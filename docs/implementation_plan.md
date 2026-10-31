> **Catatan audit 27 Oktober 2026:** dokumen ini adalah rencana historis. Pernyataan kelengkapan tujuh buku atau akurasi terhadap sumber OJK di bawah belum memiliki traceability/validasi yang memadai. Gunakan `docs/enterprise/README.md` dan matriks regulasi terbaru sebagai status implementasi yang berlaku.

# Rencana Pengembangan Sistem Green Calculator Lengkap & Mobile-Friendly (HP)

## Gambaran Umum & Tujuan
Berdasarkan file sumber `Kalkulator Emisi CRMS.html`, sistem Green Calculator saat ini memiliki metodologi perhitungan yang sangat lengkap mengacu pada **Buku 1–7 Panduan Climate Risk Management & Scenario Analysis (CRMS) OJK 2026** serta standar **PCAF (Partnership for Carbon Accounting Financials)**. Namun, antarmuka sebelumnya berorientasi desktop dengan tabel-tabel lebar yang sulit dibaca di layar HP, navigasi tab horizontal atas yang tidak ergonomis untuk satu tangan, serta penyimpanan lokal di memori yang hilang begitu browser HP me-refresh halaman.

Tujuan pengembangan ini adalah merombak dan meningkatkan sistem menjadi aplikasi web modern yang **lengkap, ramah pengguna (user-friendly), responsif mobile-first untuk perangkat HP/smartphone**, offline-ready, serta memiliki fitur kalkulator cepat (wizard) untuk operasional harian di lapangan maupun kantor cabang.

---

## Fitur Utama yang Dikembangkan

### 1. Desain Mobile-First & Ergonomi HP (Smartphones)
- **Bottom Navigation Bar (Bilah Navigasi Bawah)** untuk HP:
  - Menu utama mudah dijangkau dengan satu ibu jari: *Ringkasan*, *Aktivitas*, *Pembiayaan*, *Risiko Transisi*, dan *Menu/Lainnya* (Offset, Parameter, Panduan, Backup).
  - Pada layar desktop/tablet, otomatis beradaptasi menjadi sidebar/topbar yang proporsional.
- **Adaptive Data Presentation (Mobile Card vs Table View)**:
  - Pada layar smartphone (< 768px), data aktivitas, pembiayaan, dan risiko transisi disajikan dalam bentuk **kartu informasi interaktif (Mobile Cards)** yang rapi, dilengkapi chip status, rincian emisi per unit, dan tombol aksi cepat (Edit & Hapus) dengan ukuran sentuh nyaman (minimal 44×44px).
  - Pada layar desktop, tetap dapat menampilkan tabel lengkap multi-kolom.
- **Mobile Bottom Sheets & Floating Action Button (FAB)**:
  - Tombol aksi mengambang `+ Catat Emisi` untuk menambah data dengan cepat kapan saja di HP.
  - Dialog dan formulir input membuka sebagai bottom sheet yang nyaman diisi dengan keyboard virtual HP.
- **Form Input Teroptimasi HP**:
  - Ukuran input minimum 16px (mencegah auto-zoom yang mengganggu di browser iPhone/Safari & Android Chrome).
  - Atribut `inputmode="decimal"` dan `inputmode="numeric"` agar keyboard angka otomatis muncul di HP.
  - Opsi pencarian (search dropdown / quick filter) untuk mempermudah pemilihan sistem kelistrikan (150+ sistem) dan jenis bahan bakar.

### 2. Fitur Baru: "Kalkulator Cepat / Entry Wizard"
- Menyediakan mode kalkulasi instan untuk staf cabang atau pengguna lapangan:
  - ⚡ **Listrik PLN**: Masukkan kWh atau estimasi tagihan listrik.
  - 🚗 **BBM & Kendaraan**: Masukkan jenis BBM (Pertalite, Dexlite, Solar, Pertamax) dan liter atau jumlah kendaraan.
  - ❄️ **AC & Refrigeran**: Estimasi kebocoran pendingin ruangan berdasarkan tipe & kapasitas.
  - ✈️ **Perjalanan Dinas**: Jarak penerbangan / tiket perjalanan dinas & hotel.
  - 💼 **Eksposur Pembiayaan / Portofolio**: Perhitungan cepat emisi terbiayai (PCAF) per debitur.
