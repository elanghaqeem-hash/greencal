# WP04 — Ekstraksi Sumber Buku 1, Buku 2, dan Lampiran Buku 7 (Risiko Kredit)

Tanggal: 1 Nov 2026 · Branch: `wp04/registry-book1-2-7a` · Lanjutan dari WP00 (`868ce76`)
Status: **requirement diturunkan; sebagian parameter masuk registry; skalar utama tetap SOURCE_PENDING.**

---

## 1. Sumber yang masuk

| Dokumen | Halaman | Ketersediaan | Catatan integritas |
|---|---|---|---|
| Buku 1 Panduan Umum CRMS Perbankan 2026 | 8 bab + glosarium | Teks penuh | Berkas `_compressed`, bukan unduhan asli OJK |
| Buku 2 Panduan Teknis CRMS Perbankan 2026 | 3 bab, 81 hlm | Teks penuh | Berkas `_compressed`, bukan unduhan asli OJK |
| Lampiran Buku 7 — Risiko Kredit (Lampiran A) | 75 hlm, tabel A.1–A.8 | Teks penuh | Dinamai `Lampiran 1 - Risiko Kredit.pdf` |

Berkas PDF **tidak tersedia di disk**, hanya lapisan teks melalui konektor project. Konsekuensinya: ekstraksi berbasis layout (pdfplumber/camelot) dan checksum tidak dapat dijalankan pada WP04. Seluruh metadata `source_sha256` ditandai `SOURCE_PENDING`.

## 2. Keputusan ekstraksi

Master Execution Prompt v2.0 Bagian 01.2 mewajibkan **ekstraksi ganda** sebelum parameter dipakai, dan hanya nilai identik dari dua ekstraksi independen yang boleh berstatus `VERIFIED_DUAL`.

Hanya satu ekstraksi yang tersedia. Karena itu ±11.340 skalar PD (Tabel A.3.a–c), ±3.780 skalar LGD transisi (Tabel A.6.a–c), dan delapan matriks biaya CRE-RRE (Tabel A.7.a–h) **tidak ditranskripsi**. Mentranskripsi 15.000 angka dari satu lapisan teks yang sudah terbukti mengandung `NaN` dan artefak kolom akan menghasilkan registry yang tampak lengkap tetapi tidak dapat dipertanggungjawabkan. Tabel-tabel itu didaftarkan dengan dimensi dan jumlah sel yang diharapkan, berstatus `SOURCE_PENDING` atau `BLOCKED`, dan uji otomatis menjaga agar statusnya tidak dinaikkan tanpa sumber baru.

Yang **masuk registry** adalah tabel yang dapat diverifikasi secara independen tanpa ekstraksi kedua:

| Tabel | Sel | Status | Mekanisme verifikasi kedua |
|---|---|---|---|
| Lampiran Buku 7 Tabel A.8 — pemetaan TTC PD ke bucket rating | 21 baris | **VERIFIED_DUAL** | Derivasi aritmetika independen: seluruh 20 batas internal terbukti sama dengan rata-rata geometrik PD baseline dua rating berdekatan, `bound = sqrt(PD[i] * PD[i+1])`, cocok pada toleransi 5e-5 |
| Lampiran Buku 7 Tabel A.5 — haircut LGD risiko fisik | 324 | EXTRACTED_SINGLE | Enam uji properti: non-negatif, monoton per tahun, Tinggi > Menengah ≥ Rendah, Rendah nol, urutan skenario CP ≥ DT ≥ NZ pada 2050, jumlah sel |
| Buku 2 Tabel 3 — 15 bucket PD | 15 | EXTRACTED_SINGLE | Monotonisitas + kecocokan dengan contoh PT XYZ dalam narasi Buku 2 (Bucket 2 = 1,19%) |
| Buku 2 Tabel 15 — bobot risiko GIRR Delta | 10 | EXTRACTED + CROSS_CHECKED | Sel per sel cocok dengan Basel FRTB MAR21 |
| Buku 2 Tabel 16 — bobot risiko CSR Delta | 18 | EXTRACTED + CROSS_CHECKED | Sel per sel cocok dengan Basel FRTB MAR21 |
| Buku 2 Tabel 18 — bobot risiko Ekuitas Delta | 26 | EXTRACTED + CROSS_CHECKED | Sel per sel cocok dengan Basel FRTB MAR21; rasio repo = spot/100 terverifikasi |
| Buku 2 Tabel 19 — bobot Risiko Gagal Bayar DRC | 9 | EXTRACTED + CROSS_CHECKED | Sel per sel cocok dengan Basel FRTB MAR22 |

