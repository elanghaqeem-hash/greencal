import test from "node:test";
import assert from "node:assert/strict";
import { permissionsForRole, writableKeysForRole, mayWriteStateKey, preservesExistingRecords } from "../src/roles.js";

test("Admin can configure system and Maker cannot",()=>{
 const admin=permissionsForRole("admin"), maker=permissionsForRole("maker");
 assert.equal(admin.viewUsers,true);
 assert.equal(admin.manageParameters,true);
 assert.equal(admin.manageAiKeys,true);
 assert.equal(admin.deleteActivity,true);
 assert.equal(maker.viewUsers,false);
 assert.equal(maker.manageParameters,false);
 assert.equal(maker.manageAiKeys,false);
 assert.equal(maker.deleteActivity,false);
});

test("Both user roles can input, edit and calculate emissions",()=>{
 for(const role of ["admin","maker"]){
  const p=permissionsForRole(role);
  assert.equal(p.viewDashboard,true);
  assert.equal(p.calculateEmissions,true);
  assert.equal(p.createActivity,true);
  assert.equal(p.editActivity,true);
  assert.equal(p.changePassword,true);
 }
 assert.equal(permissionsForRole("superadmin"),null);
 assert.equal(permissionsForRole("ADMIN"),null);
 assert.equal(permissionsForRole("anonymous"),null);
});

test("Admin-only state settings are rejected for Maker",()=>{
 assert.deepEqual(writableKeysForRole("maker"),["entries","exposures","offsets"]);
 for(const key of ["settings","tables","classes","users","audit","password_hash"]){
  assert.equal(mayWriteStateKey("maker",key),false);
 }
 for(const key of ["entries","exposures","offsets"]){
  assert.equal(mayWriteStateKey("maker",key),true);
 }
 assert.equal(mayWriteStateKey("admin","settings"),true);
 assert.equal(mayWriteStateKey("anonymous","entries"),false);
});

test("Maker may append or edit existing records without deleting their identities",()=>{
 const original=[{id:"e1",desc:"Sebelum"},{id:"e2"}];
 assert.equal(preservesExistingRecords(original,[{id:"e1",desc:"Sesudah"},{id:"e2"},{id:"e3"}]),true);
 assert.equal(preservesExistingRecords(original,original),true);
 assert.equal(preservesExistingRecords(original,[{id:"e1"}]),false);
 assert.equal(preservesExistingRecords(original,[{id:"e1"},{id:"e1"},{id:"e2"}]),false);
 assert.equal(preservesExistingRecords(original,[{id:"e1"},{id:"e2"},{desc:"no id"}]),false);
 assert.equal(preservesExistingRecords(original,[{id:"e1"},{id:"e2"},{id:""}]),false);
 assert.equal(preservesExistingRecords(original,[{id:"e1"},{id:"e2"},{id:123}]),false);
 assert.equal(preservesExistingRecords(original,{}),false);
});

test("Permissions maps do not expose mutation pathways for unexpected roles",()=>{
 assert.deepEqual(writableKeysForRole("unexpected"),[]);
 assert.equal(permissionsForRole(null),null);
});
