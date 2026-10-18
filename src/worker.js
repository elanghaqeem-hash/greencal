import { handleAiApi } from "./ai-worker.js";
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
async function identity(req,db){
  const token=getCookie(req);
  if(!token)return null;
  return db.prepare("SELECT u.id,u.email,u.role,u.active FROM gc_sessions s JOIN gc_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1")
    .bind(await sha(token),Date.now()).first();
}
async function issueSession(db,u) {
  const token=rand(32);
  const exp=Date.now()+12*3600*1000;
  await db.prepare("INSERT INTO gc_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha(token),u.id,exp).run();
  return C({user:{id:u.id,email:u.email,role:u.role}},200,{"set-cookie":cookie(token,12*3600)});
}
async function authorizeAdmin(req,db) {
  const user=await identity(req,db);
  return user&&user.role==="admin"?user:null;
}
async function router(req,env) {
  const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB;
  if(!db)return err("Database autentikasi belum terhubung",503);
  // Session-changing requests require same-origin browser requests.
  if(!["GET","HEAD","OPTIONS"].includes(method)){
    const origin=req.headers.get("origin");
    if(!origin||origin!==url.origin)return err("Origin permintaan tidak valid",403);
    if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return err("Content-Type harus application/json",415);
  }
  if(path==="/api/auth/status"&&method==="GET"){
    const n=await db.prepare("SELECT COUNT(*) AS n FROM gc_users WHERE role='admin'").first();
    return C({hasAdmin:n.n>0,setupAvailable:!!env.GC_BOOTSTRAP_TOKEN});
  }
  if(path==="/api/auth/bootstrap"&&method==="POST") {
    if(!env.GC_BOOTSTRAP_TOKEN)return err("Aktivasi Admin belum tersedia",503);
    const b=await readBody(req),e=email(b.email),p=b.password;
    if(!validEmail(e)||!validPassword(p))return err("Email tidak valid atau password kurang dari 12 karakter");
    if(!equal(await sha(String(b.code||"")),await sha(env.GC_BOOTSTRAP_TOKEN)))return err("Kode aktivasi salah",403);
    const users=await db.prepare("SELECT COUNT(*) AS n FROM gc_users").first();
    if(users.n!==0)return err("Aktivasi awal sudah ditutup",409);
    const u={id:rand(16),email:e,role:"admin"};
    const salt=rand(16),hashed=await passHash(p,salt);
    try{await db.prepare("INSERT INTO gc_users(id,email,role,salt,password_hash,active,created_at) SELECT ?,?,?,?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM gc_users)")
      .bind(u.id,u.email,"admin",salt,hashed,Date.now()).run();
    }catch{return err("Admin sudah ada atau email sudah digunakan",409);}
    const created=await db.prepare("SELECT id,email,role FROM gc_users WHERE id=?").bind(u.id).first();
    if(!created)return err("Admin sudah ada",409);
    await audit(db,u.id,"admin.bootstrap",e);
    return issueSession(db,u);
  }
  if(path==="/api/auth/login"&&method==="POST") {
    const b=await readBody(req),e=email(b.email),p=String(b.password||"");
    if(!validEmail(e)||p.length>128)return err("Email atau password salah",401);
    const row=await db.prepare("SELECT * FROM gc_login_limits WHERE email=?").bind(e).first();
    if(row?.blocked_until>Date.now())return err("Terlalu banyak percobaan login. Coba kembali nanti.",429);
    const u=await db.prepare("SELECT * FROM gc_users WHERE email=?").bind(e).first();
    // Run hashing even for nonexistent accounts to make user enumeration harder.
    const hashed=await passHash(p,u?.salt||"not-a-user-salt");
    if(!u||!u.active||!equal(hashed,u.password_hash)) {
      const attempts=(row?.first_at>Date.now()-15*60*1000?(row?.attempts||0):0)+1;
      await db.prepare("INSERT INTO gc_login_limits(email,attempts,first_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts, first_at=excluded.first_at, blocked_until=excluded.blocked_until")
       .bind(e,attempts,row?.first_at>Date.now()-15*60*1000?row.first_at:Date.now(),attempts>=6?Date.now()+15*60*1000:0).run();
      return err("Email atau password salah",401);
    }
    await db.prepare("DELETE FROM gc_login_limits WHERE email=?").bind(e).run();
    await db.prepare("DELETE FROM gc_sessions WHERE expires_at<?").bind(Date.now()).run();
    await audit(db,u.id,"auth.login",e);
    return issueSession(db,u);
  }
  if(path==="/api/auth/logout"&&method==="POST"){
    const token=getCookie(req);
    if(token)await db.prepare("DELETE FROM gc_sessions WHERE token_hash=?").bind(await sha(token)).run();
    return C({ok:true},200,{"set-cookie":cookie("",0)});
  }
  const user=await identity(req,db);
  if(!user)return err("Silakan masuk ke akun GreenCal",401);
  if(path==="/api/auth/me"&&method==="GET")return C({user:{id:user.id,email:user.email,role:user.role}});
  if(path.startsWith("/api/ai/")) return handleAiApi(req,env,user);
  if(path==="/api/auth/password"&&method==="POST"){
    const body=await readBody(req);
    if(!validPassword(body.newPassword))return err("Password baru minimal 12 karakter");
    const record=await db.prepare("SELECT salt,password_hash FROM gc_users WHERE id=?").bind(user.id).first();
    if(!record || !equal(await passHash(String(body.oldPassword||""),record.salt),record.password_hash))return err("Password lama salah",403);
    const salt=rand(16),hashed=await passHash(body.newPassword,salt);
    await db.prepare("UPDATE gc_users SET salt=?, password_hash=? WHERE id=?").bind(salt,hashed,user.id).run();
    await db.prepare("DELETE FROM gc_sessions WHERE user_id=?").bind(user.id).run();
    await audit(db,user.id,"auth.password_changed",user.id);
    return C({ok:true,reauth:true},200,{"set-cookie":cookie("",0)});
  }

  if(path==="/api/admin/users"&&method==="GET"){
    if(user.role!=="admin")return err("Hanya Admin yang dapat mengelola pengguna",403);
    const rows=await db.prepare("SELECT id,email,role,active,created_at FROM gc_users ORDER BY created_at DESC").all();
    return C({users:rows.results||[]});
  }
  if(path==="/api/admin/users"&&method==="POST"){
    if(user.role!=="admin")return err("Akses hanya untuk Admin",403);
    const b=await readBody(req),e=email(b.email),p=b.password,r=b.role;
    if(!validEmail(e)||!validPassword(p)||!["admin","maker"].includes(r))return err("Periksa email, role dan password (minimal 12 karakter)");
    const salt=rand(16),id=rand(16),hash=await passHash(p,salt);
    try{await db.prepare("INSERT INTO gc_users(id,email,role,salt,password_hash,active,created_at) VALUES(?,?,?,?,?,1,?)").bind(id,e,r,salt,hash,Date.now()).run();}
    catch{return err("Email sudah terdaftar",409);}
    await audit(db,user.id,"users.create",id+" "+r);
    return C({ok:true,id,role:r},201);
  }
  const match=/^\/api\/admin\/users\/([a-f0-9]{32})$/.exec(path);
  if(match&&method==="PATCH") {
    if(user.role!=="admin")return err("Akses hanya untuk Admin",403);
    const b=await readBody(req),target=await db.prepare("SELECT id,role,active FROM gc_users WHERE id=?").bind(match[1]).first();
    if(!target)return err("Pengguna tidak ditemukan",404);
    if(target.id===user.id)return err("Admin tidak dapat mengubah role/status akun sendiri",403);
    if(b.role!==undefined&&!["admin","maker"].includes(b.role))return err("Role tidak valid");
    if(b.active!==undefined&&typeof b.active!=="boolean")return err("Status pengguna tidak valid");
    const r=b.role??target.role,a=b.active===undefined?target.active:(b.active?1:0);
    if(target.role==="admin"&&(r!=="admin"||!a)){
      const n=await db.prepare("SELECT COUNT(*) AS n FROM gc_users WHERE role='admin' AND active=1").first();
      if(n.n<=1)return err("Minimal satu Admin aktif wajib tersedia",409);
    }
    if(b.password!==undefined&&!validPassword(b.password))return err("Password minimal 12 karakter");
    if(b.password!==undefined){
      const salt=rand(16),hash=await passHash(b.password,salt);
      await db.prepare("UPDATE gc_users SET role=?, active=?, salt=?, password_hash=? WHERE id=?").bind(r,a,salt,hash,target.id).run();
      await db.prepare("DELETE FROM gc_sessions WHERE user_id=?").bind(target.id).run();
    }else{
      await db.prepare("UPDATE gc_users SET role=?, active=? WHERE id=?").bind(r,a,target.id).run();
      if(!a||r!==target.role)await db.prepare("DELETE FROM gc_sessions WHERE user_id=?").bind(target.id).run();
    }
    await audit(db,user.id,"users.update",target.id+" "+r+" "+a);
    return C({ok:true});
  }
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