Pembanding Basel ditulis ulang dari standar BCBS di dalam validator, bukan diambil dari dokumen OJK, sehingga kecocokan sel per sel menjadi sumber kedua yang sah atas transkripsi SEOJK 23/SEOJK.03/2022.

Buku 2 Tabel 10 (ATMR risiko kredit) **tidak** masuk registry: perataan kolom LTV tidak dapat dipulihkan dari lapisan teks (lihat ANOM-B02-007).

## 3. Requirement yang diturunkan

192 requirement dengan kode `CRMS26-B0x-<DOMAIN>-nnnn`, diturunkan dari setiap kalimat "wajib", "harus", "perlu", "dapat", "diharapkan", dan setiap tabel atau formula.

| Buku | Jumlah | Domain |
|---|---|---|
| Buku 1 | 95 | GOV 16, DIS 13, MON 12, MET 9, STR 8, RSK 7, SCN 7, DAT 6, RMF 5, IMP 5, TRN 4, DEF 3 |
| Buku 2 | 97 | CRD 16, MKT 14, LGD 13, LIQ 8, OPR 6, PHY 6, CMB 4, NPL 4, CAP 4, SCP 4, RPT 4, CRS 3, SCN 3, ECL 3, STG 2, ATM 1, NII 1, DOC 1 |

Status: 179 `SOURCE_VERIFIED` (teks sumber terbaca dan requirement diturunkan), 13 `SOURCE_PENDING` (bergantung pada parameter atau dokumen yang belum tersedia). Tidak ada yang berstatus `APPROVED`; uji otomatis menolaknya.

## 4. Vektor uji parity yang diperoleh

Dua vektor uji numerik dapat dipakai langsung di WP06:

1. **Frye-Jacobs** (Buku 2 Bagian 2.2.1.1.3): Base LGD 45,00%, Base PD 0,15%, PIT PD 0,65% → LGD 45,29%.
2. **Penyesuaian NII** (Buku 2 Tabel 11): tujuh pinjaman dengan NII [100, 10, 50, 200, 30, 10, 100] juta Rupiah dan status default [0, 1, 0, 0, 1, 1, 0] → PD tertimbang 10,00%, NII disesuaikan 450 juta Rupiah. **Sudah dihitung ulang dan cocok** oleh validator.

## 5. Register anomali sumber

Prinsip *fail closed* Bagian 01.1 berlaku: anomali tidak diperbaiki, diinterpolasi, atau ditebak. Seluruhnya dicatat dan menunggu klarifikasi OJK atau PDF asli.

