// database/js/admin-script.js

const socket = io();

// --- Admin-Login-Logik ---
if (window.location.pathname === '/admin-login.html') {
    const adminLoginButton = document.getElementById('admin-login-button');
    const adminPasswordInput = document.getElementById('admin-password-input');
    const adminErrorMessage = document.getElementById('admin-error-message');

    adminLoginButton.addEventListener('click', async () => {
        const password = adminPasswordInput.value;
        const response = await fetch('/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            window.location.href = '/admin';
        } else {
            const data = await response.json();
            adminErrorMessage.textContent = data.message || 'Falsches Passwort.';
        }
    });
}

// --- Admin-Dashboard-Logik ---
if (window.location.pathname === '/admin.html') {
    const userList = document.getElementById('user-list');
    const chatList = document.getElementById('chat-list');
    const reportedMessagesList = document.getElementById('reported-messages-list');
    const activeUsersStat = document.getElementById('active-users-stat');
    const reportedMessagesStat = document.getElementById('reported-messages-stat');
    const totalChatsStat = document.getElementById('total-chats-stat');
    const registeredAccountsStat = document.getElementById('registered-accounts-stat');
    const tabUsers = document.getElementById('show-users');
    const tabChats = document.getElementById('show-chats');
    const tabReports = document.getElementById('show-reports');

    window.addEventListener('load', () => {
        socket.emit('admin:check-session');
    });

    socket.on('admin:authenticated', (data) => {
        updateDashboard(data);
    });

    socket.on('admin:auth-failed', () => {
        window.location.href = '/admin';
    });

    socket.on('admin:update', (data) => {
        updateDashboard(data);
    });

    const updateDashboard = (data) => {
        // Statistiken aktualisieren
        registeredAccountsStat.textContent = data.stats.totalUsers;
        totalChatsStat.textContent = data.stats.totalChats;
        reportedMessagesStat.textContent = data.stats.reportedMessages;

        // Benutzerliste aktualisieren
        userList.innerHTML = '';
        data.users.forEach(user => {
            const userItem = document.createElement('li');
            userItem.innerHTML = `
                <span>${user.username} (${user.email}) - Registriert: ${new Date(user.createdAt).toLocaleDateString()}</span>
                <button onclick="deleteUser('${user._id}')">Löschen</button>
            `;
            userList.appendChild(userItem);
        });

        // Chats & Gruppen Liste aktualisieren
        chatList.innerHTML = '';
        data.chats.forEach(chat => {
            const chatItem = document.createElement('li');
            chatItem.innerHTML = `
                <span>${chat.isGroup ? `Gruppe: ${chat.name}` : `Einzelchat: ${chat.participants.map(p => p.username).join(', ')}`}</span>
                <button onclick="deleteChat('${chat._id}')">Löschen</button>
            `;
            chatItem.addEventListener('click', () => {
                // Zeige Chat-Nachrichten für diesen Chat an
            });
            chatList.appendChild(chatItem);
        });

        // Meldungen aktualisieren
        reportedMessagesList.innerHTML = '';
        data.chats.forEach(chat => {
            chat.messages.filter(msg => msg.reported).forEach(msg => {
                const reportItem = document.createElement('li');
                reportItem.innerHTML = `
                    <span>Meldung in ${chat.isGroup ? `Gruppe: ${chat.name}` : `Chat von ${chat.participants[0].username}`} - ${msg.sender.username}: ${msg.text}</span>
                    <button onclick="deleteChatMessage('${chat._id}', '${msg._id}')">Nachricht löschen</button>
                `;
                reportedMessagesList.appendChild(reportItem);
            });
        });
    };

    // Tab-Wechsel-Logik
    const contentViews = document.querySelectorAll('.content-view');
    const switchTab = (tabId) => {
        document.querySelectorAll('.tab-controls button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        contentViews.forEach(view => view.classList.remove('active'));
        document.querySelector(`#${tabId.replace('show-', '')}-view`).classList.add('active');
    };

    tabUsers.addEventListener('click', () => switchTab('show-users'));
    tabChats.addEventListener('click', () => switchTab('show-chats'));
    tabReports.addEventListener('click', () => switchTab('show-reports'));

    // Global verfügbare Funktionen für die Buttons
    window.deleteUser = (userId) => {
        if (confirm('Soll dieser Benutzer wirklich gelöscht werden?')) {
            socket.emit('admin:delete-user', userId);
        }
    };
    window.deleteChat = (chatId) => {
        if (confirm('Soll dieser Chat wirklich gelöscht werden?')) {
            socket.emit('admin:delete-chat', chatId);
        }
    };
    window.deleteChatMessage = (chatId, messageId) => {
        if (confirm('Soll diese Nachricht wirklich gelöscht werden?')) {
            socket.emit('admin:delete-chat-message', { chatId, messageId });
        }
    };
}