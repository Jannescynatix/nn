const socket = io({
    auth: {
        token: localStorage.getItem('token')
    }
});

let currentChatId = null;
let currentChatType = null;
let currentUser = null;
let currentChatTitle = '';

const authContainer = document.getElementById('auth-container');
const chatApp = document.getElementById('chat-app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const authError = document.getElementById('auth-error');
const registerMessage = document.getElementById('register-message');
const currentUsernameSpan = document.getElementById('current-username');

const userSearchInput = document.getElementById('user-search');
const userSearchResults = document.getElementById('user-search-results');
const createGroupBtn = document.getElementById('create-group-btn');
const chatList = document.getElementById('chat-list');
const groupList = document.getElementById('group-list');
const chatTitle = document.getElementById('chat-title');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const reportChatBtn = document.getElementById('report-chat-btn');


// --- UI LOGIC ---
if (localStorage.getItem('token') && localStorage.getItem('user')) {
    currentUser = JSON.parse(localStorage.getItem('user'));
    showChatApp();
    socket.auth.token = localStorage.getItem('token');
    socket.connect();
} else {
    showAuthContainer();
}

function showAuthContainer() {
    authContainer.style.display = 'flex';
    chatApp.style.display = 'none';
}

function showChatApp() {
    authContainer.style.display = 'none';
    chatApp.style.display = 'flex';
    currentUsernameSpan.textContent = currentUser.username;
}

function displayMessage(message) {
    const p = document.createElement('p');
    p.textContent = `${message.sender.username}: ${message.content}`;
    messagesContainer.appendChild(p);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function loadChat(chatId, chatType, title) {
    currentChatId = chatId;
    currentChatType = chatType;
    currentChatTitle = title;
    chatTitle.textContent = title;
    reportChatBtn.style.display = 'inline-block';
    messagesContainer.innerHTML = '';
    socket.emit('load_chat_messages', { chatId, chatType });
}

// --- EVENT LISTENERS ---
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    authError.textContent = '';
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    registerMessage.textContent = '';
});

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            showChatApp();
            socket.auth.token = data.token;
            socket.connect();
        } else {
            authError.textContent = data.message;
        }
    } catch (error) {
        authError.textContent = 'Verbindung fehlgeschlagen.';
    }
});

registerBtn.addEventListener('click', async () => {
    const email = document.getElementById('register-email').value;
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });
        const data = await response.json();
        registerMessage.textContent = data.message;
        if (response.ok) document.getElementById('register-form').reset();
    } catch (error) {
        registerMessage.textContent = 'Verbindung fehlgeschlagen.';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
});

userSearchInput.addEventListener('input', async () => {
    const searchTerm = userSearchInput.value.trim();
    if (searchTerm.length > 2) {
        const response = await fetch(`/api/users/search?username=${searchTerm}`);
        const users = await response.json();
        userSearchResults.innerHTML = '';
        users.forEach(user => {
            if (user.username !== currentUser.username) {
                const li = document.createElement('li');
                li.textContent = user.username;
                li.addEventListener('click', () => {
                    socket.emit('start_new_chat', user._id);
                    userSearchResults.innerHTML = '';
                    userSearchInput.value = '';
                });
                userSearchResults.appendChild(li);
            }
        });
    } else {
        userSearchResults.innerHTML = '';
    }
});

createGroupBtn.addEventListener('click', async () => {
    const groupName = prompt('Gruppenname eingeben:');
    if (!groupName) return;

    const membersInput = prompt('Mitglieds-Benutzernamen eingeben (durch Komma getrennt):');
    if (!membersInput) return;

    const usernames = membersInput.split(',').map(u => u.trim());
    const memberObjects = [];

    for (const username of usernames) {
        const response = await fetch(`/api/users/search?username=${username}`);
        const users = await response.json();
        if (users.length > 0) {
            memberObjects.push(users[0]);
        }
    }

    if (memberObjects.length > 0) {
        socket.emit('create_group', { name: groupName, members: memberObjects });
    } else {
        alert('Keine gültigen Mitglieder gefunden.');
    }
});

sendMessageBtn.addEventListener('click', () => {
    const content = messageInput.value.trim();
    if (content && currentChatId) {
        socket.emit('send_message', { chatId: currentChatId, chatType: currentChatType, content });
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessageBtn.click();
    }
});

reportChatBtn.addEventListener('click', () => {
    const message = prompt('Bitte beschreibe das Problem:');
    if (message) {
        socket.emit('report_chat', { chatId: currentChatId, chatType: currentChatType, message });
    }
});

// --- SOCKET.IO EVENTS ---
socket.on('connect', () => {
    console.log('Verbunden mit dem Server');
    socket.emit('load_chats_and_groups');
});

socket.on('chats_loaded', (chats) => {
    chatList.innerHTML = '';
    chats.forEach(chat => {
        const otherUser = chat.participants.find(p => p.username !== currentUser.username);
        const li = document.createElement('li');
        li.textContent = otherUser.username;
        li.addEventListener('click', () => loadChat(chat._id, 'chat', otherUser.username));
        chatList.appendChild(li);
    });
});

socket.on('groups_loaded', (groups) => {
    groupList.innerHTML = '';
    groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group.name;
        li.addEventListener('click', () => loadChat(group._id, 'group', group.name));
        groupList.appendChild(li);
    });
});

socket.on('chat_messages_loaded', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(displayMessage);
});

socket.on('new_message', ({ chatId, message }) => {
    if (chatId === currentChatId) {
        displayMessage(message);
    }
});

socket.on('new_chat_created', (chat) => {
    const otherUser = chat.participants.find(p => p.username !== currentUser.username);
    const li = document.createElement('li');
    li.textContent = otherUser.username;
    li.addEventListener('click', () => loadChat(chat._id, 'chat', otherUser.username));
    chatList.appendChild(li);
});

socket.on('new_group_created', (group) => {
    const li = document.createElement('li');
    li.textContent = group.name;
    li.addEventListener('click', () => loadChat(group._id, 'group', group.name));
    groupList.appendChild(li);
});

socket.on('report_success', (data) => {
    alert(data.message);
});