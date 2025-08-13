// public/js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const fileForm = document.getElementById('file-form');
    const fileList = document.getElementById('file-list');
    const fileIdInput = document.getElementById('file-id');
    const saveButton = document.getElementById('save-button');
    const logoutButton = document.getElementById('logout-button');

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
                <div class="file-actions">
                    <button class="edit-btn" data-id="${file._id}" data-title="${file.title}" data-content="${file.content}">Bearbeiten</button>
                    <button class="delete-btn" data-id="${file._id}">Löschen</button>
                </div>
            `;
            fileList.appendChild(fileCard);
        });
    };

    // Formular zum Speichern/Bearbeiten einer Datei
    fileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = fileForm.title.value;
        const content = fileForm.content.value;
        const fileId = fileIdInput.value;

        let res;
        if (fileId) {
            res = await fetch(`/api/files/${fileId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });
        } else {
            res = await fetch('/api/files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });
        }

        await res.json();
        fileForm.reset();
        fileIdInput.value = ''; // ID zurücksetzen
        saveButton.textContent = 'Datei speichern'; // Button-Text zurücksetzen
        await loadFiles();
    });

    // Event-Listener für Lösch- und Bearbeitungs-Buttons
    fileList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const fileId = e.target.dataset.id;
            await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await loadFiles();
        } else if (e.target.classList.contains('edit-btn')) {
            const fileId = e.target.dataset.id;
            const title = e.target.dataset.title;
            const content = e.target.dataset.content;

            fileForm.title.value = title;
            fileForm.content.value = content;
            fileIdInput.value = fileId;
            saveButton.textContent = 'Änderungen speichern'; // Button-Text anpassen
        }
    });

    // Logout-Funktion
    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login';
    });

    loadFiles();
});