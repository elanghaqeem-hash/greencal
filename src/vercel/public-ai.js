// Cloudflare KV replacement for public-only AI: immutable Vercel environment config.
// Never sends keys or provider credentials to the browser. Admin mutation is disabled.
import {handlePublicAiApi} from '../ai-worker.js';
const PROVIDERS=new Set(['gemini','openai','openrouter','groq']);
const KEY_NAMES=['AI_KEY_GEMINI','AI_KEY_OPENAI','AI_KEY_OPENROUTER','AI_KEY_GROQ'];
export function parsePublicAiOrder(raw){
 if(raw===undefined||raw===null||raw==='')return null; // Cloudflare's built-in defaults
 try{
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed)||parsed.length<1||parsed.length>4)return false;
  const used=new Set();
  const order=[];
  for(const p of parsed){
   if(!p||!PROVIDERS.has(p.provider)||used.has(p.provider)||typeof p.model!=='string'||
    !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(p.model)||typeof p.enabled!=='boolean')return false;
   used.add(p.provider);
   order.push({provider:p.provider,model:p.model,enabled:p.enabled});
  }
  return order;
 }catch{return false;}
}
export function vercelPublicAiEnvironment(config,db){
 const order=parsePublicAiOrder(config.GREENCAL_AI_ORDER_JSON);
 const enabled=config.GREENCAL_PUBLIC_AI_ENABLED==='true'&&order!==false;
 const result={GREENCAL_PUBLIC_AI_ENABLED:enabled?'true':'false',
  DB:db,AI_CONFIG:{async get(key,options){
    if(key!=='ai_chain_v1'||options?.type!=='json')return null;
    return order?{order,updatedAt:null}:null;
   }}};
 for(const key of KEY_NAMES){
  if(typeof config[key]==='string'&&config[key].length>11)result[key]=config[key];
 }
 return result;
}
export async function handleVercelPublicAi(request,config,db,scope){
 return handlePublicAiApi(request,vercelPublicAiEnvironment(config,db),scope);
}
