// Public state is isolated from legacy gc_state. IP scope is derived server-side,
// never from an arbitrary client-supplied header or scope identifier.
export async function networkScope(request, secret) {
  const ip=request.headers.get("CF-Connecting-IP");
  if(!ip || typeof secret!=="string" || secret.length<32) return null;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("greencal:v1:"+ip));
  return Array.from(new Uint8Array(mac),v=>v.toString(16).padStart(2,"0")).join("");
}
export function validPublicState(data) {
 if(!data||typeof data!=="object"||Array.isArray(data))return false;
 const keys=["entries","exposures","offsets","classes","settings","tables"];
 if(Object.keys(data).some(k=>!keys.includes(k)))return false;
 for(const [key,value] of Object.entries(data)){
   if(["entries","exposures","offsets","classes"].includes(key) &&
      (!Array.isArray(value)||value.length>50000||value.some(x=>!x||typeof x!=="object"||Array.isArray(x))))return false;
   if(["settings","tables"].includes(key) &&
      (!value||typeof value!=="object"||Array.isArray(value)))return false;
 }
 return JSON.stringify(data).length<=1900000;
}
