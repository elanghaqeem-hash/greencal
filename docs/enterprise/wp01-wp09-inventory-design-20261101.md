# WP01 dan WP09 — Inventaris aksi, OpenAPI 3.1, dan design system

Tanggal: 1 November 2026
Cabang: `wp02-wp10/onprem-iam-precision`
Pendahulu: `docs/enterprise/wp02-wp10-onprem-platform-20261101.md`

---

## A. Ringkasan

| Paket kerja | Lingkup | Keadaan |
| --- | --- | --- |
| WP01 | Inventaris menu, form, dan aksi; spesifikasi OpenAPI 3.1; gate CI | Selesai |
| WP09 | Design system "Fresh Green Finance": token, mode gelap, font dihosting sendiri, verifikasi kontras WCAG 2.2 AA | Selesai |

Uji: **464 uji, 462 lulus, 0 gagal, 2 dilewati.** Dua yang dilewati adalah uji
PostgreSQL warisan Vercel yang menuntut `GREENCAL_TEST_PG_URL` terpisah.
Penambahan pada paket kerja ini: 50 uji (27 inventaris dan OpenAPI, 23 design
system).

---

## B. WP01 — Inventaris aksi dan OpenAPI

### B.1 Mengapa diekstrak, bukan ditulis tangan

Inventaris menu, form, dan aksi yang ditulis tangan akan menyimpang dari kode
pada perubahan kedua atau ketiga, dan penyimpangan itu baru terlihat saat
auditor menanyakan endpoint yang tidak ada di dokumen. Karena itu rantainya
dibuat tertutup:

```
kode penangan  <-- gate dua arah -->  menu-form-action.csv  --generate-->  openapi.json
```

- `scripts/inventory/extract-actions.mjs` membaca penjaga rute pada
  `src/enterprise/*.js` dan menghasilkan daftar (path, method) yang **benar-benar
  ada** di kode.
- `docs/inventory/menu-form-action.csv` memuat anotasi yang hanya diketahui
  manusia: menu, form, modul, peran minimum, sumber daya dan aksi RBAC,
  penulisan audit, dan `test_case_ids`.
- `docs/api/openapi.json` **dibangun** dari CSV itu, bukan ditulis terpisah.

Gate bekerja **dua arah**, dan keduanya menggagalkan CI:

| Penyimpangan | Kode temuan |
| --- | --- |
| Endpoint ada di kode, tidak terdaftar di inventaris | `ACTION_NOT_IN_INVENTORY` |
| Baris inventaris menyebut rute yang tidak ada di kode | `INVENTORY_ROUTE_NOT_IN_CODE` |
| Rute tanpa penjaga metode HTTP eksplisit | `ROUTE_WITHOUT_METHOD_GUARD` |
| Aksi yang mengubah keadaan tanpa penulisan audit | `MUTATION_WITHOUT_AUDIT` |
| `test_case_ids` kosong atau salah bentuk | `INVENTORY_FIELD_EMPTY`, `INVENTORY_TEST_IDS_MALFORMED` |
| Modul di luar M01 sampai M32 | `INVENTORY_MODULE_UNKNOWN` |
| `openapi.json` basi terhadap CSV | langkah CI "Pastikan OpenAPI tidak basi" |

Hasil saat ini: **54 aksi di kode, 54 baris inventaris, 0 temuan.**

### B.2 Masalah yang ditemukan dan diperbaiki saat membangun ekstraktor

Versi pertama ekstraktor menghasilkan **69 aksi**, lebih banyak daripada yang
benar-benar ada. Penyebabnya: rute berparameter dicocokkan satu regex yang
mencakup beberapa sub-aksi sekaligus, misalnya

```js
/^\/records\/([a-zA-Z0-9_-]{1,80})(?:\/(workflow|history|export))?$/
```

dan metode yang muncul di mana pun dalam blok itu menempel pada **seluruh**
varian path. Akibatnya inventaris mencantumkan `PATCH .../export` dan
`POST .../history`, dua endpoint yang tidak pernah ada.

Perbaikannya: penautan metode dilakukan **per kondisi `if`**, karena di situlah
sub-aksi dan metode diuji bersama-sama (`action==='export'&&method==='GET'`),
termasuk memecah kondisi gabungan seperti

```js
if ((!action && method === 'PATCH') || (action === 'workflow' && method === 'POST'))
```

menjadi dua pasangan terpisah. Varian path yang tidak pernah diuji bersama
metode apa pun dibuang: ia hanya kemungkinan sintaksis dari regex-nya, bukan
endpoint. Setelah perbaikan, jumlahnya 54 dan cocok dengan kode baris per baris.

Uji `tests/inventory-openapi.test.mjs` mengunci kedua arah kesalahan ini: ia
menuntut tujuh endpoint yang diketahui ada **muncul**, dan tiga endpoint yang
diketahui tidak ada **tidak muncul**.

### B.3 Sifat yang dinyatakan kontrak API

Spesifikasi tidak hanya mendaftar endpoint; ia menyatakan sifat yang berlaku
pada seluruh operasi, dan uji menuntut sifat itu tampak di kontrak:

