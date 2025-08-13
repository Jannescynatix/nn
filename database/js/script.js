// public/js/script.js

// --- Globale Variablen & Elemente ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const chatListContainer = document.getElementById('chat-list');
const chatMessagesContainer = document.getElementById('chat-messages-container');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const chatNameHeader = document.getElementById('chat-name');

let currentChatId = null;
let currentUsername = '';

// --- Anmelde-/Registrierungslogik ---
if (loginForm && registerForm) {
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorMessage = registerForm.querySelector('.error-message');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                window.location.href = '/chat';
            } else {
                errorMessage.textContent = data.message;
            }
        } catch (err) {
            errorMessage.textContent = 'Ein Fehler ist aufgetreten.';
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorMessage = loginForm.querySelector('.error-message');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                window.location.href = '/chat';
            } else {
                errorMessage.textContent = data.message;
            }
        } catch (err) {
            errorMessage.textContent = 'Ein Fehler ist aufgetreten.';
        }
    });
}

// --- Chat-Seite Logik ---
if (window.location.pathname === '/chat') {
    const socket = io();
    const token = localStorage.getItem('token');
    currentUsername = localStorage.getItem('username');

    if (!token) {
        window.location.href = '/';
    } else {
        socket.emit('authenticate', token);
    }

    socket.on('authenticated', (data) => {
        console.log('Authentifiziert');
        currentUsername = data.username;
    });

    socket.on('auth-error', (message) => {
        alert(message);
        localStorage.removeItem('token');
        window.location.href = '/';
    });

    socket.on('load chats', (chats) => {
        chatListContainer.innerHTML = '';
        chats.forEach(chat => {
            const chatItem = document.createElement('li');
            chatItem.dataset.chatId = chat._id;
            const chatName = chat.isGroup ? chat.name : chat.participants.find(p => p.username !== currentUsername).username;
            chatItem.textContent = chatName;
            chatItem.addEventListener('click', () => {
                loadChatMessages(chat);
            });
            chatListContainer.appendChild(chatItem);
        });
    });

    const loadChatMessages = (chat) => {
        currentChatId = chat._id;
        chatNameHeader.textContent = chat.isGroup ? chat.name : chat.participants.find(p => p.username !== currentUsername).username;
        chatMessagesContainer.innerHTML = '';
        chat.messages.forEach(msg => {
            addMessageToChat(msg);
        });
    };

    const addMessageToChat = (message) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(message.sender.username === currentUsername ? 'sent' : 'received');

        const messageHeader = document.createElement('strong');
        messageHeader.textContent = `${message.sender.username}: `;

        const messageText = document.createElement('span');
        messageText.textContent = message.text;

        messageDiv.appendChild(messageHeader);
        messageDiv.appendChild(messageText);

        // Option zum Löschen der eigenen Nachricht
        if (message.sender.username === currentUsername) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '❌';
            deleteBtn.classList.add('delete-btn');
            deleteBtn.addEventListener('click', () => {
                socket.emit('delete message', { chatId: currentChatId, messageId: message._id });
            });
            messageDiv.appendChild(deleteBtn);
        }

        // Option zum Melden
        if (message.sender.username !== currentUsername) {
            const reportBtn = document.createElement('button');
            reportBtn.textContent = '⚠️';
            reportBtn.classList.add('report-btn');
            reportBtn.addEventListener('click', () => {
                socket.emit('report message', { chatId: currentChatId, messageId: message._id });
                alert('Nachricht gemeldet.');
            });
            messageDiv.appendChild(reportBtn);
        }

        chatMessagesContainer.appendChild(messageDiv);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    };

    sendMessageBtn.addEventListener('click', () => {
        if (!currentChatId || messageInput.value.trim() === '') return;
        socket.emit('send message', { chatId: currentChatId, text: messageInput.value });
        messageInput.value = '';
    });

    socket.on('new message', (data) => {
        if (data.chatId === currentChatId) {
            addMessageToChat(data.message);
        }
    });

    socket.on('message deleted', ({ chatId, messageId }) => {
        if (chatId === currentChatId) {
            const messageElement = chatMessagesContainer.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        }
    });
}