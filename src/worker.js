import { networkScope, validPublicState } from "./public-state.js";
import { handleAiApi, verifyAccessIdentity } from "./ai-worker.js";
import { permissionsForRole, writableKeysForRole, preservesExistingRecords } from "./roles.js";
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
// The Cloudflare Access JWT authenticates the email address. D1 password adds
// a second verification step and MUST be rotated before application API access.
async function identity(req,db,actor){
  if(!actor||!actor.email||!["Admin","Maker"].includes(actor.role))return null;
  const user=await db.prepare("SELECT id,email,role,active,salt,password_hash,must_change_password,password_updated_at FROM gc_users WHERE email=?")
    .bind(actor.email.toLowerCase()).first();
  if(!user||!user.active||user.role!==(actor.role==="Admin"?"admin":"maker"))return null;
  return user;
}
function currentUser(u){return {id:u.id,email:u.email,role:u.role,mustChangePassword:!!u.must_change_password,permissions:permissionsForRole(u.role)};}
async function sessionUser(req,db,accessActor){
  const token=getCookie(req);if(!token)return null;
  const row=await db.prepare("SELECT s.user_id,s.expires_at,u.id,u.email,u.role,u.active,u.must_change_password,u.salt,u.password_hash FROM gc_sessions s JOIN gc_users u ON u.id=s.user_id WHERE s.token_hash=?")
    .bind(await sha(token)).first();
  if(!row||row.expires_at<=Date.now()||!row.active||row.email.toLowerCase()!==accessActor.email.toLowerCase()||
      row.role!==(accessActor.role==="Admin"?"admin":"maker"))return null;
  return row;
}
async function activateFirstPassword(req,db,actor){
  const user=await identity(req,db,actor);
  if(!user||!user.active)return err("Akun belum terdaftar.",403);
  if(user.password_updated_at!==null&&user.password_updated_at!==undefined)
    return err("Akun sudah diaktifkan. Silakan login dengan password Anda.",409);
  const body=await readBody(req),pass=body.password;
  if(!validPassword(pass)||!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||
     !/[0-9]/.test(pass)||!/[^a-zA-Z0-9]/.test(pass))
    return err("Password minimal 12 karakter dengan huruf besar, kecil, angka, dan simbol.",400);
  const salt=rand(16),hash=await passHash(pass,salt);
  const result=await db.prepare("UPDATE gc_users SET salt=?,password_hash=?,must_change_password=0,password_updated_at=? WHERE id=? AND password_updated_at IS NULL")
    .bind(salt,hash,Date.now(),user.id).run();
  if(result.meta?.changes!==1)return err("Akun sudah diaktifkan.",409);
  await audit(db,user.id,"auth.activated","verified_email_otp");
  return C({ok:true,readyToLogin:true});
}
async function login(req,db,actor){
  const body=await readBody(req),addr=email(body.email),pwd=body.password;
  if(!validEmail(addr)||typeof pwd!=="string"||pwd.length>128||addr!==actor.email.toLowerCase())
    return err("Email atau password tidak valid",401);
  const now=Date.now();
  const limit=await db.prepare("SELECT attempts,first_at,blocked_until FROM gc_login_limits WHERE email=?").bind(addr).first();
  if(limit?.blocked_until>now)return err("Terlalu banyak percobaan. Coba lagi setelah 15 menit.",429);
  const user=await identity(req,db,actor);
  let matches=false;
  if(user){matches=equal(await passHash(pwd,user.salt),user.password_hash);}
  if(!matches){
    const reset=!limit||limit.first_at<now-900000;
    const attempts=reset?1:limit.attempts+1;
    const blocked=attempts>=5?now+900000:0;
    await db.prepare("INSERT INTO gc_login_limits(email,attempts,first_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts, first_at=excluded.first_at, blocked_until=excluded.blocked_until")
      .bind(addr,attempts,reset?now:limit.first_at,blocked).run();
    return err("Email atau password tidak valid",401);
  }
  await db.prepare("DELETE FROM gc_login_limits WHERE email=?").bind(addr).run();
  await db.prepare("DELETE FROM gc_sessions WHERE expires_at<?").bind(now).run();
  const token=rand(32);
  await db.prepare("INSERT INTO gc_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(await sha(token),user.id,now+12*3600000).run();
  await audit(db,user.id,"auth.login",user.role);
  return C({ok:true,user:currentUser(user)},200,{"set-cookie":cookie(token,43200)});
}
async function updatePassword(req,db,user){
  const body=await readBody(req),old=body.oldPassword,pass=body.newPassword;
  if(typeof old!=="string"||!validPassword(pass)||pass.length<12||pass===old)
    return err("Isi password lama dan password baru yang berbeda (12–128 karakter).",400);
  if(!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||!/[0-9]/.test(pass)||!/[^a-zA-Z0-9]/.test(pass))
    return err("Password baru wajib mengandung huruf besar, huruf kecil, angka, dan simbol.",400);
  if(!equal(await passHash(old,user.salt),user.password_hash))return err("Password lama tidak sesuai.",401);
  const salt=rand(16),hash=await passHash(pass,salt);
  await db.prepare("UPDATE gc_users SET salt=?,password_hash=?,must_change_password=0,password_updated_at=? WHERE id=?")
    .bind(salt,hash,Date.now(),user.id).run();
  await db.prepare("DELETE FROM gc_sessions WHERE user_id=?").bind(user.id).run();
  await audit(db,user.id,"auth.password_changed","first_login_or_regular");
  return C({ok:true,reauthRequired:true},200,{"set-cookie":cookie("",0)});
}
async function router(req,env) {
  const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB;
  if(!db)return err("Database autentikasi belum terhubung",503);
  const actor=await verifyAccessIdentity(req,env);
  if(actor.error)return actor.error;
  if(!["GET","HEAD","OPTIONS"].includes(method)){
    const origin=req.headers.get("origin");
    if(!origin||origin!==url.origin)return err("Origin permintaan tidak valid",403);
    if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return err("Content-Type harus application/json",415);
  }
  if(path==="/api/auth/status"&&method==="GET"){
    const account=await identity(req,db,actor);
    return C({loginMethod:"cloudflare-access-plus-password",deviceMfaEnrollment:"cloudflare-access-biometrics",email:actor.email,
      activationRequired:!!account&&account.password_updated_at==null,
      accountEnabled:!!account,role:account?.role||null});
  }
  if(path==="/api/auth/bootstrap"&&method==="POST")return err("Bootstrap publik ditutup.",403);
  if(path==="/api/auth/activate"&&method==="POST")return activateFirstPassword(req,db,actor);
  if(path==="/api/auth/login"&&method==="POST")return login(req,db,actor);
  if(path==="/api/auth/logout"&&method==="POST"){
    const token=getCookie(req);
    if(token)await db.prepare("DELETE FROM gc_sessions WHERE token_hash=?").bind(await sha(token)).run();
    return C({ok:true},200,{"set-cookie":cookie("",0)});
  }
  const user=await sessionUser(req,db,actor);
  if(!user)return err("Sesi berakhir. Silakan masuk menggunakan email dan password.",401);
  if(path==="/api/auth/me"&&method==="GET")return C({user:currentUser(user)});
  if(path==="/api/auth/password"&&method==="POST")return updatePassword(req,db,user);
  if(user.must_change_password)return err("Wajib mengganti password sementara sebelum mengakses GreenCal.",428);
  if(path.startsWith("/api/ai/"))return handleAiApi(req,env,user);
  if(path==="/api/admin/users"&&method==="GET"){
    if(user.role!=="admin")return err("Hanya Superadmin yang dapat mengelola pengguna",403);
    const rows=await db.prepare("SELECT id,email,role,active,created_at,must_change_password FROM gc_users ORDER BY created_at DESC").all();
    return C({users:rows.results||[]});
  }
  // Password resets are deliberately not issued via unverified browser actions.
  if((path==="/api/admin/users"&&method==="POST") ||
     (/^\/api\/admin\/users\/[a-f0-9]{32}$/.test(path)&&method==="PATCH"))
    return err("Penambahan/reset pengguna hanya melalui proses undangan terverifikasi.",403);
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
    const permitted=writableKeysForRole(user.role);
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
        if(!preservesExistingRecords(before,value))
          return err("Maker tidak diizinkan menghapus data atau memakai ID aktivitas yang duplikat/tidak valid",403);
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

async function publicStateRouter(req,env) {
  if(!env.DB)return err("Penyimpanan belum tersedia",503);
  const scope=await networkScope(req,env.IP_SCOPE_SECRET);
  if(!scope)return err("Identitas jaringan tidak tersedia",503);
  const url=new URL(req.url);
  if(req.method==="GET"){
    const row=await env.DB.prepare("SELECT revision,payload FROM gc_public_state WHERE scope_id=?").bind(scope).first();
    return C({revision:row?.revision??0,data:row?JSON.parse(row.payload):null});
  }
  if(req.method!=="PUT")return err("Metode tidak didukung",405);
  if(req.headers.get("origin")!==url.origin)return err("Origin permintaan tidak valid",403);
  if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return err("Content-Type harus application/json",415);
  const body=await readBody(req);
  if(!Number.isInteger(body?.revision)||body.revision<0||!validPublicState(body.data))
    return err("Struktur data/revisi tidak valid",400);
  const payload=JSON.stringify(body.data),now=Date.now();
  // CAS updates and conditional insert prevent overwriting concurrent browser saves.
  if(body.revision===0){
    const existing=await env.DB.prepare("SELECT revision FROM gc_public_state WHERE scope_id=?").bind(scope).first();
    if(existing)return err("Konflik revisi. Muat ulang.",409);
    try{
      await env.DB.prepare("INSERT INTO gc_public_state(scope_id,revision,payload,updated_at) VALUES(?,1,?,?)").bind(scope,payload,now).run();
    }catch{return err("Konflik revisi. Muat ulang.",409);}
  }else{
    const result=await env.DB.prepare("UPDATE gc_public_state SET revision=revision+1,payload=?,updated_at=? WHERE scope_id=? AND revision=?")
      .bind(payload,now,scope,body.revision).run();
    if(result.meta?.changes!==1)return err("Konflik revisi. Muat ulang.",409);
  }
  return C({ok:true,revision:body.revision+1});
}

export default {
  async fetch(req,env){
    const path=new URL(req.url).pathname;
    if(path==="/api/public/state"){
      try{return await publicStateRouter(req,env)}catch(e){console.error("Public state exception",e);return err("Permintaan gagal diproses",500);}
    }
    if(path==="/api/client-scope" && req.method==="GET"){
      // Never trust a browser-supplied IP. Cloudflare supplies the observed IP.
      const ip=req.headers.get("CF-Connecting-IP");
      if(!ip || !env.IP_SCOPE_SECRET || env.IP_SCOPE_SECRET.length<32)
        return err("Identitas jaringan tidak tersedia. Penyimpanan dinonaktifkan.",503);
      const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.IP_SCOPE_SECRET),
        {name:"HMAC",hash:"SHA-256"},false,["sign"]);
      const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("greencal:v1:"+ip));
      const scope=Array.from(new Uint8Array(signed),v=>v.toString(16).padStart(2,"0")).join("");
      return C({scope}); 
    }
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
