# OJK CRMS 2026 Buku 5 — review and deployment of the supplied annexes

## Source assurance
Both user-uploaded workbooks open with the user-supplied password. Original encrypted workbook SHA-256:
- Lampiran 1 Buku 5 — Data Risiko Fisik.xlsx: \`ec43a6e771c085d865f0adbd76b73692758b0e9b97db613b21e8ea2b9b91fcbb\`.
- Lampiran 2 Buku 5 — Mapping Kodepos.xlsx: \`eb305da341f9e893b12921e4844644934341cfdc2ea523ee71efaaf0362592d7\`.

Sumber 1: seven worksheets with 28,908 source rows each (7,227 administrative kecamatan × four asset lines), 3 scenarios and 4 years.
Sumber 2: 83,242 mapping rows, 10,611 distinct postal codes; 777 postal codes map to >1 geographic candidate. Official postcode mapping is **many-to-many**; do not select the first match.

The supplied Excel Cover clarifies risk categories as **Rendah 0, Menengah 0–50 (excluding the already classified zero), Tinggi >50**. This resolves the PDF Table 4's overlap at 50. The validated engine must return 50 as menengah.

## Source anomaly control
Source file has 4 repeated source keys (each on 7 hazard sheets) for PAPUA / PEGUNUNGAN BINTANG / OKBAB, source row 19324–19327 and 19332–19335, with conflicting score values for some hazards. Do not silently choose a duplicate.

Skor Dampak Gabungan row for JAKARTA BARAT / CENGKARENG / KOMERSIAL lists province **DAERAH ISTIMEWA YOGYAKARTA**, but all six individual-hazard sheets show **DAERAH KHUSUS IBUKOTA JAKARTA**. Do not silently overwrite source provenance.

A controlled bank-side private extraction staged **346,788 scenario/year rows** out of the 346,848 initially normalized rows and **quarantined 60 rows** corresponding to these anomalies. All raw official source files remain immutable. The geographically safe staged subset covers 34 provinces, 489 regencies and 7,225 distinct kecamatan. These data counts describe the *staged subset*, not the complete official annex. Final OJK source integrity requires independent adjudication of the exceptions and location mapping.

Additional traceability caveats: 119 official \`ID_BUKU 5\` keys map to multiple administrative candidates; some source rows have missing district codes; 52 Buku 5 location ID strings have no exact mapping match. A valid postcode is not sufficient to identify a unique score.

## Repository implementation
- \`src/enterprise/book5.js\`: scoring boundaries backed by the official Excel Cover, without altering source-published combined scores.
- \`src/enterprise/book5-api.js\`: tenant/role gated postcode candidate lookup. Only \`validated\` source versions can serve readings. No automatic mapping to a unique district if ambiguous.
- \`migrations/vercel/0103_book5_postcodes.sql\`: tenant-separated mapping and source version tables. Staged source and immutable raw mapping rows.
- \`scripts/book5/import-official-annex.mjs\`: bank-side loader, SHA-256 verified, schema validated, rows reconciled, *staging-only*. It will NOT set \`validated\`; no secrets, datasets, or full official content are pushed to GitHub.
- \`assets/enterprise-book5.js\`: explicit postcode candidate selection, not automatic first result.

## Bank operator procedure
1. Keep the two original encrypted workbooks and the *private GreenCal Buku 5 staging ZIP* outside GitHub, Vercel static dist and public object storage.
2. Extract \`book5_import_manifest.json\`, \`book5_ojk_physical_scores_stage.csv.gz\`, and \`book5_ojk_postcode_mapping.csv.gz\` into an approved encrypted bank administrative filesystem. Review \`book5_source_exceptions.json\`.
3. Run locally on bank-approved Node 24 where the \`pg\` dependency is installed:
   \`node scripts/book5/import-official-annex.mjs --manifest <manifest> --scores <scores.gz> --postcodes <postcodes.gz> --dry-run\`.
4. On approved PostgreSQL, review and apply migrations 0102 + 0103 after backup. Verify the private enterprise database is not the public AI quota database.
5. For staged import only, use protected environment variables \`GC_BOOK5_IMPORT_ACK=import-to-staging-only\`, \`GC_BOOK5_TENANT_ID\`, \`GC_BOOK5_ACTOR_SUBJECT\`, \`GC_BOOK5_DATASET_ID\`, \`GC_BOOK5_MAPPING_ID\`, and \`DATABASE_URL_POOLED\` (credential in secret store). Run \`--apply\` only in the bank change window.
6. Reconcile counts, checksum, score-range, 2020 same-baseline checks, regional joins, and exceptions. Record source replacement or documented conservative choices by two independent reviewers; then apply dataset status changes through controlled DBA change; do not self-approve.
7. Only after institution SSO and source review configure \`GC_ENTERPRISE_BOOK5_ENABLED=true\`. No bypass for missing SSO. Test per-tenant read and write denial plus ambiguity handling.
8. Validate Buku 2 PD/LGD/CKPN transmission and Buku 6 reporting independently; code and imported scores do not constitute approval of bank risk models.

State: XLSX extracted; curated private staging ZIP created; integration code and test gates ready. **Import into bank PostgreSQL and operational availability remain unverified** until bank-side execution.
