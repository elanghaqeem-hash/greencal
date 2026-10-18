# GreenCal — Penerapan MFA biometrik atau PIN perangkat

Status dokumen: **rencana cutover yang memerlukan enrollment dan validasi pemilik akun**. Tidak membuktikan MFA produksi sudah aktif.

## Arsitektur

- **Cloudflare Access** memverifikasi identitas email pengguna dengan JWT yang divalidasi Worker.
- **Cloudflare independent MFA** ditargetkan hanya mengizinkan `biometrics` (platform authenticator: Face ID, Touch ID, Windows Hello, atau verifikasi lokal perangkat yang didukung, termasuk PIN/sandi kunci layar bila ditawarkan OS).
- **D1** tetap memeriksa status aktif dan role `admin` / `maker`.
- **GreenCal** saat ini masih memiliki login password D1 setelah Cloudflare Access; jangan menghapusnya sampai alur passkey penuh diuji dan disetujui.
- Tidak menambahkan TOTP/authenticator app/SMS sebagai pilihan MFA GreenCal.
- Tidak mengubah MFA tingkat **organisasi** Cloudflare karena digunakan aplikasi lain.
- Jangan menyimpan template biometrik, PIN, atau private key di Worker, frontend, KV, GitHub, atau D1; OS dan platform autentikator menangani verifikasi lokal.

## Bukti konfigurasi saat investigasi

- Cloudflare Access app: `GreenCal — Admin and Maker`, destination Worker `greencal`.
- Kebijakan app hanya memperbolehkan dua alamat yang terdaftar: Admin `tegoehbudiarto@gmail.com` dan Maker `serayamg@gmail.com`.
- IdP biometrik/passkey tersedia tetapi tidak dipilih eksklusif untuk app.
- IdP Cloudflare default memakai `restrict_to_account_members=true`; ini dapat menolak pengguna bukan anggota akun.
- MFA organisasi mengizinkan `totp`, `biometrics`, dan `security_key`, dan berlaku pada aplikasi lain.
- Akun D1 keduanya terdaftar namun perlu aktivasi password pertama pada saat pemeriksaan sebelumnya.
- Tidak ditemukan bukti bahwa **kedua** pengguna sudah mendaftarkan platform authenticator.

## Tahap 1 — Onboarding perangkat (jangan aktifkan biometrik wajib dahulu)

1. Admin memastikan **login identitas pertama** untuk kedua email dapat dilakukan melalui metode verifikasi identitas yang sah. Jika OTP email dipakai untuk bootstrap, gunakan hanya pada pendaftaran awal, **bukan** sebagai MFA rutin. Jangan mengubah email allowlist.
2. Pemilik Admin dan Maker membuka `https://green-heart-e2b0.cloudflareaccess.com/AddMfaDevice` setelah berhasil login ke Access.
3. Pilih **Biometrics → Register biometrics**. Ikuti Face ID, Touch ID, Windows Hello, atau verifikasi kunci layar/PIN yang ditawarkan perangkat.
4. Setiap pemilik akun melakukan pendaftaran pada HP/laptopnya sendiri. **Jangan meminta pengguna mengirim biometrik atau PIN ke Admin.**
5. Admin memverifikasi masing-masing punya autentikator terdaftar melalui kontrol Cloudflare / pengujian langsung. Indikator kompatibilitas WebAuthn dalam GreenCal **bukan** bukti enrollment.
6. Lakukan aktivasi password D1 bila masih diperlukan oleh login GreenCal.

**Gate sebelum enforcement:** kedua akun dapat masuk dengan role benar, perangkat masing-masing mampu memenuhi metode biometrik, dan pemulihan akses terdokumentasi.

## Tahap 2 — Enforcement hanya pada aplikasi GreenCal

Di Cloudflare Zero Trust → Access controls → Applications → **GreenCal — Admin and Maker** → MFA settings:

- MFA enabled / required.
- Allowed authenticators: **Biometrics saja**.
- Disable `totp` dan `security_key` sebagai opsi MFA aplikasi ini.
- Gunakan konfigurasi aplikasi atau kebijakan khusus GreenCal; **jangan** ubah `mfa_required_for_all_apps` atau `mfa_config` organisasi.
- Bentuk konfigurasi API untuk app/policy bila dilakukan dengan hak akses yang sesuai:
  ```json
  { "mfa_config": { "allowed_authenticators": ["biometrics"], "mfa_disabled": false, "session_duration": "12h" } }
  ```
- Pertahankan dua alamat email allowlist, destination Worker, session policy, dan RBAC D1.
- IdP Passkeys untuk login langsung dapat dipilih **setelah** passkey kedua pengguna terdaftar dan tervalidasi. Identity provider `passkeys` dan independent `biometrics` MFA adalah dua mekanisme berbeda: jangan keliru menganggap mengaktifkan IdP otomatis memaksakan independent MFA.

## Tahap 3 — Uji penerimaan dan rollback

| Skenario | Hasil wajib |
|---|---|
| Admin login HP dengan biometrik/PIN perangkat yang terdaftar | Sukses; role Admin benar |
| Maker login HP/laptop dengan biometrik/PIN perangkat yang terdaftar | Sukses; role Maker benar |
| Login pada browser/perangkat yang belum didaftarkan | Ditolak atau diarahkan onboarding yang aman |
| TOTP/SMS/security key alternatif pada MFA GreenCal | Tidak ditawarkan sebagai MFA GreenCal |
| Email di luar allowlist dua akun | Cloudflare Access 403 |
| Maker mencoba ubah parameter/config AI/hapus data | Backend 403 |
| Session logout / kadaluwarsa | Mewajibkan autentikasi ulang sesuai policy |
| Recovery bila perangkat hilang | Hanya melalui alur identitas/pemulihan terverifikasi; tidak bypass |
| Proteksi aplikasi Cloudflare lain | Tidak berubah |

Jika kedua akun terblokir, **rollback hanya pengaturan MFA/IdP app GreenCal** ke konfigurasi sebelumnya oleh admin Cloudflare yang berwenang; jangan menonaktifkan MFA organisasi atau membuka allowlist untuk publik. Audit perubahan sebelum/selepas. Simpan hasil pengujian nyata sebelum menyatakan production PASS.

Rujukan: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/
