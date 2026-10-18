/* GreenCal Admin / Maker: authenticated UI adapter.
   UI hiding is convenience; all authorisation is checked by the Worker API. */
(function(){
 "use strict";
 const by=id=>document.getElementById(id);
 const state={user:null,access:null,revision:0,init:null,pending:false,saving:false,failed:false};
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
 const updateVerifiedIdentity=(access)=>{
   state.access=access||null;
   const box=by("gcIdentityInfo"),emailField=by("gcVerifiedEmail"),role=by("gcVerifiedRole");
   if(!box||!emailField||!role)return;
   const verified=typeof access?.email==="string"&&access.email.includes("@");
   box.hidden=!verified;
   if(!verified)return;
   emailField.textContent=access.email;
   role.textContent=access.role==="admin"?"Admin":access.role==="maker"?"Maker":"Akses terbatas";
   const loginEmail=by("gcLoginEmail");
   if(loginEmail){loginEmail.value=access.email;loginEmail.readOnly=true;loginEmail.title="Email telah diverifikasi oleh Cloudflare Access. Untuk mengganti akun, keluar dahulu dari sesi Access.";}
 };

 const showGate=async(message="")=>{
   const overlay=by("gcAuthGate");if(!overlay)return;
   overlay.hidden=false;
   by("gcLoginForm").hidden=false;
   by("gcBootstrapForm").hidden=true;
   by("gcForcePasswordForm").hidden=true;
   by("gcActivationForm").hidden=true;
   by("gcAuthHeading").textContent="Masuk ke GreenCal";
   by("gcAuthDescription").textContent="Identitas email diverifikasi melalui Cloudflare Access. Masukkan password pribadi GreenCal untuk melanjutkan.";
   msg(message);
 };
 const forcePasswordChange=()=>{
   by("gcAuthGate").hidden=false;
   by("gcLoginForm").hidden=true;
   by("gcBootstrapForm").hidden=true;
   by("gcForcePasswordForm").hidden=false;
   by("gcActivationForm").hidden=true;
   by("gcAuthHeading").textContent="Wajib Ganti Password";
   by("gcAuthDescription").textContent="Untuk mengamankan akun "+state.user.email+", ganti password sementara sebelum menggunakan aplikasi.";
   by("gcForcePasswordForm").reset();
   msg("");
 };

 const showActivation=(email)=>{
   by("gcAuthGate").hidden=false;
   by("gcLoginForm").hidden=true;
   by("gcBootstrapForm").hidden=true;
   by("gcForcePasswordForm").hidden=true;
   by("gcActivationForm").hidden=false;
   by("gcAuthHeading").textContent="Aktivasi Akun Pertama";
   by("gcAuthDescription").textContent="Email "+email+" sudah diverifikasi melalui Cloudflare Access. Buat password pribadi untuk pertama kali.";
   by("gcActivationForm").reset();
   msg("");
 };

 const applyRole=()=>{
   const admin=state.user?.role==="admin" && state.user?.permissions?.viewUsers===true;
   document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=!admin;});
   document.querySelectorAll('nav.desktop-nav [data-tab="parameter"]').forEach(el=>{el.hidden=!admin;});
   const chip=by("gcCurrentRole");if(chip)chip.textContent=admin?"Admin":"Maker";
   const profile=by("gcProfileRole");if(profile)profile.textContent=admin?"Admin":"Maker";
   const email=by("gcCurrentUser");if(email)email.textContent=state.user?.email||"";
   document.querySelectorAll('[data-ed],[data-xd],[data-od]').forEach(el=>{if(!admin)el.remove();});
   // Identities and assigned roles are managed through signed Cloudflare Access policies.
   const usersMenu=by("gcUsersMenu");if(usersMenu)usersMenu.hidden=!admin;
   document.querySelectorAll('[data-tab="users"]').forEach(el=>{el.hidden=!admin;});
   const passwordForm=by("gcPasswordForm");if(passwordForm)passwordForm.hidden=false;
   const cfg=by("btnConfigureAi");if(cfg)cfg.hidden=state.user?.permissions?.manageAiKeys!==true;
   const clear=by("btnClearSamples");if(clear)clear.hidden=state.user?.permissions?.deleteActivity!==true;
 };
 const postAuth=async()=>{
   if(state.user?.mustChangePassword){forcePasswordChange();return;}
   const saved=await request("/api/state");
   state.revision=saved.revision||0;
   by("gcAuthGate").hidden=true;
   applyRole();
   if(typeof state.init==="function")state.init(saved.data||null);
   applyRole();
   status("");
 };
 async function signIn(body,bootstrap){
   if(bootstrap)throw Error("Bootstrap publik ditutup.");
   const b=await request("/api/auth/login","POST",body);
   state.user=b.user;
   await postAuth();
 }
 // Informational only: browser support never proves a passkey is registered or MFA completed.
 async function detectPlatformAuthenticator(){
   const label=by("gcDeviceAuthenticatorStatus");if(!label)return;
   try{
     const available=typeof window.PublicKeyCredential==="function" &&
       typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==="function" &&
       await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
     label.textContent=available
       ?"Perangkat kompatibel. Daftarkan perangkat ke Cloudflare Access sebelum MFA diwajibkan."
       :"Autentikator belum terdeteksi. Periksa pengaturan biometrik/PIN perangkat dan gunakan browser terbaru.";
   }catch(_){
     label.textContent="Kompatibilitas tidak dapat diperiksa. Lakukan pendaftaran melalui Cloudflare Access.";
   }
 }
 function setupForms(){
   const toggle=by("gcTogglePassword"),forgot=by("gcForgotPassword");
   if(toggle)toggle.onclick=()=>{
     const input=by("gcLoginPassword"),visible=input.type==="password";
     input.type=visible?"text":"password";
     toggle.setAttribute("aria-pressed",String(visible));
     toggle.setAttribute("aria-label",visible?"Sembunyikan password":"Tampilkan password");
   };
   if(forgot)forgot.onclick=()=>{const help=by("gcForgotHelp");help.hidden=!help.hidden;forgot.setAttribute("aria-expanded",String(!help.hidden));};
   by("gcActivationForm").onsubmit=async e=>{
     e.preventDefault();
     const btn=e.currentTarget.querySelector('button[type="submit"]'),pass=by("gcActivatePassword").value;
     if(pass!==by("gcActivateConfirm").value){msg("Konfirmasi password tidak sama.");return;}
     if(pass.length<12||!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||
       !/[0-9]/.test(pass)||!/[^a-zA-Z0-9]/.test(pass)){
       msg("Gunakan minimal 12 karakter, termasuk huruf besar, kecil, angka, dan simbol.");return;
     }
     btn.disabled=true;msg("");
     try{
       await request("/api/auth/activate","POST",{password:pass});
       by("gcActivationForm").reset();
       await showGate("Aktivasi akun berhasil. Silakan login dengan password baru Anda.");
     }catch(err){msg(err.message);}finally{btn.disabled=false;}
   };
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
   by("gcForcePasswordForm").onsubmit=async e=>{
     e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');
     const old=by("gcForceOld").value,pass=by("gcForceNew").value;
     if(pass!==by("gcForceConfirm").value){msg("Konfirmasi password baru tidak sama.");return;}
     if(pass.length<12||!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||
       !/[0-9]/.test(pass)||!/[^a-zA-Z0-9]/.test(pass)){
       msg("Gunakan minimal 12 karakter dengan huruf besar, kecil, angka, dan simbol.");return;
     }
     btn.disabled=true;msg("");
     try{
       await request("/api/auth/password","POST",{oldPassword:old,newPassword:pass});
       by("gcForcePasswordForm").reset();
       state.user=null;state.revision=0;
       await showGate("Password baru telah disimpan. Silakan login ulang.");
     }catch(err){msg(err.message);}finally{btn.disabled=false;}
   };
   by("gcLogout").onclick=async()=>{
     await request("/api/auth/logout","POST",{}).catch(()=>{});
     state.user=null;state.revision=0;window.location.assign("/");
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
       state.user=null;state.revision=0;await showGate("Password berhasil diubah. Silakan login ulang.");
     }catch(err){by("gcPasswordFeedback").textContent=err.message;}finally{button.disabled=false;}
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
   get isAdmin(){return state.user?.role==="admin" && state.user?.permissions?.viewUsers===true;},
   async start(init){
     state.init=init;
     setupForms();
     void detectPlatformAuthenticator();
     try{const r=await request("/api/auth/me");state.user=r.user;updateVerifiedIdentity(r.user);await postAuth();}
     catch(e){
       state.user=null;
       try{
         const accessStatus=await request("/api/auth/status");
         updateVerifiedIdentity(accessStatus);
         if(accessStatus.activationRequired){showActivation(accessStatus.email);return;}
         if(!accessStatus.accountEnabled){await showGate("Akun ini belum tercatat atau belum aktif. Hubungi pengelola GreenCal dan pastikan email yang digunakan sudah sesuai.");return;}
       }catch(_){}
       await showGate();
     }
   },
   can(tab){if(!state.user)return false;const p=state.user.permissions||{};if(tab==="parameter")return p.manageParameters===true;if(tab==="users")return p.viewUsers===true;return p.viewDashboard===true;},
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
       const result=await request("/api/admin/users");
       tbody.innerHTML=(result.users||[]).map(u=>
         '<tr><td><b>'+safe(u.email)+'</b></td><td><span class="gc-role-tag">'+
         safe(u.role==="admin"?"Admin":"Maker")+'</span></td>'+
         '<td>'+(u.active?(u.must_change_password?"Belum aktivasi password":"Aktif &amp; teraktivasi"):"Nonaktif")+'</td></tr>'
       ).join("");
     }catch(e){by("gcUserFeedback").textContent=e.message;}

   }
 };
})();
