/* GreenCal Public Mode: no login, no shared banking database access.
   Each browser has its own private local working copy. */
(function(){
  "use strict";
  const LEGACY_STORE="greencal_public_data_v1";
  const LEGACY_APP_STORE="green_calc_storage_v1";
  let scopedStore=null;
  let scopeReady=false;
  // Older unscoped data must never load automatically after network isolation is enabled.
  // Keep legacy keys for explicit backup/migration; never read into a network-scoped session. 
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
      const raw=scopedStore ? localStorage.getItem(scopedStore) : null;
      if(!raw)return null;
      const obj=JSON.parse(raw);
      if(!obj||typeof obj!=="object"||Array.isArray(obj))return null;
      return {entries:Array.isArray(obj.entries)?obj.entries:[],exposures:Array.isArray(obj.exposures)?obj.exposures:[],
        offsets:Array.isArray(obj.offsets)?obj.offsets:[],
        narrativeDrafts:obj.narrativeDrafts&&typeof obj.narrativeDrafts==="object"&&!Array.isArray(obj.narrativeDrafts)?obj.narrativeDrafts:{}};
    }catch(e){return null;}
  }
  async function save(snapshot){
    try{
      const r=await fetch("/api/client-scope",{cache:"no-store"});
      const d=r.ok?await r.json():null;
      if(!d || scopedStore!=="greencal_ip_scope_v1_"+d.scope){
        scopeReady=false;
        scopedStore=null;
        location.reload();
        return;
      }
    }catch(e){scopeReady=false;scopedStore=null;location.reload();return;}

    try{
      const p=snapshot();
      const clean={entries:p.entries,exposures:p.exposures,offsets:p.offsets,
        narrativeDrafts:p.narrativeDrafts&&typeof p.narrativeDrafts==="object"?p.narrativeDrafts:{},updatedAt:new Date().toISOString()};
      if(!scopeReady || !scopedStore)throw Error("IP scope not verified");
      localStorage.setItem(scopedStore,JSON.stringify(clean));
      const status=get("gcSyncStatus");if(status){status.hidden=true;status.textContent="";}
    }catch(e){
      const status=get("gcSyncStatus");
      if(status){status.hidden=false;status.textContent="Penyimpanan perangkat gagal. Unduh cadangan JSON sebelum menutup halaman.";}
    }
  }
  window.addEventListener("focus",async()=>{
    if(!scopeReady)return;
    try{
      const r=await fetch("/api/client-scope",{cache:"no-store"});
      const d=r.ok?await r.json():null;
      if(!d||scopedStore!=="greencal_ip_scope_v1_"+d.scope){scopeReady=false;scopedStore=null;location.reload();}
    }catch(_){scopeReady=false;scopedStore=null;location.reload();}
  });
  window.GC_AUTH={
    get user(){return guest;},
    get isAdmin(){return false;},
    async start(init){
      removePrivateUi();
      let restored=null;
      try{
        const response=await fetch("/api/client-scope",{credentials:"same-origin",cache:"no-store"});
        if(!response.ok)throw Error("IP identity unavailable");
        const result=await response.json();
        if(!/^[a-f0-9]{64}$/.test(result.scope||""))throw Error("Invalid IP scope");
        scopedStore="greencal_ip_scope_v1_"+result.scope;
        scopeReady=true;
        restored=read();
      }catch(error){
        scopeReady=false;
        scopedStore=null;
        const status=get("gcSyncStatus");
        if(status){status.hidden=false;status.textContent="Jaringan tidak dapat diverifikasi. Semua input tampil kosong; penyimpanan dinonaktifkan sampai koneksi tersedia.";}
      }
      if(typeof init==="function")init(restored);
      removePrivateUi();
    },
    resetCurrentScope(){
      if(!scopeReady||!scopedStore)throw Error("Jaringan belum terverifikasi. Reset tidak tersedia.");
      clearTimeout(debounce);
      localStorage.removeItem(scopedStore);
      return true;
    },
    get scopeReady(){return scopeReady;},
    can(tab){return !["users","parameter"].includes(tab);},
    applyRole:removePrivateUi,
    queue(snapshot){if(!scopeReady)return;clearTimeout(debounce);debounce=setTimeout(()=>save(snapshot),160);},
    async renderUsers(){}
  };
})();
