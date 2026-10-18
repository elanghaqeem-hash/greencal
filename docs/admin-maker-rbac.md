# GreenCal: Admin & Maker (2-role RBAC)

| Aksi | Admin | Maker |
| --- | :---: | :---: |
| Login/logout, ubah password sendiri | ✓ | ✓ |
| Lihat ringkasan, kalkulator, input/edit emisi | ✓ | ✓ |
| Hapus aktivitas, eksposur, offset | ✓ | ✗ |
| Edit faktor emisi, parameter, unit kerja, organisasi | ✓ | ✗ |
| Kelola pengguna: buat, ganti role, reset sandi, aktif/nonaktif | ✓ | ✗ |
| Migrasi/restore data browser dan reset data bersama | ✓ | ✗ |
| Pengaturan AI | ✓ | ✗ |

Backend: Cloudflare Worker src/worker.js, D1 greencal-db (binding DB), dengan tabel gc_users, gc_sessions, gc_login_limits, gc_state, gc_events.
Server menolak akses tanpa login (401), pembaruan admin oleh Maker (403), dan konflik perubahan state (409). Cookie sesi HttpOnly/Secure/SameSite=Strict, password PBKDF2 SHA-256.

## Aktivasi perdana

1. Migrasi migrations/0001_admin_maker.sql diterapkan ke D1 tanpa merusak tabel lama.
2. Pengelola menempatkan kode setup acak sebagai secret GC_BOOTSTRAP_TOKEN di Worker Cloudflare. Jangan simpan kode ini di repository.
3. Build production harus menyalin index.html, auth-client.js dan assets/brks-syariah.svg ke dist/; deploy dengan npx wrangler deploy (wrangler.json).
4. Buka situs produksi dan daftarkan Admin pertama memakai email/password pilihan sendiri dan kode aktivasi satu kali.
5. Login Admin -> Lainnya -> Manajemen Pengguna -> buat akun Maker.
6. Impor data lama dari perangkat yang menyimpan localStorage hanya setelah verifikasi dan persetujuan Admin; tidak ada impor otomatis.
7. Rotasi/hapus kode bootstrap setelah admin aktif.

## Pemeriksaan keamanan

- API Admin dicek secara server-side, bukan hanya menu tersembunyi.
- Maker hanya bisa membuat/memperbarui entries, exposures, offsets; ID yang sudah tersimpan tidak boleh dihapus.
- Role pengguna disimpan di D1, sesi diinvalidasi ketika status/role/sandi berubah.
- Minimal satu Admin aktif dipertahankan; Admin tidak dapat menonaktifkan akun sendiri.
- Setiap perubahan state diaudit; setiap update memakai optimistic revision.
- Hitung emisi masih berjalan di sisi klien dan divalidasi formatnya di server, bukan dihitung ulang di server.
- Konfigurasi AI cloud yang sudah ada masih tersimpan di browser; jangan simpan API key produksi sebelum migrasi backend-secret dilakukan.

## Batasan

Sebelum login awal, tabel akun memang kosong (tidak dibuat password dummy). UI situs akan meminta aktivasi Admin pertama; kemudian Admin dapat membuat satu atau lebih akun Maker. Data lama di localStorage tidak dihapus dan harus dimigrasi secara eksplisit.
