/* GreenCal Public Mode: no login, no shared banking database access.
   Each browser has its own private local working copy. */
(function(){
  "use strict";
  const STORE="greencal_public_data_v1";
  const guest=Object.freeze({role:"public",email:null,permissions:{viewDashboard:true,manageAiKeys:false,viewUsers:false,manageParameters:false}});
  let debounce=null;
  const get=id=>document.getElementById(id);
  const removePrivateUi=()=>{
    const gate=get("gcAuthGate");
    if(gate)gate.remove();
    document.querySelectorAll("[data-admin-only]").forEach(el=>{el.hidden=true;});
    document.querySelectorAll('[data-tab="users"],[data-tab="parameter"]').forEach(el=>{el.hidden=true;});
    const cfg=get("btnConfigureAi");if(cfg)cfg.hidden=true;
    const account=document.querySelector(".gc-account-bar");
    if(account){account.innerHTML='<span class="gc-role-tag" aria-label="Mode publik">Akses Publik</span>';}
    const security=get("gcAccountSecurityPanel");if(security)security.hidden=true;
    const users=get("view-users");if(users)users.hidden=true;
    const backup=get("gcBackupDescription");
    if(backup)backup.textContent="Data kalkulasi tersimpan hanya di browser perangkat ini, bukan di database bersama. Gunakan Unduh Cadangan untuk menyimpan salinan Anda. Jangan masukkan informasi rahasia debitur atau data pribadi.";
  };
  function read(){
    try{
      const raw=localStorage.getItem(STORE);
      if(!raw)return null;
      const obj=JSON.parse(raw);
      if(!obj||typeof obj!=="object"||Array.isArray(obj))return null;
      return {entries:Array.isArray(obj.entries)?obj.entries:[],exposures:Array.isArray(obj.exposures)?obj.exposures:[],
        offsets:Array.isArray(obj.offsets)?obj.offsets:[]};
    }catch(e){return null;}
  }
  function save(snapshot){
    try{
      const p=snapshot();
      const clean={entries:p.entries,exposures:p.exposures,offsets:p.offsets,updatedAt:new Date().toISOString()};
      localStorage.setItem(STORE,JSON.stringify(clean));
      const status=get("gcSyncStatus");if(status){status.hidden=true;status.textContent="";}
    }catch(e){
      const status=get("gcSyncStatus");
      if(status){status.hidden=false;status.textContent="Penyimpanan perangkat gagal. Unduh cadangan JSON sebelum menutup halaman.";}
    }
  }
  window.GC_AUTH={
    get user(){return guest;},
    get isAdmin(){return false;},
    async start(init){
      removePrivateUi();
      if(typeof init==="function")init(read());
      removePrivateUi();
    },
    can(tab){return !["users","parameter"].includes(tab);},
    applyRole:removePrivateUi,
    queue(snapshot){clearTimeout(debounce);debounce=setTimeout(()=>save(snapshot),160);},
    async renderUsers(){}
  };
})();
