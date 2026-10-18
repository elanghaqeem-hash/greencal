// Anonymous browser isolation: HttpOnly random device token; no IP-derived identity.
// This protects distinct browsers even behind shared corporate networks/NAT.
const COOKIE="gc_guest";
const bytesHex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
export async function deviceScope(request,secret) {
 if(typeof secret!=="string"||secret.length<32)return null;
 const raw=/(?:^|;\s*)gc_guest=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get("cookie")||"")?.[1];
 const newlyCreated=!raw;
 const token=raw||bytesHex(crypto.getRandomValues(new Uint8Array(32)));
 const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode("greencal:device:v1:"+token));
 return {scope:bytesHex(new Uint8Array(mac)),newlyCreated,cookie:newlyCreated?`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`:null};
}
export function validPublicState(data) {
 if(!data||typeof data!=="object"||Array.isArray(data))return false;
 const keys=["entries","exposures","offsets","classes","settings","tables","narrativeDrafts"];
 if(Object.keys(data).some(k=>!keys.includes(k)))return false;
 for(const [key,value] of Object.entries(data)){
   if(["entries","exposures","offsets","classes"].includes(key) &&
      (!Array.isArray(value)||value.length>50000||value.some(x=>!x||typeof x!=="object"||Array.isArray(x))))return false;
   if(["settings","tables","narrativeDrafts"].includes(key) &&
      (!value||typeof value!=="object"||Array.isArray(value)))return false;
 }
 return JSON.stringify(data).length<=1900000;
}
