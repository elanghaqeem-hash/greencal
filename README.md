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


## Deployment produksi otomatis (Cloudflare Workers Builds)

GreenCal ditayangkan pada **https://greencal.elang-haqeem.workers.dev** melalui Cloudflare Worker `greencal`.

- **Sumber produksi:** repository `elanghaqeem-hash/greencal`, branch `main`.
- **Pemicu:** Cloudflare Workers Builds terhubung ke GitHub dan `auto_build_enabled` aktif. Setiap push/merge ke `main` seharusnya memicu build baru; branch pengembangan tidak langsung masuk ke produksi.
- **Build command:** `mkdir -p dist && cp index.html dist/index.html && if [ -f assets/brks-syariah.svg ]; then mkdir -p dist/assets && cp assets/brks-syariah.svg dist/assets/brks-syariah.svg; fi`.
- **Deploy command:** `npx wrangler deploy --assets ./dist --name greencal --compatibility-date 2026-10-18`.
- **Entry point:** hanya `index.html` yang dipublikasikan sebagai aset web produksi. File `Kalkulator Emisi CRMS.html` adalah versi standalone cadangan.
- **Verifikasi:** periksa status **Builds** dan **Deployments** di [Cloudflare Dashboard](https://dash.cloudflare.com/), lalu uji halaman publik di HP dan laptop.
- **Keamanan:** token build disimpan dan dikelola pada Cloudflare Workers Builds, tidak di-commit ke GitHub.

Jika terjadi build gagal, periksa log di Cloudflare terlebih dahulu. Jangan menganggap merge GitHub sebagai bukti deployment berhasil tanpa status **SUCCESS** dan versi deployment terbaru.

## Logo BRK Syariah

Aset `assets/brks-syariah.svg` diolah dari gambar yang disediakan pengguna; header menggunakannya pada desktop dan ponsel. Build Cloudflare menyalin logo ke `dist/assets/`. Untuk membuka HTML secara lokal, sertakan direktori `assets/` di sebelah file HTML.
