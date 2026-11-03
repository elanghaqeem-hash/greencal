# WP02, WP03, WP05, WP10 — Platform on-premise GreenCal CRMS Enterprise

Tanggal: 1 November 2026
Cabang: `wp02-wp10/onprem-iam-precision`
Prasyarat: `docs/enterprise/wp00-audit-baseline-v2-20261101.md`, `docs/enterprise/wp04-source-extraction-20261101.md`

Dokumen ini mencatat apa yang dibangun, apa yang dibuktikan uji, dan apa yang
**masih tidak dapat** dipenuhi dari sisi rekayasa. Bagian terakhir itu sama
pentingnya dengan dua yang pertama: Master Execution Prompt v2.0 Bagian 09.5
melarang produksi bank sebelum seluruh gate tertutup, dan dokumen ini menyebut
dengan tepat gate mana yang masih terbuka beserta alasannya.

---

## A. Ringkasan

| Paket kerja | Lingkup | Keadaan |
| --- | --- | --- |
| WP02 | Re-platform on-premise: kontainer, compose DC dan DRC, PostgreSQL 16 dengan RLS, Redis, penyimpanan objek, edge nginx dan ModSecurity, egress deny | Selesai, kecuali penyematan digest citra |
| WP03 | IAM: 27 peran, RBAC dan ABAC default deny, 15 aturan SoD, daur hidup identitas JML | Selesai |
| WP05 | Presisi desimal eksak, formula berversi, calculation_run yang dapat direproduksi | Selesai |
| WP10 | Audit berantai hash, DevSecOps CI, paket rilis offline bertanda tangan | Selesai dari sisi mekanisme; gate bank masih terbuka |

Uji: **479 uji, 477 lulus, 0 gagal, 2 dilewati.** Dua yang dilewati adalah uji
PostgreSQL warisan Vercel yang menuntut `GREENCAL_TEST_PG_URL` terpisah dan
tidak terkait perubahan ini. Baseline WP00 adalah 248 uji; penambahan bersihnya
166 uji.

---

## B. WP02 — Re-platform on-premise

### B.1 Topologi jaringan dan egress deny

Egress deny ditegakkan **tiga lapis**, bukan satu:

1. **Lapis jaringan.** `deploy/docker-compose.dc.yml` mendeklarasikan jaringan
   `internal` dengan `internal: true`. Docker tidak memasang gateway pada
   jaringan itu, sehingga aplikasi, basis data, cache, dan penyimpanan objek
   **tidak dapat** menghubungi host mana pun di luar, bahkan bila kodenya
   mencoba. Hanya layanan `edge` yang menyentuh dua jaringan.
2. **Lapis aplikasi.** `GREENCAL_EGRESS=deny` membuat
   `scripts/onprem/server.mjs` mencabut `fetch`, `WebSocket`, dan
   `EventSource` dari `globalThis` sebelum kode lain berjalan, dengan properti
   non-writable sehingga tidak dapat dipasang kembali.
3. **Lapis citra.** Tahap `runtime` pada `Dockerfile` tidak memasang `curl`,
   `wget`, `git`, atau kompilator apa pun. CI memverifikasi ketiadaannya
   dengan menjalankan `command -v` di dalam citra.

Uji: `tests/onprem-deployment.test.mjs`, empat uji egress, termasuk bukti bahwa
pencabutan tidak dapat ditimpa.

### B.2 Skema PostgreSQL 16

Empat migrasi, seluruhnya dijalankan dan diuji terhadap PostgreSQL 16.15
sungguhan:

| Berkas | Isi |
| --- | --- |
| `0001_foundation.sql` | Skema, peran basis data, domain presisi, konteks tenant, enum 27 peran, tabel platform |
| `0002_registry_and_runs.sql` | Dokumen regulatori, parameter, formula berversi, snapshot, `calculation_runs`, `run_outputs` |
| `0003_cycle_and_audit.sql` | Reporting Cycle 16 tahap, submission, anti double counting, log audit berantai hash, ekspor WORM |
| `0004_rls_policies.sql` | RLS menyeluruh, hak akses minimum, guard RLS dan guard kolom pecahan biner |

Keputusan arsitektur yang perlu dicatat:

- **RLS diterapkan lewat katalog, bukan daftar manual.** Migrasi 0004
  menelusuri `pg_class` dan menyalakan `ENABLE` serta `FORCE ROW LEVEL
  SECURITY` plus policy `tenant_isolation` pada setiap tabel ber-`tenant_id`.
  Tabel baru yang lupa dilindungi akan **menggagalkan migrasi**, karena guard
  `crms.find_tables_without_rls()` dijalankan di akhir berkas yang sama.
