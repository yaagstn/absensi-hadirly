function checkAuth() {
    const userData = localStorage.getItem('currentUser');

    if (!userData) {
        window.location.href = '../login.html';
        return;
    }

    const user = JSON.parse(userData);

    const namaLengkap = user.nama || user.nama_lengkap || 'User';
    const namaPanggilan = namaLengkap.split(' ')[0];

    // NAVBAR NAME
    const navName =
        document.getElementById('nav-user-name') ||
        document.querySelector('.header-right span') ||
        document.querySelector('.user-profile span');

    if (navName) {
        navName.innerText = namaLengkap;
    }

    // WELCOME TEXT
    const welcomeName =
        document.getElementById('welcome-name') ||
        document.querySelector('.welcome-box h2');

    if (welcomeName) {
        welcomeName.innerText =
            user.role === 'siswa'
                ? `Selamat Datang, ${namaPanggilan}! 👋`
                : `Selamat Datang, ${namaLengkap}! 👋`;
    }

    // ROLE / KELAS
    const navRole =
        document.getElementById('nav-user-role') ||
        document.querySelector('.role') ||
        document.querySelector('.user-profile p');

    if (navRole) {
        if (user.role === 'siswa') {
            navRole.innerText = `Siswa - ${user.kelas || 'Tanpa Kelas'}`;
        } else {
            navRole.innerText =
                user.role.charAt(0).toUpperCase() + user.role.slice(1);
        }
    }
}

document.addEventListener('DOMContentLoaded', checkAuth);