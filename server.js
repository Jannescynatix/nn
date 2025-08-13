// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

// Modelle laden
const User = require('./database/models/User');
const File = require('./database/models/File');

// Express App und Server initialisieren
const app = express();
const server = http.createServer(app);

// Wichtige Konstanten
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const iv = crypto.randomBytes(16); // Initialisierungsvektor für die Verschlüsselung

// Rate Limiting zum Schutz vor Brute-Force-Angriffen
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 10, // maximal 10 Versuche pro IP pro 15 Minuten
    message: 'Zu viele Login-Versuche von dieser IP, bitte versuchen Sie es in 15 Minuten erneut.'
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: 'auto' }
});
app.use(sessionMiddleware);

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

// Datenverschlüsselungsfunktionen
function encrypt(text) {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(encryptedData, iv) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Authentifizierungs-Middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send('Zugriff verweigert. Kein Token vorhanden.');
    }
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).send('Ungültiger Token.');
    }
};

// --- Express-Routen ---

// Frontend-Routen
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Registrierung
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const user = new User({ username, email, password });
        await user.save();
        res.status(201).json({ message: 'Registrierung erfolgreich. Sie können sich jetzt anmelden.' });
    } catch (err) {
        res.status(400).json({ message: 'Registrierung fehlgeschlagen', error: err.message });
    }
});

// Login mit Brute-Force-Schutz
app.post('/api/login', loginLimiter, async (req, res) => {
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

// Routen für verschlüsselte Dateien (geschützt durch Middleware)
app.post('/api/files', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const encryptedData = encrypt(content);
        const file = new File({
            userId: req.user.id,
            title,
            iv: encryptedData.iv,
            content: encryptedData.encryptedData
        });
        await file.save();
        res.status(201).json({ message: 'Datei erfolgreich gespeichert.' });
    } catch (err) {
        res.status(500).json({ message: 'Speichern fehlgeschlagen', error: err.message });
    }
});

app.get('/api/files', authMiddleware, async (req, res) => {
    try {
        const files = await File.find({ userId: req.user.id });
        const decryptedFiles = files.map(file => ({
            _id: file._id,
            title: file.title,
            createdAt: file.createdAt,
            content: decrypt(file.content, file.iv)
        }));
        res.status(200).json(decryptedFiles);
    } catch (err) {
        res.status(500).json({ message: 'Abrufen fehlgeschlagen', error: err.message });
    }
});

app.delete('/api/files/:id', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        await file.deleteOne();
        res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
    } catch (err) {
        res.status(500).json({ message: 'Löschen fehlgeschlagen', error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));