- **`FORCE ROW LEVEL SECURITY` berlaku juga bagi pemilik tabel.** Akibatnya
  pemilik objek `crms_owner` **tidak dapat** menyentuh data bisnis sama sekali;
  ia hanya punya policy `platform_provisioning` pada tiga tabel provisioning
  (`institutions`, `org_units`, `memberships`). Seluruh data bisnis hanya
  dapat diakses `crms_app` dengan konteks tenant aktif. Uji
  `tests/onprem-postgres.test.mjs` membuktikan keduanya.
- **Fail closed pada konteks tenant.** `crms.current_tenant()` **melempar
  galat** bila `crms.tenant_id` belum ditetapkan, bukan mengembalikan NULL.
  Kueri tanpa konteks gagal; ia tidak pernah diam-diam mengembalikan nol baris
  yang bisa disalahartikan sebagai "tidak ada data".
- **`crms_app` tidak memiliki hak `DELETE` pada satu tabel pun.** Retensi
  dijalankan prosedur terkontrol. Diverifikasi uji yang memeriksa
  `has_table_privilege` pada seluruh tabel kedua skema.

### B.3 Temuan presisi yang mengubah panduan implementasi

Uji menemukan hal yang tidak diantisipasi WP00 dan berdampak pada cara
perhitungan ditulis:

> **Pembagian NUMERIC pada PostgreSQL tidak mempertahankan skala domain.**
> `1::crms.amount / 3` menghasilkan `0.33333333333333333333` (20 desimal),
> bukan `0.333333333333` (12 desimal). Domain `NUMERIC(38,12)` membatasi
> penyimpanan, bukan hasil antara ekspresi.

Konsekuensinya: **seluruh aritmetika finansial dijalankan di
`src/onprem/precision/decimal.js`**, dan basis data hanya menyimpan. Bila suatu
saat pembagian harus dilakukan di SQL, hasilnya **wajib** di-cast balik ke
`crms.amount`. Keadaan ini dikunci uji `NUMERIC(38,12) menyimpan nilai eksak;
pembagian SQL wajib di-cast balik`, yang akan gagal bila asumsi ini berubah.

Perbedaan kedua yang perlu diketahui pengembang: cast PostgreSQL ke
`NUMERIC(38,12)` **membulatkan** nilai berskala lebih besar, sedangkan
`Decimal.from()` pada lapisan aplikasi **menolak** masukan berskala >12 dengan
galat `SCALE_EXCEEDED`. Perilaku aplikasi yang lebih ketat itu disengaja:
pembulatan senyap pada nilai yang masuk laporan regulator adalah kesalahan yang
tidak terlihat sampai angkanya dipertanyakan.

### B.4 Edge, basis data, dan cache

- `deploy/nginx/crms.conf` dan `crms-proxy.inc`: TLS 1.3 saja, ModSecurity
  dengan OWASP CRS paranoia 2, pembatasan laju terpisah untuk rute
  autentikasi (5 permintaan per menit) dan rute umum (30 per detik), halaman
  galat netral tanpa jejak tumpukan. Header `X-CRMS-Tenant`, `X-CRMS-Role`,
  `X-Forwarded-Host`, dan `X-Original-URL` yang datang dari klien **dibuang di
  edge**, bukan diabaikan di aplikasi.
- `deploy/nginx/modsecurity-overrides.conf`: setiap pengecualian WAJIB menyebut
  alasan, rute terbatas, dan tanggal peninjauan ulang. Uji menolak pengecualian
  yang tidak menyertakan ketiganya. Berkas ini juga memuat aturan kustom 10003
  yang **menolak** permintaan yang mencoba menetapkan konteks tenant lewat
  header, karena permintaan semacam itu adalah serangan, bukan kesalahan.
- `deploy/postgres/pg_hba.conf`: tanpa `trust`, tanpa `md5`, seluruh koneksi
  TCP wajib `hostssl`, replikasi menuntut `clientcert=verify-full`, dan baris
  penutup menolak sisanya secara eksplisit sehingga kelalaian menulis aturan
  berakhir pada penolakan.
- `deploy/redis/redis.conf`: persistensi dimatikan (`save ""`,
  `appendonly no`). Redis **bukan** sumber kebenaran; isinya boleh hilang tanpa
  mempengaruhi hasil perhitungan mana pun. `FLUSHALL`, `FLUSHDB`, `KEYS`,
  `CONFIG`, dan `DEBUG` dinonaktifkan.

### B.5 DRC

