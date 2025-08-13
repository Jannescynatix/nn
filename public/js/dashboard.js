// public/js/dashboard.js (final, bereinigt und korrigiert)

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    // --- UI-Elemente ---
    const welcomeMessage = document.getElementById('welcome-message');
    const userEmail = document.getElementById('user-email');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const adminLink = document.querySelector('.admin-link');
    const fileForm = document.getElementById('file-form');
    const fileList = document.getElementById('file-list');
    const fileIdInput = document.getElementById('file-id');
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const saveButton = document.getElementById('save-button');
    const newFileBtn = document.getElementById('new-file-btn');
    const searchInput = document.getElementById('search-input');
    const noFilesMessage = document.getElementById('no-files');
    const logoutButton = document.getElementById('logout-button');
    const historyModal = document.getElementById('history-modal');
    const historyCloseBtn = document.getElementById('history-close-btn');
    const historyList = document.getElementById('history-list');

    // Einstellungs-Ansicht
    const settingsUsername = document.getElementById('settings-username');
    const settingsEmail = document.getElementById('settings-email');
    const changePasswordForm = document.getElementById('change-password-form');
    const oldPasswordInput = document.getElementById('old-password');
    const newPasswordInput = document.getElementById('new-password');
    const deleteAccountBtn = document.getElementById('delete-account-btn');

    // Admin-Ansicht
    const adminStatsUsers = document.getElementById('stat-users');
    const adminStatsFiles = document.getElementById('stat-files');
    const adminUserList = document.getElementById('user-list');
    const adminFileList = document.getElementById('admin-file-list');

    let allFiles = [];

    // --- Hilfsfunktionen ---
    const showToast = (message, isSuccess) => {
        const toast = document.createElement('div');
        toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    // --- Dateiverwaltungs-Funktionen ---
    const loadFiles = async () => {
        try {
            const res = await fetch('/api/files', { headers: { 'Authorization': `Bearer ${token}` } });
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
                    <button class="history-btn">Verlauf</button>
                </div>
            `;
            fileList.appendChild(fileCard);
        });
    };

    // --- Einstellungs-Funktionen ---
    const loadUserSettings = async () => {
        try {
            const res = await fetch('/api/account', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const user = await res.json();
                settingsUsername.textContent = user.username;
                settingsEmail.textContent = user.email;
                userEmail.textContent = user.email;
            } else {
                showToast('Fehler beim Laden der Account-Daten.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        }
    };

    // --- Admin-Funktionen ---
    const loadAdminData = async () => {
        if (!isAdmin) return;
        try {
            const statsRes = await fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } });
            const stats = await statsRes.json();
            adminStatsUsers.textContent = stats.userCount;
            adminStatsFiles.textContent = stats.fileCount;

            const usersRes = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            const users = await usersRes.json();
            renderAdminUsers(users);

            const filesRes = await fetch('/api/admin/files', { headers: { 'Authorization': `Bearer ${token}` } });
            const files = await filesRes.json();
            renderAdminFiles(files);
        } catch (error) {
            showToast('Fehler beim Laden der Admin-Daten.', false);
        }
    };

    const renderAdminUsers = (users) => {
        let html = `<table class="admin-table"><thead><tr><th>Username</th><th>E-Mail</th><th>Admin</th><th>Aktionen</th></tr></thead><tbody>`;
        users.forEach(user => {
            html += `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${user.isAdmin ? 'Ja' : 'Nein'}</td>
                    <td class="table-actions">
                        <button class="btn reset-password-btn" data-id="${user._id}">Passwort</button>
                        <button class="btn danger-btn delete-user-btn" data-id="${user._id}">Löschen</button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        adminUserList.innerHTML = html;
    };

    const renderAdminFiles = (files) => {
        let html = `<table class="admin-table"><thead><tr><th>Titel</th><th>Besitzer</th><th>Erstellt</th><th>Aktionen</th></tr></thead><tbody>`;
        files.forEach(file => {
            html += `
                <tr>
                    <td>${file.title}</td>
                    <td>${file.username} (${file.email})</td>
                    <td>${new Date(file.createdAt).toLocaleDateString()}</td>
                    <td class="table-actions">
                        <button class="btn danger-btn delete-admin-file-btn" data-id="${file._id}">Löschen</button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        adminFileList.innerHTML = html;
    };

    // --- Event-Handler ---
    const showView = (viewId) => {
        views.forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.classList.add('active');
            activeView.style.display = 'block';
        }
        navItems.forEach(item => {
            if (item.dataset.view === viewId.replace('-view', '')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    };

    const handleNavigation = (view) => {
        showView(`${view}-view`);
        if (view === 'files') loadFiles();
        if (view === 'settings') loadUserSettings();
        if (view === 'admin') loadAdminData();
    };

    // --- Initialisierung ---
    if (!token || !username) {
        window.location.href = '/login';
        return;
    }

    if (isAdmin) {
        adminLink.style.display = 'flex';
    }
    welcomeMessage.textContent = username;

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            handleNavigation(e.currentTarget.dataset.view);
        });
    });

    if (window.location.hash) {
        const view = window.location.hash.substring(1);
        handleNavigation(view);
    } else {
        handleNavigation('files');
    }

    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        showToast('Erfolgreich abgemeldet.', true);
        setTimeout(() => { window.location.href = '/login'; }, 1000);
    });

    fileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = titleInput.value;
        const content = contentInput.value;
        const fileId = fileIdInput.value;
        if (!title || !content) return showToast('Titel und Inhalt dürfen nicht leer sein.', false);

        const url = fileId ? `/api/files/${fileId}` : '/api/files';
        const method = fileId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, content })
            });
            if (res.ok) {
                showToast(fileId ? 'Datei aktualisiert.' : 'Datei gespeichert.', true);
                newFileBtn.click();
                await loadFiles();
            } else {
                const errorData = await res.json();
                showToast(errorData.message || 'Fehler.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        }
    });

    fileList.addEventListener('click', async (e) => {
        const fileCard = e.target.closest('.file-card');
        if (!fileCard) return;
        const fileId = fileCard.dataset.id;
        const file = allFiles.find(f => f._id === fileId);

        if (e.target.classList.contains('delete-btn')) {
            if (confirm('Sicher löschen?')) {
                try {
                    const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.ok) { showToast('Datei gelöscht.', true); await loadFiles(); }
                    else { const errorData = await res.json(); showToast(errorData.message || 'Löschen fehlgeschlagen.', false); }
                } catch (error) { showToast('Netzwerkfehler.', false); }
            }
        } else if (e.target.classList.contains('edit-btn')) {
            if (file) {
                titleInput.value = file.title;
                contentInput.value = file.content;
                fileIdInput.value = file._id;
                saveButton.textContent = 'Änderungen speichern';
                document.documentElement.scrollTop = 0;
            }
        } else if (e.target.classList.contains('history-btn')) {
            if (file) {
                await loadHistory(file._id);
            }
        }
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredFiles = allFiles.filter(file =>
            file.title.toLowerCase().includes(searchTerm) ||
            file.content.toLowerCase().includes(searchTerm)
        );
        renderFileList(filteredFiles);
    });

    newFileBtn.addEventListener('click', () => {
        fileForm.reset();
        fileIdInput.value = '';
        saveButton.textContent = 'Datei speichern';
    });

    const loadHistory = async (fileId) => {
        try {
            const res = await fetch(`/api/files/${fileId}/history`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const history = await res.json();
                historyList.innerHTML = '';
                history.forEach((item, index) => {
                    const historyItem = document.createElement('li');
                    historyItem.className = 'history-item';
                    historyItem.innerHTML = `
                        <p>${new Date(item.timestamp).toLocaleString()}: ${item.message}</p>
                        <button class="revert-btn" data-index="${index}" data-file-id="${fileId}">Wiederherstellen</button>
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
    };

    historyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('revert-btn')) {
            const fileId = e.target.dataset.fileId;
            const historyIndex = e.target.dataset.index;
            if (confirm('Sicher wiederherstellen?')) {
                try {
                    const res = await fetch(`/api/files/${fileId}/revert`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ historyIndex })
                    });
                    if (res.ok) {
                        showToast('Datei wiederhergestellt.', true);
                        historyModal.style.display = 'none';
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

    historyCloseBtn.addEventListener('click', () => historyModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            historyModal.style.display = 'none';
        }
    });

    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPassword = oldPasswordInput.value;
        const newPassword = newPasswordInput.value;
        try {
            const res = await fetch('/api/account/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            if (res.ok) {
                showToast('Passwort geändert.', true);
                changePasswordForm.reset();
            } else {
                const errorData = await res.json();
                showToast(errorData.message || 'Fehler beim Ändern des Passworts.', false);
            }
        } catch (error) {
            showToast('Netzwerkfehler.', false);
        }
    });

    deleteAccountBtn.addEventListener('click', async () => {
        if (confirm('Sicher? Alle Ihre Daten werden gelöscht!')) {
            try {
                const res = await fetch('/api/account', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    showToast('Account gelöscht.', true);
                    localStorage.clear();
                    setTimeout(() => window.location.href = '/', 2000);
                } else {
                    const errorData = await res.json();
                    showToast(errorData.message || 'Fehler beim Löschen des Accounts.', false);
                }
            } catch (error) {
                showToast('Netzwerkfehler.', false);
            }
        }
    });

    adminUserList.addEventListener('click', async (e) => {
        const userId = e.target.dataset.id;
        if (e.target.classList.contains('reset-password-btn')) {
            const newPass = prompt('Neues Passwort eingeben:');
            if (newPass) {
                try {
                    const res = await fetch(`/api/admin/users/${userId}/password`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ newPassword: newPass })
                    });
                    if (res.ok) showToast('Passwort geändert.', true);
                    else { const err = await res.json(); showToast(err.message || 'Fehler.', false); }
                } catch (error) { showToast('Netzwerkfehler.', false); }
            }
        } else if (e.target.classList.contains('delete-user-btn')) {
            if (confirm('Sicher? Alle Dateien werden auch gelöscht!')) {
                try {
                    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.ok) { showToast('Benutzer gelöscht.', true); await loadAdminData(); }
                    else { const err = await res.json(); showToast(err.message || 'Fehler.', false); }
                } catch (error) { showToast('Netzwerkfehler.', false); }
            }
        }
    });

    adminFileList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-admin-file-btn')) {
            const fileId = e.target.dataset.id;
            if (confirm('Sicher?')) {
                try {
                    const res = await fetch(`/api/admin/files/${fileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.ok) { showToast('Datei gelöscht.', true); await loadAdminData(); }
                    else { const err = await res.json(); showToast(err.message || 'Fehler.', false); }
                } catch (error) { showToast('Netzwerkfehler.', false); }
            }
        }
    });
});