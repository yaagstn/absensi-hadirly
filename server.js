const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { v2: cloudinary } = require('cloudinary');

require('dotenv').config({ path: './koneksi.env' });

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024
    }
});

// --- CONSTANTS ---
const ROLES = { GURU: 'guru', SISWA: 'siswa', ADMIN: 'admin' };
const HARI_EFEKTIF_SISWA = 20;
const HARI_KERJA_GURU = 22;

// --- HELPERS ---
function hitungRekap(rows, totalHari) {
    return rows.map((row) => {
        const h = row.hadir || 0;
        const s = row.sakit || 0;
        const i = row.izin || 0;
        const a = Math.max(0, totalHari - (h + s + i));
        return {
            nama_lengkap: row.nama_lengkap,
            hadir: h,
            sakit: s,
            izin: i,
            alfa: a,
            persentase: totalHari > 0 ? ((h / totalHari) * 100).toFixed(0) + '%' : '0%',
        };
    });
}

function makeUpload(dest, prefix = '') {
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, dest),
            filename: (req, file, cb) =>
                cb(
                    null,
                    (prefix ? prefix + '-' : '') + Date.now() + path.extname(file.originalname)
                ),
        }),
        limits: { fileSize: 500000 },
    });
}

// Konfigurasi Database menggunakan .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Tes Koneksi Database saat Server Jalan
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Gagal koneksi ke database Neon:', err.stack);
    }
    console.log('✅ Terhubung ke Database Neon');
    release();
});

// --- ENDPOINT DATA GURU ---
app.post('/tambah-guru', async (req, res) => {
    const { nip_id, nama_lengkap, jenis_kelamin, mata_pelajaran, email, no_hp, alamat_lengkap } = req.body;

    // Validasi Manual di Server (Proteksi tambahan)
    if (!jenis_kelamin || jenis_kelamin === '') {
        return res.status(400).json({
            error: 'Kolom jenis_kelamin kosong! Server menolak karena database NOT NULL.',
        });
    }

    try {
        const query = `
            INSERT INTO guru (nip_id, nama_lengkap, jenis_kelamin, mata_pelajaran, email, no_hp, alamat_lengkap)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        const values = [
            nip_id,
            nama_lengkap,
            jenis_kelamin,
            mata_pelajaran,
            email,
            no_hp,
            alamat_lengkap,
        ];

        await pool.query(query, values);
        res.status(200).json({ message: 'Data Guru berhasil disimpan!' });
    } catch (err) {
        // Tampilkan error yang sangat spesifik dari PostgreSQL
        console.error('DB ERROR:', err.message);
        res.status(500).json({ error: 'Database Error: ' + err.message });
    }
});

// --- ENDPOINT DATA SISWA ---
app.post('/tambah-siswa', async (req, res) => {
    const { nisn_id, nama_lengkap, kelas, angkatan, jenis_kelamin, no_hp, alamat_lengkap } =
        req.body;
    try {
        const query = `
      INSERT INTO siswa (nisn_id, nama_lengkap, kelas, angkatan, jenis_kelamin, no_hp, alamat_lengkap)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        const values = [
            nisn_id,
            nama_lengkap,
            kelas,
            angkatan,
            jenis_kelamin,
            no_hp,
            alamat_lengkap,
        ];
        await pool.query(query, values);
        res.status(200).json({ message: 'Data Siswa berhasil disimpan ke Neon!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menyimpan data siswa' });
    }
});

