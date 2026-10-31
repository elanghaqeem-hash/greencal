import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBook7PublishedPdf} from '../scripts/book7/reconcile-pdf-catalog.mjs';

test('Recalculate every Buku 7 published PDF parameter and shock without claiming official Excel parity',()=>{
 const r=reconcileBook7PublishedPdf();
 assert.deepEqual(r.tableRows,{ 'A.3':1260,'A.5':36,'A.6':420,'A.7':369,'B.2':3,'B.5':1260,'A.8':21,'B.3':26,'C.2':84});
 assert.equal(r.numericCells,30492);
 assert.equal(r.arithmeticChecks,30883);
 assert.equal(r.lookupChecks,30366);
 assert.equal(r.anomalies.length,1);
 assert.equal(r.anomalies[0].year,2027);
 assert.match(r.anomalies[0].source,/^A\.7:/);
 assert.equal(r.arithmeticParityForPdfSource,true);
 assert.equal(r.officialOjkWorkbookParity,false);
 assert.equal(r.regulatoryProductionApproved,false);
 for(const digest of Object.values(r.pdfCatalogSha256))assert.match(digest,/^[a-f0-9]{64}$/);
});
