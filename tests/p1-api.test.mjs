import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {consumePublicAiQuota,PUBLIC_AI_GLOBAL_DAY,PUBLIC_AI_PER_IP_DAY} from "../src/public-ai.js";

const base="https://greencal.example";
const env={
  IP_SCOPE_SECRET:"p1-test-only-not-a-real-secret-0123456789",
  GREENCAL_PUBLIC_AI_ENABLED:"false",
  AI_CONFIG:{async get(){return {order:[{provider:"gemini",model:"test-model",enabled:true}]};}},
  AI_KEY_GEMINI:"fake-unit-test-key",
  DB:{},
  ASSETS:{fetch:()=>new Response("PUBLIC")}
};
const request=(path,options={})=>new Request(base+path,options);

test("public network scope requires Cloudflare-observed IP, never client-provided identity",async()=>{
  const missing=await worker.fetch(request("/api/client-scope"),env);
  assert.equal(missing.status,503);
  const scope=await worker.fetch(request("/api/client-scope",{headers:{"CF-Connecting-IP":"198.51.100.12"}}),env);
  assert.equal(scope.status,200);
  const data=await scope.json();
  assert.match(data.scope,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(data).includes("198.51.100.12"));
});

test("public AI status exposes availability without provider secrets or administrative permissions",async()=>{
  let r=await worker.fetch(request("/api/ai/status",{headers:{"CF-Connecting-IP":"198.51.100.12"}}),env);
  assert.equal(r.status,200);
  let data=await r.json();
  assert.equal(data.role,"public");
  assert.equal(data.publicCloudEnabled,false);
  assert.ok(!JSON.stringify(data).includes("fake-unit-test-key"));
  assert.ok(!Object.hasOwn(data,"config"));
  r=await worker.fetch(request("/api/ai/status",{headers:{"CF-Connecting-IP":"198.51.100.12"}}),{...env,GREENCAL_PUBLIC_AI_ENABLED:"true"});
  assert.equal(r.status,200);
  data=await r.json();
  assert.equal(data.publicCloudEnabled,true);
});

test("disabled public AI cannot call paid providers, and admin configuration remains protected",async()=>{
  const body=JSON.stringify({year:2026,total:100,financed:0,scope1:20,scope2:80,scope3:0});
  const h={"Content-Type":"application/json","Origin":base,"CF-Connecting-IP":"198.51.100.12"};
  const r=await worker.fetch(request("/api/ai/analyze",{method:"POST",headers:h,body}),env);
  assert.equal(r.status,403);
  assert.equal((await r.json()).code,"AI_PUBLIC_DISABLED");
  const settings=await worker.fetch(request("/api/ai/settings",{method:"POST",headers:h,body:"{}"}),env);
  assert.notEqual(settings.status,200);
  const state=await worker.fetch(request("/api/state"),env);
  assert.notEqual(state.status,200);
});

test("public AI quotas are atomic per pseudonymous IP and globally capped",async()=>{
  const storage=new Map();
  const db={prepare(sql){
    assert.match(sql,/RETURNING used/);
    return {bind(day,key,limit){return {async first(){
      const id=day+"|"+key;
      const used=storage.get(id)||0;
      if(used>=limit)return null;
      storage.set(id,used+1);
      return {used:used+1};
    }}}};
  }};
  const stamp=new Date("2026-10-20T00:00:00Z");
  const a="a".repeat(64);
  for(let i=0;i<PUBLIC_AI_PER_IP_DAY;i++)assert.deepEqual(await consumePublicAiQuota(db,a,stamp),{ok:true});
  assert.equal((await consumePublicAiQuota(db,a,stamp)).code,"IP_DAILY_LIMIT");
  let failed=false;
  for(let i=0;i<100;i++){
    const scope=i.toString(16).padStart(64,"0");
    const r=await consumePublicAiQuota(db,scope,stamp);
    if(!r.ok){failed=r.code==="GLOBAL_DAILY_LIMIT";break;}
  }
  assert.equal(failed,true);
  assert.ok(storage.get("2026-10-20|global")<=PUBLIC_AI_GLOBAL_DAY);
});

test("data storage keys are scoped in client and public routing is strictly allowlisted",async()=>{
  const {readFileSync}=await import("node:fs");
  const auth=readFileSync(new URL("../auth-client.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const server=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
  assert.match(auth,/scopedKey:storageKey/);
  assert.match(auth,/scopeGeneration\+\+/);
  assert.match(html,/scopedKey\("activity-draft"\)/);
  assert.match(html,/scopedKey\("transition-scenario"\)/);
  assert.doesNotMatch(html,/localStorage\.getItem\(ACTIVITY_DRAFT_KEY\)/);
  assert.doesNotMatch(html,/localStorage\.getItem\(GC_TRANS_SCENARIO_STORE\)/);
  assert.match(server,/path==="\/api\/ai\/analyze"/);
  assert.match(server,/path==="\/api\/ai\/status"/);
});