`deploy/docker-compose.drc.yml` berjalan sebagai hot standby dengan dua
pembeda yang disengaja:

1. **Tidak ada layanan `migrator`.** Skema DRC datang dari replikasi streaming.
   Menjalankan migrasi di kedua sisi adalah cara paling cepat memecah
   replikasi. Uji memverifikasi ketiadaan layanan ini.
2. **`GREENCAL_ROLE=standby`**, dan healthcheck basis data menuntut
   `pg_is_in_recovery()` bernilai true, sehingga standby yang tanpa sengaja
   dipromosikan tidak akan dianggap sehat.

**RPO dan RTO tidak dinyatakan di berkas mana pun.** Keduanya hanya boleh
ditulis setelah uji restore dan failover nyata (gate G12).

---

## C. WP03 — IAM

| Modul | Isi | Uji |
| --- | --- | --- |
| `src/onprem/iam/roles.js` | Tepat 27 peran dalam 11 kelompok, 4 tingkat sensitivitas, pemetaan 14 peran warisan | 45 uji |
| `src/onprem/iam/policy-engine.js` | `authorize()` default deny, 9 langkah berurutan | |
| `src/onprem/iam/sod.js` | 15 aturan SoD, 18 pasangan peran berkonflik | |
| `src/onprem/iam/identity-lifecycle.js` | Joiner, mover (revoke sebelum grant), leaver, inaktivitas, resertifikasi | |

Dua hal yang perlu dicatat:

- **Satu sumber kebenaran untuk SoD.** Pada draf awal, logika syariah dan
  kedaluwarsa delegasi muncul di `policy-engine.js` **dan** di `sod.js`.
  Duplikasi itu dihapus: `sod.js` memiliki aturan 10 sampai 12, dan mesin
  kebijakan mendelegasikan kepadanya. Aturan yang hidup di dua tempat akan
  berbeda cepat atau lambat.
- **Aturan 11 diuji lewat jalurnya sendiri.** Aturan ini menolak pencucian
  wewenang lewat delegasi: aktor yang sendirinya lolos aturan 8 tetap ditolak
  bila **peran yang didelegasikan kepadanya** gagal aturan 8 pada evaluasi
  bersarang. Uji konsolidasi menegaskan `proven.size === 15`, sehingga tidak
  ada aturan yang lolos tanpa pernah terbukti memicu penolakan.

Enum peran basis data dan daftar peran aplikasi dibandingkan satu per satu oleh
`tests/onprem-postgres.test.mjs`; keduanya tidak dapat menyimpang tanpa uji
gagal.

---

## D. WP05 — Presisi dan reproduksi

- `src/onprem/precision/decimal.js`: `NUMERIC(38,12)` lewat BigInt.
  `Decimal.from()` **menolak** tipe `number` dengan galat `FLOAT_FORBIDDEN`.
  `toFixedString()` mengembalikan **string**, bukan Decimal, sehingga nilai
  yang sudah dibulatkan untuk presentasi tidak dapat masuk kembali ke
  perhitungan antara. `toUnsafeNumber()` dinamai demikian agar pemakaiannya
  terlihat saat audit kode.
- `src/onprem/precision/calculation-run.js`: `FormulaRegistry` berversi,
  `ParameterSet` yang **menolak** parameter non-`APPROVED`, `runFormula` yang
  gagal keras pada input atau parameter yang hilang, manifest berisi
  `parameterSetDigest`, `formulaSetDigest`, `inputDigest`, `outputDigest`, dan
  `randomSeed`, serta `verifyReproduction()` untuk validator independen.
- `assertNoDoubleCounting()` menegakkan tiga pasangan kanal terlarang Bagian
  05.11. Aturan yang sama kini **juga** menjadi trigger basis data
  (`crms.assert_no_double_counting`), sehingga tidak dapat dilewati lewat jalur
  apa pun, termasuk impor data langsung.

---

## E. WP10 — Audit, DevSecOps, dan paket rilis

### E.1 Audit append-only berantai hash

Log audit ditolak perubahannya pada **tiga lapis**, dan ketiganya diuji:

1. `crms_app` tidak memiliki hak `UPDATE` maupun `DELETE` pada
   `crms_audit.event_log`.
2. Pemilik objek tidak memiliki policy RLS pada tabel itu, sehingga `UPDATE`
   dan `DELETE` miliknya tidak mengenai satu baris pun.
3. Trigger menolak `UPDATE`, `DELETE`, **dan** `TRUNCATE` tanpa kecuali.
   Uji membuktikan lapis ini dengan koneksi **berhak penuh** ke basis data:
   bahkan akun dengan hak tertinggi tidak dapat mengubah log audit.

