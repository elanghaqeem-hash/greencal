import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const origin="https://greencal.example";
function mockEnv(){
 const records=new Map();
 const limits=new Map();
 const db={prepare(sql){let params=[];
   return {bind(...p){params=p;return this;},
     async first(){
       if(sql.includes("gc_public_state")){const row=records.get(params[0]);return row?{revision:row.revision,payload:JSON.stringify(row.data)}:null;}
       return null;
     },
     async run(){
       if(sql.startsWith("INSERT INTO gc_public_state")){
         if(records.has(params[0]))throw Error("conflict");
         records.set(params[0],{revision:1,data:JSON.parse(params[1])});return {meta:{changes:1}};
       }
       if(sql.startsWith("UPDATE gc_public_state")){
         const [payload,,scope,rev]=params,row=records.get(scope);
         if(!row||row.revision!==rev)return {meta:{changes:0}};
         records.set(scope,{revision:rev+1,data:JSON.parse(payload)});return {meta:{changes:1}};
       }
       if(sql.includes("gc_public_ai_limits")){const key=params[0]+":"+params[1];const n=limits.get(key)||0;if(n>=5)return {meta:{changes:0}};limits.set(key,n+1);return {meta:{changes:1}};}
       throw Error("Unsupported mock SQL "+sql);
     }
   };
 }};
 return {DB:db,AI_CONFIG:{get:async()=>({order:[],updatedAt:null})},
   IP_SCOPE_SECRET:"a-32-character-minimum-server-secret-123456",
   ASSETS:{fetch:async()=>new Response("ok")},records};
}
async function send(env,path="/api/public/state",method="GET",cookie="",body){
 const headers={};
 if(cookie)headers.cookie=cookie;
 if(method!=="GET"){headers.origin=origin;headers["content-type"]="application/json";}
 const res=await worker.fetch(new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
 return {status:res.status,headers:res.headers,data:await res.json()};
}
test("public device A can save and retrieve, device B sees empty workspace",async()=>{
 const env=mockEnv();
 const first=await send(env);assert.equal(first.status,200);assert.equal(first.data.revision,0);
 const cookie=first.headers.get("set-cookie")?.split(";")[0];assert.ok(cookie);
 const saved=await send(env,"/api/public/state","PUT",cookie,{revision:0,data:{entries:[{id:"a1"}],exposures:[],offsets:[]}});
 assert.equal(saved.status,200);assert.equal(saved.data.revision,1);
 const read=await send(env,"/api/public/state","GET",cookie);
 assert.deepEqual(read.data.data.entries,[{id:"a1"}]);
 const other=await send(env);
 assert.equal(other.data.data,null);assert.equal(other.data.revision,0);
});
test("concurrent stale revisions are rejected; unknown fields forbidden",async()=>{
 const env=mockEnv();const first=await send(env),cookie=first.headers.get("set-cookie").split(";")[0];
 assert.equal((await send(env,"/api/public/state","PUT",cookie,{revision:0,data:{entries:[]}})).status,200);
 assert.equal((await send(env,"/api/public/state","PUT",cookie,{revision:0,data:{entries:[]}})).status,409);
 assert.equal((await send(env,"/api/public/state","PUT",cookie,{revision:1,data:{users:[{id:"secret"}]}})).status,400);
});
test("public AI status is accessible without login but never returns secrets",async()=>{
 const env=mockEnv(),res=await send(env,"/api/ai/status");
 assert.equal(res.status,200);
 assert.equal(res.data.role,"public");
 assert.ok(!JSON.stringify(res.data).includes(env.IP_SCOPE_SECRET));
});
test("AI without configured providers fails closed without consuming quota",async()=>{
 const env=mockEnv(),init=await send(env),cookie=init.headers.get("set-cookie").split(";")[0];
 const res=await send(env,"/api/ai/analyze","POST",cookie,{year:2026,total:100,financed:20});
 assert.equal(res.status,503);
 assert.equal(res.data.code,"AI_NOT_CONFIGURED");
});
