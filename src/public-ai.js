/* Rate limiting for optional public aggregate-only AI analysis.
 * Requires migrations/0004_public_ai_quota.sql in D1 before public mode is enabled.
 * Every attempt is counted before outbound provider calls. No client-controlled quotas.
 */
export const PUBLIC_AI_PER_IP_DAY=3;
export const PUBLIC_AI_GLOBAL_DAY=50;
const TABLE="gc_public_ai_quota";
export async function consumePublicAiQuota(db,scope,now=new Date()){
  if(!/^[a-f0-9]{64}$/.test(scope||""))throw Error("INVALID_SCOPE");
  const day=now.toISOString().slice(0,10);
  // Atomic, single-row SQLite upsert prevents simultaneous requests exceeding limits.
  async function increment(key,limit){
    const row=await db.prepare(`
      INSERT INTO ${TABLE}(day,scope,used) VALUES(?,?,1)
      ON CONFLICT(day,scope) DO UPDATE SET used=used+1 WHERE used < ?
      RETURNING used`).bind(day,key,limit).first();
    return Boolean(row?.used);
  }
  if(!await increment("ip:"+scope,PUBLIC_AI_PER_IP_DAY))return {ok:false,code:"IP_DAILY_LIMIT"};
  if(!await increment("global",PUBLIC_AI_GLOBAL_DAY))return {ok:false,code:"GLOBAL_DAILY_LIMIT"};
  return {ok:true};
}
