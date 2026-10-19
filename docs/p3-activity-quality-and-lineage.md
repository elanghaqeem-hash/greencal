# GreenCal P3.1 — kualitas input aktivitas dan keterlacakan faktor

## Perubahan yang selesai dikembangkan
1. Setiap kategori aktivitas dengan jumlah wajib membedakan **data kosong** dari **nol yang sengaja diisi**. Nilai kosong tidak menghasilkan emisi nol yang dapat disimpan.
2. Validasi bergantung pada pilihan metode. Pada refrigeran/pemadam dengan neraca, setidaknya satu komponen pengukuran wajib diisi, namun komponen lain boleh kosong bila tidak ada transaksi.
3. Kolom teks seperti nama dan kota hotel tidak dipaksa sebagai angka. Penghitungan hotel tetap berdasarkan tamu-malam atau belanja, bukan metadata hotel.
4. Jumlah kendaraan, gedung, pegawai, hari kerja, dan efisiensi ketel divalidasi. Efisiensi ketel dibatasi pada rentang lebih dari nol sampai 100 persen; masa operasi refrigeran lebih dari nol sampai 12 bulan.
5. Referensi faktor dalam hasil aktivitas mencantumkan nama, sumber dari metadata katalog, periode berlaku, dan versi. Faktor GWP CH4/N2O yang benar-benar digunakan dalam perhitungan ikut dicatat.
6. Tampilan hasil mempunyai rincian sumber melalui komponen buka-tutup yang mudah diakses di HP; pengguna diingatkan bahwa status katalog tidak sama dengan verifikasi independen.

## Pengujian
- Unit/regresi P3.1, P2, PCAF surat berharga, dan perjalanan dinas.
- Browser Chromium desktop dan HP: form listrik kosong tidak dianggap nol, simpan data invalid ditolak, sumber faktor tersimpan, dan nama hotel teks dapat diisi.
- P0/P1 regression tetap wajib lulus.
- Tidak ada migrasi atau penghapusan data produksi; data localStorage pengguna tetap di perangkatnya.

## Batasan P3.1
Audit struktur menemukan 883 entri pada 22 tabel faktor, yang pada snapshot repository memiliki metadata sumber, versi, periode, dan identitas faktor terisi. **Pemeriksaan ini tidak memverifikasi keakuratan numerik, lisensi, status verifikasi, kecocokan konteks unit, atau keabsahan dokumen rujukan dari sumber primer.** Banyak rujukan berasal dari teks katalog dan perlu rekonsiliasi manual sebelum pelaporan resmi.

### Tahap berikutnya
- **P3.2** Rekonsiliasi sumber faktor paling material: listrik, bahan bakar, penerbangan/perjalanan, dan PCAF, termasuk tahun, unit, GWP, label metode, serta selisih terhadap dokumen primer.
- **P3.3** Data-quality dashboard: coverage, evidence completeness, stale factors dan peringatan hasil belum tervalidasi.
