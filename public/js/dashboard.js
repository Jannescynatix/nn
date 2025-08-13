// public/js/dashboard.js (vollständig überarbeitet)

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const fileForm = document.getElementById('file-form');
    const fileList = document.getElementById('file-list');
    const fileIdInput = document.getElementById('file-id');
    const saveButton = document.getElementById('save-button');
    const logoutButton = document.getElementById('logout-button');

    // Toast-Benachrichtigung für eine schönere UX
    function showToast(message, isSuccess) {
        const toast = document.createElement('div');
        toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    if (!token || !username) {
        window.location.href = '/login';
        return;
    }

    document.getElementById('welcome-message').textContent = `Willkommen, ${username}!`;

    // Funktion zum Laden der Dateien
    const loadFiles = async () => {
        try {
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
        } catch (error) {
            showToast('Fehler beim Laden der Dateien.', false);
        }
    };

    // Formular zum Speichern/Bearbeiten einer Datei
    fileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = fileForm.title.value;
        const content = fileForm.content.value;
        const fileId = fileIdInput.value;

        if (!title || !content) {
            showToast('Titel und Inhalt dürfen nicht leer sein.', false);
            return;
        }

        let res;
        let method = 'POST';
        let url = '/api/files';
        let message = 'Datei erfolgreich gespeichert.';

        if (fileId) {
            method = 'PUT';
            url = `/api/files/${fileId}`;
            message = 'Datei erfolgreich aktualisiert.';
        }

        try {
            res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });

            if (res.ok) {
                showToast(message, true);
                fileForm.reset();
                fileIdInput.value = '';
                saveButton.textContent = 'Datei speichern';
                await loadFiles();
            } else {
                const errorData = await res.json();
                showToast(errorData.message || 'Ein Fehler ist aufgetreten.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        }
    });

    // Event-Listener für Lösch- und Bearbeitungs-Buttons
    fileList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const fileId = e.target.dataset.id;
            if (confirm('Sind Sie sicher, dass Sie diese Datei löschen möchten?')) {
                try {
                    const res = await fetch(`/api/files/${fileId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        showToast('Datei erfolgreich gelöscht.', true);
                        await loadFiles();
                    } else {
                        const errorData = await res.json();
                        showToast(errorData.message || 'Löschen fehlgeschlagen.', false);
                    }
                } catch (error) {
                    showToast('Netzwerkfehler.', false);
                }
            }
        } else if (e.target.classList.contains('edit-btn')) {
            const fileId = e.target.dataset.id;
            const title = e.target.dataset.title;
            const content = e.target.dataset.content;

            fileForm.title.value = title;
            fileForm.content.value = content;
            fileIdInput.value = fileId;
            saveButton.textContent = 'Änderungen speichern';
        }
    });

    // Logout-Funktion
    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        showToast('Erfolgreich abgemeldet.', true);
        setTimeout(() => {
            window.location.href = '/login';
        }, 1000);
    });

    loadFiles();
});