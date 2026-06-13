# HadirLy

**HadirLy** adalah sistem absensi sekolah berbasis web yang dirancang untuk lingkungan akademik. Aplikasi ini memanfaatkan teknologi **Geofencing** dan **Face Detection** untuk memastikan presensi siswa dilakukan secara akurat, real-time, dan meminimalisir kecurangan (anti-titip absen) di area sekolah.

Aplikasi ini saat ini diimplementasikan berdasarkan Analisis Perancangan Sistem di **SMA Negeri 14 Surabaya**.

---

## ✨ Fitur Utama

*   **Geofencing (Validasi Lokasi):** Memastikan siswa hanya dapat melakukan absensi jika berada dalam radius aman koordinat sekolah menggunakan Google Maps Platform API.
*   **Face Detection (Verifikasi Wajah):** Proses absensi dilengkapi dengan pemindaian wajah real-time menggunakan `Face-API.js` untuk mencocokkan identitas siswa.
*   **Real-time Dashboard:** Rekapitulasi data kehadiran yang dapat dipantau langsung oleh pihak sekolah/administrator.
*   **Secure Authentication:** Keamanan akun yang terintegrasi untuk siswa dan admin menggunakan `Auth.js`.

---

## 🚀 Teknologi yang Digunakan

### Backend & Database
*   **Runtime & Framework:** Node.js, Express.js
*   **Database:** PostgreSQL (Hosted via NeonDB)
*   **Authentication:** Auth.js / NextAuth (Ecosystem)

### Frontend & API Integrations
*   **Peta & Lokasi:** Google Maps Platform API (Geolocation & Geofencing)
*   **Biometrik / AI:** Face-API.js (Mendeteksi dan mengenali wajah lewat browser)

---

## 🛠️ Struktur Proyek

```text
├── Guru/               # Panel atau aset terkait antarmuka Guru
├── Siswa/              # Panel atau aset terkait antarmuka Siswa
├── admin/              # Panel atau aset terkait antarmuka Administrator
├── models/             # Folder berisi model Face-API.js / AI pemindai wajah
├── auth.js             # Logika otentikasi login/register sistem
├── server.js           # Entry point utama aplikasi Node.js / Express
├── koneksi.env         # File konfigurasi environment variables (Database & API)
├── package.json        # Manifest proyek dan daftar dependensi Node.js
├── vercel.json         # Konfigurasi deployment untuk platform Vercel
├── index.html          # Halaman utama / Landing page aplikasi
├── login.html          # Halaman masuk sistem
├── register.html       # Halaman pendaftaran akun baru
├── lupa_password.html  # Halaman pemulihan kata sandi
├── style.css           # File styling utama (CSS)
├── logout.php          # Script penanganan logout (jika ada komponen legacy)
├── contoh_excel.xlsx   # Template format Excel untuk import data
└── *.png               # Aset gambar dan logo aplikasi (HadirLy, Tetra, dll)

## 🌐 Deployment

Proyek ini sudah dikonfigurasi agar siap di-deploy ke **Vercel** menggunakan file `vercel.json`. 

1. Install Vercel CLI (`npm i -g vercel`)
2. Jalankan perintah `vercel` di root folder.
3. Masukkan Environment Variables yang ada di `koneksi.env` ke Dashboard Vercel kamu.
