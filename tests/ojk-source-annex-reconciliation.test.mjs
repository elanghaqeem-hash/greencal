import test from 'node:test';
import assert from 'node:assert/strict';
import {OJK_ANNEX_AUDIT_20261031 as audit} from '../src/enterprise/ojk-annex-audit.js';
import {publicOjkReadiness} from '../src/enterprise/ojk-readiness.js';
import {book6Catalog,book6Preview,validateBook6Draft} from '../src/enterprise/book6.js';
import {reconcileBook7PublishedPdf} from '../scripts/book7/reconcile-pdf-catalog.mjs';

test('Official source annex audit records original counts and explicitly blocks approvals',()=>{
 assert.equal(audit.book3.independentlyRecomputed+audit.book3.remainingNotRecomputed,audit.book3.formulaCells);
 assert.equal(audit.book5.numericScenarioYearPositions,audit.book5.riskSourceWorksheets*audit.book5.rowsPerWorksheet*12);
 assert.equal(audit.book5.sourceDuplicateKeysPerWorksheet,4);
 assert.equal(audit.book5.postcodeMappingRows,83242);
 assert.equal(audit.book5.postcodeMultipleLocationCandidates,777);
 assert.equal(audit.book6.sheetNames.length,12);
 assert.equal(audit.book6.formulaCells,2876);
 assert.equal(audit.book6.sharedFormulaCells,2496);
 assert.equal(audit.book6.blueStyleUnlockedCells,12489);
 assert.equal(audit.book6.formulaStyledUnlockedCells,133);
 assert.equal(audit.book6.formulaAndCellParityWithBankExport,false);
 const result=reconcileBook7PublishedPdf();
 assert.equal(result.numericCells,audit.book7.pdfReadableNumericPositions);
 assert.equal(result.arithmeticChecks,audit.book7.pdfArithmeticRecomputationChecks);
 assert.equal(result.lookupChecks,audit.book7.pdfLookupCrossChecks);
 assert.equal(result.anomalies.length,audit.book7.excludedNanSourcePositions);
 assert.equal(audit.officialOjkSubmissionApproved,false);
 assert.equal(audit.bankProductionReady,false);
});
test('Buku 6 catalog reports verified structural intake but never official Excel parity',()=>{
 const c=book6Catalog(),r=publicOjkReadiness();
 assert.equal(c.sourceWorkbookFormulaCells,2876);
 assert.equal(c.officialWorkbookMetadataInspected,true);
 assert.equal(c.officialWorkbookAvailable,false);
 assert.equal(c.templateParity,'unverified');
 assert.equal(r.status,'NOT_READY');
 assert.equal(r.counts.booksPassed,0);
 assert.equal(r.officialAnnexReconciliation.book6.formulaCells,2876);
 assert.equal(r.bankProductionReady,false);
});