| ID | Lokasi | Tingkat | Temuan |
|---|---|---|---|
| ANOM-B7A-001 | Tabel A.3.b | Tinggi | **PD Scalar bernilai di bawah 1,0** pada beberapa sel skenario Delayed Transition sektor Listrik, Gas, Uap/Air Panas, dan Udara Dingin. Contoh: Menengah/Tinggi/AA 2028 = 0,9939; Kecil/Menengah/AA 2027 = 0,9944; Mikro/Menengah/AA 2027 = 0,9871. Skalar di bawah satu berarti risiko iklim **menurunkan** PD, bertentangan dengan uji monotonisitas Bagian 05.12 master prompt. Perlu konfirmasi apakah ini efek makro NGFS yang disengaja pada tahun awal atau kekeliruan kalibrasi. |
| ANOM-B7A-002 | Tabel A.7.b | **Kritis** | **Sel bernilai `NaN`** pada Matriks biaya CRE-RRE Ritel Pusat Perbelanjaan, skenario Delayed Transition, ukuran properti 0–5 ribu m², kategori EUI "Tidak Memenuhi Klasifikasi", tahun 2027. Tabel ditandai `BLOCKED`. Interpolasi tidak diizinkan. |
| ANOM-B7A-003 | Catatan Tabel A.3 | Tinggi | Portofolio (Mikro/Kecil/Menengah/Korporasi) ditentukan dari nilai penjualan, atau total aset bila penjualan tidak tersedia, tetapi **ambang batas tidak diberikan**. Tanpa ambang, pemilihan baris skalar tidak deterministik dan hasil antarbank tidak dapat dibandingkan. |
| ANOM-B7A-004 | Tabel A.1 kolom 6 | Rendah | Deskripsi lokasi menyebut "Kabupaten atau kota", namun contoh yang diberikan ("Arongan Lambalek") adalah **kecamatan** di Kabupaten Aceh Barat. Granularitas lokasi menjadi ambigu dan memengaruhi join ke tabel wilayah Buku 5. |
| ANOM-B7A-005 | Tabel A.2 | Rendah | Baris contoh template melanggar monotonisitas term structure: ID 1 tahun 2030 = 0,0060 sedangkan 2028 = 0,0008 dan 2035 = 0,0010; ID 3 tahun 2035 = 0,0050 sedangkan 2030 = 0,0081; ID 4 tahun 2035 = 0,0200 sedangkan 2030 = 0,0309. Diduga nilai ilustratif. **Tidak boleh dipakai sebagai vektor uji.** |
| ANOM-B7A-006 | Lampiran A, konvensi penyajian | Tinggi | Lampiran menyatakan "nilai dengan presisi penuh tersedia pada kertas kerja Lampiran Buku 7 – Risiko Kredit". **Kertas kerja itu tidak tersedia.** Seluruh skalar hanya ada dalam bentuk dibulatkan 4 desimal, sehingga tidak dapat dipakai untuk output resmi Buku 6. |
| ANOM-B7A-007 | Lampiran A, pengantar | Menengah | Lampiran B (risiko pasar) dan Lampiran C (risiko likuiditas) disebut berada pada dokumen terpisah "Lampiran Buku 7 – Risiko Pasar dan Likuiditas" yang **belum tersedia**. |
| ANOM-B02-001 | Buku 2 Tabel 13 | Tinggi | **Skenario keempat "Indonesia Policies"** muncul pada tabel skenario risiko pasar, sementara Buku 1 Bagian 4.2 dan Buku 2 Tabel 2 menetapkan tiga skenario. Tidak ada narasi, parameter, maupun data pendukung untuk skenario keempat. Perlu klarifikasi apakah wajib dijalankan. |
| ANOM-B02-002 | Buku 2 Tabel 3 vs Lampiran Buku 7 Tabel A.8 | Tinggi | **Dua sistem bucket PD yang tidak saling dipetakan.** Buku 2 memakai 15 bucket Krink (pooled PD 0,38% s.d. 19,72%); Lampiran Buku 7 memakai 5 bucket rating (AA/A/BA/B/C) dari 21 rating Moody's. Bank yang memakai pendekatan rasio keuangan Buku 2 tidak punya jalur resmi untuk memilih baris PD Scalar Buku 7. |
| ANOM-B02-003 | Buku 2 Tabel 2 | Menengah | Kolom "Risiko Transisi" dan "Risiko Fisik" tidak dapat dipasangkan secara andal dari lapisan teks. Urutan nilai ("Rendah, Rendah-sedang, Tertinggi" dan "Sedang, Sedang-tinggi, Rendah") menghasilkan dua pembacaan, dan salah satunya bertentangan dengan Buku 1 yang menyatakan Net Zero 2050 memiliki risiko transisi **tinggi** dan risiko fisik **rendah**. |
| ANOM-B02-004 | Buku 2 Bagian 2.2.1.1.2 | Rendah | Kalimat "Horizon jangka pendek, yaitu tahun n+1, n+1, dan n+1" — diduga salah ketik untuk n+1, n+2, n+3. |
| ANOM-B02-005 | Buku 2 Bagian 2.2.1.1.1 vs 2.2.1.1.2 | Menengah | **Periode asesmen LGD tidak konsisten.** Bagian 2.2.1.1.1 menyebut "tahun n+1, n+2, n+3, 2030, 2050" (tanpa 2040); Bagian 2.2.1.1.2 menyebut "2030, 2040, dan 2050". Berpengaruh langsung pada kelengkapan sel Buku 6. |
| ANOM-B02-006 | Buku 2 Bagian 2.2.1.1.1 | Menengah | **Dua konvensi horizon jangka pendek.** Analisis jangka pendek risiko transisi disebut "tahun n, n+1, dan n+2"; risiko pasar, likuiditas, LGD, dan ATMR memakai "n+1, n+2, n+3". |
| ANOM-B02-007 | Buku 2 Tabel 10 | Menengah | Skedul bobot risiko ATMR untuk Kredit Beragun Properti Rumah Tinggal **tidak dapat dipulihkan** dari lapisan teks; nilai 30/35/45/60/75/105/150 persen tidak dapat dipasangkan ke bucket LTV. Harus diambil dari SEOJK yang berlaku atau ekstraksi berbasis layout. |
| ANOM-B02-008 | Buku 2 Tabel 17 dan 18 | Rendah | Tabel 17 memuat definisi bucket ekuitas tanpa kolom bobot; bobot berada di Tabel 18. Bukan kekeliruan, tetapi membingungkan saat ekstraksi otomatis. |
| ANOM-B02-009 | Buku 2 Bagian 2.2.1.1.2 | Menengah | Formula LGD berbasis nilai pemulihan **terpotong** pada lapisan teks ("LGD = 1 – " diikuti "Di mana," tanpa definisi recovery rate). Formula penuh harus diambil dari PDF asli. |
| ANOM-B01-001 | Buku 1 Bab 7 vs Lampiran Buku 7 | Tinggi | **Titik tahun proyeksi tidak konsisten.** Buku 1 Penafian menyatakan variabel makroekonomi dan karbon tersedia tahunan untuk 2026, 2027, 2028 serta sepuluh tahunan untuk 2030, 2040, 2050 (enam titik). Lampiran Buku 7 menyajikan sembilan titik: 2025, 2026, 2027, 2028, 2030, 2035, 2040, 2045, 2050. Tahun **2025, 2035, dan 2045 tidak memiliki dasar variabel makro** yang dinyatakan di Buku 1. |
| ANOM-B01-002 | Buku 1 Bab 8 | Rendah | Buku 1 menyebut Buku 5 berfokus pada "enam hazard utama" lalu mencantumkan tujuh item: banjir, kenaikan muka air laut, kebakaran hutan dan lahan, heat stress, water stress, badai, serta risiko gabungan. Risiko gabungan adalah agregasi, bukan hazard ketujuh. |
| ANOM-B01-003 | Buku 1 Bab 8 | Rendah | Daftar bagian Template Pelaporan Buku 6 menyebut "10 (sepuluh) bagian" tetapi hanya mencantumkan sembilan item (Pedoman Umum, Bagian A sampai H). Bagian I (Ringkasan Eksekutif) disebut di bagian lain panduan. Jumlah bagian perlu diverifikasi terhadap Buku 6. |
| ANOM-SRC-001 | Integritas berkas | Tinggi | Ketiga PDF bukan unduhan asli OJK. Buku 1 dan Buku 2 berakhiran `_compressed`; Lampiran dinamai `Lampiran 1 - Risiko Kredit.pdf`, bukan nama resmi. Checksum resmi belum diverifikasi untuk ketiganya. Berlaku juga untuk Buku 4 dan Buku 5 (lihat WP00 bagian H). |