Rantai hash ditegakkan basis data, bukan hanya aplikasi: `sequence` wajib
menerus tanpa celah dan `prev_hash` wajib sama dengan hash event sebelumnya.
Event pertama wajib menautkan genesis hash 64 nol.

Payload tidak disimpan utuh; hanya digestnya. Ini minimalisasi data menurut
UU 27/2022 PDP: log audit tidak boleh menjadi salinan kedua data pribadi.

### E.2 DevSecOps

`.github/workflows/onprem-release.yml`, tujuh pekerjaan: uji unit, jaminan
skema terhadap PostgreSQL 16 sungguhan, gate konfigurasi, SAST Semgrep,
SBOM CycloneDX dengan pemindaian Grype, pemindaian rahasia gitleaks pada
**riwayat penuh**, pemindaian citra kontainer, dan pembangunan paket rilis.

Seluruh aksi pihak ketiga disematkan pada commit SHA, bukan tag, karena tag
aksi dapat dipindahkan oleh pemiliknya.

### E.3 Paket rilis offline

`scripts/release/build-offline-bundle.mjs` menghasilkan manifest berisi
checksum SHA-256 setiap berkas, digest manifest yang deterministik, dan status
kelayakan rilis. Daftar isi paket **eksplisit**, bukan glob, dan ada daftar
pola terlarang yang memastikan rahasia, `node_modules`, serta berkas kunci
tidak pernah ikut masuk.

Dua keputusan yang disengaja:

- **Skrip build tidak pernah membuat kunci penandatangan.** Kunci yang dibuat
  oleh proses build adalah kunci yang tidak dapat dipercaya. Skrip hanya
  memakai kunci Ed25519 yang disediakan operator lewat `GREENCAL_SIGNING_KEY`,
  dan menolak kunci bertipe lain. Uji memverifikasi bahwa
  `generateKeyPair` tidak muncul di skrip itu.
- **Paket hanya boleh dibangun dari pohon kerja bersih**, kecuali dengan
  `--allow-dirty` untuk uji lokal.

---

## F. Gate rilis: keadaan sebenarnya

`docs/enterprise/release/release-gates.json` adalah ledger gate yang ikut masuk
manifest paket, sehingga statusnya tidak dapat diubah tanpa mengubah digest
paket. Keadaan saat ini:

| Gate | Status | Alasan |
| --- | --- | --- |
| G01 Uji otomatis | **PASSED** | 479 uji, 0 gagal |
| G02 Guard skema | **PASSED** | RLS lengkap, tanpa kolom pecahan biner |
| G03 Determinisme | **PASSED** | Manifest digest identik pada eksekusi ulang |
| G04 Digest citra | BLOCKED | Hanya operator bank dapat mengisi digest dari registri internal |
| G05 Parameter APPROVED | BLOCKED | 5 dari 7 Buku belum tersedia sebagai sumber berchecksum |
| G06 SAST | **PASSED** | Semgrep tanpa temuan severity ERROR |
| G07 SBOM dan SCA | **PASSED** | Syft dan Grype tanpa temuan high atau critical; npm audit nol kerentanan. Penandatanganan SBOM masih menunggu kunci rilis bank |
| G08 Pemindaian rahasia | **PASSED** | Nol temuan pada seluruh 658 commit riwayat |
| G09 DAST | NOT_STARTED | Butuh lingkungan UAT bank |
| G10 Uji penetrasi | NOT_STARTED | Belum dipesan |
| G11 Validasi model independen | NOT_STARTED | Jalur teknis siap, pelaksanaannya milik fungsi validasi bank |
| G12 Uji restore dan failover | NOT_STARTED | Konfigurasi siap; angka RPO dan RTO tidak boleh dinyatakan sebelum uji nyata |
| G13 Residensi data dan PDP | NOT_STARTED | Skema menegakkan `data_residency = 'ID'`, asesmen formal belum ada |
| G14 Persetujuan CAB | NOT_STARTED | Tidak dapat dipenuhi tim rekayasa |
| G15 Paket bertanda tangan | BLOCKED | Menunggu kunci rilis bank |
| G16 CVE citra dasar tanpa perbaikan | BLOCKED | Tiga CVE glibc berstatus "won't fix" pada Debian 13; butuh asesmen keamanan bank |

### F.1 Pengerasan citra runtime

Pemindaian citra pertama kali berjalan sampai selesai pada 3 November dan
menemukan kerentanan nyata, bukan galat konfigurasi:

