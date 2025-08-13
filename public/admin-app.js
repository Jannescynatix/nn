const socket = io();

const adminLoginPage = document.getElementById('admin-login-page');
const adminDashboard = document.getElementById('admin-dashboard');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminError = document.getElementById('admin-error');

const userCount = document.getElementById('user-count');
const chatCount = document.getElementById('chat-count');
const groupCount = document.getElementById('group-count');
const reportCount = document.getElementById('report-count');

const usersList = document.getElementById('users-list');
const chatsList = document.getElementById('chats-list');
const groupsList = document.getElementById('groups-list');
const reportsList = document.getElementById('reports-list');

adminLoginBtn.addEventListener('click', () => {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    socket.emit('admin_login', { username, password });
});

socket.on('admin_authenticated', () => {
    adminLoginPage.style.display = 'none';
    adminDashboard.style.display = 'block';
    socket.emit('admin_get_stats');
});

socket.on('admin_login_failed', (data) => {
    adminError.textContent = data.message;
});

socket.on('admin_stats', (stats) => {
    updateDashboard(stats);
});

socket.on('admin_stats_update', () => {
    socket.emit('admin_get_stats');
});

socket.on('new_report', (report) => {
    const li = createReportItem(report);
    reportsList.appendChild(li);
    reportCount.textContent = parseInt(reportCount.textContent) + 1;
});

function updateDashboard(stats) {
    userCount.textContent = stats.users.length;
    chatCount.textContent = stats.chats.length;
    groupCount.textContent = stats.groups.length;
    reportCount.textContent = stats.reports.length;

    usersList.innerHTML = '';
    stats.users.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>Username: ${user.username}, Email: ${user.email}</span>
            <button class="delete" onclick="deleteUser('${user._id}')">Löschen</button>
        `;
        usersList.appendChild(li);
    });

    chatsList.innerHTML = '';
    stats.chats.forEach(chat => {
        const li = document.createElement('li');
        const participants = chat.participants.map(p => p.username).join(', ');
        li.innerHTML = `
            <span>Teilnehmer: ${participants}</span>
            <button class="delete" onclick="deleteChat('${chat._id}')">Löschen</button>
        `;
        chatsList.appendChild(li);
    });

    groupsList.innerHTML = '';
    stats.groups.forEach(group => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>Name: ${group.name}, Mitglieder: ${group.members.length}</span>
            <button class="delete" onclick="deleteGroup('${group._id}')">Löschen</button>
        `;
        groupsList.appendChild(li);
    });

    reportsList.innerHTML = '';
    stats.reports.forEach(report => {
        const li = createReportItem(report);
        reportsList.appendChild(li);
    });
}

function createReportItem(report) {
    const li = document.createElement('li');
    li.innerHTML = `
        <span>Meldung von ${report.reporter.username} in ${report.reportedChatType} (${report.reportedChatId}): ${report.message}</span>
    `;
    if (!report.isResolved) {
        const resolveBtn = document.createElement('button');
        resolveBtn.textContent = 'Lösen';
        resolveBtn.classList.add('resolve');
        resolveBtn.onclick = () => socket.emit('admin_resolve_report', report._id);
        li.appendChild(resolveBtn);
    }
    return li;
}

function deleteUser(id) {
    if (confirm('Benutzer wirklich löschen?')) socket.emit('admin_delete_user', id);
}

function deleteChat(id) {
    if (confirm('Chat wirklich löschen?')) socket.emit('admin_delete_chat', id);
}

function deleteGroup(id) {
    if (confirm('Gruppe wirklich löschen?')) socket.emit('admin_delete_group', id);
}