// --- ENDPOINT UNTUK DASHBOARD (STATISTIK) ---
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT tabel,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE LOWER(jenis_kelamin) LIKE 'laki%') AS laki,
                   COUNT(*) FILTER (WHERE LOWER(jenis_kelamin) LIKE 'perempuan%') AS perempuan
            FROM (
                SELECT 'guru' AS tabel, jenis_kelamin FROM guru
                UNION ALL
                SELECT 'siswa', jenis_kelamin FROM siswa
            ) t
            GROUP BY tabel
        `);

        const byTabel = Object.fromEntries(result.rows.map((r) => [r.tabel, r]));
        const parse = (r) =>
            r
                ? {
                      total: parseInt(r.total) || 0,
                      laki: parseInt(r.laki) || 0,
                      perempuan: parseInt(r.perempuan) || 0,
                  }
                : { total: 0, laki: 0, perempuan: 0 };

        res.json({ guru: parse(byTabel.guru), siswa: parse(byTabel.siswa) });
    } catch (err) {
        console.error('Error stats:', err);
        res.status(500).json({ error: 'Gagal mengambil data statistik' });
    }
});

// Mengambil semua daftar kelas
app.get('/api/kelas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM kelas ORDER BY nama_kelas ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Menambah kelas baru
app.post('/api/kelas', async (req, res) => {
    const { nama_kelas, kapasitas } = req.body;
    try {
        // Pastikan nama tabel di database Neon kamu adalah 'kelas'
        const result = await pool.query(
            'INSERT INTO kelas (nama_kelas, kapasitas) VALUES ($1, $2) RETURNING *',
            [nama_kelas, kapasitas]
        );
        // Kirim respon sukses agar frontend tidak memunculkan pesan "Gagal Simpan"
        res.status(201).json({
            success: true,
            message: 'Data berhasil disimpan',
            data: result.rows[0],
        });
    } catch (err) {
        console.error('Error simpan kelas ke database:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/kelas/:nama_kelas/siswa', async (req, res) => {
    try {
        const { nama_kelas } = req.params;
        // Query untuk mencari siswa berdasarkan kolom kelas
        const query = 'SELECT nama_lengkap as nama, nisn_id as nisn FROM siswa WHERE kelas = $1';
        const result = await pool.query(query, [nama_kelas]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data siswa' });
    }
});

// 1. Ambil semua data mapel untuk tabel datamapel.html dan dropdown
app.get('/api/mapel', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM mapel ORDER BY nama_mapel ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Simpan mapel baru dari modal tambah
app.post('/api/mapel', async (req, res) => {
    try {
        const { nama_mapel, kode_mapel } = req.body;
        await pool.query('INSERT INTO mapel (nama_mapel, kode_mapel) VALUES ($1, $2)', [
            nama_mapel,
            kode_mapel,
        ]);
        res.json({ message: 'Mata pelajaran berhasil ditambahkan!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/mapel/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM mapel WHERE id = $1', [id]);
        res.json({ message: 'Data berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route untuk mengupdate data mapel berdasarkan ID
app.put('/api/mapel/:id', async (req, res) => {
    const { id } = req.params;
    const { nama_mapel, kode_mapel } = req.body;
    try {
        await pool.query('UPDATE mapel SET nama_mapel = $1, kode_mapel = $2 WHERE id = $3', [
            nama_mapel,
            kode_mapel,
            id,
        ]);
        res.json({ message: 'Data berhasil diperbarui!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route untuk mengambil data dari tabel guru
app.get('/api/guru', async (req, res) => {
    try {
        // Query untuk mengambil semua data guru
        const query = 'SELECT nip_id, nama_lengkap, mata_pelajaran, email FROM guru ORDER BY nama_lengkap ASC';
        
        // Menggunakan pool yang sama dengan yang kamu pakai untuk INSERT
        const result = await pool.query(query);
        
        // Mengirimkan baris data (rows) ke frontend
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('DB ERROR saat fetch:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data dari database' });
    }
});

// Endpoint untuk mengambil daftar nama guru (untuk dropdown laporan)
app.get('/api/guru/daftar', async (req, res) => {
    try {
        const result = await pool.query('SELECT nip_id, nama_lengkap FROM guru ORDER BY nama_lengkap ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error ambil guru:', err.message);
        res.status(500).json({ error: err.message });
    }
});


// 1. Ambil data profil admin
app.get('/api/admin/profile', async (req, res) => {
    try {
        // Ambil dari pengguna agar data yang muncul sesuai dengan yang ada di navbar/login
        const result = await pool.query(
            "SELECT username, email FROM pengguna WHERE role = 'admin' AND id = 1"
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Update data profil admin (Hanya Username dan Email)
app.put('/api/admin/profile', async (req, res) => {
    try {
        // Kita tidak perlu nip_nisn lagi, tapi kita butuh id admin yang sedang login
        const { username, email, nama_lengkap, id } = req.body;

        if (!id) {
            return res.status(400).json({ success: false, message: 'ID Admin wajib dikirim' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // 1. Update tabel 'admin' berdasarkan ID
            await client.query('UPDATE admin SET username=$1, email=$2 WHERE id=$3', [
                username,
                email,
                id,
            ]);

            // 2. Update tabel 'pengguna' berdasarkan ID atau username
            // Karena admin juga ada di tabel pengguna, kita update berdasarkan ID
            const result = await client.query(
                'UPDATE pengguna SET username=$1, nama_lengkap=$2 WHERE id=$3',
                [username, nama_lengkap, id]
            );

            if (result.rowCount === 0) {
                throw new Error('Data di tabel pengguna tidak ditemukan');
            }

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            res.status(500).json({ success: false, message: err.message });
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── RESET PASSWORD ────────────────────────────────────────────────────────────

// Fungsi internal: verifikasi identitas (no_hp atau email)
async function verifyIdentity(username, role, verifikasi) {
    const pRes = await pool.query('SELECT nip_nisn FROM pengguna WHERE username = $1', [username]);
    if (pRes.rows.length === 0) return false;
    const nip_nisn = pRes.rows[0].nip_nisn;

    if (role === 'guru') {
        const r = await pool.query('SELECT id FROM guru WHERE nip_id = $1 AND no_hp = $2', [nip_nisn, verifikasi]);
        return r.rows.length > 0;
    } else if (role === 'siswa') {
        const r = await pool.query('SELECT id FROM siswa WHERE nisn_id = $1 AND no_hp = $2', [nip_nisn, verifikasi]);
        return r.rows.length > 0;
    } else {
        // admin: cocokkan dengan email di tabel admin (ambil admin pertama)
        const r = await pool.query('SELECT id FROM admin WHERE LOWER(email) = LOWER($1)', [verifikasi]);
        return r.rows.length > 0;
    }
}

// Step 1: cek username
app.post('/api/reset-password/cek-username', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Username wajib diisi' });
    try {
        const result = await pool.query(
            'SELECT nama_lengkap, role FROM pengguna WHERE username = $1',
            [username]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Username tidak ditemukan' });

        const { nama_lengkap, role } = result.rows[0];
        const hint = role === 'admin' ? 'email yang terdaftar' : 'nomor HP yang terdaftar';
        res.json({ success: true, nama: nama_lengkap, role, hint });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Step 2: verifikasi identitas
app.post('/api/reset-password/verifikasi', async (req, res) => {
    const { username, verifikasi } = req.body;
    if (!username || !verifikasi)
        return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    try {
        const pRes = await pool.query('SELECT role FROM pengguna WHERE username = $1', [username]);
        if (pRes.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Username tidak valid' });

        const valid = await verifyIdentity(username, pRes.rows[0].role, verifikasi);
        if (!valid)
            return res.status(400).json({ success: false, message: 'Identitas tidak cocok dengan data terdaftar' });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Step 3: ganti password (verifikasi ulang penuh sebelum simpan)
app.post('/api/reset-password/ganti', async (req, res) => {
    const { username, verifikasi, password_baru } = req.body;
    if (!username || !verifikasi || !password_baru)
        return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    if (password_baru.length < 6)
        return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    try {
        const pRes = await pool.query('SELECT role FROM pengguna WHERE username = $1', [username]);
        if (pRes.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Username tidak valid' });

        const valid = await verifyIdentity(username, pRes.rows[0].role, verifikasi);
        if (!valid)
            return res.status(400).json({ success: false, message: 'Verifikasi identitas gagal' });

        await pool.query('UPDATE pengguna SET password = $1 WHERE username = $2', [password_baru, username]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            `
            SELECT 
                p.nip_nisn, 
                p.nama_lengkap, 
                p.role, 
                g.nip_id, 
                g.mata_pelajaran, 
                g.email, 
                g.no_hp,
                s.kelas AS id_kelas
            FROM pengguna p
            LEFT JOIN guru g ON p.nip_nisn = g.nip_id
            LEFT JOIN siswa s ON p.nip_nisn = s.nisn_id
            WHERE p.username = $1 AND p.password = $2
        `,
            [username, password]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const finalId = user.nip_id || user.nip_nisn;

            // Perbaikan Logika Redirect agar Siswa tidak masuk ke Admin
            let halamanTujuan = '';
            if (user.role === ROLES.GURU) {
                halamanTujuan = 'Guru/dashboard_guru.html';
            } else if (user.role === ROLES.SISWA) {
                halamanTujuan = 'Siswa/dashboard_siswa.html';
            } else {
                halamanTujuan = 'admin/admin.html';
            }

            res.json({
                success: true,
                user: {
                    nip: finalId,
                    nama: user.nama_lengkap,
                    role: user.role,
                    mapel: user.mata_pelajaran,
                    email: user.email,
                    no_hp: user.no_hp,
                    id_kelas: user.id_kelas,
                    kelas: user.id_kelas,
                },
                redirect: halamanTujuan,
            });
        } else {
            res.status(401).json({ success: false, message: 'Username atau Password salah' });
        }
    } catch (err) {
        console.error('Error Login:', err.message);
        res.status(500).json({ success: false, message: 'Kesalahan server' });
    }
});

// --- ENDPOINT REGISTER (AKTIVASI WAJAH) ---
app.post('/api/register', async (req, res) => {
    // Kita tidak butuh data 'role' dari frontend lagi karena server akan mencarinya sendiri
    const { id_nomor, password, face_vector } = req.body;

    try {
        // 1. Cek di tabel GURU dahulu
        let checkInduk = await pool.query('SELECT nama_lengkap FROM guru WHERE nip_id = $1', [
            id_nomor,
        ]);
        let detectedRole = ROLES.GURU;

        // 2. Jika tidak ketemu di guru, cek di tabel SISWA
        if (checkInduk.rows.length === 0) {
            checkInduk = await pool.query('SELECT nama_lengkap FROM siswa WHERE nisn_id = $1', [
                id_nomor,
            ]);
            detectedRole = ROLES.SISWA;
        }

        // 3. Jika di kedua tabel tidak ada, baru kirim error
        if (checkInduk.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `ID ${id_nomor} tidak ditemukan di data Guru maupun Siswa!`,
            });
        }

        const namaAsli = checkInduk.rows[0].nama_lengkap;

        // 4. Cek apakah sudah pernah daftar
        const checkUser = await pool.query('SELECT * FROM pengguna WHERE nip_nisn = $1', [
            id_nomor,
        ]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Akun sudah aktif!' });
        }

        if (face_vector) {
            const pendaftarBaruDescriptor = JSON.parse(face_vector);
            const semuaPengguna = await pool.query('SELECT nip_nisn, face_vector FROM pengguna WHERE face_vector IS NOT NULL');
            const THRESHOLD = 0.5; 

            for (let user of semuaPengguna.rows) {
                try {
                    const userDescriptor = JSON.parse(user.face_vector);
                    if (Array.isArray(userDescriptor) && userDescriptor.length === pendaftarBaruDescriptor.length) {
                        const distance = Math.sqrt(
                            pendaftarBaruDescriptor.reduce((sum, val, i) => sum + Math.pow(val - userDescriptor[i], 2), 0)
                        );
                        if (distance < THRESHOLD) {
                            return res.status(400).json({ 
                                success: false, 
                                message: 'Gagal! Wajah ini sudah digunakan oleh akun lain.' 
                            });
                        }
                    }
                } catch (e) {
                    continue; 
                }
            }
        }

        // 5. Simpan ke tabel pengguna (Gunakan id_nomor sebagai username)
        const insertQuery = `
            INSERT INTO pengguna (nip_nisn, nama_lengkap, role, username, password, face_vector, status_aktif)
            VALUES ($1, $2, $3, $4, $5, $6, true)
        `;

        await pool.query(insertQuery, [
            id_nomor,
            namaAsli,
            detectedRole,
            id_nomor,
            password,
            face_vector,
        ]);

        res.json({
            success: true,
            message: `Halo ${namaAsli}, pendaftaran sebagai ${detectedRole} berhasil!`,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Kesalahan Database: ' + err.message });
    }
});

app.get('/api/get-face-guru/:nip', async (req, res) => {
    try {
        const { nip } = req.params;
        const result = await pool.query(
            'SELECT face_vector, nama_lengkap FROM pengguna WHERE nip_nisn = $1',
            [nip]
        );
        if (result.rows.length > 0) {
            res.json({
                success: true,
                face_vector: result.rows[0].face_vector,
                nama_lengkap: result.rows[0].nama_lengkap,
            });
        } else {
            res.status(404).json({ success: false, message: 'Data wajah tidak ditemukan!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/submit-absen', async (req, res) => {
    const { user_id, nama_lengkap, jenis_absen } = req.body;

    const nDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const sekarang = new Date(nDate);
    const jamSekarang =
        sekarang.getHours().toString().padStart(2, '0') +
        ':' +
        sekarang.getMinutes().toString().padStart(2, '0') +
        ':' +
        sekarang.getSeconds().toString().padStart(2, '0');

    const tanggalSekarang =
        sekarang.getFullYear() +
        '-' +
        (sekarang.getMonth() + 1).toString().padStart(2, '0') +
        '-' +
        sekarang.getDate().toString().padStart(2, '0');

    try {
        const cekData = await pool.query(
            'SELECT * FROM presensi WHERE nip_nisn = $1 AND tanggal = $2',
            [user_id, tanggalSekarang]
        );

        // 1. LOGIKA KHUSUS PULANG
        if (jenis_absen === 'pulang') {
            if (cekData.rows.length > 0) {
                await pool.query(
                    'UPDATE presensi SET jam_pulang = $1 WHERE nip_nisn = $2 AND tanggal = $3',
                    [jamSekarang, user_id, tanggalSekarang]
                );
            } else {
                await pool.query(
                    `INSERT INTO presensi 
                     (nip_nisn, nama_lengkap, tanggal, jam_masuk, jam_pulang, status) 
                     VALUES ($1, $2, $3, NULL, $4, $5)`,
                    [user_id, nama_lengkap, tanggalSekarang, jamSekarang, 'Hadir']
                );
            }
            return res.json({ success: true, message: 'Absen pulang berhasil dicatat!' });
        }
        // 2. LOGIKA KHUSUS MASUK
        else if (jenis_absen === 'masuk') {
            if (cekData.rows.length > 0) {
                await pool.query(
                    'UPDATE presensi SET jam_masuk = $1, status = $2 WHERE nip_nisn = $3 AND tanggal = $4',
                    [jamSekarang, 'Hadir', user_id, tanggalSekarang]
                );
            } else {
                await pool.query(
                    'INSERT INTO presensi (nip_nisn, nama_lengkap, tanggal, jam_masuk, status) VALUES ($1, $2, $3, $4, $5)',
                    [user_id, nama_lengkap, tanggalSekarang, jamSekarang, 'Hadir']
                );
            }
            return res.json({ success: true, message: 'Absen masuk berhasil dicatat!' });
        }
        // 3. JIKA JENIS_ABSEN TIDAK VALID
        else {
            return res.status(400).json({ success: false, error: 'Jenis absen tidak valid' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Gagal memproses absensi' });
    }
});

       
app.get('/api/guru/absen-hari-ini', async (req, res) => {
    const { nip } = req.query;

    const nDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const sekarang = new Date(nDate);
    const tanggalSekarang = sekarang.getFullYear() + "-" + 
        (sekarang.getMonth() + 1).toString().padStart(2, '0') + "-" + 
        sekarang.getDate().toString().padStart(2, '0');

    try {
        const result = await pool.query(
            'SELECT jam_masuk, jam_pulang, status FROM presensi WHERE nip_nisn = $1 AND tanggal = $2',
            [nip, tanggalSekarang]
        );

        res.json({ 
            success: true, 
            data: result.rows.length > 0 ? result.rows[0] : null 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DB Mapel Guru!!!
app.get('/api/jadwal', async (req, res) => {
    const { id_guru } = req.query;

    try {
        // Jika tidak ada id_guru, berikan pesan error atau array kosong
        if (!id_guru) {
            return res.status(400).json({ error: 'id_guru wajib dikirim' });
        }

        const query = `
            SELECT j.id, m.nama_mapel, j.hari, j.jam, k.nama_kelas AS kelas
            FROM jadwal j
            JOIN mapel m ON j.id_mapel = m.id
            JOIN kelas k ON j.id_kelas = k.id
            WHERE j.id_guru = $1
        `;

        const result = await pool.query(query, [id_guru]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error Get Jadwal:', err.message);
        res.status(500).json({ error: 'Gagal memuat data database' });
    }
});

// Konfirmasi kehadiran siswa
app.post('/api/simpan-absensi-siswa', async (req, res) => {
    try {
        const { data_absensi } = req.body;
        if (!data_absensi || !Array.isArray(data_absensi)) {
            return res.status(400).json({
                error: 'Data absensi tidak valid'
            });
        }
        for (const item of data_absensi) {
            await pool.query(
                `
                INSERT INTO absensi_siswa
                (id_jadwal, nisn_siswa, status, tanggal)
                VALUES ($1, $2, $3, NOW())
                `,
                [
                    item.id_jadwal,
                    item.nisn_siswa,
                    item.status
                ]
            );
        }
        res.json({
            success: true,
            message: 'Absensi berhasil disimpan',
        });
    } catch (error) {
        console.error('ERROR SIMPAN ABSENSI:', error);
        res.status(500).json({
            error: 'Gagal menyimpan absensi',
        });
    }
});

// DETAIL JADWAL
app.get('/api/jadwal-detail', async (req, res) => {
    const { id_jadwal } = req.query;
    try {
        const result = await pool.query(
            `
            SELECT
                j.id,
                j.hari,
                j.jam,
                m.nama_mapel,
                g.nama_lengkap AS nama_guru
            FROM jadwal j
            JOIN mapel m ON j.id_mapel = m.id
            JOIN guru g ON j.id_guru = g.nip_id
            WHERE j.id = $1
            `,
            [id_jadwal]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Jadwal tidak ditemukan'
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Server error'
        });
    }
});

// Siswa melihat kehadiran berdasarkan mapel
app.get('/api/absensi-siswa', async (req, res) => {
    const { id_jadwal, nisn_siswa } = req.query;
    try {

        const result = await pool.query(
            `
            SELECT
                a.id,
                a.status,
                a.tanggal,
                j.hari,
                j.jam,
                m.nama_mapel,
                g.nama_lengkap AS nama_guru

            FROM absensi_siswa a
            JOIN jadwal j
                ON a.id_jadwal = j.id
            JOIN mapel m
                ON j.id_mapel = m.id
            JOIN guru g
                ON j.id_guru = g.nip_id
            WHERE a.id_jadwal = $1
            AND a.nisn_siswa = $2
            ORDER BY a.tanggal DESC
            `,
            [id_jadwal, nisn_siswa]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error.message
        });
    }
});

// mengambil daftar siswa untuk absen guru //
app.get('/api/siswa-by-jadwal', async (req, res) => {
    const { id_jadwal } = req.query;

    try {
        const result = await pool.query(
            `
            SELECT
                s.nisn_id,
                s.nama_lengkap,
                s.angkatan,
                p.bukti_file,
                p.jenis_keterangan,
                p.tanggal_mulai,
                p.sampai_tanggal
            FROM siswa s
            JOIN kelas k
                ON s.kelas = k.nama_kelas
            JOIN jadwal j
                ON j.id_kelas = k.id
            LEFT JOIN perizinan p
                ON LOWER(TRIM(s.nama_lengkap)) = LOWER(TRIM(p.nama_siswa))
            WHERE j.id = $1
            ORDER BY s.nama_lengkap ASC
        `,
            [id_jadwal]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jadwal tidak ditemukan atau tidak ada siswa' });
        }

        res.json(result.rows);
    } catch (err) {
        console.error('Error ambil siswa:', err.message);
        res.status(500).json({ error: 'Gagal mengambil daftar siswa' });
    }
});

// Api izin guru
app.post('/api/izin', upload.single('bukti_file'), async (req, res) => {
    try {
        const { nama_pengajar, jenis_keterangan, tanggal_mulai, tanggal_selesai, alasan } =
            req.body;
        let bukti_url = null;
        let bukti_mime_type = null;

        if (req.file) {
            const base64File = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await cloudinary.uploader.upload(base64File, {
                folder: 'hadirly/perizinan_guru',
                resource_type: 'auto'
            });
            bukti_url = uploadResult.secure_url;
            bukti_mime_type = req.file.mimetype;
        }

        const query = `
            INSERT INTO data_izin (nama_pengajar, jenis_keterangan, tanggal_mulai, tanggal_selesai, alasan, bukti_url, bukti_mime_type)
VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;

        const values = [
            nama_pengajar,
            jenis_keterangan,
            tanggal_mulai,
            tanggal_selesai,
            alasan,
            bukti_url,
            bukti_mime_type,
        ];

        const result = await pool.query(query, values);

        res.status(200).json({
            success: true,
            message: 'Data izin berhasil disimpan',
            data: result.rows[0],
        });
    } catch (err) {
        console.error('Error Database:', err);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan ke database',
            error: err.message,
        });
    }
});

app.get('/api/admin/laporan-izin-guru', async (req, res) => {
    try {
        const { bulan } = req.query;

        let query = `
            SELECT 
                id,
                nama_pengajar,
                jenis_keterangan,
                tanggal_mulai,
                tanggal_selesai,
                alasan,
                bukti_url,
                bukti_mime_type
            FROM data_izin
        `;

        const values = [];

        if (bulan) {
            query += ` WHERE TO_CHAR(tanggal_mulai, 'YYYY-MM') = $1`;
            values.push(bulan);
        }

        query += ` ORDER BY tanggal_mulai DESC, id DESC`;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (err) {
        console.error('Error laporan izin guru:', err);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil laporan izin guru',
            error: err.message,
        });
    }
});

// Endpoint untuk Update Profil Guru
app.post('/api/guru/update-profile', async (req, res) => {
    const { nip_id, email, no_hp } = req.body;
    if (!nip_id || !email || !no_hp) {
        return res.status(400).json({
            success: false,
            message: 'NIP, Email, dan Nomor HP tidak boleh kosong.',
        });
    }

    try {
        const queryText = `
            UPDATE guru 
            SET email = $1, no_hp = $2 
            WHERE nip_id = $3
        `;
        const values = [email, no_hp, nip_id];

        const result = await pool.query(queryText, values);

        // 4. Cek hasil query
        if (result.rowCount > 0) {
            console.log(`Berhasil update NIP: ${nip_id}`);
            res.json({
                success: true,
                message: 'Data guru berhasil diperbarui di database.',
            });
        } else {
            console.warn(`NIP tidak ditemukan: ${nip_id}`);
            res.status(404).json({
                success: false,
                message: 'Gagal: Data guru tidak ditemukan (NIP salah).',
            });
        }
    } catch (err) {
        // Log error secara detail di terminal server
        console.error('Database Error Detail:', err);
        res.status(500).json({
            success: false,
            error: 'Kesalahan Server: ' + err.message,
        });
    }
});
// LAPORAN GURU
app.get('/api/guru/rekap-laporan', async (req, res) => {
    const { nip, nama, bulan } = req.query;

    try {
        const queryText = `
            SELECT 
                tanggal, 
                jam_masuk, 
                jam_pulang, 
                status 
            FROM presensi
            WHERE nip_nisn = $1 
              AND TO_CHAR(tanggal, 'YYYY-MM') = $2
            ORDER BY tanggal ASC
        `;

        const result = await pool.query(queryText, [nip, bulan]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

//file excel
app.post('/api/import-siswa', async (req, res) => {
    const { nama_kelas, siswa } = req.body;

    if (!siswa || siswa.length === 0) {
        return res.status(400).json({ error: 'Data siswa kosong' });
    }

    const CHUNK_SIZE = 500; // 500 × 7 = 3500 params, safely under pg's 65535 limit
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let offset = 0; offset < siswa.length; offset += CHUNK_SIZE) {
            const chunk = siswa.slice(offset, offset + CHUNK_SIZE);
            const valuePlaceholders = chunk
                .map(
                    (_, i) =>
                        `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
                )
                .join(', ');
            const flatValues = chunk.flatMap((s) => [
                String(s.nisn_id),
                s.nama_lengkap,
                nama_kelas,
                String(s.angkatan || ''),
                s.jenis_kelamin || '',
                s.no_hp || '',
                s.alamat_lengkap || '',
            ]);
            await client.query(
                `
                INSERT INTO siswa (nisn_id, nama_lengkap, kelas, angkatan, jenis_kelamin, no_hp, alamat_lengkap)
                VALUES ${valuePlaceholders}
                ON CONFLICT (nisn_id) DO UPDATE SET
                    nama_lengkap = EXCLUDED.nama_lengkap,
                    kelas = EXCLUDED.kelas
            `,
                flatValues
            );
        }
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Sukses' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Detail Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ROUTE KHUSUS SISWA -> MASUK KE TABEL perizinan
app.post('/api/izin/siswa', upload.single('bukti_file'), async (req, res) => {
    try {
        console.log('BODY IZIN:', req.body);
        console.log('FILE IZIN:', req.file);
        const {
            nama_siswa,
            kelas,
            jenis_keterangan,
            tanggal_mulai,
            sampai_tanggal,
            alasan
        } = req.body;

        if (!nama_siswa || !kelas || !jenis_keterangan) {
            return res.status(400).json({ error: 'Data wajib tidak lengkap' });
        }

        let bukti_file = null;

        if (req.file) {
            const base64File = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

            const uploadResult = await cloudinary.uploader.upload(base64File, {
                folder: 'hadirly/perizinan',
                resource_type: 'auto'
            });

            bukti_file = uploadResult.secure_url;
        }

        const query = `
            INSERT INTO perizinan 
            (nama_siswa, kelas, jenis_keterangan, tanggal_mulai, sampai_tanggal, alasan, bukti_file)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `;

        await pool.query(query, [
            nama_siswa,
            kelas,
            jenis_keterangan,
            tanggal_mulai,
            sampai_tanggal,
            alasan,
            bukti_file
        ]);

        res.json({ success: true });
    } catch (err) {
        console.error('ERROR IZIN:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint untuk UPDATE data profil siswa
app.get('/api/siswa/rekap-laporan', async (req, res) => {
    const { nisn, nama, bulan } = req.query;
    try {
        const queryText = `
            SELECT 
                tanggal, 
                jam_masuk, 
                jam_pulang, 
                status 
            FROM presensi
            WHERE nip_nisn = $1 
              AND TO_CHAR(tanggal, 'YYYY-MM') = $2
            ORDER BY tanggal ASC
        `;
        
        const result = await pool.query(queryText, [nisn, bulan]);
        res.json({ 
            success: true, 
            data: result.rows 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/siswa/absen-hari-ini', async (req, res) => {
    const { nisn } = req.query;
    if (!nisn) return res.status(400).json({ success: false, message: 'NISN wajib dikirim' });
    try {
        const result = await pool.query(
            // TAMBAHKAN jam_pulang di baris bawah ini
            `SELECT jam_masuk, jam_pulang, status FROM presensi 
             WHERE nip_nisn = $1 AND tanggal = CURRENT_DATE
             ORDER BY jam_masuk ASC`,
            [nisn]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/siswa/profile', async (req, res) => {
    const { nisn } = req.query;
    if (!nisn) return res.status(400).json({ success: false, message: 'NISN wajib dikirim' });
    try {
        const result = await pool.query(
            'SELECT nama_lengkap, nisn_id, jenis_kelamin, alamat_lengkap, no_hp, kelas FROM siswa WHERE nisn_id = $1',
            [nisn]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
        res.json({ success: true, ...result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/siswa/update-profile', async (req, res) => {
    try {
        const { nisn, alamat, no_hp } = req.body;

        if (!nisn) {
            return res.status(400).json({ success: false, message: 'NISN wajib dikirim' });
        }

        const result = await pool.query(
            `UPDATE siswa SET alamat_lengkap = $1, no_hp = $2 WHERE nisn_id = $3 RETURNING *`,
            [alamat, no_hp, nisn]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Gagal update, data siswa tidak ditemukan' });
        }

        res.json({ success: true, message: 'Profil berhasil diperbarui!' });
    } catch (err) {
        console.error('Update Error:', err.message);
        res.status(500).json({ success: false, message: 'Gagal memperbarui profil' });
    }
});

//DB Jadwal Siswa!!!
app.get('/api/jadwal-siswa', async (req, res) => {
    const { id_kelas } = req.query;

    try {
        if (!id_kelas) {
            return res.status(400).json({ error: 'id_kelas wajib dikirim' });
        }

        const query = `
            SELECT
                j.id,
                j.hari,
                j.jam,
                m.nama_mapel,
                g.nama_lengkap AS nama_guru
            FROM jadwal j
            JOIN mapel m ON j.id_mapel = m.id
            JOIN guru g ON j.id_guru = g.nip_id
            JOIN kelas k ON j.id_kelas = k.id
            WHERE k.nama_kelas = $1
            ORDER BY
                CASE
                    WHEN j.hari = 'Senin' THEN 1
                    WHEN j.hari = 'Selasa' THEN 2
                    WHEN j.hari = 'Rabu' THEN 3
                    WHEN j.hari = 'Kamis' THEN 4
                    WHEN j.hari = 'Jumat' THEN 5
                END, j.jam ASC
        `;

        const result = await pool.query(query, [id_kelas]);
        res.json(result.rows); // Mengirim array hasil query
    } catch (err) {
        console.error('Error Get Jadwal Siswa:', err.message);
        res.status(500).json({ error: 'Gagal memuat data database' });
    }
});

//tabel laporan admin
app.get('/api/siswa/laporan/:kelas', async (req, res) => {
    const { kelas } = req.params;
    const { bulan } = req.query; // Format: 2026-04

    try {
        const query = `
            SELECT 
                s.nama_lengkap,
                s.nisn_id,
                -- Hitung Hadir dari tabel presensi
                (SELECT COUNT(*)::int FROM presensi pr
                 WHERE pr.nip_nisn = s.nisn_id
                 AND TO_CHAR(pr.tanggal, 'YYYY-MM') = $2) as hadir,
                -- Hitung Sakit dari tabel perizinan
                (SELECT COUNT(*)::int FROM perizinan pe 
                 WHERE pe.nama_siswa = s.nama_lengkap 
                 AND pe.jenis_keterangan = 'sakit' 
                 AND TO_CHAR(pe.tanggal_mulai, 'YYYY-MM') = $2) as sakit,
                -- Hitung Izin dari tabel perizinan
                (SELECT COUNT(*)::int FROM perizinan pe 
                 WHERE pe.nama_siswa = s.nama_lengkap 
                 AND pe.jenis_keterangan = 'izin' 
                 AND TO_CHAR(pe.tanggal_mulai, 'YYYY-MM') = $2) as izin
            FROM siswa s
            WHERE s.kelas = $1
            ORDER BY s.nama_lengkap ASC
        `;

        const result = await pool.query(query, [kelas, bulan]);
        res.json(hitungRekap(result.rows, HARI_EFEKTIF_SISWA));
    } catch (err) {
        console.error('Error Laporan Siswa:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/guru/laporan', async (req, res) => {
    const { bulan } = req.query; // Format: 2026-04

    try {
        const query = `
            SELECT 
                g.nama_lengkap,
                g.nip_id,
                -- Hadir dari presensi
                (SELECT COUNT(*)::int FROM presensi pr
                 WHERE pr.nip_nisn = g.nip_id
                 AND TO_CHAR(pr.tanggal, 'YYYY-MM') = $1) as hadir,
                -- Sakit dari data_izin (Guru)
                (SELECT COUNT(*)::int FROM data_izin di 
                 WHERE di.nama_pengajar = g.nama_lengkap 
                 AND di.jenis_keterangan = 'sakit' 
                 AND TO_CHAR(di.tanggal_mulai, 'YYYY-MM') = $1) as sakit,
                -- Izin dari data_izin (Guru)
                (SELECT COUNT(*)::int FROM data_izin di 
                 WHERE di.nama_pengajar = g.nama_lengkap 
                 AND di.jenis_keterangan = 'izin' 
                 AND TO_CHAR(di.tanggal_mulai, 'YYYY-MM') = $1) as izin
            FROM guru g
            ORDER BY g.nama_lengkap ASC
        `;

        const result = await pool.query(query, [bulan]);
        res.json(hitungRekap(result.rows, HARI_KERJA_GURU));
    } catch (err) {
        console.error('Error Laporan Guru:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: CRUD JADWAL ---
app.get('/api/admin/jadwal', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.id, j.id_mapel, j.id_kelas, j.id_guru, j.hari, j.jam,
                   m.nama_mapel, k.nama_kelas, g.nama_lengkap AS nama_guru
            FROM jadwal j
            JOIN mapel m ON j.id_mapel = m.id
            JOIN kelas k ON j.id_kelas = k.id
            JOIN guru g ON j.id_guru = g.nip_id
            ORDER BY
                CASE j.hari
                    WHEN 'Senin'  THEN 1 WHEN 'Selasa' THEN 2 WHEN 'Rabu'  THEN 3
                    WHEN 'Kamis'  THEN 4 WHEN 'Jumat'  THEN 5 ELSE 6
                END, j.jam, k.nama_kelas
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/jadwal', async (req, res) => {
    const { id_mapel, id_kelas, id_guru, hari, jam } = req.body;
    if (!id_mapel || !id_kelas || !id_guru || !hari || !jam)
        return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi' });
    try {
        await pool.query(
            'INSERT INTO jadwal (id_mapel, id_kelas, id_guru, hari, jam) VALUES ($1,$2,$3,$4,$5)',
            [id_mapel, id_kelas, id_guru, hari, jam]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/jadwal/:id', async (req, res) => {
    const { id_mapel, id_kelas, id_guru, hari, jam } = req.body;
    try {
        const result = await pool.query(
            'UPDATE jadwal SET id_mapel=$1, id_kelas=$2, id_guru=$3, hari=$4, jam=$5 WHERE id=$6',
            [id_mapel, id_kelas, id_guru, hari, jam, req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/jadwal/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM jadwal WHERE id=$1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

//jangan ubah ini ya bestieeeehhh
app.use(express.static('public'));
app.use('/models', express.static('models')); // Agar model wajah bisa diakses browser
app.use('/uploads', express.static('uploads'));

// Jalankan Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server HadirLy aktif di http://localhost:3000`);
});
module.exports = app;