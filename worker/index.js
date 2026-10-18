const enc = new TextEncoder();
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = str => Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const digest = async text => b64(await crypto.subtle.digest("SHA-256",enc.encode(text)));
async function pwdHash(password,salt){
 const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
 return b64(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(salt),iterations:310000,hash:"SHA-256"},key,256));
}
const random = (n=32) => b64(crypto.getRandomValues(new Uint8Array(n)));
const cookie = (token,age) => `gc_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
async function identity(request,env){
 const token=request.headers.get("cookie")?.match(/(?:^|; )gc_session=([^;]+)/)?.[1]; if(!token)return null;
 const hash=await digest(token);
 return env.DB.prepare("SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.enabled=1").bind(hash,Math.floor(Date.now()/1000)).first();
}
async function keyFor(env){
 if(!env.AI_ENCRYPTION_KEY)throw Error("AI_ENCRYPTION_KEY not configured");
 const raw=unb64(env.AI_ENCRYPTION_KEY);if(raw.byteLength!==32)throw Error("Invalid encryption key");
 return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
async function seal(value,env){
 const iv=crypto.getRandomValues(new Uint8Array(12));const key=await keyFor(env);
 return {iv:b64(iv),encrypted_key:b64(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(value)))};
}
async function unseal(row,env){
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(row.iv)},await keyFor(env),unb64(row.encrypted_key)));
}
async function body(request){const content=Number(request.headers.get("content-length")||0);if(content>25000)throw Error("Request too large");const text=await request.text();if(text.length>25000)throw Error("Request too large");return JSON.parse(text||"{}");}
const validEmail=e=>typeof e==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<255;
const strongPwd=p=>typeof p==="string"&&p.length>=12&&p.length<=128;
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith("/api/")){
  if(path==="/login.html")return env.ASSETS.fetch(request);
  if(path==="/admin.html" || path==="/" || path==="/index.html"){
    if(!env.DB)return new Response("GreenCal authentication not configured",{status:503});
    const u=await identity(request,env);
    if(!u)return Response.redirect(url.origin+"/login.html",302);
    if(path==="/admin.html"&&u.role!=="admin")return new Response("Forbidden: Admin only",{status:403});
  }
  return env.ASSETS.fetch(request);
 }
 if(!env.DB)return json({error:"Database not configured"},503);
 const method=request.method;
 if(!["GET","POST","PUT","PATCH","DELETE"].includes(method))return json({error:"Method not allowed"},405);
 if(method!=="GET" && request.headers.get("origin")!==url.origin)return json({error:"Invalid origin"},403);
 try{
  if(path==="/api/bootstrap"&&method==="POST"){
   if(!env.ADMIN_SETUP_TOKEN)return json({error:"Bootstrap disabled"},403);
   const data=await body(request);
   if(data.setupToken!==env.ADMIN_SETUP_TOKEN||!validEmail(data.email)||!strongPwd(data.password))return json({error:"Setup credentials rejected"},403);
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
   if(count.n!==0)return json({error:"Already initialized"},409);
   const salt=random(16);await env.DB.prepare("INSERT INTO users(id,email,role,salt,password_hash) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),data.email.toLowerCase(),"admin",salt,await pwdHash(data.password,salt)).run();
   return json({ok:true,message:"Admin initialized; remove ADMIN_SETUP_TOKEN"});
  }
  if(path==="/api/login"&&method==="POST"){
   const d=await body(request);
   const u=typeof d.email==="string"?await env.DB.prepare("SELECT * FROM users WHERE email=? AND enabled=1").bind(d.email.toLowerCase()).first():null;
   if(!u||typeof d.password!=="string"||await pwdHash(d.password,u.salt)!==u.password_hash)return json({error:"Email or password incorrect"},401);
   const token=random(32),ttl=8*3600;
   await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await digest(token),u.id,Math.floor(Date.now()/1000)+ttl).run();
   const response=json({ok:true,user:{email:u.email,role:u.role}});
   response.headers.set("set-cookie",cookie(token,ttl));return response;
  }
  const user=await identity(request,env);if(!user)return json({error:"Authentication required"},401);
  if(path==="/api/me"&&method==="GET")return json({user});
  if(path==="/api/logout"&&method==="POST"){
   const token=request.headers.get("cookie")?.match(/(?:^|; )gc_session=([^;]+)/)?.[1];
   if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
   const res=json({ok:true});res.headers.set("set-cookie",cookie("",0));return res;
  }
  if(path==="/api/ai/settings"&&method==="GET"){
   const row=await env.DB.prepare("SELECT provider,model,encrypted_key IS NOT NULL AS configured,updated_at FROM ai_settings WHERE id=1").first();
   return json({settings:row||{provider:null,model:null,configured:false}});
  }
  if(path==="/api/ai/settings"&&method==="PUT"){
   if(user.role!=="admin")return json({error:"Admin only"},403);
   const d=await body(request);
   if(!["openai","gemini"].includes(d.provider)||typeof d.model!=="string"||!/^[-.a-zA-Z0-9_/]{2,100}$/.test(d.model)||typeof d.apiKey!=="string"||d.apiKey.length<10||d.apiKey.length>4096)return json({error:"Invalid AI configuration"},400);
   const secret=await seal(d.apiKey,env);
   await env.DB.prepare("INSERT INTO ai_settings(id,provider,model,encrypted_key,iv,updated_by,updated_at) VALUES(1,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,encrypted_key=excluded.encrypted_key,iv=excluded.iv,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(d.provider,d.model,secret.encrypted_key,secret.iv,user.id).run();
   return json({ok:true});
  }
  if(path==="/api/users"&&method==="GET"){
   if(user.role!=="admin")return json({error:"Admin only"},403);
   return json({users:(await env.DB.prepare("SELECT id,email,role,enabled,created_at FROM users ORDER BY created_at DESC LIMIT 200").all()).results});
  }
  if(path==="/api/users"&&method==="POST"){
   if(user.role!=="admin")return json({error:"Admin only"},403);
   const d=await body(request);if(!validEmail(d.email)||!strongPwd(d.password)||!["admin","user"].includes(d.role))return json({error:"Invalid account"},400);
   const salt=random(16);
   await env.DB.prepare("INSERT INTO users(id,email,role,salt,password_hash) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),d.email.toLowerCase(),d.role,salt,await pwdHash(d.password,salt)).run();
   return json({ok:true},201);
  }
  if(path.startsWith("/api/users/")&&method==="PATCH"){
   if(user.role!=="admin")return json({error:"Admin only"},403);
   const id=path.slice("/api/users/".length);const d=await body(request);
   if(id===user.id)return json({error:"Cannot change own role/status"},403);
   if(!["admin","user"].includes(d.role)||typeof d.enabled!=="boolean")return json({error:"Invalid fields"},400);
   const result=await env.DB.prepare("UPDATE users SET role=?, enabled=? WHERE id=?").bind(d.role,d.enabled?1:0,id).run();
   await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
   return json({ok:!!result.meta?.changes});
  }
  if(path==="/api/ai/analyze"&&method==="POST"){
   const d=await body(request);if(typeof d.prompt!=="string"||!d.prompt.trim()||d.prompt.length>12000)return json({error:"Invalid prompt"},400);
   const settings=await env.DB.prepare("SELECT * FROM ai_settings WHERE id=1").first();
   if(!settings?.encrypted_key)return json({error:"AI not configured by administrator"},503);
   const key=await unseal(settings,env);
   let response;
   if(settings.provider==="gemini"){
    response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(settings.model)+":generateContent",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{parts:[{text:d.prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2000}})});
   }else{
    response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+key},body:JSON.stringify({model:settings.model,messages:[{role:"user",content:d.prompt}],temperature:0.2,max_tokens:2000})});
   }
   if(!response.ok)return json({error:"AI provider request failed",status:response.status},502);
   const payload=await response.json();
   const text=settings.provider==="gemini"?payload.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join(""):payload.choices?.[0]?.message?.content;
   return json({text:text||"",provider:settings.provider,model:settings.model});
  }
  return json({error:"Not found"},404);
 }catch(e){
  if(e?.message==="Request too large")return json({error:"Request too large"},413);
  if(e?.message?.includes("UNIQUE constraint"))return json({error:"Account already exists"},409);
  return json({error:"Request failed; check server logs"},500);
 }
}};