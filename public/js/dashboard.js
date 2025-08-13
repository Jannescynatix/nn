// public/js/dashboard.js (überarbeitet)

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const fileForm = document.getElementById('file-form');
    const fileList = document.getElementById('file-list');
    const fileIdInput = document.getElementById('file-id');
    const saveButton = document.getElementById('save-button');
    const logoutButton = document.getElementById('logout-button');
    const fileModal = document.getElementById('file-modal');
    const modalCloseBtn = document.querySelector('.close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const saveLoader = document.getElementById('save-loader');

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
                fileCard.dataset.id = file._id;
                fileCard.dataset.title = file.title;
                fileCard.dataset.content = file.content;
                fileCard.innerHTML = `
                    <div>
                        <h3>${file.title}</h3>
                        <p>${file.content.substring(0, 50)}...</p>
                        <small>Erstellt: ${new Date(file.createdAt).toLocaleDateString()}</small>
                    </div>
                    <div class="file-actions">
                        <button class="edit-btn">Bearbeiten</button>
                        <button class="delete-btn">Löschen</button>
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

        saveButton.disabled = true;
        saveButton.innerHTML = `<span class="loader"></span> Speichern...`;

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
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = 'Datei speichern';
        }
    });

    // Event-Listener für Lösch-, Bearbeitungs- und Anzeigebuttons
    fileList.addEventListener('click', async (e) => {
        const fileCard = e.target.closest('.file-card');
        if (!fileCard) return;

        if (e.target.classList.contains('delete-btn')) {
            e.stopPropagation();
            const fileId = fileCard.dataset.id;
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
            e.stopPropagation();
            const fileId = fileCard.dataset.id;
            const title = fileCard.dataset.title;
            const content = fileCard.dataset.content;

            fileForm.title.value = title;
            fileForm.content.value = content;
            fileIdInput.value = fileId;
            saveButton.textContent = 'Änderungen speichern';
        } else {
            // Ganze Karte anklicken zum Anzeigen des Inhalts
            modalTitle.textContent = fileCard.dataset.title;
            modalContent.textContent = fileCard.dataset.content;
            fileModal.style.display = 'flex';
        }
    });

    // Modal schließen
    modalCloseBtn.addEventListener('click', () => {
        fileModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === fileModal) {
            fileModal.style.display = 'none';
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