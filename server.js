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
app.set('trust proxy', 1); // Wichtig für Render, um die korrekte IP des Clients zu identifizieren
const server = http.createServer(app);

// Wichtige Konstanten
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Passwort-Validierungsfunktion
const validatePassword = (password) => {
    // Mindestens 8 Zeichen, Großbuchstabe, Kleinbuchstabe, Zahl und Sonderzeichen
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

// Rate Limiting zum Schutz vor Brute-Force-Angriffen
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 Minute
    max: 5, // maximal 5 Versuche pro IP pro Minute
    handler: (req, res) => {
        res.status(429).json({
            message: 'Zu viele Login-Versuche von dieser IP, bitte versuchen Sie es in einer Minute erneut.'
        });
    }
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
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(encryptedData, iv) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
        let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Entschlüsselungsfehler:', error);
        return 'Fehler beim Entschlüsseln der Daten.';
    }
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

// Logout-Route
app.get('/api/logout', (req, res) => {
    // Client-seitig löschen
    res.status(200).json({ message: 'Erfolgreich abgemeldet.' });
});

// Registrierung
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!validatePassword(password)) {
        return res.status(400).json({
            message: 'Das Passwort muss mindestens 8 Zeichen lang sein und Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen enthalten.'
        });
    }
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

app.put('/api/files/:id', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        const encryptedData = encrypt(content);
        file.title = title;
        file.content = encryptedData.encryptedData;
        file.iv = encryptedData.iv;
        await file.save();
        res.status(200).json({ message: 'Datei erfolgreich aktualisiert.' });
    } catch (err) {
        res.status(500).json({ message: 'Aktualisierung fehlgeschlagen', error: err.message });
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