# WP00 — Audit Baseline GreenCal terhadap Master Execution Prompt v2.0

Tanggal: 1 Nov 2026 · Branch: `wp00/audit-baseline-v2` · Basis: `main` @ `e15115e` (PR #78, 2026-11-01 09:06 WIB)
Status: **AUDIT SELESAI — tidak ada perubahan kode produksi.** Dokumen ini adalah satu-satunya artefak WP00.

---

## A. Ringkasan eksekutif

GreenCal saat ini adalah **aplikasi publik kalkulator emisi (monolit `index.html` 764 KB) + workspace `/enterprise/` tahap fondasi** yang berjalan di Cloudflare Workers/D1 dengan jalur migrasi ke Vercel/PostgreSQL. Pekerjaan sebelumnya disiplin: fail-closed, label NOT_VERIFIED, maker-checker-approver, release gate default OFF, 238/240 test lulus.

Namun terhadap v2.0, gap bersifat **arsitektural, bukan kosmetik**:

1. **Target runtime berubah total.** v2.0 mewajibkan on-premise di DC/DRC bank, intranet only, tanpa internet saat runtime. Kode saat ini terikat Cloudflare (Worker, D1, KV, Access) dan Vercel, memanggil Google Fonts dan LLM eksternal (OpenAI, Groq, OpenRouter, Gemini).
2. **Model otorisasi belum memenuhi v2.0**: 14 role (target 27), SoD hanya aturan #1 (dari 15), tidak ada policy engine, tidak ada RLS PostgreSQL.
3. **Presisi belum memenuhi prinsip decimal-exact**: validator menerima maks 13 digit + 6 desimal (target NUMERIC(38,12)); dua kolom `REAL` di migrasi.
4. **Regulation-as-data belum terpenuhi**: ±528 KB skalar Buku 7 di-hard-code di file JS dan bersumber dari PDF yang dibulatkan, bukan workbook resmi.
5. **Belum ada**: Reporting Cycle 16 tahap (M31), Regulatory Parameter Registry dengan ekstraksi ganda (M32), ekspor Buku 6 berbasis template, audit log hash berantai, SAST/SCA/secret scan di CI.

Rekomendasi: **jangan menulis ulang dari nol.** Pertahankan engine kalkulasi, test, dan dokumen sumber; bangun ulang lapisan runtime, data, IAM, dan registry untuk on-prem (strangler pattern). Estimasi kesiapan terhadap Definition of Done v2.0: **±15–20%** (lihat tabel D).

## B. Lingkup dan metode audit

| Item | Detail |
|---|---|
| Kode | Clone shallow `elanghaqeem-hash/greencal` main; 225 file, ±14.600 baris di `src/ tests/ scripts/ migrations/ docs/` + 2 HTML monolit |
| Eksekusi | `npm install`, `node scripts/build-dist.mjs`, `node --test tests/*.test.mjs`, `pytest tests/book6 tests/test_migrate_d1_to_postgres.py` |
| Lingkungan | Node 22.23.4 (repo menargetkan 24.x — selisih dicatat), Python 3.13 |
| Pemeriksaan statis | RLS, hash chain audit, tipe numerik, library desimal, dependensi eksternal, pola secret, ukuran data hard-coded, CI scanner |
| Sumber regulasi | Project files: Buku 4 (81 hlm) dan Buku 5 (32 hlm). **Buku 1, 2, 3, 6, 7 dan lampiran workbook tidak tersedia di sesi ini.** |
| Tidak dilakukan | Akses Cloudflare/Vercel, database produksi, deployment, perubahan pada `main` |

## C. Hasil uji baseline

| Suite | Hasil |
|---|---|
| Node test (54 file) | **240 test: 238 PASS, 0 FAIL, 2 SKIP** (integrasi PostgreSQL butuh `GREENCAL_TEST_PG_URL` disposable) |
| Python (Buku 6 inspection, migrasi D1→PG) | **6 PASS** |
| Build `dist/` | PASS — seluruh aset P0 lengkap |

Catatan: test yang lulus adalah bukti regresi, **bukan** bukti kepatuhan 7 Buku (sesuai prinsip "evidence or it did not happen").

## D. Gap analysis terhadap v2.0

Kelas: **W** berfungsi & teruji · **P** parsial · **M** belum ada · **R** harus diganti (bertentangan dengan v2.0).

| Bagian v2.0 | Kondisi saat ini | Kelas | Tindakan |
|---|---|---|---|
| 01.1 Decimal-exact | BigInt skala 1e6; input maks 13+6 digit; `REAL` di `0003_quant_engines`, `0005_portfolio_source_controls` | P | Naikkan ke NUMERIC(38,12) + decimal library; hapus REAL |
| 01.1 Fail closed | Konsisten diterapkan (Buku 7 tolak interpolasi, physical tolak ekstrapolasi) | W | Pertahankan |
| 01.2 Parameter Registry | `source-registry.js`, `official-document-catalog.json`, `0007_dataset_provenance` — tanpa status VERIFIED_DUAL/APPROVED per parameter, tanpa extractor/verifier | P | Bangun M32 di atas provenance yang ada |
| 01.2 Regulation-as-data | Skalar Buku 7 hard-coded di 3 file JS (528 KB), sumber PDF dibulatkan | R | Pindahkan ke registry sebagai data; ganti dengan workbook resmi |
| 01.3 Matriks kewajiban | `regulatory-matrix.csv` 40 baris level dokumen/seksi; belum ada kode `CRMS26-B0x-…` | P | Turunkan requirement per kalimat "wajib/harus" |
| 02 Siklus 16 tahap + M31 | Tidak ada `reporting_cycle`/gate | M | WP baru |
| 03.1 Policy engine + ABAC | Fungsi `canCreate/canCheck/canApprove` di `policy.js` | R | Ganti dengan Cedar/OPA/Casbin |
| 03.1 RLS PostgreSQL | **0 tabel dengan RLS**; isolasi via predicate aplikasi | M | Wajib sebelum data nyata |
| 03.1 27 role | 14 role | P | Tambah 13 role + mapping grup AD |
| 03.3 15 aturan SoD | Aturan #1 (maker≠checker≠approver per subject) teruji; release gate 5 fungsi berbeda | P (1/15) | Implementasi 14 aturan sisa + test negatif |
| 03.4 JML / recertification | Tidak ada | M | Integrasi SCIM/HR |
| 04.3 Kontrak halaman | 23 view enterprise; feature flag jujur sudah ada | P | Formula panel, badge status data, import massal belum seragam |
| 04.4 `menu-form-action.csv` | Tidak ada | M | Generate dari route + API (WP01) |
| 05 Formula library | Buku 3 PCAF exact-decimal, Scope 1–3, physical damage curve, ECL Stage 1, CKPN recon, bridge KPMM — sebagian | P | Tambah formula_id berversi; LCR, Vasicek PIT, market, OpLoss, anti double counting |
| 05.12 Parity Buku 3 | 249 dari 6.900 sel formula Annex C dihitung ulang; 6.651 belum | P (3,6%) | Prioritas tinggi |
| 06 Buku 6 template-as-data | Inspector workbook Python ada; ekspor ke template resmi belum | P | report_cell + cell_binding + openpyxl |
| 07 Design system | CSS sendiri; belum token "Fresh Green Finance"; Google Fonts eksternal | R | Terapkan token, self-host font |
| 08.1 On-premise intranet | Cloudflare Workers/D1/KV/Access + Vercel | R | Re-platform (lihat F) |
| 08.1 Tanpa internet runtime | Google Fonts, OpenAI, Groq, OpenRouter, Gemini, Cloudflare Access | R | Hapus/bundel; AI off default |
| 08.2 Audit log hash berantai | Trigger append-only ada; **tanpa `prev_hash`** | P | Tambah hash chain + WORM + SIEM |
| 08.2 MFA step-up, session policy | Bergantung Cloudflare Access | R | OIDC/SAML ke IdP bank |
| 08.3 SAST/SCA/secret/DAST di CI | 22 workflow, **tidak ada satu pun scanner keamanan** | M | Tambah Semgrep, gitleaks, Syft/Grype, ZAP |
| 09.2 OpenAPI 3.1 | Tidak ada spec | M | Generate dari route existing |
| 09.3 Container image + bundle offline | Tidak ada Dockerfile | M | WP re-platform |
| DoD #28 (egress deny) | Tidak dapat dipenuhi di arsitektur sekarang | R | — |

## E. Aset yang dipertahankan (REUSE)

- Engine: `book3.js` (PCAF exact-decimal), `book5.js`, `book7.js`/`book7-annex.js` (logika, bukan datanya), `quant*.js`, `validation.js`, `source-control.js`, `ckpn-reconciliation.mjs`.
- Workflow: `transition()` maker-checker-approver, release authorization 5 fungsi (`0006`), immutability triggers.
- Data adapter: `portfolio-cbs-adapter.mjs`, `ngfs-iamc-adapter.mjs`, `book5/import-official-annex.mjs`, `book6/inspect_official_workbook.py`.
- Jalur PostgreSQL: `migrations/vercel/0100–0103`, `src/vercel/postgres.js`, `migrate-d1-to-postgres.py` — basis langsung untuk PostgreSQL 16 on-prem.
- Seluruh 54 test suite dan golden vector Bank Sawan sebagai regression baseline.
- Dokumentasi audit sebelumnya (`docs/enterprise/*`) — jujur dan konsisten; sebagian besar temuan tetap relevan.

## F. Rencana kerja usulan (WP01–WP10, 6 bulan)

| WP | Isi | Gate keluar |
|---|---|---|
| WP01 | Inventaris `menu-form-action.csv`, OpenAPI 3.1, mapping M01–M32 ke view existing | CI gagal untuk action tanpa endpoint/test |
| WP02 | Re-platform on-prem: Dockerfile (web Next.js, API Node, worker Python), PostgreSQL 16 + RLS, Redis, MinIO; hapus Cloudflare/Vercel dari runtime | Uji egress deny lulus; docker compose UAT berjalan |
| WP03 | IAM: OIDC/SAML (Keycloak/ADFS), 27 role, policy engine, 15 SoD, JML | Test positif/negatif seluruh matriks |
| WP04 | M32 Regulatory Parameter Registry + ekstraksi ganda; migrasi skalar Buku 7 dari JS ke registry | 100% parameter terpakai berstatus jelas |
| WP05 | Decimal NUMERIC(38,12), formula_definition berversi, calculation_run + manifest | Determinism test (hash input = hash output) |
| WP06 | Parity Buku 3: 6.651 sel tersisa | NOT_RECALCULATED = 0 |
| WP07 | Buku 4 & 5 terkunci (dataset + checksum), CRSA kredit/pasar/likuiditas/operasional, agregasi anti double counting | Property test 10.000 input |
| WP08 | M31 Reporting Cycle 16 tahap + M23 Buku 6 template-as-data + trace-to-cell | Siklus penuh di Bank Sawan |
| WP09 | Design system "Fresh Green Finance" + dashboard per role, WCAG 2.2 AA | axe-core bersih, SUS ≥ 80 |
| WP10 | DevSecOps: SAST/SCA/secret/DAST, hash chain audit, release bundle bertanda tangan, pentest | Tanpa Critical/High terbuka |

Urutan kritis: WP02 → WP03 → WP04/05 (paralel) → WP06/07 → WP08. Re-platform harus lebih dulu karena RLS, IAM, dan decimal semuanya bergantung pada PostgreSQL on-prem.

---

## G. Regulatory coverage

| Buku | Sumber tersedia di sesi ini | Requirement `CRMS26-B0x` terbentuk | Status dominan |
|---|---|---|---|
| 1 Panduan Umum | Tidak | 0 | SOURCE_PENDING |
| 2 Panduan Teknis | Tidak | 0 | SOURCE_PENDING |
| 3 Metode Emisi | Tidak (repo: PDF unggahan + workbook Annex C) | 0 | IN_PROGRESS (repo) |
| 4 Data Makro | **Ya**, 81 hlm | 0 (WP04) | SOURCE_PENDING — lihat temuan checksum |
| 5 Risiko Fisik | **Ya**, 32 hlm (versi terkompresi) | 0 (WP04) | SOURCE_PENDING — bukan file asli |
| 6 Kertas Kerja | Tidak | 0 | SOURCE_PENDING |
| 7 Pendekatan Standar | Tidak (repo: angka dari PDF dibulatkan) | 0 | SOURCE_PENDING |

Regulasi pendukung (1.5): POJK MR, POJK keuangan berkelanjutan, TKBI, POJK 11/2022, SEOJK 29/2022, POJK LCR, KPMM/ATMR, PSAK 71, UU 27/2022 — seluruhnya **SOURCE_PENDING** (versi belum diverifikasi di sesi ini).

## H. Parameter registry delta

Tidak ada parameter ditambah atau disetujui pada WP00. Temuan integritas sumber:

| Dokumen | SHA-256 di project | SHA-256 di katalog repo | Temuan |
|---|---|---|---|
| Buku 4 | `3a25af98…e622` | `4a9cccab…5768` | **Tidak cocok.** File project dihasilkan ulang via macOS Quartz (bukan PDF asli OJK). |
| Buku 5 | `75b5ffbb…68ac` | kosong | File dikompresi iLovePDF; berpotensi menurunkan kualitas tabel. **Tidak boleh dipakai sebagai sumber ekstraksi.** |

Tindakan: unduh ulang PDF asli dari situs OJK, catat checksum, dan cari versi workbook (XLSX) lampiran untuk Buku 4, 5, 7.

## I. Parity report

| Workbook | MATCHED | MISMATCHED | NOT_RECALCULATED | BLOCKED |
|---|---|---|---|---|
| Buku 3 Lampiran C (35 sheet, 6.900 sel formula) | 249 | 0 tercatat | 6.651 | 10 isu kontrol terbuka |
| Buku 6 template | — | — | — | Template resmi belum dipetakan |
| Buku 7 parameter | — | — | — | Workbook presisi penuh tidak tersedia |

Sumber angka: `docs/enterprise/book3-35-sheet-reconciliation-20261031.md` (tidak dihitung ulang pada WP00).

## J. Security delta

| Kontrol | Hasil |
|---|---|
| SAST / SCA / SBOM / DAST | **Tidak dijalankan — tidak ada di CI.** Temuan baru SEC10. |
| Secret scan (pola sederhana) | Tidak ditemukan secret literal di `src/ api/ scripts/ assets/`. ID KV/D1 di `wrangler.jsonc` bukan secret tetapi membocorkan topologi. |
| RLS | 0 dari seluruh tabel enterprise (SEC11) |
| Audit hash chain | Tidak ada `prev_hash` (SEC12) |
| Egress | Runtime memanggil Google Fonts, OpenAI, Groq, OpenRouter, Gemini, Cloudflare Access (SEC13) |
| Skrip `autopush.bat/.ps1`, `push-now.bat` | Berpotensi push langsung ke `main`, bertentangan dengan branch protection 8.3 (SEC14) |

Temuan SEC01–SEC09 dari audit 27 Okt tetap terbuka; SEC06 (persetujuan hosting) kini diselesaikan arahnya oleh keputusan on-premise, tetapi implementasinya belum.

## K. UX evidence

Tidak ada halaman baru pada WP00; screenshot dan axe-core belum dijalankan. Baseline: 23 view enterprise, satu shell responsif, belum menerapkan token warna v2.0.

## L. Asumsi dan pertanyaan terbuka

1. **Dokumen v1.0 Master Prompt** (M01–M30, 27 role, 22 DoD, 420 skenario UAT) tidak tersedia di sesi ini. Mohon dilampirkan agar mapping menu dan role tidak diasumsikan.
2. **Buku 1, 2, 3, 6, 7 dan seluruh lampiran workbook** belum dilampirkan ke project. Tanpa ini WP04 dan WP06 tidak dapat dimulai.
3. PDF Buku 4 dan 5 di project bukan file asli OJK (lihat H). Mohon ganti dengan unduhan langsung.
4. Bank target pertama (untuk sizing, IdP, platform VM vs Kubernetes, DRC) — atau tetap Bank Sawan simulasi sampai ada pilot?
5. Nasib deployment publik `greencal.elang-haqeem.workers.dev`: dipertahankan sebagai demo publik terpisah atau dihentikan? Usulan: pisahkan repo/produk publik dari distribusi enterprise on-prem.
6. Keputusan stack frontend: v2.0 mewajibkan Next.js; enterprise saat ini vanilla JS. Konfirmasi rewrite UI di WP09.
7. Node runtime: repo menargetkan 24.x; konfirmasi versi LTS yang disetujui TI bank.
8. Policy engine: pilih Cedar, OPA, atau Casbin (rekomendasi: Cedar untuk auditability atau OPA bila bank sudah memakainya).
