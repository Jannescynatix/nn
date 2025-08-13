const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./public/User');
const Chat = require('./public/Chat');
const Group = require('./public/Group');
const Report = require('./public/Report');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB verbunden'))
    .catch(err => console.log(err));

const authMiddleware = (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Nicht autorisiert: Kein Token vorhanden.'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch (error) {
        next(new Error('Nicht autorisiert: Ungültiger Token.'));
    }
};
io.use(authMiddleware);

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const userExists = await User.findOne({ username });
        if (userExists) return res.status(400).json({ message: 'Benutzername existiert bereits.' });
        const emailExists = await User.findOne({ email });
        if (emailExists) return res.status(400).json({ message: 'E-Mail existiert bereits.' });
        const user = new User({ username, email, password });
        await user.save();
        res.status(201).json({ message: 'Registrierung erfolgreich' });
    } catch (error) {
        res.status(500).json({ message: 'Registrierung fehlgeschlagen', error });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: 'Benutzer nicht gefunden' });
        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Ungültiges Passwort' });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.status(200).json({ message: 'Login erfolgreich', token, user: { id: user._id, username: user.username } });
    } catch (error) {
        res.status(500).json({ message: 'Serverfehler' });
    }
});

app.get('/api/users/search', async (req, res) => {
    const { username } = req.query;
    try {
        const users = await User.find({ username: new RegExp(username, 'i') }).select('username');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Serverfehler' });
    }
});

io.on('connection', (socket) => {
    console.log(`Benutzer verbunden: ${socket.userId}`);
    socket.join(socket.userId.toString());

    socket.on('load_chats_and_groups', async () => {
        try {
            const user = await User.findById(socket.userId)
                .populate({ path: 'chats', populate: { path: 'participants', select: 'username' } })
                .populate({ path: 'groups', populate: { path: 'members', select: 'username' } });
            socket.emit('chats_loaded', user.chats);
            socket.emit('groups_loaded', user.groups);
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('load_chat_messages', async ({ chatId, chatType }) => {
        try {
            let chat;
            if (chatType === 'chat') {
                chat = await Chat.findById(chatId).populate('messages.sender', 'username');
            } else if (chatType === 'group') {
                chat = await Group.findById(chatId).populate('messages.sender', 'username');
            }
            if (chat) {
                socket.emit('chat_messages_loaded', chat.messages);
            }
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('send_message', async ({ chatId, chatType, content }) => {
        try {
            const message = { sender: socket.userId, content };
            let chat;
            if (chatType === 'chat') {
                chat = await Chat.findById(chatId);
            } else if (chatType === 'group') {
                chat = await Group.findById(chatId);
            }
            chat.messages.push(message);
            await chat.save();
            const sender = await User.findById(socket.userId);
            const messageWithSender = { ...message, sender: { username: sender.username } };

            chat.participants.forEach(p => io.to(p.toString()).emit('new_message', { chatId, message: messageWithSender }));
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('start_new_chat', async (otherUserId) => {
        try {
            const existingChat = await Chat.findOne({ participants: { $all: [socket.userId, otherUserId] } });
            if (existingChat) {
                return socket.emit('chat_already_exists', { chatId: existingChat._id });
            }
            const newChat = new Chat({ participants: [socket.userId, otherUserId] });
            await newChat.save();
            await User.findByIdAndUpdate(socket.userId, { $push: { chats: newChat._id } });
            await User.findByIdAndUpdate(otherUserId, { $push: { chats: newChat._id } });
            const populatedChat = await Chat.findById(newChat._id).populate('participants', 'username');
            socket.emit('new_chat_created', populatedChat);
            io.to(otherUserId.toString()).emit('new_chat_created', populatedChat);
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('create_group', async ({ name, members }) => {
        try {
            const memberIds = [...members.map(m => m._id), socket.userId];
            const newGroup = new Group({ name, creator: socket.userId, members: memberIds });
            await newGroup.save();
            for (const memberId of memberIds) {
                await User.findByIdAndUpdate(memberId, { $push: { groups: newGroup._id } });
                io.to(memberId.toString()).emit('new_group_created', newGroup);
            }
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('save_message', ({ chatId, chatType, messageId }) => {
        console.log(`Nachricht ${messageId} in ${chatType} ${chatId} gespeichert`);
        socket.emit('message_saved');
    });

    socket.on('delete_message_group', async ({ groupId, messageId }) => {
        try {
            const group = await Group.findById(groupId);
            if (group.creator.toString() === socket.userId.toString()) {
                group.messages.pull({ _id: messageId });
                await group.save();
                group.members.forEach(m => io.to(m.toString()).emit('message_deleted', { chatId: groupId, messageId }));
            }
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('report_chat', async ({ chatId, chatType, message }) => {
        try {
            const report = new Report({ reporter: socket.userId, reportedChatId: chatId, reportedChatType: chatType, message });
            await report.save();
            const populatedReport = await Report.findById(report._id).populate('reporter', 'username');
            io.to('admin-room').emit('new_report', populatedReport);
            socket.emit('report_success', { message: 'Meldung wurde gesendet.' });
        } catch (error) {
            socket.emit('report_error', { message: 'Fehler beim Senden der Meldung.' });
        }
    });

    socket.on('admin_login', async ({ username, password }) => {
        if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
            socket.join('admin-room');
            socket.emit('admin_authenticated');
            const stats = await getAdminStats();
            io.to('admin-room').emit('admin_stats', stats);
        } else {
            socket.emit('admin_login_failed', { message: 'Falsche Anmeldedaten.' });
        }
    });

    socket.on('admin_get_stats', async () => {
        if (socket.rooms.has('admin-room')) {
            const stats = await getAdminStats();
            socket.emit('admin_stats', stats);
        }
    });

    socket.on('admin_delete_group', async (groupId) => {
        if (socket.rooms.has('admin-room')) {
            await Group.findByIdAndDelete(groupId);
            io.to('admin-room').emit('admin_stats_update');
        }
    });

    socket.on('admin_delete_chat', async (chatId) => {
        if (socket.rooms.has('admin-room')) {
            await Chat.findByIdAndDelete(chatId);
            io.to('admin-room').emit('admin_stats_update');
        }
    });

    socket.on('admin_delete_user', async (userId) => {
        if (socket.rooms.has('admin-room')) {
            await User.findByIdAndDelete(userId);
            io.to('admin-room').emit('admin_stats_update');
        }
    });

    socket.on('admin_resolve_report', async (reportId) => {
        if (socket.rooms.has('admin-room')) {
            await Report.findByIdAndUpdate(reportId, { isResolved: true });
            io.to('admin-room').emit('admin_stats_update');
        }
    });

    socket.on('disconnect', () => {
        console.log('Benutzer getrennt:', socket.userId);
    });
});

async function getAdminStats() {
    const users = await User.find();
    const chats = await Chat.find().populate('participants', 'username');
    const groups = await Group.find().populate('members', 'username');
    const reports = await Report.find().populate('reporter', 'username');
    return { users, chats, groups, reports };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));