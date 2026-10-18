# GreenCal: biometrik saja sebagai faktor MFA

**Status rollout:** Pendaftaran perangkat disiapkan; kewajiban biometric-only pada
kebijakan aplikasi GreenCal belum diaktifkan sampai Admin dan Maker
menyelesaikan enrollment serta uji login. Jangan menghapus jalur onboarding
sebelum masing-masing pengguna punya autentikator yang berfungsi.

## Cakupan dan tujuan

- Hanya GreenCal; jangan mengubah `mfa_config` organisasi Cloudflare yang juga
  melindungi aplikasi lainnya.
- MFA yang diizinkan untuk aplikasi GreenCal setelah migrasi: **biometrics**.
  Nonaktifkan pilihan TOTP, SMS (bila ada), atau security key sebagai MFA
  GreenCal. Jangan mengubah batas akses dua identitas yang ditentukan.
- Touch ID, Face ID, Windows Hello atau autentikator lokal perangkat menggunakan
  WebAuthn. GreenCal dan Cloudflare tidak menyimpan foto wajah/sidik jari.
- Perangkat tertentu mengizinkan PIN perangkat sebagai fallback untuk operasi
  passkey; tidak semua perangkat/browser dapat dipaksa menggunakan sensor fisik
  saja. Klaim \"hanya sidik jari/wajah tanpa PIN\" tidak dapat dijamin oleh UI.

## Pendaftaran Admin dan Maker (masing-masing pada perangkat sendiri)

1. Siapkan biometrik pada **pengaturan keamanan perangkat**.
2. Buka halaman enrollment resmi:
   https://green-heart-e2b0.cloudflareaccess.com/AddMfaDevice
3. Login/identifikasi diri secara sah pada Cloudflare Access jika diminta.
   Identifikasi awal saat setup **bukan** opsi MFA tambahan untuk akses rutin.
4. Pilih **Biometrics → Register biometrics**, lalu ikuti prompt
   sidik jari/wajah dari sistem operasi.
5. Ulangi di perangkat lain yang ingin digunakan, jika perlu.
6. Uji login Cloudflare Access pada jendela baru; jangan hapus metode
   onboarding sebelum kedua pengguna berhasil.

## Konfigurasi per-policy setelah enrollment terverifikasi

Cloudflare Access > Access controls > Applications > GreenCal — Admin and Maker
> Policies > GreenCal — Superadmin dan Maker > MFA.

- Enable MFA.
- Allowed authenticator methods: **Biometrics** saja
  (`mfa_config.allowed_authenticators = [\"biometrics\"]`).
- Tetap pertahankan daftar `include` hanya dua email Admin/Maker, tanpa
  `bypass` maupun `everyone`.
- Pastikan `mfa_disabled` bukan `true`.
- Jangan mengubah kebijakan lain atau autentikasi global organisasi.

## Kriteria penerimaan

- Admin dan Maker memiliki biometric authenticator yang berhasil dienroll.
- Login GreenCal dengan biometrik berhasil pada HP/laptop masing-masing.
- Login tanpa biometrik gagal meskipun identitas utama benar.
- Aplikasi tidak menawarkan TOTP/security key sebagai MFA GreenCal.
- Maker tetap tidak dapat mengubah pengaturan AI, parameter, dan data Admin.
- Backend GreenCal masih memerlukan aktivasi password awal terpisah sampai
  alur aplikasi itu secara eksplisit dimigrasikan dan diuji ulang.
- Kunci autentikasi privat disimpan pada perangkat, tidak disimpan di D1,
  JavaScript, localStorage, atau dikirim ke repository.

## Pemulihan akses

Jika ponsel hilang atau sidik jari gagal, perlu prosedur administrasi
terverifikasi untuk mencabut autentikator lama dan enroll ulang.
Tidak disediakan bypass tidak terautentikasi.
