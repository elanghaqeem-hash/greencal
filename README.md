# GreenCal

Repository utama pengembangan GreenCal.

## Pengelolaan materi

Materi, dokumentasi, dan kode dapat ditambahkan melalui commit atau pull request. Gunakan branch terpisah untuk perubahan yang memerlukan review sebelum digabungkan ke `main`.

## Struktur Proyek

- `docs/` — dokumentasi proyek & artefak pengembangan:
  - [`docs/walkthrough.md`](docs/walkthrough.md) — Rangkuman peningkatan fitur, pengujian, dan panduan sistem Green Calculator
  - [`docs/implementation_plan.md`](docs/implementation_plan.md) — Rencana implementasi teknis & metodologi OJK CRMS / PCAF
- `index.html` — Aplikasi web utama Green Calculator (mobile-friendly & desktop)
- `Kalkulator Emisi CRMS.html` — Versi cadangan / standalone kalkulator emisi CRMS OJK


## Deployment produksi dan P0 asset integrity

GreenCal ditayangkan pada **https://greencal.elang-haqeem.workers.dev** melalui Cloudflare Worker `greencal`.

- **Sumber produksi:** repository `elanghaqeem-hash/greencal`, branch `main`.
- **Status pemicu:** Integrasi Workers Builds otomatis **belum terverifikasi aktif**. Pemeriksaan Cloudflare tanggal 20 Oktober 2026 menunjukkan belum ada build trigger untuk Worker ini. Jangan menganggap push ke `main` telah tayang sebelum deployment selesai.
- **Build command wajib:** `node scripts/build-dist.mjs` — menyalin `index.html`, `auth-client.js`, `assets/guide-learning.js` dan `assets/brks-syariah.svg`; gagal otomatis apabila ada file penting hilang.
- **Deploy command:** `npx wrangler deploy --config wrangler.jsonc` (setelah build; binding `ASSETS`, D1, KV tetap mengikuti konfigurasi Worker).
- **Entry point:** `index.html` sebagai halaman utama serta **seluruh dependensi eksternal** wajib berada dalam paket `dist/`. File `Kalkulator Emisi CRMS.html` tetap cadangan dan tidak dibundel.
- **Verifikasi:** periksa status **Builds** dan **Deployments** di [Cloudflare Dashboard](https://dash.cloudflare.com/), lalu uji halaman publik di HP dan laptop.
- **Keamanan:** token build disimpan dan dikelola pada Cloudflare Workers Builds, tidak di-commit ke GitHub.

Jika terjadi build gagal, periksa log di Cloudflare terlebih dahulu. Jangan menganggap merge GitHub sebagai bukti deployment berhasil tanpa status **SUCCESS** dan versi deployment terbaru.

## P0 — pemeriksaan aplikasi sebelum rilis

```bash
node scripts/build-dist.mjs
node --test tests/p0-assets.test.mjs
node --check auth-client.js
node --check assets/guide-learning.js
# Kemudian deployment manual setelah CI lolos:
npx wrangler deploy --config wrangler.jsonc
```

Workflow `GreenCal P0 assets and browser smoke` melakukan uji Chromium desktop dan seluler dengan API identity lokal yang ditiru. Ini tidak mengubah database maupun API key produksi. Setelah deploy, periksa file HTTP `/auth-client.js`, `/assets/guide-learning.js` dan `/assets/brks-syariah.svg`, pastikan bukan 404/HTML fallback; uji kalkulator, simpan, refresh, menu lengkap, dan console errors pada alamat produksi. GitHub CI yang berhasil **tidak sama** dengan deployment produksi yang berhasil.

## Logo BRK Syariah

Aset `assets/brks-syariah.svg` diolah dari gambar yang disediakan pengguna; header menggunakannya pada desktop dan ponsel. Build Cloudflare menyalin logo ke `dist/assets/`. Untuk membuka HTML secara lokal, sertakan direktori `assets/` di sebelah file HTML.
