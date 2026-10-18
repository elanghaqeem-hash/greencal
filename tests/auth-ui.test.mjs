import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../auth-client.js",import.meta.url),"utf8");

test("GreenCal public calculator does not require a login or MFA form",()=>{
 assert.match(html,/Public calculator: no authentication screen or account signup required/);
 for(const id of ["gcAuthGate","gcLoginForm","gcLoginEmail","gcLoginPassword",
                   "gcEnrollBiometrics","gcForcePasswordForm","gcActivationForm"]){
  assert.equal(html.split('id="'+id+'"').length-1,0,id+" should not appear as an active UI control");
 }
 assert.match(client,/GreenCal Public Mode: no login/);
 assert.match(client,/role:"public"/);
});

test("public calculator isolates browser-local state",()=>{
 assert.match(client,/greencal_public_data_v1/);
 assert.match(client,/localStorage.setItem\(STORE/);
 assert.match(client,/localStorage.getItem\(STORE/);
 assert.match(client,/entries:Array.isArray/);
 assert.match(client,/exposures:Array.isArray/);
 assert.match(client,/offsets:Array.isArray/);
 assert.doesNotMatch(client,/credentials:"same-origin"/);
});

test("admin-only UI and key configuration are hidden in public mode",()=>{
 assert.match(client,/document.querySelectorAll\("\[data-admin-only\]"/);
 assert.match(client,/viewUsers:false/);
 assert.match(client,/manageAiKeys:false/);
 assert.match(client,/manageParameters:false/);
 assert.match(client,/btnConfigureAi/);
});

test("public calculator still has responsive branding and parses",()=>{
 assert.match(html,/Plus Jakarta Sans/);
 assert.match(html,/assets\/brks-syariah\.svg/);
 const script=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
 assert.ok(script.length>100000);
 assert.doesNotThrow(()=>new Function(script));
 assert.doesNotThrow(()=>new Function(client));
});
