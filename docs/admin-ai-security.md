# GreenCal — RBAC dan AI Server Proxy

## Keamanan
- **Admin**: membuat pengguna, mengubah peran, mengaktifkan/nonaktifkan akun, dan mengelola API Key AI.
- **User**: menjalankan analisis AI dan kalkulator, tetapi tidak dapat mengubah konfigurasi API Key.
- Password menggunakan PBKDF2 SHA-256 (310.000 iterasi) dengan salt acak; sesi menggunakan token acak yang hanya disimpan sebagai SHA-256 pada D1 dan cookie HttpOnly Secure SameSite=Strict.
- AI API Key dienkripsi AES-256-GCM menggunakan secret `AI_ENCRYPTION_KEY` (base64, 32 byte), disimpan di D1; hanya backend yang memanggil penyedia AI. Kunci tidak dikirim kembali ke browser.
- `ADMIN_SETUP_TOKEN` diperlukan sekali untuk bootstrap Admin dan **tidak disimpan di repository**. Hapus setelah bootstrap.
- Backend memblokir request mutasi lintas origin dan memerlukan pengguna login. Semua endpoint AI mensyaratkan sesi.
- Jangan simpan token/kunci dalam localStorage, git, atau dokumen publik.

## Sebelum aktivasi production
1. Buat D1 `greencal-db`; pasang UUID ke `wrangler.jsonc` dan jalankan `npx wrangler d1 execute greencal-db --remote --file schema.sql`.
2. Buat Cloudflare Worker secrets `AI_ENCRYPTION_KEY` (random 32 bytes base64) dan `ADMIN_SETUP_TOKEN` (acak, kuat).
3. Pindahkan `index.html` ke `public/index.html` untuk build. Jangan sertakan dokumen dan script push dalam folder publik.
4. Deploy Worker dengan `npx wrangler deploy`; pastikan login dan data eksisting tidak terganggu.
5. POST `/api/bootstrap` dengan JSON `{email,password,setupToken}` melalui sambungan tepercaya; sistem hanya membolehkan satu bootstrap ketika belum ada pengguna. Buang secret setup sesudahnya.
6. Login via `/api/login` dan pengaturan API di `/admin.html` (akan diintegrasikan dengan UI utama).
7. Uji 401/403 untuk semua endpoint, jangan produksi tanpa pengujian end-to-end, pemeriksaan keamanan, dan backup.

**Catatan:** Perubahan ini disiapkan pada branch fitur, belum otomatis mengubah production. Kalkulator lama menyimpan data aktivitas dalam browser; data ini belum menjadi multi-user server-side.