- **Setiap** operasi mendeklarasikan 401, 403, dan 503. Default deny dan fail
  closed harus terlihat di kontrak, bukan hanya di kode.
- **Setiap** operasi berparameter mendeklarasikan 404, karena objek milik tenant
  lain menghasilkan 404, bukan 403 — status 403 akan mengungkapkan bahwa objek
  itu ada.
- Parameter path wajib punya pola validasi dan batas panjang.
- Operasi bermetode tubuh wajib mendeklarasikan `requestBody` wajib, dan
  deskripsinya menyatakan bahwa keluaran peramban tidak pernah dipercaya:
  perhitungan dihitung ulang di server sebelum submit, check, dan approve.
- Skema galat menuntut `code` yang stabil dan berpola, sehingga klien bercabang
  pada kode, bukan pada teks pesan yang dapat berubah.
- Setiap operasi membawa `x-greencal-module`, `x-greencal-required-role`,
  `x-greencal-rbac`, `x-greencal-writes-audit`, dan `x-greencal-test-case-ids`.
- Server yang dideklarasikan hanya host intranet; uji menolak host yang tampak
  publik, karena deployment ini tidak terjangkau dari internet.

Hasil: 42 path, 54 operasi, 14 tag.

### B.4 Temuan yang perlu ditindaklanjuti

Seluruh **27 peran** sudah ada di lapisan IAM on-premise, tetapi penjaga peran
di `src/enterprise/*.js` masih memakai sebagian dari **14 peran warisan**. Uji
`peran pada inventaris adalah peran yang benar-benar ada` menerima keduanya
lewat `LEGACY_ROLE_MAP`, sehingga inventaris jujur terhadap keadaan kode saat
ini. Migrasi penjaga peran lama ke `authorize()` pada
`src/onprem/iam/policy-engine.js` adalah pekerjaan tersendiri; mencampurnya ke
dalam WP01 akan menyembunyikan perubahan perilaku otorisasi di balik perubahan
dokumentasi.

---

## C. WP09 — Design system "Fresh Green Finance"

### C.1 Token sebagai satu-satunya sumber nilai

`assets/design-tokens.css` adalah satu-satunya tempat warna, tipografi, jarak,
radius, bayangan, dan lapisan didefinisikan. Uji menolak warna literal di luar
blok definisi token, sehingga komponen tidak dapat menyelipkan `#52756a` lagi
seperti pada stylesheet sebelumnya.

Tiga keputusan yang membentuk palet:

1. **Hijau tua, bukan hijau pemasaran.** Layar yang dipakai sepanjang hari
   untuk membaca angka membaca lebih tenang dengan hijau tua, dan menyisakan
   ruang kontras untuk warna status.
2. **Angka memakai tabular numerals** (`tnum`) secara global, ditambah
   `font-variant-numeric: tabular-nums` pada kolom bertanda numerik. Kolom
   rupiah yang digitnya sejajar dapat dibandingkan sekali lihat; tanpa itu,
   perbedaan satu digit tersamar lebar karakter.
3. **Warna tidak pernah menjadi satu-satunya pembawa makna** (WCAG 1.4.1).
   Setiap status punya pasangan teks dan latar yang lulus AA penuh, dan komponen
   wajib menambahkan ikon atau label.

### C.2 Mode gelap bukan inversi

Mode gelap punya tokennya sendiri, bukan hasil inversi:

- Hijau tua merek tidak terbaca pada latar gelap, jadi merek bergeser ke hijau
  terang (`#54d3a4`) dan warna di atasnya menjadi hijau sangat tua
  (`#04231a`), bukan putih. Uji menuntut `--color-on-brand` **berbeda** antar
  mode, karena putih di atas hijau terang gagal kontras.
- Latar tidak pernah hitam murni. `#000` pada panel OLED besar menghasilkan
  silau tepi pada teks terang; `#0a1512` menghindarinya.
- Bayangan hampir tak berguna pada mode gelap, jadi kedalaman dinyatakan lewat
  `--color-surface-raised` dan batas.

Dua jalur aktivasi: preferensi sistem, dan pilihan eksplisit lewat
`data-theme`. Pilihan eksplisit **menang**, sehingga pengguna dapat menolak
preferensi sistemnya.

### C.3 Kontras dihitung, bukan diklaim

`scripts/design/contrast.mjs` mengimplementasikan luminance relatif dan rasio
kontras WCAG 2.x, lalu membaca token yang benar-benar dipakai stylesheet dan
menghitung **24 pasangan** pada mode terang dan gelap, total **48 pemeriksaan**.
Pembulatan selalu ke bawah, agar 4.499 tidak pernah tampil sebagai 4.5.

Keadaan saat ini: **48 pasangan diperiksa, 0 gagal.** Angka terendah adalah
4.02:1 untuk batas kolom input pada mode terang terhadap ambang non-teks 3:1.

Verifikasi ini **menemukan dua cacat nyata** pada rancangan pertama, dan
keduanya hanya terlihat karena dihitung:

