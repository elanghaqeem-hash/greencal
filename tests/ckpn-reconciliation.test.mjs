import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileCkpn} from '../scripts/ckpn-reconciliation.mjs';
const csv='facilityRef,currency,asOf,stage,bookedCKPN\nFAC-001,IDR,2026-09-30,1,5\nFAC-002,IDR,2026-09-30,2,10\n';
const rows=[{facilityRef:'FAC-001',stage:1,currency:'IDR',expectedCreditLoss:'5.1'},{facilityRef:'FAC-002',stage:2,currency:'IDR',expectedCreditLoss:'10.1'}];
const control={currency:'IDR',asOf:'2026-09-30',rowCount:2,glCkpnControlTotal:'15',approvedTolerance:'0.1'};
test('CKPN facility by facility reconciles booked ECL, GL, scenario estimate and tolerances',()=>{
 const p=reconcileCkpn(csv,rows,control);
 assert.equal(p.rowCount,2);assert.equal(p.bookedCkpnTotal,'15');assert.equal(p.modelEclTotal,'15.2');assert.equal(p.totalVariance,'0.2');
 assert.equal(p.withinTolerance,true);assert.equal(p.postingAllowed,false);assert.equal(p.exceptions.length,2);
});
test('CKPN adapter fails closed on independent GL mismatch, missing facilities, cross-currency and PII columns',()=>{
 assert.throws(()=>reconcileCkpn(csv,rows,{...control,glCkpnControlTotal:'16'}),/GL/);
 assert.throws(()=>reconcileCkpn(csv,rows.slice(0,1),control),/row-count/);
 assert.throws(()=>reconcileCkpn(csv.replace('facilityRef,currency','debtorName,facilityRef,currency'),rows,control),/PII/);
 assert.throws(()=>reconcileCkpn(csv,rows.map(x=>({...x,currency:'USD'})),control),/currency/);
 assert.equal(reconcileCkpn(csv,rows,{...control,approvedTolerance:'0'}).status,'exceptions_require_bank_review');
});
