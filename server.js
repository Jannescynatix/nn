// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const sharedsession = require('express-socket.io-session');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./database/models/User');
const Chat = require('./database/models/Chat');

const app = express();
const server = http.createServer(app);
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'EinGeheimesSchluesselWort',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: 'auto' }
});

app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const io = socketIo(server);
io.use(sharedsession(sessionMiddleware, {
    autoSave: true
}));

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET || 'EinSehrGeheimerJWT-Schlüssel';

// MongoDB-Verbindung
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB erfolgreich verbunden!');
    } catch (err) {
        console.error('MongoDB-Verbindungsfehler:', err.message);
        process.exit(1);
    }
};
connectDB();

// --- Express-Routen ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/admin', (req, res) => req.session.isAdmin ? res.sendFile(path.join(__dirname, 'public', 'admin.html')) : res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const user = new User({ username, email, password });
        await user.save();
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, username: user.username });
    } catch (err) {
        res.status(400).json({ message: 'Registrierung fehlgeschlagen', error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Falsche E-Mail oder falsches Passwort' });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ message: 'Serverfehler' });
    }
});

app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD_HASH) {
        return res.status(500).send({ success: false, message: 'Admin-Passwort-Hash ist nicht gesetzt.' });
    }
    bcrypt.compare(password, ADMIN_PASSWORD_HASH, (err, result) => {
        if (result === true) {
            req.session.isAdmin = true;
            req.session.save();
            res.status(200).send({ success: true });
        } else {
            res.status(401).send({ success: false, message: 'Falsches Passwort.' });
        }
    });
});

// --- Socket.IO Events ---

const getStats = async () => {
    const totalUsers = await User.countDocuments();
    const totalChats = await Chat.countDocuments();
    const reportedMessages = await Chat.countDocuments({ 'messages.reported': true });
    return {
        totalUsers,
        totalChats,
        reportedMessages
    };
};

io.on('connection', (socket) => {
    console.log('Ein Benutzer hat sich verbunden:', socket.id);

    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (!user) {
                return socket.emit('auth-error', 'Benutzer nicht gefunden.');
            }
            socket.userId = user._id;
            socket.username = user.username;
            socket.join(user._id.toString());
            socket.emit('authenticated', { username: user.username });

            const userChats = await Chat.find({ participants: user._id }).populate('participants', 'username').populate('messages.sender', 'username');
            socket.emit('load chats', userChats);

        } catch (err) {
            socket.emit('auth-error', 'Authentifizierung fehlgeschlagen.');
        }
    });

    socket.on('send message', async ({ chatId, text }) => {
        if (!socket.userId) return;
        try {
            const chat = await Chat.findById(chatId);
            if (!chat) return;

            const message = { sender: socket.userId, text };
            chat.messages.push(message);
            await chat.save();

            io.to(chatId).emit('new message', { chatId, message, senderName: socket.username });
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('create group', async ({ groupName, participants }) => {
        if (!socket.userId) return;
        try {
            const participantIds = participants.map(id => mongoose.Types.ObjectId(id));
            participantIds.push(socket.userId);
            const newGroup = new Chat({
                name: groupName,
                isGroup: true,
                participants: participantIds,
                admin: socket.userId,
                messages: []
            });
            await newGroup.save();

            newGroup.participants.forEach(pId => io.to(pId.toString()).emit('new chat', newGroup));
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('report message', async ({ chatId, messageId }) => {
        if (!socket.userId) return;
        try {
            await Chat.updateOne(
                { _id: chatId, 'messages._id': messageId },
                { '$set': { 'messages.$.reported': true } }
            );
            io.to('admin-room').emit('new report');
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('delete message', async ({ chatId, messageId }) => {
        if (!socket.userId) return;
        try {
            const chat = await Chat.findById(chatId);
            if (!chat || (chat.isGroup && chat.admin.toString() !== socket.userId.toString())) {
                return;
            }

            const messageToDelete = chat.messages.id(messageId);
            if (!messageToDelete) return;

            if (chat.isGroup || messageToDelete.sender.toString() === socket.userId.toString()) {
                messageToDelete.remove();
                await chat.save();
                io.to(chatId).emit('message deleted', { chatId, messageId });
            }
        } catch (err) {
            console.error(err);
        }
    });

    // Admin-Events
    socket.on('admin:check-session', async () => {
        if (socket.handshake.session && socket.handshake.session.isAdmin) {
            socket.join('admin-room');
            const [users, chats, stats] = await Promise.all([
                User.find({}, 'username email createdAt'),
                Chat.find().populate('participants', 'username').populate('messages.sender', 'username'),
                getStats()
            ]);
            socket.emit('admin:authenticated', { users, chats, stats });
        } else {
            socket.emit('admin:auth-failed');
        }
    });

    socket.on('admin:delete-user', async (userId) => {
        if (!socket.handshake.session.isAdmin) return;
        await User.findByIdAndDelete(userId);
        io.to('admin-room').emit('admin:update', await getAdminData());
    });

    socket.on('admin:delete-chat', async (chatId) => {
        if (!socket.handshake.session.isAdmin) return;
        await Chat.findByIdAndDelete(chatId);
        io.to('admin-room').emit('admin:update', await getAdminData());
    });

    socket.on('admin:delete-chat-message', async ({ chatId, messageId }) => {
        if (!socket.handshake.session.isAdmin) return;
        const chat = await Chat.findById(chatId);
        if (chat) {
            chat.messages.id(messageId).remove();
            await chat.save();
            io.to(chatId).emit('message deleted', { chatId, messageId });
            io.to('admin-room').emit('admin:update', await getAdminData());
        }
    });

    socket.on('disconnect', async () => {
        console.log('Benutzer getrennt:', socket.id);
    });
});

const getAdminData = async () => {
    const [users, chats, stats] = await Promise.all([
        User.find({}, 'username email createdAt'),
        Chat.find().populate('participants', 'username').populate('messages.sender', 'username'),
        getStats()
    ]);
    return { users, chats, stats };
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));