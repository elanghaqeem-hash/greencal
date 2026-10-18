/* GreenCal role policy — single server-side source of truth.
 * Only the verified Cloudflare Access identity + active D1 user determines role.
 * Browser visibility rules are informative, never an authorization boundary.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze({
    viewDashboard: true,
    calculateEmissions: true,
    createActivity: true,
    editActivity: true,
    deleteActivity: true,
    manageParameters: true,
    manageAiKeys: true,
    viewUsers: true,
    changePassword: true,
    importLegacyData: true
  }),
  maker: Object.freeze({
    viewDashboard: true,
    calculateEmissions: true,
    createActivity: true,
    editActivity: true,
    deleteActivity: false,
    manageParameters: false,
    manageAiKeys: false,
    viewUsers: false,
    changePassword: true,
    importLegacyData: false
  })
});

const writable = Object.freeze({
  admin: Object.freeze(["entries","exposures","offsets","settings","tables","classes"]),
  maker: Object.freeze(["entries","exposures","offsets"])
});

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || null;
}

export function writableKeysForRole(role) {
  return writable[role] || Object.freeze([]);
}

export function mayWriteStateKey(role,key) {
  return writableKeysForRole(role).includes(key);
}

/** Maker may add/edit records, but never remove existing records by ID.
 * Reject missing/duplicate identifiers to prevent bypass via record substitution.
 */
export function preservesExistingRecords(before,after) {
  if(!Array.isArray(before)||!Array.isArray(after))return false;
  const ids = new Set();
  for(const row of after){
    if(!row||typeof row!=="object"||Array.isArray(row))return false;
    const id = row.id;
    if(typeof id!=="string"||!id.trim()||ids.has(id))return false;
    ids.add(id);
  }
  return before.every(row=>row&&typeof row.id==="string"&&ids.has(row.id));
}