| Cacat | Temuan | Perbaikan |
| --- | --- | --- |
| `--color-border-strong: #94aba2` | hanya **2.44:1** terhadap putih, di bawah ambang 3:1 WCAG 1.4.11 untuk komponen antarmuka | digelapkan ke `#6b847b`, kini 4.02:1 |
| Lima seri data | seluruhnya lulus terhadap latar, tetapi terangnya hampir sama (gap terkecil 1.03:1), sehingga diagram tidak terbaca pada cetakan hitam putih maupun bagi pembaca dengan defisiensi penglihatan warna | palet disusun ulang sebagai tangga terang; setiap seri berurutan kini terpisah minimal 1.17:1 |

Cacat kedua layak dicatat: palet pertama **lulus seluruh ambang WCAG** dan
tetap merupakan rancangan yang buruk. WCAG tidak mengatur pemisahan antar seri
data, jadi aturan 1.15:1 itu adalah aturan rancangan yang ditetapkan sendiri dan
diuji sendiri. Diagram pada laporan regulator sering dicetak hitam putih;
palet yang hanya dibedakan hue akan kehilangan maknanya di sana.

Satu cacat ketiga ditemukan verifikasi dengan cara yang lebih sederhana:
`--color-brand-hover` bernilai `#084staging`, bukan warna. Pembaca token
menolaknya dan uji gagal. Tanpa verifikasi yang dihitung, nilai itu akan
diam-diam membuat tombol hover kehilangan warnanya di produksi.

### C.4 Font dihosting sendiri

Inter, subset latin, empat berat (400, 500, 600, 700), **96 KB total**, di
bawah SIL Open Font License 1.1 dengan salinan lisensi di
`assets/fonts/inter-OFL-1.1.txt`.

Alasannya bukan preferensi, melainkan konsekuensi WP02: **deployment
on-premise menolak egress**, sehingga font dari Google Fonts atau CDN mana pun
tidak akan pernah tiba, dan teks akan jatuh ke font cadangan tanpa peringatan.
Uji menolak rujukan ke host luar, menolak `@import` dari internet, memverifikasi
setiap berkas yang dirujuk benar-benar ada dengan ukuran yang wajar, dan
menuntut setiap `@font-face` menunjuk berkas yang **beratnya cocok** — berat
yang tidak cocok membuat peramban mensintesis huruf dan merusak bentuknya.

### C.5 Aksesibilitas yang ditegakkan stylesheet

- **Fokus tidak pernah dihapus tanpa pengganti.** Uji menolak
  `outline: none` di luar media query. Ini kegagalan WCAG 2.4.7 yang paling
  sering ditemukan pada aplikasi internal.
- **Target sentuh minimum 24x24 px** (WCAG 2.2 butir 2.5.8 Target Size Minimum).
- **Ukuran font akar tidak dikunci dalam piksel**, sehingga pengguna yang
  memperbesar font peramban terlayani (WCAG 1.4.4).
- **`prefers-reduced-motion`** mematikan animasi, bukan mempercepatnya; pengguna
  yang meminta pengurangan gerak umumnya sensitif terhadap gerak apa pun.
- **`forced-colors: active`** menyerahkan warna ke sistem alih-alih menimpanya.
- **Aturan cetak** membuang latar gelap dan tetap membedakan status lewat
  batas, karena laporan regulator sering dicetak.
- **Cincin fokus bukan warna merek**, dan uji menuntut keduanya terpisah
  minimal 1.5:1. Cincin fokus sewarna merek akan menghilang tepat di atas
  tombol utama, yaitu kontrol yang paling sering difokus.

---

## D. Perintah verifikasi

```bash
npm run inventory:list        # 54 aksi yang terbaca dari kode
npm run inventory:check       # gate dua arah kode dan inventaris
npm run openapi:build         # bangun ulang openapi.json dari inventaris
npm run design:contrast       # 48 pemeriksaan kontras, terang dan gelap
npm run test:ux               # uji inventaris, OpenAPI, dan design system
```

---

## E. Sisa pekerjaan sesudah ini

1. **Migrasi penjaga peran warisan** di `src/enterprise/*.js` ke
   `authorize()` pada lapisan IAM on-premise. Bukan pekerjaan dokumentasi;
   ia mengubah perilaku otorisasi dan perlu uji tersendiri per endpoint.
2. **Pemindahan rute API ke server on-premise.** `scripts/onprem/server.mjs`
   kini menyajikan aplikasi statis beserta `/healthz` dan `/readyz`; rute gaya
   Vercel di `api/bridge.js` belum dipindahkan. OpenAPI dari WP01 adalah
   kontrak yang dipakai pemindahan itu.
3. **Penerapan token ke stylesheet komponen.** `assets/enterprise.css` dan
   kerabatnya masih memuat warna literal dari sebelum WP09. Lapisan token sudah
   dimuat lebih dulu pada kedua halaman, sehingga penggantian dapat dilakukan
   bertahap tanpa memecah tampilan.
4. **Gate bank yang masih terbuka**, sebagaimana dicatat
   `docs/enterprise/release/release-gates.json`: digest citra, sumber 5 Buku,
   DAST, uji penetrasi, validasi model independen, uji restore DRC, asesmen
   residensi data, dan persetujuan CAB.
