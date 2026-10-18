# GreenCal — Cloudflare Deployment Runbook

## Pemicu otomatis
- Source: `elanghaqeem-hash/greencal`, branch produksi `main`.
- Worker: `greencal` (`https://greencal.elang-haqeem.workers.dev`).
- Workers Builds auto-build harus aktif. Setiap push ke `main` seharusnya membuat build baru; PR/branch selain `main` tidak boleh otomatis merilis produksi.

## Verifikasi setiap rilis
1. Periksa commit terakhir pada branch `main` di GitHub.
2. Pada Cloudflare Dashboard → Workers & Pages → greencal → Builds, pastikan muncul build baru yang merujuk commit terkait.
3. Tunggu status `Success`, lalu pada Deployments cek versi baru menerima 100% traffic.
4. Buka alamat Worker dari HP dan desktop: header, filter, tombol, kartu KPI, grafik, navigasi, tema gelap, serta ekspor CSV tidak boleh saling menutupi.
5. Uji rumus, penyimpanan di browser, dan backup/restore secara terpisah jika perubahan menyentuh JavaScript.

## Jika build tidak dipicu
- Verifikasi `Settings → Builds → Git Repository` terhubung ke akun GitHub serta repo yang benar.
- Cek Branch control (`main`) dan status `Enable automatic builds`.
- Gunakan pengelolaan aplikasi GitHub di Cloudflare untuk menyambungkan ulang izin repo apabila event push tidak terkirim.
- Build manual menggunakan commit SHA hanyalah pemulihan sementara; tidak membuktikan auto-deploy bekerja.

## Rollback
Gunakan Cloudflare Worker → Deployments → pilih versi produksi sehat sebelumnya. Catat versi yang di-rollback dan alasan. Jangan menghapus file sumber atau mengubah data pengguna sebagai bagian dari rollback UI.

## Keamanan
Cloudflare API token harus disimpan dalam kredensial/Build Tokens Cloudflare; tidak di README, kode, workflow publik, atau log.
