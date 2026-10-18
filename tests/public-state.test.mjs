import test from "node:test";
import assert from "node:assert/strict";
import {deviceScope,validPublicState} from "../src/public-state.js";
const secret="a-32-character-minimum-server-secret-123456";
const req=(cookie="")=>new Request("https://greencal.example/api/public/state",{headers:cookie?{cookie}:{}});
test("first request creates HttpOnly anonymous device cookie",async()=>{
 const a=await deviceScope(req(),secret);
 assert.equal(a.newlyCreated,true);
 assert.match(a.cookie,/gc_guest=[a-f0-9]{64}/);
 assert.match(a.cookie,/HttpOnly/);
 assert.match(a.cookie,/SameSite=Strict/);
 assert.match(a.scope,/^[a-f0-9]{64}$/);
 const b=await deviceScope(req(a.cookie.split(";")[0]),secret);
 assert.equal(b.newlyCreated,false);
 assert.equal(b.cookie,null);
 assert.equal(b.scope,a.scope);
});
test("distinct browsers do not share an IP-derived scope",async()=>{
 const a=await deviceScope(req("gc_guest="+"a".repeat(64)),secret);
 const b=await deviceScope(req("gc_guest="+"b".repeat(64)),secret);
 assert.notEqual(a.scope,b.scope);
 assert.equal(await deviceScope(req(),"weak"),null);
});
test("state rejects unexpected keys and malformed collections",()=>{
 assert.equal(validPublicState({entries:[],settings:{},narrativeDrafts:{}}),true);
 assert.equal(validPublicState({users:[]}),false);
 assert.equal(validPublicState({entries:[null]}),false);
 assert.equal(validPublicState({entries:{}}),false);
 assert.equal(validPublicState({tables:[]}),false);
});
