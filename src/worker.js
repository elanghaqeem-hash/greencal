import { handleAiApi, verifyAccessIdentity } from "./ai-worker.js";
// GreenCal — D1-backed authentication, two-role RBAC, shared state.
// All security decisions are enforced by the Worker; the browser role is advisory only.
const H = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const C = (data,status=200,more={}) => new Response(JSON.stringify(data),{status,headers:{...H,...more}});
const err = (message,status=400) => C({error:message},status);
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,"0")).join("");
const sha = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
const equal=(a,b)=>{if(typeof a!=="string"||typeof b!=="string")return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
const enc = s => new TextEncoder().encode(s);
const passHash = async (pass,salt) => {
  const k=await crypto.subtle.importKey("raw",enc(pass),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc(salt),iterations:210000,hash:"SHA-256"},k,256);
  return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,"0")).join("");
};
const cookie = (token,maxAge) => "gc_session="+token+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge;
const getCookie = r => /(?:^|;\s*)gc_session=([a-f0-9]{64})(?:;|$)/.exec(r.headers.get("cookie")||"")?.[1]||"";
const email = v=>String(v||"").trim().toLowerCase();
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<255;
const validPassword = p => typeof p==="string"&&p.length>=12&&p.length<=128;
const audit = (db,user,action,target) => db.prepare("INSERT INTO gc_events (id,user_id,action,target,created_at) VALUES (?,?,?,?,?)").bind(rand(12),user,action,target,Date.now()).run();
const readBody=async request=>{
  if(Number(request.headers.get("content-length")||0)>2200000)throw Error("Payload terlalu besar");
  const text=await request.text();if(text.length>2200000)throw Error("Payload terlalu besar");
  try{return JSON.parse(text)}catch{throw Error("JSON tidak valid")};
};
// Login is verified by Cloudflare Access; D1 stores role-specific app records, not passwords.
async function identity(req,db,actor){
  if(!actor || !actor.email || !["Admin","Maker"].includes(actor.role))return null;
  const email=actor.email.toLowerCase(), role=actor.role==="Admin"?"admin":"maker";
  let user=await db.prepare("SELECT id,email,role,active FROM gc_users WHERE email=?").bind(email).first();
  if(user){
    if(!user.active)return null;
    if(user.role!==role){
      await db.prepare("UPDATE gc_users SET role=? WHERE id=?").bind(role,user.id).run();
      await audit(db,user.id,"access.role_sync",role);
      user.role=role;
    }
    return user;
  }
  // Opaque unusable password hash: authentication must occur with Cloudflare Access.
  const id=rand(16);
  try{
    await db.prepare("INSERT INTO gc_users(id,email,role,salt,password_hash,active,created_at) VALUES(?,?,?,?,?,1,?)")
      .bind(id,email,role,rand(16),rand(32),Date.now()).run();
    await audit(db,id,"access.provision",role);
  }catch(e){
    // Simultaneous first requests may race; recover the newly created row below.
  }
  user=await db.prepare("SELECT id,email,role,active FROM gc_users WHERE email=?").bind(email).first();
  if(!user||!user.active)return null;
  if(user.role!==role){
    await db.prepare("UPDATE gc_users SET role=? WHERE id=?").bind(role,user.id).run();
    user.role=role;
  }
  return user;
}
// The App's Cloudflare Access session is authoritative. No local password sessions.
async function router(req,env) {
  const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB;
  if(!db)return err("Database autentikasi belum terhubung",503);
  const actor=await verifyAccessIdentity(req,env);
  if(actor.error)return actor.error;
  // Session-changing requests require same-origin browser requests.
  if(!["GET","HEAD","OPTIONS"].includes(method)){
    const origin=req.headers.get("origin");
    if(!origin||origin!==url.origin)return err("Origin permintaan tidak valid",403);
    if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return err("Content-Type harus application/json",415);
  }
  if(path==="/api/auth/status"&&method==="GET")return C({hasAdmin:true,setupAvailable:false,loginMethod:"cloudflare-access"});
  if((path==="/api/auth/bootstrap"||path==="/api/auth/login")&&method==="POST")
    return err("Masuk melalui Cloudflare Access dengan email yang sudah disetujui.",403);
  if(path==="/api/auth/logout"&&method==="POST")return C({ok:true,logoutUrl:"/cdn-cgi/access/logout"});
  const user=await identity(req,db,actor);
  if(!user)return err("Akun tidak aktif atau belum diizinkan.",403);
  if(path==="/api/auth/me"&&method==="GET")return C({user:{id:user.id,email:user.email,role:user.role}});
  if(path.startsWith("/api/ai/")) return handleAiApi(req,env,user);
  if(path==="/api/auth/password"&&method==="POST")
    return err("Password dikelola melalui Cloudflare Access; perubahan password lokal dinonaktifkan.",403);
  if(path==="/api/admin/users"&&method==="GET"){
    if(user.role!=="admin")return err("Hanya Admin yang dapat mengelola pengguna",403);
    const rows=await db.prepare("SELECT id,email,role,active,created_at FROM gc_users ORDER BY created_at DESC").all();
    return C({users:rows.results||[]});
  }
  // User provisioning is locked to Cloudflare Access's approved email policy.
  if((path==="/api/admin/users"&&method==="POST") ||
     (/^\/api\/admin\/users\/[a-f0-9]{32}$/.test(path)&&method==="PATCH"))
    return err("Kelola daftar Admin/Maker melalui Cloudflare Access. API pengguna lokal dinonaktifkan.",403);
  if(path==="/api/state"&&method==="GET"){
    const row=await db.prepare("SELECT revision, payload FROM gc_state WHERE id=1").first();
    return C({revision:row?.revision||0,data:row?JSON.parse(row.payload):null});
  }
  if(path==="/api/state"&&method==="PUT"){
    const body=await readBody(req);
    if(!Number.isInteger(body.revision)||body.revision<0||!body.data||typeof body.data!=="object"||Array.isArray(body.data))return err("Struktur data/revisi tidak valid");
    const row=await db.prepare("SELECT revision,payload FROM gc_state WHERE id=1").first();
    const rev=row?.revision||0;
    if(body.revision!==rev)return err("Data diperbarui pengguna lain. Muat ulang sebelum menyimpan.",409);
    const stored=row?JSON.parse(row.payload):{};
    const permitted=user.role==="admin"?["entries","exposures","offsets","settings","tables","classes"]:["entries","exposures","offsets"];
    const forbidden=Object.keys(body.data).filter(k=>!permitted.includes(k));
    if(forbidden.length)return err("Role "+user.role+" tidak diizinkan mengubah: "+forbidden.join(", "),403);
    const next={...stored};
    for(const k of permitted){
      if(!Object.hasOwn(body.data,k))continue;
      const value=body.data[k];
      if(["entries","exposures","offsets","classes"].includes(k)&&!Array.isArray(value))return err("Format "+k+" tidak valid");
      if(["settings","tables"].includes(k)&&(!value||typeof value!=="object"||Array.isArray(value)))return err("Format "+k+" tidak valid");
      if(Array.isArray(value)&&(value.length>50000||value.some(v=>!v||typeof v!=="object"||Array.isArray(v))))return err("Data "+k+" tidak valid");
      if(user.role==="maker"&&Array.isArray(value)) {
        const before=Array.isArray(stored[k])?stored[k]:[];
        const ids=new Set(value.map(x=>String(x.id||"")));
        if(before.some(x=>!ids.has(String(x.id||""))))return err("Maker tidak diizinkan menghapus data",403);
      }
      next[k]=value;
    }
    const payload=JSON.stringify(next);
    if(payload.length>1900000)return err("Data terlalu besar");
    if(row){
      const result=await db.prepare("UPDATE gc_state SET revision=revision+1,payload=?,updated_by=?,updated_at=? WHERE id=1 AND revision=?")
        .bind(payload,user.id,Date.now(),rev).run();
      if(!result.meta?.changes)return err("Konflik revisi. Muat ulang.",409);
    }else{
      try{await db.prepare("INSERT INTO gc_state(id,revision,payload,updated_by,updated_at) VALUES(1,1,?,?,?)").bind(payload,user.id,Date.now()).run();}
      catch{return err("Konflik revisi. Muat ulang.",409);}
    }
    await audit(db,user.id,"state.update",Object.keys(body.data).join(","));
    return C({ok:true,revision:rev+1});
  }
  if(path==="/api/admin/audit"&&method==="GET"){
    if(user.role!=="admin")return err("Akses hanya untuk Admin",403);
    const events=await db.prepare("SELECT e.action,e.target,e.created_at,u.email FROM gc_events e LEFT JOIN gc_users u ON e.user_id=u.id ORDER BY e.created_at DESC LIMIT 100").all();
    return C({events:events.results||[]});
  }
  return err("Endpoint tidak ditemukan",404);
}
export default {
  async fetch(req,env){
    const path=new URL(req.url).pathname;
    if(path.startsWith("/api/")){
      try{return await router(req,env)}catch(e){console.error("GreenCal API exception",e);return err("Permintaan gagal diproses",500);}
    }
    // The UI shell is public; the authenticated state and mutations are NOT.
    const out=await env.ASSETS.fetch(req);
    const headers=new Headers(out.headers);
    headers.set("x-content-type-options","nosniff");
    if(path==="/"||path==="/index.html")headers.set("cache-control","no-store");
    return new Response(out.body,{status:out.status,statusText:out.statusText,headers});
  }
};
