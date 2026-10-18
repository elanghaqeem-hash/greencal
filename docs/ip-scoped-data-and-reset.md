# GreenCal — isolasi data menurut IP yang terverifikasi

## Perilaku
- Setiap kunjungan memanggil GET /api/client-scope. Worker menggunakan CF-Connecting-IP dari Cloudflare dan HMAC-SHA256 untuk menghasilkan pseudonim jaringan; **alamat IP asli tidak dikirim ke browser**.
- Snapshot aktivitas, pembiayaan dan offset tersimpan hanya di browser dalam kunci localStorage yang diisolasi oleh pseudonim jaringan. Jika IP berubah, snapshot IP lama tidak dimuat; tampilan input dimulai kosong.
- Tombol **Reset Data Saya** meminta konfirmasi, lalu menghapus snapshot jaringan saat ini dan mengosongkan seluruh daftar input.
- Bila IP tidak dapat diverifikasi atau secret tidak tersedia, data tetap kosong dan penyimpanan dinonaktifkan (fail-closed).
- Data contoh tidak otomatis dimasukkan saat aplikasi dibuka.
- Data lama dari mekanisme penyimpanan tanpa IP dibersihkan untuk mencegah kebocoran lintas IP.

## Batasan penting
- IP **bukan identitas unik pengguna**. NAT, VPN, jaringan kantor, jaringan seluler, IPv6 berubah-ubah: satu IP dapat dipakai beberapa pengguna dan satu pengguna dapat pindah IP.
- Pengguna pada browser/perangkat yang berbeda **tidak otomatis berbagi snapshot**, meski IP sama; snapshot yang sama dapat diakses lagi hanya dari browser dan IP yang sesuai. Jangan gunakan IP sebagai autentikasi atau pengganti RBAC.
- Backend `gc_state` yang lama bersifat shared; perubahan ini hanya mengisolasi mode publik yang memakai `auth-client.js`. Jangan menganggap data per pengguna di D1 sudah terisolasi.
- Teks default seperti nama bank/unit kerja tetap ada sebagai konfigurasi, bukan data transaksi yang diinput. Jika diperlukan blank-slate penuh juga untuk field konfigurasi, lakukan migrasi terpisah.
- IP yang kembali sama bisa memunculkan snapshot lama di browser yang sama. IP yang berbeda tidak menghapus snapshot lama; hanya menyembunyikannya. Tombol reset menghapus snapshot IP aktif.

## Gerbang release
1. Buat Cloudflare Worker secret **IP_SCOPE_SECRET** minimal 32 karakter acak; jangan commit secret ke GitHub.
2. Pastikan `src/worker.js`, `auth-client.js`, dan kedua berkas HTML ikut build; deploy branch setelah review.
3. Uji kondisi IP A simpan → refresh IP A tetap ada → IP B kosong → refresh IP B kosong → kembali IP A data A muncul.
4. Uji tombol reset IP A lalu refresh; tidak ada data pada IP A. Uji dua perangkat dan VPN, disertai pemberitahuan privasi.
5. Uji endpoint tanpa secret/CF-Connecting-IP: 503 dan data tetap kosong.
6. Verifikasi UI mobile, browser console, sinkronisasi mutasi saat koneksi IP berubah, dan pengujian tidak ada data contoh.