- Hasil kalkulasi menampilkan formula langkah-demi-langkah secara transparan dan tombol **"Simpan ke Data Aktivitas"** dengan 1 ketukan.

### 3. Penyimpanan Persisten Offline (Offline-First Storage)
- Menggunakan **`localStorage` persisten** dengan fallback memori:
  - Seluruh data aktivitas, eksposur debitur, offset, dan perubahan parameter tersimpan aman di browser HP meskipun tab ditutup atau HP di-restart.
- **Fitur Backup & Restore Data**:
  - Ekspor seluruh data cadangan ke format JSON.
  - Impor kembali data JSON untuk sinkronisasi antar perangkat (HP ke Laptop atau sebaliknya).
  - Ekspor laporan ke format CSV / cetak laporan ringkasan yang ramah mobile.
- **Integrasi Web Share API**:
  - Memungkinkan membagikan ringkasan emisi langsung ke WhatsApp, Email, atau aplikasi chat di HP dengan tombol "Bagikan Ringkasan".

### 4. Visualisasi & Dashboard Interaktif Ringan
- **Grafik SVG Native Interaktif** (tanpa dependency berat, sangat cepat di HP berkecepatan internet rendah):
  - Ringkasan proporsi Scope 1, Scope 2, dan Scope 3 (Donut Chart visual).
  - Distribusi emisi per unit kerja / kantor cabang (Stacked Bar).
  - Distribusi Tier kualitas data debitur (Tier 1–4) & status rencana transisi net-zero 2050.
  - Biaya risiko transisi debitur per sektor CRSA.

### 5. Kelengkapan Parameter & Regulasi (Buku 1–7 OJK CRMS 2026)
- Tetap mempertahankan seluruh basis data lengkap bawaan:
  - 154 faktor sistem kelistrikan PLN Indonesia + rata-rata nasional.
  - 44 bahan bakar stasioner, 18 bahan bakar bergerak, 119 refrigeran GWP AR5, 97 faktor limbah WARM, 105 sektor pengadaan spend-based.
  - 7 kelas aset PCAF & akad syariah (Murabahah, Musyarakah, Mudharabah, Ijarah, KPR, Kendaraan, SBSN).
  - Skenario NGFS (Net Zero 2050, Delayed Transition, Current Policies) & tabel PD Bucket.
  - Manajemen parameter admin: audit log, versioning, dan status verifikasi.

---

## File yang Akan Dibuat & Dimodifikasi

1. **[NEW] `index.html`** (atau pengembangan terstruktur di folder Green Cal):
   - Kami akan membuat versi utama yang modern, responsif, dan lengkap bernama `index.html` (sehingga mudah diakses langsung atau di-host di local server / GitHub Pages / web server), serta memperbarui `Kalkulator Emisi CRMS.html` agar selaras.
   - PWA metadata (manifest & service worker dasar) agar bisa di-install sebagai Web App di layar utama HP ("Add to Home Screen").

---

## Rencana Verifikasi (Testing Plan)
1. **Verifikasi Fungsionalitas & Akurasi Rumus**:
   - Menghitung Scope 1 (Genset bensin/solar, AC R-410A).
   - Menghitung Scope 2 (Listrik sistem Sumatera / Jawa-Bali vs nasional).
   - Menghitung Scope 3 (Kat 6 Penerbangan, Kat 7 Commuting, Kat 15 Financed PCAF).
   - Menghitung Risiko Transisi Debitur (Biaya karbon skenario NGFS vs laba bersih).
   - Memastikan hasil numerik 100% identik dengan standar lembar Buku 3 OJK CRMS 2026.
2. **Verifikasi Responsivitas Mobile (HP)**:
   - Pengujian viewport layar sempit (360px - 414px) untuk simulasi smartphone (iPhone, Samsung Galaxy, dll.).
   - Memeriksa kenyamanan tombol navigasi bawah (Bottom Bar), kartu data, modal/bottom sheet, dan keyboard input.
3. **Verifikasi Penyimpanan & Ekspor**:
   - Memastikan data tersimpan di `localStorage` setelah refresh.
   - Menguji ekspor CSV & backup JSON.

---

> [!NOTE]
> Setelah rencana ini disetujui, kami akan segera mengimplementasikan sistem Green Calculator lengkap dan ramah pengguna mobile ini.
