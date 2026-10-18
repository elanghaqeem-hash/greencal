/* GreenCal temporary AI configuration: never put credential values in source code.
   Secret GREENCAL_TEMP_AI_KEY must be added through Cloudflare encrypted secrets.
   Expiration is enforced server-side on every inference request.
   Thursday 22 October 2026 23:59:59.999 Asia/Jakarta = 16:59:59.999 UTC.
*/
export const TEMP_AI_EXPIRES_AT = "2026-10-22T16:59:59.999Z";
export const TEMP_AI_EXPIRY_EPOCH = Date.parse(TEMP_AI_EXPIRES_AT);
const DEFAULT_MODELS = Object.freeze({
  gemini:"gemini-2.5-flash",
  openai:"gpt-4.1-mini",
  openrouter:"openai/gpt-4.1-mini",
  groq:"llama-3.3-70b-versatile"
});
export function temporaryAiState(env, now=Date.now()){
  const rawProvider=String(env?.GREENCAL_TEMP_AI_PROVIDER||"gemini").trim().toLowerCase();
  const provider=Object.hasOwn(DEFAULT_MODELS,rawProvider)?rawProvider:null;
  const requestedModel=String(env?.GREENCAL_TEMP_AI_MODEL||"").trim();
  const model=provider&&(/^[-A-Za-z0-9_.:/]{1,100}$/.test(requestedModel)?requestedModel:DEFAULT_MODELS[provider]);
  const configured=!!(provider&&typeof env?.GREENCAL_TEMP_AI_KEY==="string"&&env.GREENCAL_TEMP_AI_KEY.length>=12);
  const expired=now>TEMP_AI_EXPIRY_EPOCH;
  return {provider,model,configured,expired,active:configured&&!expired,expiresAt:TEMP_AI_EXPIRES_AT,mode:"temporary-worker-secret"};
}
