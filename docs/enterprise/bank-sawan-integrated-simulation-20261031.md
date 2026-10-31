# Bank Sawan — Simulasi Terintegrasi SSO / CBS / GL / CKPN / Validasi Independen / Persetujuan
**Tanggal:** 31 Oktober 2026

## Tujuan dan batasan
Lingkungan Bank Sawan adalah **SIMULASI / DATA FIKTIF**, bukan institusi perbankan nyata. Seluruh identitas dalam pengujian menggunakan `@example.invalid`, semua nomor fasilitas anonim dibuat khusus UAT, dan tidak ada kredensial/dataset bank nyata yang digunakan. **Hasil simulasi yang PASS bukan sertifikasi OJK, validasi independen organisasi bank, atau persetujuan bank nyata.**

### SSO institusi (simulasi)
`tests/bank-sawan-integrated-oidc-finance-release.test.mjs` membangkitkan pasangan kunci RSA 2048 **sementara di memori**, menandatangani JWT RS256 dengan `iss`, `aud`, `kid`, `sub`, `iat`, `exp`, `email_verified=true`; JWKS diberikan hanya dari stub HTTPS di **proses pengujian**. SSO tersebut melewati `handleEnterpriseApi` dan `verifyBankOidcIdentity` yang sama dengan implementasi Vercel. Uji negatif mencakup audience salah, token kedaluwarsa, payload dipalsukan setelah penandatanganan, dan isolasi tenant. Kunci dan email sintetis **tidak** diterbitkan ke produksi; tidak ada IdP yang menyamar sebagai bank yang aktif secara publik.

### Integrasi CBS → GL → PCAF → CKPN (simulasi)
- CSV CBS sintetis dua fasilitas: **100 + 200 IDR unit demo = 300**. Pengujian memastikan field anonim, hash SHA-256 file, count dan total GL terpisah, larangan impor sebelum registrasi manifest, serta pemisahan maker/viewer dan tenant.
- Financed emissions PCAF Scope 1 **32** dan Scope 2 **14 tCO2e simulasi**, Scope 3 belum tersedia dan tidak dianggap nol.
- Model ECL Stage 1 menggunakan skenario sintetis, EIR=0: fasilitas 1 `100×0,1×0,5=5`; fasilitas 2 `200×0,05×0,4=4`. Oracle aritmetika terpisah menghasilkan **9**, diikat ke booked CKPN **5+4=9**, GL CKPN control total **9**, toleransi tepat **0**. Pengujian negatif menolak GL CKPN kontrol **10**.
- Tidak ada transaksi CBS/GL sesungguhnya, posting jurnal, atau release model nyata.

### Validasi model (simulasi)
Model-risk checker terpisah dari maker menguji rumus PCAF, PD/LGD/EAD/CKPN, kontrol independen, hashing data, dan penolakan varians tanpa toleransi. Ini **validasi implementasi berbasis vektor uji**, bukan backtesting historis atau penilaian validator profesional eksternal.

### Persetujuan Bank Sawan (simulasi)
Kelima fungsi `risk`, `finance`, `compliance`, `it`, `independent_model_validation` memiliki **subjek dan role terpisah**, login JWT bertanda tangan masing-masing, penunjukan berbeda, dan bukti sintetik yang masuk ke tabel release yang immutable. Approval oleh viewer, self-authorization, dan akses bank lain ditolak. Semua persetujuan ini adalah **SIMULATED SIGN-OFF**; `bankProductionReady=false`, `officialOjkApproved=false`.

## Cara menjalankan
```sh
node --test tests/bank-sawan-integrated-oidc-finance-release.test.mjs
node --test tests/*.test.mjs
```
Dijalankan oleh CI GitHub `GreenCal Enterprise Foundation` pada pull request. SQLite in-memory dan JWKS stub merupakan satu-satunya sumber state dan SSO tes; tidak memerlukan secret Vercel, database produksi, Cloudflare Access atau koneksi internet.

## Bukti dan klasifikasi status
| Periksa | PASS dalam simulasi apabila | Belum lulus untuk bank nyata karena |
|---|---|---|
| SSO | JWKS + JWT RS256, claims, role & tenant ditolak/diterima sesuai aturan | IdP bank nyata, provisioning, MFA dan revokasi belum dipasang |
| CBS/GL | Dua baris, checksum sumber, count & total GL cocok | Endpoint/credential CBS & GL real tidak tersedia |
| CKPN | Oracle ECL, stage & saldo CKPN tepat sama | PSAK 71 dan model bank belum dikalibrasi/ditandatangani |
| Validator | Vektor independen & tes negatif cocok | Belum ada validator independen yang berwenang |
| Persetujuan | Lima role simulasi independen merekam keputusan | Tidak ada persetujuan Direksi/bank nyata |
| OJK Buku 1–7 | Tidak berubah; evaluasi global tetap NOT_READY | Formula lampiran, laporan, data serta source signoff masih perlu penyelesaian |

**Larangan:** Jangan set `GC_ENTERPRISE_ENABLED=true` atau flag Buku 3/5/6/7 di Production berdasarkan simulasi ini. Preview Bank Sawan terdahulu hanya berisi seed dataset sintetis dan masih tidak memiliki IdP bank; proof simulator ini tidak otomatis memberi akses login browser yang sebenarnya.

## Identitas deployment
GitHub: https://github.com/elanghaqeem-hash/greencal ; target Vercel: `greencal-crms-enterprise` milik Team serayamg. Semua perubahan kode reviewable dan backward compatible; bank production tetap fail-closed.
