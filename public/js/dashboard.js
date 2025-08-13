// public/js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const fileForm = document.getElementById('file-form');
    const fileList = document.getElementById('file-list');

    if (!token || !username) {
        window.location.href = '/login';
        return;
    }

    document.getElementById('welcome-message').textContent = `Willkommen, ${username}!`;

    // Funktion zum Laden der Dateien
    const loadFiles = async () => {
        const res = await fetch('/api/files', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.clear();
            window.location.href = '/login';
            return;
        }

        const files = await res.json();
        fileList.innerHTML = '';
        files.forEach(file => {
            const fileCard = document.createElement('div');
            fileCard.className = 'file-card';
            fileCard.innerHTML = `
                <div>
                    <h3>${file.title}</h3>
                    <p>${file.content.substring(0, 50)}...</p>
                    <small>Erstellt: ${new Date(file.createdAt).toLocaleDateString()}</small>
                </div>
                <button data-id="${file._id}">Löschen</button>
            `;
            fileList.appendChild(fileCard);
        });
    };

    // Formular zum Speichern einer Datei
    fileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = fileForm.title.value;
        const content = fileForm.content.value;

        await fetch('/api/files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, content })
        });
        fileForm.reset();
        await loadFiles();
    });

    // Event-Listener für Lösch-Buttons
    fileList.addEventListener('click', async (e) => {
        if (e.target.tagName === 'BUTTON') {
            const fileId = e.target.dataset.id;
            await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await loadFiles();
        }
    });

    loadFiles();
});