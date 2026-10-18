# Walkthrough: Pengembangan Sistem Green Calculator Mobile-Friendly & Lengkap

Sistem Green Calculator telah berhasil ditingkatkan menjadi aplikasi web modern yang **lengkap, user-friendly, dan dioptimalkan secara *mobile-first*** untuk penggunaan di *smartphone* (HP) maupun komputer desktop/laptop, mengacu pada standar **Buku 1–7 Panduan CRMS OJK 2026** dan standar **PCAF (Partnership for Carbon Accounting Financials)**.

---

## 🌟 Fitur Baru & Peningkatan Utama

### 1. Ergonomi & Antarmuka Mobile-First (HP)
- **Bottom Navigation Bar (Bilah Navigasi Bawah)**: Menu utama (Ringkasan, Kalkulator Cepat, Aktivitas, Pembiayaan, Lainnya) diposisikan di bagian bawah layar agar mudah dijangkau dengan satu ibu jari.
- **Tampilan Kartu Adaptif (*Mobile Card View*)**: Pada layar ponsel, data aktivitas dan eksposur debitur otomatis disajikan dalam bentuk kartu yang rapi dan ringkas, bukan tabel lebar yang sulit digeser.
- **Tampilan Tabel Desktop**: Tersedia tombol pengalih (*Toggle*) antara **Kartu** dan **Tabel** sewaktu-waktu.
- **Floating Action Button (FAB) `+ Catat`**: Tombol aksi mengambang di pojok kanan bawah HP untuk menambah catatan emisi secara instan.
- **Keyboard Angka Otomatis**: Bidang masukan dilengkapi `inputmode="decimal"` dan `inputmode="numeric"`, serta ukuran font minimum 15px/16px agar browser HP (Safari/Chrome) tidak melakukan *auto-zoom* yang mengganggu.
- **Mode Gelap / Terang (*Dark/Light Mode*)**: Tombol saklar tema di *header* dengan dukungan otomatis mengikuti preferensi sistem perangkat.

### 2. Fitur Baru: "Kalkulator Cepat" (*Wizard Mode*)
Dirancang khusus untuk staf lapangan atau kantor cabang yang ingin menghitung emisi harian secara instan tanpa perlu membuka formulir kompleks:
1. ⚡ **Listrik PLN**: Masukkan kWh atau nominal tagihan rekening listrik (Rp); sistem otomatis mengonversi ke tCO₂e berdasarkan sistem kelistrikan (154 sistem kelistrikan PLN Indonesia) atau rata-rata nasional.
2. ⛽ **BBM Kendaraan & Genset**: Masukkan jenis BBM (Pertalite, Pertamax, Solar, Dexlite, dll.) dan volume liter; langsung menghitung emisi Scope 1.
3. ❄️ **AC & Pendingin Ruangan**: Menghitung kebocoran freon berdasarkan jenis refrigeran (R-410A, R-32, R-22) dan kapasitas/unit AC.
4. ✈️ **Perjalanan Dinas**: Menghitung emisi penerbangan (ekonomi/bisnis, km, pulang-pergi/sekali jalan) dan transportasi dinas.
5. 💼 **Pembiayaan Debitur (PCAF)**: Menghitung *Attribution Factor* (AF) dan emisi terbiayai (*financed emissions*) dalam 10 detik.
> Setiap kalkulator cepat memiliki tombol **"Simpan ke Data Aktivitas"** atau **"Simpan ke Pembiayaan"** untuk langsung menyimpannya ke laporan resmi.

### 3. Penyimpanan Persisten Offline & Cadangan Data
- **Penyimpanan Otomatis (`localStorage`)**: Data aktivitas, pembiayaan, dan pengaturan tersimpan aman di browser HP meskipun tab ditutup atau HP di-*restart*.
- **Cadangan & Pemulihan (Backup & Restore)**: Fitur 1-klik untuk mengunduh seluruh data dalam format JSON dan memulihkannya kembali di perangkat lain.
- **Ekspor CSV**: Unduh laporan Ringkasan, Data Aktivitas, dan Pembiayaan PCAF ke file CSV.
- **Tombol "Bagikan" (Web Share API)**: Memungkinkan berbagi ringkasan angka emisi secara langsung ke WhatsApp, Email, atau aplikasi perpesanan lain dari HP.

### 4. Visualisasi Data Interaktif & Ringan
- **Donut Chart SVG Interaktif**: Diagram lingkaran komposisi emisi per Scope (Scope 1, Scope 2, Scope 3 Kat 1–14, dan Scope 3 Kat 15 Financed) tanpa beban pustaka eksternal (*zero external heavy dependencies*).
- **Grafik Batang Bertumpuk (*Stacked Bars*)**: Kontribusi emisi per unit kerja/kantor cabang.
- **Distribusi Tier Debitur**: Pemetaan kualitas data debitur Tier 1–4 OJK dan status rencana transisi *Net Zero 2050*.

---

## 📁 File yang Dihasilkan

| File | Keterangan |
| :--- | :--- |
| [`index.html`](file:///c:/Users/sasib/Downloads/Green%20Cal/index.html) | File utama aplikasi web Green Calculator responsif & lengkap (mudah di-host di server/web/GitHub Pages). |
| [`Kalkulator Emisi CRMS.html`](file:///c:/Users/sasib/Downloads/Green%20Cal/Kalkulator%20Emisi%20CRMS.html) | File sumber yang telah dimutakhirkan dengan antarmuka & mesin kalkulasi baru yang sama. |

---

## 🧪 Hasil Pengujian & Verifikasi

Semua uji otomatis berhasil dijalankan dengan hasil:
1. **Verifikasi Ekstraksi & Integritas Basis Data**: 22 tabel faktor emisi lengkap dari Buku 3 OJK CRMS 2026 terverifikasi valid (154 sistem grid, 119 gas GWP, 44 bahan bakar stasioner, 18 bahan bakar bergerak, 105 pengadaan barang/jasa, dll.).
2. **Uji Sintaksis JavaScript**: Tidak ada eror sintaksis (`SyntaxError`) pada mesin logika aplikasi.
3. **Uji Akurasi Matematika & Rumus**:
   - Scope 2 Listrik (1.000 kWh Batam): `0.7648 tCO₂e` (Sesuai faktor grid Batam 0.76 kg/kWh).
   - Scope 1 BBM Bergerak (100 gal Pertamax): `0.775 tCO₂e` (Sesuai faktor bensin Pertamax).
   - Scope 3 Kat 15 PCAF (Outstanding 50, Denom 100, Emisi 2000): Attribution Factor 0.50 → `1000 tCO₂e` (Sesuai rumus PCAF).
4. **Uji Fungsionalitas Mobile**:
   - Transisi *tab* bawah berjalan mulus.
   - Tombol *Kalkulator Cepat* menghitung emisi seketika dan menyimpan ke daftar aktivitas.
   - Mode gelap/terang merespons dengan cepat dan menyimpan preferensi tema pengguna.
