// nav.js
function syncNavbar() {
    const navName = document.getElementById('profile-name');
    if (!navName) return;

    const user =
        JSON.parse(localStorage.getItem('currentUser')) ||
        JSON.parse(localStorage.getItem('userLoggedIn'));

    console.log("USER:", user);

    if (!user) {
        navName.innerText = "Guest";
        return;
    }

    const nameToShow = user.nama || user.nama_lengkap || user.username || 'Guest';

    navName.innerText = nameToShow;

    // 2. Baru tarik data terbaru dari server
    fetch('/api/admin/profile')
        .then((res) => res.json())
        .then((data) => {
            if (data && data.username && navName.innerText !== data.username) {
                navName.innerText = data.username;
                // Update storage tanpa merusak field lain
                const updatedData = { ...user, nama: data.username };
                localStorage.setItem('userLoggedIn', JSON.stringify(updatedData));
            }
        })
        .catch(() => console.log('Offline: Pakai data lokal.'));
}
document.addEventListener('DOMContentLoaded', syncNavbar);
