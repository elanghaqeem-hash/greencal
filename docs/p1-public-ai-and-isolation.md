# GreenCal P1 — mode publik, AI Cloud, dan isolasi data

## Mode publik tanpa login
- Halaman kalkulator tetap dapat digunakan tanpa Cloudflare Access.
- Hanya `GET /api/client-scope`, `GET /api/ai/status`, dan `POST /api/ai/analyze` yang terbuka untuk publik.
- `/api/ai/settings`, `/api/admin/*`, dan `/api/state` **tidak** dibuka untuk publik. Mereka tetap bergantung pada autentikasi backend.
- Semua hasil analisis lokal Tier 2 tersedia walaupun kuota AI Cloud habis.

## Persetujuan AI Cloud
- Tombol **AI Cloud** ditampilkan hanya jika endpoint status mengonfirmasi fitur aktif dan provider tersedia.
- Pengguna harus menekan tombol dan menyetujui pengiriman data agregat sebelum memanggil model eksternal.
- Payload hanya berisi tahun, total emisi, Scope 1–3, financed emissions, outstanding dan data quality. **Nama debitur, identitas nasabah, bukti dan rincian transaksi tidak dikirim.**
- Output AI hanya draft dan wajib ditinjau manusia.

## Batas penggunaan publik
- `GREENCAL_PUBLIC_AI_ENABLED="true"` adalah feature flag deploy. Jika tidak bernilai `true`, API menolak panggilan berbiaya.
- Migrasi `migrations/0004_public_ai_quota.sql` wajib dijalankan **sebelum** feature flag diaktifkan. Ini membuat tabel `gc_public_ai_quota` saja; tidak mengubah data nasabah.
- Kuota otomatis maksimum **3 permintaan / jaringan / hari UTC** dan **50 permintaan global / hari UTC**, disimpan di Cloudflare D1 dengan update atomik.
- Seluruh pembatasan berlaku server-side, sebelum permintaan diteruskan ke provider. Apabila identitas jaringan atau database gagal, AI Cloud fail-closed.
- Tidak ada endpoint untuk mengirim API key dari browser publik. Secret tetap di Cloudflare Worker.
- Batas global ini bukan pengganti kontrol biaya, firewall bot, kuota provider, atau review penggunaan harian.
- Matikan AI Cloud dengan mengubah flag menjadi `"false"` dan redeploy jika muncul abuse.

## Data kerja pada perangkat
- Snapshot kegiatan memakai `greencal_ip_scope_v1_<hmac>`.
- Draft aktivitas dan skenario NGFS disimpan pada kunci snapshot ditambah namespace khusus.
- IP berbeda tidak pernah memuat draft/skenario jaringan sebelumnya. IP sama pada browser yang sama dapat memunculkan catatan sebelumnya.
- IP bukan autentikasi dan tidak menjamin satu orang unik. Jangan gunakan data rahasia nasabah di mode publik.
- Tidak ada migrasi otomatis kunci draft lama yang belum diisolasi. Kunci lama dapat tetap berada di browser sebagai cadangan, tetapi tidak dimuat secara otomatis.
- Tombol reset eksplisit menghapus snapshot beserta semua kunci aktif dan penyimpanan draft warisan; penyimpanan tertunda dibatalkan.

## Pengujian dan verifikasi
1. Jalankan tes `tests/p1-api.test.mjs` dan `tests/p1-browser-isolation.mjs` melalui GitHub Actions.
2. Pastikan `P0` tetap hijau.
3. Pastikan Worker publik tetap bisa memuat halaman dan `/api/client-scope`.
4. Pastikan status AI publik hanya mengembalikan `role:"public"` dan `publicCloudEnabled`, bukan API key atau konfigurasi admin.
5. Pastikan `POST /api/ai/settings` tanpa login tidak mendapat respons 200.
6. Pantau kuota global/per jaringan dan error vendor tanpa mengirim data pelanggan sebenarnya selama smoke test.

## Batasan yang belum diselesaikan
- Tidak ada database multi-tenant untuk input mode publik: semua data transaksi kerja masih hanya berada di localStorage dan harus dicadangkan oleh pengguna.
- Network scope berbasis IP bukan kontrol akses atau identitas pengguna yang cukup untuk layanan multi-user perbankan.
- Pengujian beban, anti-bot, dan rekonsiliasi tarif/faktor emisi tetap pekerjaan lanjutan.
