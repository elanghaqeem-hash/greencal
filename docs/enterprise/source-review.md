# Official source ingestion and initial review checkpoint

27 October 2026. The official OJK publication dated 6 October 2026 lists seven books; that listing is verified at the master-prompt URL. Whole-original ingestion is complete only for Book 2 (91 PDF pages, 9,245,764 bytes) and Book 4 (81 PDF pages, 15,221,944 bytes) in this checkpoint. SHA-256 values are in official-document-catalog.json. All pages were text-extracted, but this is not exhaustive semantic/formula/table validation. The remaining five books have no complete verified-source hash or accepted implementation at this checkpoint.

The official non-www page initially timed out/rejected requests; its indexed `?trk=article-ssr-frontend-pulse_little-text-block` version exposed the seven official attachments. A normal direct download from the official www host succeeded for Books 2 and 4. Other original attachments are large (Book 1 ~35 MB, Book 3 ~285 MB, Book 5 ~599 MB, Book 6 ~507 MB, Book 7 ~419 MB). Partial bytes are never treated as a source-complete document or used to derive an official hash. Source ingestion verifies PDF magic, terminal EOF, no parser repair, complete SHA-256, page count, per-page text, and marks independent review outstanding.

## Initial traceability

`regulatory-matrix.csv` contains seven document-level gap rows, fifteen selected Book 2 requirements and eleven selected Book 4 requirements. These are an initial regulatory gap matrix, not a complete seven-book extraction. Every initial requirement remains Gap Identified, and its acceptance remains unvalidated. Generic foundation record approvals do not change that status.

## Visual checks and unresolved issues

- Book 2 PDF p47 / printed p40: the stage/collectibility treatment and ECL expressions were checked against rendered originals. BUS treatment must follow applicable bank accounting/collectibility requirements; do not assume all BUS omit staging. No ECL calculator is released in this increment.
- Book 2 PDF p21 / printed p14 uses n/n+1/n+2 for short credit analysis; table on PDF p17 and market-risk section on PDF p56 use n+1/n+2/n+3. Resolve conventions per risk type/base date with the bank SME instead of silently hardcoding one convention for all engines.
- Book 4 PDF p17 / printed p10 states four paths (Reference plus three assessment scenarios), confirmed visually in Table 2. PDF p29 / printed p22 introductory text refers to five paths while its actual table shows four. Record this source inconsistency for SME clarification; do not invent a fifth macro series.
- Book 2 PDF p55 / printed p48 includes an Indonesia Policies row in Table 13 while adjacent text specifies three named scenarios. Its applicability must be reconciled with Books 1/4 and any official clarification before selecting a production scenario catalogue.
- Many Book 4 annual numeric tables are raster images: text extraction returns headings but omits their values. Rendered p29 confirms table values exist. Importing those absent text cells as zero/empty-valid would be wrong. Obtain accompanying official workbooks or OCR with independent visual/numeric reconciliation for every required cell.
- Book 4 PDF p24 / printed p17 distinguishes stock interpolation, flow aggregation and rate-to-level treatment; PDF p71 / printed p64 distinguishes 2017-USD quarterly private consumption from the real 2010-IDR series. These require explicit metadata and transformation controls.

## Next source step

Complete whole-original retrieval for Books 1/3/5/6/7; inventory accompanying spreadsheets/data packages; OCR and visually reconcile image tables/formulas; extract definitions, inputs, units, rules, assumptions, outputs, applicability and cross-book dependencies for every relevant section. Have the bank Compliance, Quant/Model Validation and Sharia reviewers accept the matrix before implementing official formulas or templates. No 2024 formula/template is silently substituted.