| Temuan | Jumlah awal | Tindakan | Sisa |
| --- | --- | --- | --- |
| Node 24.11.0 | 1 Critical, 5 High | Naik ke 24.13.0 pada ketiga tahap build | 0 |
| Paket npm bundled (glob, minimatch, tar, brace-expansion) | 11 High | npm, npx, dan corepack dibuang dari tahap runtime; penghapusan diverifikasi di dalam build | 0 |
| Debian 12 bookworm (termasuk zlib1g CVE-2023-45853 Critical) | 1 Critical, ~14 High | Basis berpindah ke Debian 13 trixie, ditambah pembaruan keamanan paket yang sudah ada | 0 |
| glibc pada Debian 13 | 3 High, "won't fix" | Dicatat sebagai gate G16; **tidak** diabaikan dan **tidak** diklaim tidak berlaku | 3 |

Dua keputusan yang perlu dicatat:

1. **npm dibuang dari citra runtime.** Seluruh temuan High pada paket npm
   berasal dari npm yang dibundel citra dasar, bukan dari dependensi aplikasi:
   aplikasi hanya bergantung pada `pg`, dan `npm audit` melaporkan nol
   kerentanan. npm tidak dibutuhkan saat runtime, jadi membuangnya menutup
   temuan sekaligus mengecilkan permukaan serang. Penghapusannya diverifikasi
   di dalam build dengan `! command -v npm`, bukan diasumsikan.

2. **Gate memakai `--only-fixed`.** Build digagalkan hanya oleh kerentanan yang
   sudah ada perbaikannya. Gate yang gagal karena hal yang tidak dapat
   diperbaiki siapa pun akan mendorong orang menambah daftar pengabaian sampai
   gate itu berhenti bermakna. Kerentanan tanpa perbaikan tetap dipindai,
   diringkas sebagai tabel pada ringkasan CI, diunggah sebagai artefak, dan
   dicatat sebagai gate terbuka G16.

Penerapan ketiga CVE glibc terhadap beban kerja ini **belum diasesmen**, dan
dokumen ini tidak mengklaim ketiganya tidak berlaku: klaim itu akan menjadi
klaim tanpa bukti, tepat jenis yang dilarang Bagian 09.5.

**Kesimpulan: platform ini siap UAT, dan TIDAK boleh dipakai produksi bank.**
`scripts/release/verify-onprem.mjs` dan `scripts/release/build-offline-bundle.mjs`
keduanya menolak menyatakan kelayakan produksi selama keadaan di atas bertahan.
Penolakan itu bukan efek samping; ia adalah kontrol yang diminta Bagian 09.5.

---

## G. Yang masih harus dikerjakan

Berurutan menurut ketergantungan:

1. **WP01** — inventaris menu, form, dan aksi; spesifikasi OpenAPI 3.1; gate CI
   yang menolak aksi tanpa endpoint atau `test_case_ids`.
2. **WP09** — design system "Fresh Green Finance": token warna, tipografi,
   radius, mode gelap, font yang dihosting sendiri, verifikasi kontras
   WCAG 2.2 AA.
3. **Penyematan digest citra** (G04) — menunggu registri internal bank.
4. **Sumber 5 Buku yang belum ada** (G05) — menunggu berkas berchecksum.
   Sampai saat itu, parameter terkait tetap `SOURCE_PENDING` dan **tidak
   pernah** mengisi laporan, ditegakkan constraint basis data.
5. **Rute API on-premise** — `scripts/onprem/server.mjs` saat ini menyajikan
   aplikasi statis beserta `/healthz` dan `/readyz`. Rute API gaya Vercel di
   `api/` belum dipindahkan ke server on-premise; itu pekerjaan tersendiri yang
   bergantung pada OpenAPI dari WP01.

---

## H. Cara memverifikasi sendiri

```bash
npm ci
npm run build
npm run test:onprem                 # presisi, IAM, audit, siklus, deployment
npm run registry:validate           # registry parameter CRMS 2026

# Jaminan skema terhadap PostgreSQL 16 sungguhan
createdb crms_onprem_ci
export GREENCAL_ONPREM_PG_URL=postgresql://localhost/crms_onprem_ci
npm run migrate:onprem:plan
npm run migrate:onprem
npm run migrate:onprem              # idempotensi: seluruh migrasi dilewati
psql "$GREENCAL_ONPREM_PG_URL" -c 'GRANT crms_owner, crms_app, crms_readonly TO CURRENT_USER;'
npm run test:onprem-postgres

npm run release:verify-onprem       # gagal selama digest citra placeholder
npm run release:bundle              # keluar 2: NOT_RELEASABLE
```
