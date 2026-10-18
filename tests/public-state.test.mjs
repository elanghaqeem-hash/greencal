import test from "node:test";
import assert from "node:assert/strict";
import {networkScope,validPublicState} from "../src/public-state.js";
test("same network stable, different network isolated and secret not returned", async()=>{
 const secret="a-32-character-minimum-server-secret-123456";
 const req=ip=>new Request("https://greencal.example/api/public/state",{headers:{"CF-Connecting-IP":ip}});
 const a=await networkScope(req("203.0.113.1"),secret), b=await networkScope(req("203.0.113.1"),secret);
 const c=await networkScope(req("203.0.113.2"),secret);
 assert.equal(a,b);assert.notEqual(a,c);assert.match(a,/^[a-f0-9]{64}$/);
 assert.equal(await networkScope(new Request("https://greencal.example"),secret),null);
 assert.equal(await networkScope(req("203.0.113.1"),"weak"),null);
});
test("state rejects unexpected keys and malformed collections",()=>{
 assert.equal(validPublicState({entries:[],settings:{}}),true);
 assert.equal(validPublicState({users:[]}),false);
 assert.equal(validPublicState({entries:[null]}),false);
 assert.equal(validPublicState({entries:{}}),false);
 assert.equal(validPublicState({tables:[]}),false);
});
