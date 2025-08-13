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
    const historyModal = document.getElementById('history-modal');
    const modalCloseBtn = fileModal.querySelector('.close-btn');
    const historyCloseBtn = historyModal.querySelector('.close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const editModalBtn = document.getElementById('edit-modal-btn');
    const viewHistoryBtn = document.getElementById('view-history-btn');
    const historyList = document.getElementById('history-list');
    const newFileBtn = document.getElementById('new-file-btn');
    const searchInput = document.getElementById('search-input');
    const noFilesMessage = document.getElementById('no-files');

    let allFiles = []; // Speichert alle Dateien für die Suche

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

    document.getElementById('welcome-message').textContent = username;

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
            allFiles = files;
            renderFileList(allFiles);
        } catch (error) {
            showToast('Fehler beim Laden der Dateien.', false);
        }
    };

    const renderFileList = (files) => {
        fileList.innerHTML = '';
        if (files.length === 0) {
            noFilesMessage.style.display = 'block';
        } else {
            noFilesMessage.style.display = 'none';
        }

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
        saveButton.innerHTML = `<span class="loader-icon"></span> Speichern...`;

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
                saveButton.innerHTML = `<span class="button-text">Datei speichern</span>`;
                await loadFiles();
            } else {
                const errorData = await res.json();
                showToast(errorData.message || 'Ein Fehler ist aufgetreten.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = `<span class="button-text">Datei speichern</span>`;
        }
    });

    // Event-Listener für Lösch-, Bearbeitungs- und Anzeigebuttons
    fileList.addEventListener('click', async (e) => {
        const fileCard = e.target.closest('.file-card');
        if (!fileCard) return;

        const fileId = fileCard.dataset.id;
        const fileTitle = fileCard.dataset.title;
        const fileContent = fileCard.dataset.content;

        if (e.target.classList.contains('delete-btn')) {
            e.stopPropagation();
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
            fileForm.title.value = fileTitle;
            fileForm.content.value = fileContent;
            fileIdInput.value = fileId;
            saveButton.innerHTML = `<span class="button-text">Änderungen speichern</span>`;
        } else {
            // Ganze Karte anklicken zum Anzeigen des Inhalts
            modalTitle.textContent = fileTitle;
            modalContent.textContent = fileContent;
            fileModal.style.display = 'flex';
            editModalBtn.dataset.id = fileId;
            viewHistoryBtn.dataset.id = fileId;
        }
    });

    // Suchfunktion
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredFiles = allFiles.filter(file =>
            file.title.toLowerCase().includes(searchTerm) ||
            file.content.toLowerCase().includes(searchTerm)
        );
        renderFileList(filteredFiles);
    });

    // Modal-Logik
    const closeModal = () => {
        fileModal.style.display = 'none';
        historyModal.style.display = 'none';
    };

    modalCloseBtn.addEventListener('click', closeModal);
    historyCloseBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === fileModal || e.target === historyModal) {
            closeModal();
        }
    });

    // Datei aus Modal bearbeiten
    editModalBtn.addEventListener('click', () => {
        const fileId = editModalBtn.dataset.id;
        const file = allFiles.find(f => f._id === fileId);
        if (file) {
            fileForm.title.value = file.title;
            fileForm.content.value = file.content;
            fileIdInput.value = file._id;
            saveButton.innerHTML = `<span class="button-text">Änderungen speichern</span>`;
        }
        closeModal();
    });

    // Dateiverlauf anzeigen
    viewHistoryBtn.addEventListener('click', async () => {
        const fileId = viewHistoryBtn.dataset.id;
        try {
            const res = await fetch(`/api/files/${fileId}/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const history = await res.json();
                historyList.innerHTML = '';
                history.forEach((item, index) => {
                    const historyItem = document.createElement('li');
                    historyItem.className = 'history-item';
                    historyItem.innerHTML = `
                        <p>${new Date(item.timestamp).toLocaleString()}: ${item.message}</p>
                        <button class="revert-btn" data-index="${index}">Wiederherstellen</button>
                    `;
                    historyList.appendChild(historyItem);
                });
                historyModal.style.display = 'flex';
            } else {
                showToast('Fehler beim Laden des Verlaufs.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        }
    });

    // Version wiederherstellen
    historyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('revert-btn')) {
            const fileId = viewHistoryBtn.dataset.id;
            const historyIndex = e.target.dataset.index;
            if (confirm('Sind Sie sicher, dass Sie diese Version wiederherstellen möchten?')) {
                try {
                    const res = await fetch(`/api/files/${fileId}/revert`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ historyIndex })
                    });
                    if (res.ok) {
                        showToast('Datei erfolgreich wiederhergestellt.', true);
                        closeModal();
                        await loadFiles();
                    } else {
                        const errorData = await res.json();
                        showToast(errorData.message || 'Wiederherstellung fehlgeschlagen.', false);
                    }
                } catch (error) {
                    showToast('Netzwerkfehler.', false);
                }
            }
        }
    });

    // "Neue Datei" Button
    newFileBtn.addEventListener('click', () => {
        fileForm.reset();
        fileIdInput.value = '';
        saveButton.innerHTML = `<span class="button-text">Datei speichern</span>`;
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