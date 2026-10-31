/* GreenCal Public Mode: no login, no shared banking database access.
   Each browser has its own private local working copy. */
(function(){
  "use strict";
  const LEGACY_STORE="greencal_public_data_v1";
  const LEGACY_APP_STORE="green_calc_storage_v1";
  let scopedStore=null;
  let scopeReady=false;
  let scopeGeneration=0;
  const EXTRA_SCOPE_KEYS=Object.freeze(["activity-draft","transition-scenario"]);
  const storageKey=name=>scopeReady&&scopedStore&&EXTRA_SCOPE_KEYS.includes(name)?scopedStore+":"+name:null;
  // Older unscoped data must never load automatically after network isolation is enabled.
  // Keep legacy keys for explicit backup/migration; never read into a network-scoped session. 
  // Cross-origin localStorage cannot be copied by a server. The user can
  // explicitly import their OWN JSON backup from the old Cloudflare origin.
  // Never allow an imported file to change admin parameters, users, AI keys,
  // bank membership, or enterprise database state.
  const safeJsonTree=(v,depth=0)=>{
    if(depth>14)return false;
    if(v===null)return true;
    if(typeof v==="string")return v.length<=100000;
    if(typeof v==="boolean")return true;
    if(typeof v==="number")return Number.isFinite(v);
    if(Array.isArray(v))return v.length<=50000&&v.every(x=>safeJsonTree(x,depth+1));
    if(!v||typeof v!=="object"||Object.getPrototypeOf(v)!==Object.prototype)return false;
    const keys=Object.keys(v);
    return keys.length<=250&&keys.every(k=>k.length<=160&&
      !["__proto__","prototype","constructor"].includes(k)&&safeJsonTree(v[k],depth+1));
  };
  function normalizePublicBackup(data){
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Struktur cadangan tidak valid");
    const fields=["entries","exposures","offsets"];
    if(!fields.some(k=>Array.isArray(data[k])) &&
      (!data.narrativeDrafts||typeof data.narrativeDrafts!=="object"))
      throw Error("File bukan cadangan data publik GreenCal");
    const out={};
    for(const key of fields){
      const records=data[key]??[];
      if(!Array.isArray(records)||records.length>50000||
        records.some(x=>!x||typeof x!=="object"||Array.isArray(x))||
        !safeJsonTree(records))throw Error("Format "+key+" tidak valid");
      out[key]=records;
    }
    const drafts=data.narrativeDrafts??{};
    if(!drafts||typeof drafts!=="object"||Array.isArray(drafts)||
       !safeJsonTree(drafts))throw Error("Draf narasi tidak valid");
    out.narrativeDrafts=drafts;
    out.updatedAt=new Date().toISOString();
    if(JSON.stringify(out).length>1900000)throw Error("Data melebihi batas penyimpanan");
    return out;
  }
  function installPublicBackupImport(){
    const button=get("btnBackupJson"),parent=button?.parentElement;
    if(!parent||get("gcImportPublicBackup"))return;
    const label=document.createElement("label");
    label.id="gcImportPublicBackup";
    label.className="btn sm";
    label.style.cursor="pointer";
    label.title="Pulihkan cadangan pribadi yang sebelumnya diunduh dari Cloudflare. File tidak diunggah ke server.";
    label.textContent="Impor Cadangan dari Cloudflare";
    const input=document.createElement("input");
    input.type="file";
    input.accept=".json,application/json";
    input.style.display="none";
    label.appendChild(input);
    parent.appendChild(label);
    input.onchange=async ev=>{
      const file=ev.target.files?.[0];if(!file)return;
      try{
        if(!scopeReady||!scopedStore)throw Error("Verifikasi jaringan belum tersedia");
        if(file.size>1900000)throw Error("Ukuran berkas terlalu besar");
        const parsed=normalizePublicBackup(JSON.parse(await file.text()));
        const current=read();
        if(current&&(current.entries.length||current.exposures.length||
          current.offsets.length||Object.keys(current.narrativeDrafts||{}).length)){
          if(!window.confirm("Impor akan menggantikan data pada browser/jaringan ini. Cadangkan data yang sudah ada terlebih dahulu. Lanjutkan?"))return;
        }
        clearTimeout(debounce);
        scopeGeneration++;
        localStorage.setItem(scopedStore,JSON.stringify(parsed));
        location.reload();
      }catch(err){window.alert(err?.message||"Cadangan tidak dapat dipulihkan");}
      finally{input.value="";}
    };
  }
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
    if(account){account.textContent="";account.hidden=true;}
    const security=get("gcAccountSecurityPanel");if(security)security.hidden=true;
    const users=get("view-users");if(users)users.hidden=true;
    const backup=get("gcBackupDescription");
    if(backup)backup.textContent="Data kalkulasi tersimpan hanya di browser perangkat ini, bukan di database bersama. Gunakan Unduh Cadangan untuk menyimpan salinan Anda. Jangan masukkan informasi rahasia debitur atau data pribadi.";
    installPublicBackupImport();
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
  async function save(snapshot,expectedGeneration){
    if(expectedGeneration!==scopeGeneration||!scopeReady||!scopedStore)return;
    try{
      const r=await fetch("/api/client-scope",{cache:"no-store"});
      const d=r.ok?await r.json():null;
      if(!d || scopedStore!=="greencal_ip_scope_v1_"+d.scope){
        scopeReady=false;
        scopedStore=null;
        scopeGeneration++;
        location.reload();
        return;
      }
    }catch(e){scopeReady=false;scopedStore=null;scopeGeneration++;location.reload();return;}

    try{
      const p=snapshot();
      const clean={entries:p.entries,exposures:p.exposures,offsets:p.offsets,
        narrativeDrafts:p.narrativeDrafts&&typeof p.narrativeDrafts==="object"?p.narrativeDrafts:{},updatedAt:new Date().toISOString()};
      if(!scopeReady || !scopedStore || scopeGeneration!==expectedGeneration)return;
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
      if(!d||scopedStore!=="greencal_ip_scope_v1_"+d.scope){scopeReady=false;scopedStore=null;scopeGeneration++;location.reload();}
    }catch(_){scopeReady=false;scopedStore=null;scopeGeneration++;location.reload();}
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
        scopeGeneration++;
        scopeReady=true;
        restored=read();
      }catch(error){
        scopeReady=false;
        scopedStore=null;
        scopeGeneration++;
        const status=get("gcSyncStatus");
        if(status){status.hidden=false;status.textContent="Jaringan tidak dapat diverifikasi. Semua input tampil kosong; penyimpanan dinonaktifkan sampai koneksi tersedia.";}
      }
      if(typeof init==="function")init(restored);
      removePrivateUi();
    },
    resetCurrentScope(){
      if(!scopeReady||!scopedStore)throw Error("Jaringan belum terverifikasi. Reset tidak tersedia.");
      clearTimeout(debounce);
      scopeGeneration++;
      const keys=[scopedStore,...EXTRA_SCOPE_KEYS.map(storageKey).filter(Boolean),"green_activity_draft_v1","greencal_transition_scenario_assumptions_v1"];
      keys.forEach(key=>localStorage.removeItem(key));
      return true;
    },
    get scopeReady(){return scopeReady;},
    scopedKey:storageKey,
    can(tab){return !["users","parameter"].includes(tab);},
    applyRole:removePrivateUi,
    queue(snapshot){if(!scopeReady)return;clearTimeout(debounce);const revision=scopeGeneration;debounce=setTimeout(()=>save(snapshot,revision),160);},
    async renderUsers(){}
  };
})();
