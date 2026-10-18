# Walkthrough - Peningkatan Sistem Green Calculator CRMS 2026 & Fitur Analisa AI Berjenjang

Sistem **Green Calculator CRMS** telah berhasil diperbarui dan disempurnakan secara menyeluruh untuk memenuhi kebutuhan operasional perbankan & lembaga jasa keuangan sesuai standar **Buku 1–7 Panduan CRMS OJK 2026** dan standar **PCAF (Partnership for Carbon Accounting Financials)**.

---

## 1. Masalah yang Ditemukan & Solusinya

- **Kendala Sebelumnya (Sesuai Screenshot Pengguna):**
  Pada implementasi awal, kartu ringkasan emisi, donut chart, dan unit kerja tampak kosong karena fungsi rendering DOM mengalami `ReferenceError` saat inisialisasi awal (`boot()`).
- **Solusi yang Diterapkan:**
  - Dilakukan refaktorisasi arsitektur perakitan file mandiri (*single-file self-contained*) `index.html` dan `Kalkulator Emisi CRMS.html` (ukuran ~431 KB tanpa dependensi eksternal).
  - Memastikan seluruh modul skrip (`CORE_SCRIPT`, `UI_SCRIPT`, `MODULES_SCRIPT`, `AI_SCRIPT`, `AI_UI_SCRIPT`) digabungkan dan di-export secara tepat ke objek `window`.
  - Mengisolasi 22 tabel parameter baseline Buku 3 OJK ke dalam `<script type="application/json" id="baseline">` terstruktur.
  - Memperbaiki styling elemen `<select>` dropdown tahun pada header agar rapi dan tidak bentrok dengan layout form global.

---

## 2. Fitur Baru: Analisa AI dengan Pilihan Berjenjang (Tiered AI)

Sistem kini dilengkapi dengan modul **Analisa AI (Berjenjang)** yang dapat diakses langsung melalui menu navigasi desktop maupun tab navigasi seluler bawah (*mobile bottom navigation*).

Tingkatan kecerdasan buatan (*AI Tiers*) diatur secara fleksibel oleh **User Admin**:

| Tingkat AI | Mesin / Teknologi | Karakteristik & Kegunaan | Kebutuhan Jaringan |
| :--- | :--- | :--- | :--- |
| **Tier 1: AI Heuristik & Aturan Regulasi OJK** | Deterministic Audit Rule Engine | Checklist kepatuhan Buku 1–7 OJK CRMS 2026, validasi bukti audit (*evidence trail*), data gap debitur PCAF, dan penetapan **Skor Kematangan (Maturity Grade A–D)**. | 100% Offline (Tanpa Internet) |
| **Tier 2: AI Rekomendasi ESG & Dekarbonisasi Strategis (Disarankan)** | Advisory & Decarbonization Modeling Engine | Menghitung potensi riil penurunan emisi tCO₂e/tahun, estimasi investasi (*Capex*), dan periode pengembalian (*payback period*) untuk: <br>1. **PLTS Atap** kantor cabang & pusat<br>2. **Elektrifikasi Kendaraan Dinas (EV)**<br>3. **Efisiensi AC Inverter & Smart Sensor**<br>4. **Skema Pembiayaan Khusus Transisi Hijau** untuk debitur Kat. 15 PCAF. | 100% Offline (Tanpa Internet) |
| **Tier 3: Cloud LLM Generative AI** | Google Gemini (1.5 Flash/Pro) / OpenAI (GPT-4o) | Menghasilkan draf narasi eksekutif laporan keberlanjutan (*Sustainability Report / IFRS S2 / TCFD*) siap saji. Dilengkapi fitur **fallback otomatis ke Tier 2** jika API key belum diisi atau koneksi internet terputus. | Cloud API (Memerlukan API Key) |

### Pengaturan AI oleh Admin:
- Klik tombol **⚙️ Pengaturan AI (Admin)** pada tab Analisa AI.
- Admin dapat memilih tingkatan aktif (Tier 1 / Tier 2 / Tier 3).
- Mengatur target tahun dekarbonisasi (mis. 2030) dan target persentase penurunan emisi (mis. 35%).
- Konfigurasi tersimpan secara lokal dan aman di browser (`localStorage`).
- Dilengkapi tombol **Unduh Laporan AI (.md)** dan **Salin Teks Rekomendasi**.

---

## 3. Desain Responsif & Ramah Pengguna di Perangkat HP (Mobile-Friendly)

- **Touch Target & Ergonomi:** Seluruh tombol dan kontrol form memiliki tinggi minimal **44px** sesuai standar ergonomi sentuh iOS/Android.
- **Bottom Navigation Bar:** Navigasi 5 tab utama di bagian bawah layar HP (`Ringkasan`, `Analisa AI`, `Kalkulator`, `Aktivitas`, `Lainnya`).
- **Floating Action Button (FAB):** Tombol aksi cepat di sudut kanan bawah untuk kalkulasi instan.
- **Dark Mode / Light Mode:** Dukungan tema gelap otomatis dan tombol toggle tema di header.
- **Kalkulator Cepat (Wizard Form):** 5 form instan untuk menginput pemakaian listrik PLN, BBM kendaraan/genset, freon AC, tiket perjalanan dinas, dan pembiayaan debitur.

---

## 4. Hasil Verifikasi Sistem

Pengujian otomatis dijalankan secara menyeluruh:
1. **Inisialisasi Runtime (`boot`):** Berjalan mulus tanpa error `ReferenceError` maupun `TypeError`.
2. **Dashboard Visual:**
   - 4 Kartu KPI (*Total Emisi*, *Scope 1*, *Scope 2*, *Scope 3*) terisi angka riil.
   - Donut Chart SVG SVG ter-render interaktif dengan label persentase per Scope.
   - Baris unit kerja menampilkan kontribusi emisi Kantor Pusat dan Cabang.
   - Indikator Kesiapan Audit OJK / IFRS S2 menampilkan status hijau/kuning.
3. **Simulasi Eksekusi 3 Tingkat AI:**
   - *Tier 1*: Menghasilkan predikat Grade A (100/100) - Unggul.
   - *Tier 2*: Menghitung potensi reduksi emisi sebesar **1.698,91 tCO₂e/tahun** dari 4 inisiatif dekarbonisasi.
   - *Tier 3*: Fallback lancar saat API key kosong dengan catatan informatif bagi pengguna.

---

## 5. Tautan untuk Membuka Aplikasi

Sistem web server aktif dan siap dibuka melalui peramban:

- **Buka di Laptop/Komputer:**  
  [http://localhost:3000](http://localhost:3000)
- **Buka di HP / Smartphone (terhubung ke jaringan Wi-Fi yang sama):**  
  `http://192.168.1.16:3000`
- **Membuka File Langsung Secara Offline:**  
  Buka file `c:\Users\sasib\Downloads\Green Cal\index.html` atau `c:\Users\sasib\Downloads\Green Cal\Kalkulator Emisi CRMS.html` langsung dengan klik dua kali di browser (Google Chrome, Edge, Safari, dll.).