## 6. Koreksi terhadap temuan WP00

Dua hal dari laporan WP00 berubah setelah sumber baru masuk:

1. **Formula biaya karbon debitur.** Master prompt Bagian 05.3 menambahkan faktor `(1 - pass_through)` dan `(1 - abatement)` pada level debitur. Buku 2 **tidak** menerapkan pass-through di level debitur; pass-through hanya berlaku pada biaya karbon **agunan**. Ketentuan buku yang dipakai; selisih dicatat di registry.
2. **Cakupan risiko likuiditas.** Master prompt Bagian 05.7 mengasumsikan LCR dihitung lintas skenario dan tahun proyeksi. Buku 2 membatasinya pada **skenario Net Zero 2050 saja, hanya tahun n+1**, dan LDR dihitung otomatis di Buku 6, bukan oleh bank. Lingkup WP07 menyusut.

Satu temuan WP00 diperkuat: skalar Buku 7 yang di-hard-code di `src/enterprise/book7-annex-*-data.js` berasal dari PDF yang dibulatkan. Lampiran resmi kini mengonfirmasi sendiri bahwa angka yang ditampilkan memang dibulatkan dan presisi penuh ada di kertas kerja terpisah yang belum tersedia (ANOM-B7A-006). Kesimpulan WP00 bahwa data itu tidak layak untuk output resmi tetap berlaku.

