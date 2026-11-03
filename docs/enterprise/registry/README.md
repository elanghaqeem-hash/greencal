# Registry parameter regulatori

Direktori ini memuat registry **regulasi-sebagai-data**: setiap angka regulatori
yang dipakai perhitungan, beserta dokumen sumber, halaman, versi, status
verifikasi, dan jejak verifier serta approver.

Master Execution Prompt v2.0 Bagian 01.1 butir 1 melarang konstanta regulatori
yang hard-coded di aplikasi. Direktori inilah penggantinya, dan
`migrations/onprem/0002_registry_and_runs.sql` adalah bentuk tabelnya di basis
data.

## Isi

Berkas registry (`book2-parameters.json`, `book7-annex-a-credit.json`, dan
seterusnya) tiba bersama **WP04**; lihat PR yang membawa
`scripts/registry/validate-crms26.mjs`. Sampai PR itu masuk, direktori ini
hanya memuat berkas ini.

Direktori sengaja dipertahankan ada meskipun masih kosong, karena `Dockerfile`
menyalinnya ke dalam citra runtime: parameter regulatori wajib ikut dalam paket
rilis offline, bukan diambil dari jaringan saat aplikasi berjalan.

## Aturan yang berlaku atas isinya

- Tidak ada angka yang boleh berstatus `APPROVED` tanpa `source_sha256` pada
  dokumen sumbernya. Ditegakkan trigger `crms.require_source_checksum()`.
- Status `VERIFIED_DUAL` menuntut **dua ekstraksi independen yang cocok**.
  Ditegakkan constraint `dual_requires_two_extractions`.
- Pengekstrak, pemverifikasi, dan penyetuju wajib **tiga orang berbeda**.
  Ditegakkan constraint `parameter_sod_three_persons`.
- Angka yang belum lengkap sumbernya tetap berstatus `SOURCE_PENDING` dan
  **tidak pernah** mengisi laporan resmi. Itu bukan kekurangan yang ditutup
  dengan nilai default; kalkulasi dihentikan dengan galat.
