# Ruang Dinas — Anggaran SPPD

Versi ini menggunakan Python standard library dan SQLite, tanpa halaman login. Data karyawan disimpan pada file `sppd.db` di komputer yang menjalankan server.

## Menjalankan

1. Pastikan Python 3 tersedia.
2. Jalankan server:
   ```sh
   python3 app.py
   ```
3. Buka `http://127.0.0.1:8000` di browser pada komputer server. Jangan membuka `index.html` langsung melalui `file://`, karena fitur database memerlukan server.
4. Pilih **Kelola karyawan** untuk mengimpor data karyawan dan tarif sesuai jenis perjalanannya.
5. Klik **Unduh Excel (.xlsx)** pada ringkasan untuk menyimpan hasil dalam format laporan.

CSV data karyawan memerlukan kolom NIK, Nama, dan Jabatan. Pemisah koma dan titik koma didukung. Header tambahan seperti `Unit Kerja`, `Divisi`, dan `Uraian` ikut disimpan; kolom lain diabaikan. Variasi jabatan seperti `BOD 3` otomatis dipetakan menjadi `BOD-3`. NIK disimpan sebagai teks, dan impor NIK yang sudah ada memperbarui data karyawan tersebut. File ini terpisah dari CSV tarif.

CSV tarif memakai header `jenis_perjalanan,jabatan,lokasi,uang_harian,uang_transportasi`. `jenis_perjalanan` diisi `Dalam Negeri` atau `Luar Negeri`. Isi satu baris untuk setiap kombinasi jenis perjalanan, jabatan, dan lokasi. Jika kombinasinya sama, impor berikutnya memperbarui tarif sebelumnya. Biaya pelatihan offline termasuk dalam uang harian; biaya online tetap Rp150.000 per hari untuk semua jabatan dan lokasi.

Tabel uang harian Dalam Negeri maupun Luar Negeri dapat diimpor terpisah dalam format matriks per daerah dengan kolom BOD-1 sampai BOD-5. Bila diimpor terpisah, tarif transportasi tidak dihitung sampai tarif transportasinya tersedia.

Tarif transportasi berdasarkan jabatan diimpor terpisah. BOD-1 dan BOD-2 meminta nominal manual saat karyawan dipilih; tarif BOD-3 sampai BOD-5 mengikuti file transportasi.

Biaya penginapan dimasukkan manual sebagai total untuk perjalanan. Kelas hotel otomatis mengikuti jabatan: Dewan Pengawas, Direksi, dan BOD-1 menggunakan hotel bintang 5; BOD-2 sampai BOD-5 menggunakan hotel bintang 4. Biaya yang dimasukkan ikut dijumlahkan dan ditampilkan pada hasil Excel.

Pilihan pelatihan gabungan menghitung uang harian sesuai hari offline, transportasi satu kali, dan biaya online Rp150.000 dikali hari online. Biaya pelatihan offline termasuk dalam uang harian. Satu perhitungan mewakili satu karyawan untuk satu perjalanan dinas.

Server saat ini hanya menerima koneksi pada komputer lokal (`127.0.0.1`). Membuka akses LAN memerlukan konfigurasi akses jaringan yang aman terlebih dahulu.

Tidak ada autentikasi. Siapa pun yang memiliki alamat situs dapat membuka aplikasi, melihat data karyawan/tarif, dan mengimpor perubahan. Untuk hosting di balik HTTPS, atur `APP_COOKIE_SECURE=1`; untuk platform yang meneruskan port, atur `HOST=0.0.0.0` dan gunakan port dari variabel `PORT`. Atur `DB_PATH` ke lokasi penyimpanan persisten pada VPS/hosting supaya data tidak hilang saat aplikasi diperbarui.

## Deploy ke Vercel dari GitHub

Repositori ini menyertakan `Dockerfile.vercel`, yang menjalankan server Python pada port yang diharapkan Vercel. Hubungkan repositori GitHub ke Vercel dan pastikan **Root Directory** menunjuk ke folder proyek ini. Tidak perlu mengatur `APP_PASSWORD` atau `APP_SESSION_SECRET`. Atur `APP_COOKIE_SECURE=1` pada Vercel Project Settings → Environment Variables untuk HTTPS, kemudian redeploy.

Jangan set `PORT` kecuali Vercel meminta pengaturan port khusus; image default menggunakan port 80 dan aplikasi mengikuti nilai `PORT` jika platform menetapkannya.

**Penyimpanan:** SQLite disimpan pada `/tmp/sppd.db` dan bersifat sementara. Container Vercel dapat dimatikan atau digandakan, sehingga data karyawan dan tarif yang diimpor tidak terjamin tetap ada. Gunakan database persisten eksternal sebelum memakai aplikasi untuk data operasional. Database lokal `sppd.db` tidak disertakan dalam Git atau image.

Untuk hosting container biasa yang menyediakan persistent volume, gunakan `Dockerfile` (bukan `Dockerfile.vercel`) dan mount volume pada `/data`; database disimpan di `/data/sppd.db`.
