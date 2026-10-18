# GreenCal — Audit Integrasi Frontend, Kalkulator, Database dan AI
18 Oktober 2026 | PR #31 | Status: pengujian PR; BELUM produksi

## Temuan sumber yang telah dibuktikan
1. Backend produksi sebelumnya memakai Cloudflare Access JWT + password + gc_sessions untuk seluruh API state dan AI.
2. gc_state lama hanya satu record id=1. Tabel ini **tidak** diekspos melalui API publik baru.
3. Frontend publik sebelumnya menyimpan input pada localStorage per IP hasil GET /api/client-scope, sehingga perangkat dengan IP yang sama tidak memiliki batas isolasi yang kuat.
4. Frontend memaksa AI Tier 2 walau tombol Analisis AI tersedia; setelah perbaikan, klik manual tombol Analisis AI memanggil Tier 3 server, sementara render otomatis pertama tetap Tier 2 dan tidak membebani kuota.
5. Tabel autentikasi lama gc_users/gc_sessions/users/sessions tetap di database; sengaja tidak dihapus.

## Perubahan dalam branch
- gc_public_state menyimpan record per anonymous browser token, hashed server-side memakai HMAC dan secret. Tidak lagi menggunakan IP sebagai identitas penyimpanan.
- Cookie anonymous HttpOnly, Secure, SameSite=Strict tidak diekspos JavaScript; expiry 30 hari. Clear cookies/browser atau kedaluwarsa berarti ruang lama tidak dapat dipulihkan tanpa mekanisme pemulihan terpisah.
- /api/public/state GET untuk membaca data/revisi, PUT ber-Origin same-origin dan compare-and-swap revision untuk menolak penulisan stale (409).
- Frontend menginisialisasi state dari D1, menyimpan setelah perubahan melalui antrean serial dan debouncing, serta memperingatkan saat koneksi gagal/terjadi konflik.
- /api/ai/status (public) hanya mengembalikan metadata provider + hasKey, bukan secret. /api/ai/analyze menjalankan rantai model di Worker dengan pembatasan lima permintaan per cookie per hari. API keys tetap disimpan sebagai Cloudflare secrets/terenkripsi di KV.
- Tidak ada migrasi dari gc_state lama ke anonymous data karena berisiko membeberkan data lintas-pengguna.
- Reset perangkat melakukan API write kosong, bukan hanya menghapus localStorage.

## Kualitas hasil dan pembatasan
- Test unit/regresi: tests/business-travel.test.mjs, tests/pcaf-securities.test.mjs, tests/wizard-interaction.test.mjs, tests/rbac.test.mjs, tests/auth-ui.test.mjs, tests/public-state.test.mjs, tests/public-api.integration.test.mjs.
- Chromium browser end-to-end dengan server mock: menu, wizard, public save/reload/isolation, AI button, mobile viewport.
- Database mock bukan Cloudflare D1 produksi; real D1 migration/constraints/latensi harus diuji terpisah di staging.
- Browser test bukan jaminan akurasi ilmiah untuk seluruh faktor emisi; tetap perlu verifikasi referensi sumber OJK/PCAF dan QA metrologi.
- Public per-device cookie bukan autentikasi identitas orang atau institusi. Jangan mengunggah data pribadi, sensitif, atau rahasia debitur ke mode publik.
- Cookie dapat dibuat ulang: kuota AI bukan batas biaya yang kuat. Sebelum live AI publik, wajib tambahkan Cloudflare WAF/rate limiting per IP/ASN dan budget provider.
- Admin API lama tetap dilindungi Cloudflare Access. Jangan menghapus protections tanpa desain IAM pengganti.

## Gate menuju produksi
1. Semua job GitHub Actions pada HEAD PR lulus.
2. Review keamanan anonymous cookies, data sensitive, AI cost protection.
3. Backup D1 dan migrasi staging 0003 dan 0004; verifikasi PRAGMA foreign_key_check, tabel, concurrency/revision 409, reset, dan rollback.
4. Uji browser nyata HP/laptop memakai staging Worker + binding ASSETS + D1 staging + KV test + AI key test.
5. Putuskan kebijakan retention data dan recovery cookie, serta login jika data debitur rahasia diperlukan.
6. Setelah lolos, merge branch, deploy Wrangler dengan assets ./dist yang dibangun sesuai runbook, lalu smoke-test URL produksi.
7. Jangan menandai production PASS sebelum API GET/PUT dan UI secara langsung diverifikasi.

## Catatan tentang sumber versus produksi
PR #31 hanya kode dan pengujian. Cloudflare production tidak otomatis diperbarui dari commit GitHub pada repository ini; deploy harus dilakukan eksplisit melalui pipeline teruji.
