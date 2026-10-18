/* GreenCal Admin / Maker: authenticated UI adapter.
   UI hiding is convenience; all authorisation is checked by the Worker API. */
(function(){
 "use strict";
 const by=id=>document.getElementById(id);
 const state={user:null,revision:0,init:null,pending:false,saving:false,failed:false};
 const request=async(path,method="GET",data)=>{
   const rsp=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
     headers:data===undefined?{}:{"content-type":"application/json"},
     body:data===undefined?undefined:JSON.stringify(data)});
   let payload={};try{payload=await rsp.json();}catch{}
   if(!rsp.ok){const e=new Error(payload.error||"Koneksi gagal ("+rsp.status+")");e.status=rsp.status;throw e;}
   return payload;
 };
 const msg=text=>{by("gcAuthError").textContent=text;by("gcAuthError").hidden=!text;};
 const status=msg=>{const box=by("gcSyncStatus");if(box){box.textContent=msg;box.hidden=!msg;}};
 const showGate=async()=>{
   const overlay=by("gcAuthGate");overlay.hidden=false;
   by("gcLoginForm").hidden=false;
   by("gcBootstrapForm").hidden=true;
   msg("");
   try{
     const s=await request("/api/auth/status");
     if(!s.hasAdmin){
       by("gcLoginForm").hidden=true;
       by("gcBootstrapForm").hidden=!s.setupAvailable;
       if(!s.setupAvailable)msg("Admin belum diaktivasi. Pengelola harus mengatur secret GC_BOOTSTRAP_TOKEN di Cloudflare terlebih dahulu.");
     }
   }catch(e){msg(e.message);}
 };
 const applyRole=()=>{
   const admin=state.user?.role==="admin";
   document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=!admin;});
   document.querySelectorAll('nav.desktop-nav [data-tab="parameter"]').forEach(el=>{el.hidden=!admin;});
   const chip=by("gcCurrentRole");if(chip)chip.textContent=admin?"Admin":"Maker";
   const profile=by("gcProfileRole");if(profile)profile.textContent=admin?"Admin":"Maker";
   const email=by("gcCurrentUser");if(email)email.textContent=state.user?.email||"";
   document.querySelectorAll('[data-ed],[data-xd],[data-od]').forEach(el=>{if(!admin)el.remove();});
   const cfg=by("btnConfigureAi");if(cfg)cfg.hidden=!admin;
   const clear=by("btnClearSamples");if(clear)clear.hidden=!admin;
 };
 const postAuth=async()=>{
   const saved=await request("/api/state");
   state.revision=saved.revision||0;
   by("gcAuthGate").hidden=true;
   applyRole();
   if(typeof state.init==="function")state.init(saved.data||null);
   applyRole();
   status("");
 };
 async function signIn(body,bootstrap){
   const b=await request(bootstrap?"/api/auth/bootstrap":"/api/auth/login","POST",body);
   state.user=b.user;
   await postAuth();
 }
 function setupForms(){
   by("gcLoginForm").onsubmit=async e=>{
     e.preventDefault();msg("");const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');
     btn.disabled=true;
     try{await signIn({email:by("gcLoginEmail").value,password:by("gcLoginPassword").value},false);by("gcLoginPassword").value="";}
     catch(ex){msg(ex.message);}finally{btn.disabled=false;}
   };
   by("gcBootstrapForm").onsubmit=async e=>{
     e.preventDefault();msg("");const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
     try{await signIn({email:by("gcSetupEmail").value,password:by("gcSetupPassword").value,code:by("gcSetupCode").value},true);
       by("gcSetupPassword").value="";by("gcSetupCode").value="";}
     catch(ex){msg(ex.message);}finally{btn.disabled=false;}
   };
   by("gcLogout").onclick=async()=>{
     await request("/api/auth/logout","POST",{}).catch(()=>{});
     state.user=null;state.revision=0;
     by("gcLoginPassword").value="";
     await showGate();
   };
   by("gcUsersMenu").onclick=()=>{if(state.user?.role==="admin"&&typeof window.setTab==="function")window.setTab("users");};
   by("gcUsersMenu").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();by("gcUsersMenu").click();}};
   by("gcRefreshUsers").onclick=()=>{window.GC_AUTH.renderUsers();};
   by("gcPasswordForm").onsubmit=async e=>{
     e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
     try{
       await request("/api/auth/password","POST",{oldPassword:by("gcOldPassword").value,newPassword:by("gcNewSelfPassword").value});
       by("gcPasswordForm").reset();
       by("gcPasswordFeedback").textContent="Password diubah. Silakan login ulang.";
       state.user=null;state.revision=0;await showGate();
     }catch(err){by("gcPasswordFeedback").textContent=err.message;}finally{button.disabled=false;}
   };
   by("gcUserCreate").onsubmit=async e=>{
     e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');
     btn.disabled=true;
     try{
       await request("/api/admin/users","POST",{
         email:by("gcNewEmail").value,password:by("gcNewPassword").value,role:by("gcNewRole").value});
       form.reset();by("gcUserFeedback").textContent="Pengguna berhasil dibuat.";
       await window.GC_AUTH.renderUsers();
     }catch(err){by("gcUserFeedback").textContent=err.message;}finally{btn.disabled=false;}
   };
   by("gcUsersTable").onclick=async e=>{
     const b=e.target.closest("[data-user-action]");if(!b)return;
     const id=b.dataset.userId,role=b.dataset.role,active=b.dataset.active==="1",action=b.dataset.userAction;
     let values={};
     if(action==="toggle")values={active:!active};
     else if(action==="role")values={role:role==="admin"?"maker":"admin"};
     else if(action==="reset"){
       const pw=prompt("Password baru (minimal 12 karakter) untuk akun ini:");
       if(pw===null)return;
       values={password:pw};
     }
     if(action!=="reset"&&!confirm("Simpan perubahan akses pengguna ini?"))return;
     b.disabled=true;
     try{await request("/api/admin/users/"+id,"PATCH",values);by("gcUserFeedback").textContent="Pengguna berhasil diperbarui.";await window.GC_AUTH.renderUsers();}
     catch(err){by("gcUserFeedback").textContent=err.message;}finally{b.disabled=false;}
   };
   by("gcImportLocal").onclick=async()=>{
     if(state.user?.role!=="admin")return;
     const raw=localStorage.getItem("green_calc_storage_v1");
     if(!raw){status("Tidak ditemukan data browser lama.");return;}
     let parsed;try{parsed=JSON.parse(raw);}catch{status("Data browser lama tidak valid.");return;}
     if(!confirm("Impor data lama dari browser INI ke penyimpanan bersama? Impor akan menggantikan data Cloudflare yang saat ini tersimpan. Lanjutkan hanya jika sumbernya sudah diverifikasi."))return;
     const current=await request("/api/state");
     if(current.revision!==0){status("Impor otomatis ditolak karena data bersama sudah ada. Gunakan proses migrasi tervalidasi.");return;}
     const keys=["entries","exposures","offsets","settings","tables","classes"];
     const data={};keys.forEach(k=>{if(parsed[k])data[k]=parsed[k];});
     try{const out=await request("/api/state","PUT",{revision:current.revision,data});
       state.revision=out.revision;status("Data browser lama telah diimpor ke database. Muat ulang halaman untuk melihatnya.");
     }catch(e){status("Impor gagal: "+e.message);}
   };
 }
 const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let timer=null;
 async function flush(snapshot){
   if(state.saving)return;
   state.saving=true;
   while(state.pending){
     state.pending=false;
     const data=snapshot();
     try{const r=await request("/api/state","PUT",{revision:state.revision,data});
       state.revision=r.revision;
       state.failed=false;
       status("");
     }catch(err){
       state.failed=true;
       status("Data belum tersimpan: "+err.message+" Jangan tutup halaman sebelum diselesaikan.");
       if(err.status===401)await showGate();
       if(err.status===409){state.pending=false;break;}
       // Stop retry storm on network failures; next user edit retriggers attempt.
       break;
     }
   }
   state.saving=false;
 }
 window.GC_AUTH={
   get user(){return state.user;},
   get isAdmin(){return state.user?.role==="admin";},
   async start(init){
     state.init=init;
     setupForms();
     try{const r=await request("/api/auth/me");state.user=r.user;await postAuth();}
     catch{await showGate();}
   },
   can(tab){return !!state.user&&(tab!=="parameter"&&tab!=="users"||state.user.role==="admin");},
   applyRole,
   queue(snapshot){
     if(!state.user)return;
     state.pending=true;
     clearTimeout(timer);
     timer=setTimeout(()=>{flush(snapshot);},220);
   },
   async renderUsers(){
     if(!this.isAdmin)return;
     const tbody=by("gcUsersTable");
     try{
       const r=await request("/api/admin/users");
       tbody.innerHTML=(r.users||[]).map(u=>
         '<tr><td><b>'+safe(u.email)+'</b></td><td><span class="gc-role-tag">'+safe(u.role==="admin"?"Admin":"Maker")+'</span></td>'+
         '<td>'+ (u.active?"Aktif":"Nonaktif") + '</td><td><div class="gc-user-actions">'+
         (u.id===state.user.id?'<small>Akun sendiri</small>':
           '<button class="btn sm" data-user-action="role" data-user-id="'+safe(u.id)+'" data-role="'+safe(u.role)+'">Ubah Role</button>'+
           '<button class="btn sm" data-user-action="toggle" data-user-id="'+safe(u.id)+'" data-active="'+u.active+'">'+(u.active?"Nonaktifkan":"Aktifkan")+'</button>'+
           '<button class="btn sm" data-user-action="reset" data-user-id="'+safe(u.id)+'">Reset Password</button>')+
         '</div></td></tr>').join("");
     }catch(e){by("gcUserFeedback").textContent=e.message;}
   }
 };
})();
