import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../auth-client.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");

test("login and activation forms exist exactly once",()=>{
 const ids=["gcAuthGate","gcLoginForm","gcLoginEmail","gcLoginPassword","gcAuthError",
  "gcActivationForm","gcActivatePassword","gcActivateConfirm",
  "gcForcePasswordForm","gcForceOld","gcForceNew","gcForceConfirm",
  "gcBootstrapForm","gcSetupEmail","gcSetupPassword","gcSetupCode",
  "gcAuthHeading","gcAuthDescription","gcIdentityInfo","gcVerifiedEmail","gcVerifiedRole",
  "gcEnrollBiometrics","gcForgotPassword","gcForgotHelp","gcTogglePassword"];
 for(const id of ids){
  const count=html.split('id="'+id+'"').length-1;
  assert.equal(count,1,id+" duplicate/missing");
 }
});

test("responsive GreenCal visual design has no unsafe external image requests",()=>{
 assert.match(html,/GC GREEN FINANCE SIGN-IN v3/);
 assert.match(html,/@media \(max-width:820px\)/);
 assert.match(html,/gc-auth-landscape/);
 assert.match(html,/gc-auth-hero/);
 assert.match(html,/assets\/brks-syariah\.svg/);
 assert.doesNotMatch(html,/id="gcLoginPassword"[^>]*value=/);
});

test("biometric enrollment uses official Cloudflare Access route",()=>{
 assert.match(html,/id="gcEnrollBiometrics"/);
 assert.match(html,/https:\/\/green-heart-e2b0\.cloudflareaccess\.com\/AddMfaDevice/);
 assert.match(html,/Daftarkan Biometrik \/ PIN Perangkat/);
 assert.match(html,/id="gcDeviceAuthenticatorStatus"/);
 assert.match(html,/Keamanan bawaan perangkat/);
 assert.match(html,/Tidak diperlukan aplikasi OTP\/TOTP atau SMS sebagai MFA GreenCal/);
 assert.match(client,/detectPlatformAuthenticator/);
 assert.match(client,/isUserVerifyingPlatformAuthenticatorAvailable/);
 assert.match(client,/Kompatibilitas tidak dapat diperiksa/);
 assert.match(worker,/cloudflare-access-plus-password/);
 assert.match(html,/Biometrik perangkat tidak secara otomatis mereset password aplikasi/);
 assert.match(html,/id="gcProfileBiometrics"/);
 assert.doesNotMatch(html,/Verifikasi ulang OTP Email/);
 assert.match(client,/gcForgotHelp/);
 assert.match(client,/gcTogglePassword/);
});

test("role is obtained from server and password-first activation remains enforced",()=>{
 assert.match(client,/request\("\/api\/auth\/status"\)/);
 assert.match(client,/accessStatus\.activationRequired/);
 assert.match(client,/loginEmail\.readOnly=true/);
 assert.match(client,/request\("\/api\/auth\/activate","POST"/);
 assert.match(client,/request\("\/api\/auth\/login","POST"/);
 assert.match(worker,/verifyAccessIdentity\(req,env\)/);
 assert.match(worker,/if\(user\.must_change_password\)/);
});

test("inlined main application script is syntactically valid",()=>{
 const script=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
 assert.ok(script.length>100000);
 assert.doesNotThrow(()=>new Function(script));
 assert.doesNotThrow(()=>new Function(client));
});
