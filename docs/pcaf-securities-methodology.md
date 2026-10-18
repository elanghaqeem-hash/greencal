# GreenCal — Surat Berharga (Scope 3 Kategori 15 / PCAF)

## Kelas aset

| Instrumen | Kelas perhitungan | Penyebut yang diminta |
|---|---|---|
| SBN/SUN (ORI, FR, SPN), SBSN/Sukuk Negara, Green Sukuk Negara | Sovereign debt | PDB disesuaikan PPP, dalam mata uang ekuivalen dengan eksposur |
| Saham emiten, obligasi/sukuk korporasi tercatat, MTN emiten, green bond/sukuk korporasi yang diatribusikan pada emiten | Listed equity and corporate bonds | EVIC penerbit |
| Saham privat / obligasi perusahaan non-emiten | Unlisted equity and private company bonds | Total ekuitas + utang penerbit |
| Reksa dana, ETF, sukuk/obligasi daerah, instrumen tanpa klasifikasi | Penilaian lanjut | Tidak dihitung otomatis; perlu data underlying atau metodologi yang relevan |

Rumus kerja: **Emisi terbiayai (tCO₂e) = Nilai eksposur / penyebut × emisi penerbit atau emisi teritorial negara**.

## Validasi input

- Eksposur dan penyebut wajib bernilai positif, dalam mata uang dan satuan yang sama. Eksposur yang melebihi penyebut diperlakukan sebagai data gap dan harus diperiksa, bukan diam-diam dipotong menjadi 100%.
- PDB PPP **tidak boleh** digantikan oleh PDB nominal. Konversi kurs PPP dan tahun referensi harus diselaraskan dan dikonfirmasi pemakai sebelum angka negara dihitung.
- Untuk penerbit, pilih cakupan emisi Scope 1+2 atau Scope 1+2+3. Untuk negara, pilih emisi teritorial dengan/tanpa LULUCF dan gunakan inventaris resmi yang sesuai.
- Cantumkan nama laporan, tahun, dan halaman/rujukan emisi serta penyebut. Tanpa sumber tidak ada emisi terbiayai yang otomatis dimasukkan ke total.
- Kualitas data secara default **Belum ada data**. Pengguna memilih sumber dan kelas kualitas secara eksplisit. Semua hasil surat berharga berstatus **Draft — perlu validasi**; angka ini bukan validasi kepatuhan OJK.
- Label green bond/sukuk tidak menandakan emisi terbiayai nol. Jika efek benar-benar berbasis proyek/ring-fenced/use-of-proceeds, metode berbasis penerbit mungkin tidak sesuai; lakukan verifikasi metodologi PCAF yang relevan sebelum menggunakannya dalam laporan.

## Alur aplikasi

1. Kalkulator → **Surat Berharga (PCAF)**; atau Investasi & Pembiayaan → **+ Surat Berharga**.
2. Pilih instrumen, penerbit, kode/ISIN, sektor, eksposur, data penyebut, emisi dan bukti sumber.
3. GreenCal menghitung AF dan emisi (jika data layak) atau menampilkan gap; hasil tersimpan di eksposur PCAF lokal.
4. Pada tabel investasi/pembiayaan, pilih **Edit** untuk memperbaiki data; hasil ikut ringkasan Scope 3 Kategori 15 dan ekspor CSV (jenis efek, ISIN, cakupan emisi, status validasi).

## Referensi metodologi

- [PCAF — Financed Emissions Standard, Third Edition (2025/2026)](https://carbonaccountingfinancials.com/files/standard-launch-2025/PCAF-PartA-2025-V3-15012026.pdf)
- [GHG Protocol Scope 3 — Category 15 Investments](https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf)

Catatan: klasifikasi dan koefisien tidak menggantikan kebijakan bank, asuransi, atau surat edaran/regulasi pelaporan yang berlaku. Semua bukti pengukuran perlu review manusia.