## 7. Artefak

| Berkas | Isi |
|---|---|
| `docs/enterprise/registry/book7-annex-a-credit.json` | Metadata dokumen, inventaris 20 tabel, enumerasi, spesifikasi input A.1 dan A.4, Tabel A.5, Tabel A.8 |
| `docs/enterprise/registry/book2-parameters.json` | Skenario per jenis risiko, tier data emisi, Tabel 3, 15, 16, 18, 19, ambang materialitas, lingkup pasar dan likuiditas, 17 formula, aturan retrofit, klasifikasi bangunan, hazard |
| `docs/enterprise/requirements/crms26-book1.csv` | 95 requirement |
| `docs/enterprise/requirements/crms26-book2.csv` | 97 requirement |
| `scripts/registry/validate-crms26.mjs` | Validator 38 pemeriksaan |
| `tests/registry-crms26.test.mjs` | Pembungkus `node:test` |

## 8. Yang masih memblokir

1. **Kertas kerja presisi penuh Lampiran Buku 7** (XLSX) — tanpa ini seluruh skalar PD dan LGD tidak dapat APPROVED.
2. **Lampiran Buku 7 — Risiko Pasar dan Likuiditas** (Lampiran B dan C).
3. **Buku 3, Buku 6, Buku 7 (badan dokumen)** beserta Lampiran C Buku 3 (kalkulator 35 sheet).
4. **PDF asli OJK** untuk keenam dokumen, agar checksum dapat dicatat dan ekstraksi berbasis layout dijalankan.
5. **Klarifikasi OJK** atas ANOM-B7A-001, ANOM-B7A-002, ANOM-B7A-003, ANOM-B02-001, ANOM-B02-002, ANOM-B02-005, dan ANOM-B01-001.

## 9. Pertanyaan terbuka

1. Apakah skenario keempat "Indonesia Policies" wajib dijalankan untuk risiko pasar? (ANOM-B02-001)
2. Ambang batas Mikro/Kecil/Menengah/Korporasi mengacu ke UU 20/2008 UMKM, POJK, atau definisi internal bank? (ANOM-B7A-003)
3. Bagaimana memetakan 15 bucket PD Buku 2 ke 5 bucket rating Lampiran Buku 7? (ANOM-B02-002)
4. Apakah asesmen LGD mencakup 2040 atau tidak? (ANOM-B02-005)
5. Apakah PD Scalar di bawah 1,0 disengaja? (ANOM-B7A-001)
6. Horizon jangka pendek: `n, n+1, n+2` atau `n+1, n+2, n+3`? (ANOM-B02-006)
