/* GreenCal anonymous workspace: D1-backed per-browser data, no login.
 * Server sets an HttpOnly random device cookie; never expose the token to JS.
 * Legacy localStorage remains untouched for manual backup, not auto-imported.
 */
(function(){
"use strict";
const guest=Object.freeze({role:"public",email:null,permissions:{viewDashboard:true,manageAiKeys:false,viewUsers:false,manageParameters:false}});
const get=id=>document.getElementById(id);
let ready=false,revision=0,timer=null,queueSnapshot=null,busy=Promise.resolve(),generation=0;
const notice=message=>{const el=get("gcSyncStatus");if(el){el.hidden=!message;el.textContent=message||"";}};
const removePrivateUi=()=>{
  get("gcAuthGate")?.remove();
  document.querySelectorAll("[data-admin-only]").forEach(el=>el.hidden=true);
  document.querySelectorAll('[data-tab="users"],[data-tab="parameter"]').forEach(el=>el.hidden=true);
  const cfg=get("btnConfigureAi");if(cfg)cfg.hidden=true;
  const account=document.querySelector(".gc-account-bar");
  if(account)account.innerHTML="";
  for(const id of ["gcAccountSecurityPanel","view-users"]){const x=get(id);if(x)x.hidden=true;}
  const backup=get("gcBackupDescription");
  if(backup)backup.textContent="Data kerja disimpan pada ruang perangkat ini di database GreenCal. Pengguna browser lain tidak mendapat akses otomatis. Gunakan cadangan JSON untuk salinan independen.";
};
async function request(method,body){
  const r=await fetch("/api/public/state",{method,credentials:"same-origin",cache:"no-store",
    headers:method==="PUT"?{"Content-Type":"application/json"}:{},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data.error||"Database GreenCal tidak tersedia"),{status:r.status});
  return data;
}
async function flush(){
  if(!ready||!queueSnapshot)return;
  const snapshot=queueSnapshot;queueSnapshot=null;
  let data;
  try{data=snapshot();}catch(e){notice("Data tidak dapat disiapkan untuk penyimpanan.");return;}
  const captured=generation;
  busy=busy.then(async()=>{
    if(captured!==generation)return;
    try{
      const saved=await request("PUT",{revision,data});
      revision=saved.revision;
      notice("");
    }catch(e){
      if(e.status===409){
        ready=false;
        notice("Data telah berubah pada tab lain. Unduh cadangan JSON, kemudian muat ulang halaman agar perubahan tidak tertimpa.");
      }else{
        notice("Penyimpanan database gagal. Jangan tutup halaman; unduh cadangan JSON sebelum memuat ulang.");
      }
    }
  });
  await busy;
}
window.GC_AUTH={
  get user(){return guest;},get isAdmin(){return false;},
  get scopeReady(){return ready;},
  can(tab){return !["users","parameter"].includes(tab);},
  applyRole:removePrivateUi,
  async start(init){
    removePrivateUi();
    let restored=null;
    try{
      const x=await request("GET");
      revision=x.revision;restored=x.data;ready=true;notice("");
    }catch(e){
      ready=false;notice("Database tidak dapat diakses. Form tetap tersedia, tetapi penyimpanan nonaktif. Ekspor cadangan sebelum meninggalkan halaman.");
    }
    if(typeof init==="function")init(restored);
    removePrivateUi();
  },
  queue(snapshot){
    if(!ready){notice("Penyimpanan nonaktif. Unduh cadangan JSON.");return;}
    queueSnapshot=snapshot;
    clearTimeout(timer);
    timer=setTimeout(()=>{void flush();},300);
  },
  async resetCurrentScope(){
    if(!ready)throw Error("Database belum tersedia.");
    clearTimeout(timer);queueSnapshot=null;
    await busy;
    generation++;
    const saved=await request("PUT",{revision,data:{entries:[],exposures:[],offsets:[],narrativeDrafts:{}}});
    revision=saved.revision;notice("");
    return true;
  },
  async renderUsers(){}
};
})();
