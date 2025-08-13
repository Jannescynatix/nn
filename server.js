// server.js (überarbeitet und final)

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

console.log('Server wird gestartet...');

// Modelle laden
const User = require('./database/models/User');
const File = require('./database/models/File');

// Express App und Server initialisieren
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Wichtige Konstanten
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Logging für Umgebungsvariablen
console.log('Prüfe Umgebungsvariablen...');
if (!process.env.MONGODB_URI) console.error('FEHLER: MONGODB_URI fehlt!');
if (!JWT_SECRET) console.error('FEHLER: JWT_SECRET fehlt!');
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) console.error('FEHLER: ENCRYPTION_KEY fehlt oder hat falsche Länge (muss 64 Zeichen sein)!');

// Passwort-Validierungsfunktion
const validatePassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

// Rate Limiting zum Schutz vor Brute-Force-Angriffen
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    handler: (req, res) => {
        console.warn(`Rate-Limit-Überschreitung für IP: ${req.ip}`);
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
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        throw new Error('Verschlüsselung fehlgeschlagen: Ungültiger Key.');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(encryptedData, iv) {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        throw new Error('Entschlüsselung fehlgeschlagen: Ungültiger Key.');
    }
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
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.warn(`Autorisierungsfehler: Kein Token vorhanden für ${req.originalUrl}`);
        return res.status(401).send('Zugriff verweigert. Kein Token vorhanden.');
    }
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(verified.id).select('-password');
        if (!req.user) {
            console.warn('Benutzer nicht gefunden oder gelöscht');
            return res.status(401).send('Zugriff verweigert.');
        }
        console.log(`Token verifiziert. Benutzer-ID: ${req.user._id}`);
        next();
    } catch (err) {
        console.error(`Ungültiger Token: ${err.message}`);
        res.status(400).send('Ungültiger Token.');
    }
};

// Admin-Middleware
const adminMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        console.warn(`Admin-Zugriff verweigert für Benutzer-ID: ${req.user?._id}`);
        return res.status(403).json({ message: 'Admin-Zugriff verweigert.' });
    }
    next();
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
    console.log(`Versuchter Registrierung für E-Mail: ${email}`);
    if (!validatePassword(password)) {
        console.warn(`Registrierung fehlgeschlagen: Ungültiges Passwort für E-Mail: ${email}`);
        return res.status(400).json({
            message: 'Das Passwort muss mindestens 8 Zeichen lang sein und Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen enthalten.'
        });
    }
    try {
        const user = new User({ username, email, password });
        await user.save();
        console.log(`Registrierung erfolgreich für E-Mail: ${email}`);
        res.status(201).json({ message: 'Registrierung erfolgreich. Sie können sich jetzt anmelden.' });
    } catch (err) {
        console.error(`Registrierung fehlgeschlagen für E-Mail: ${email}. Fehler: ${err.message}`);
        res.status(400).json({ message: 'Registrierung fehlgeschlagen', error: err.message });
    }
});

// Login mit Brute-Force-Schutz
app.post('/api/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login-Versuch für E-Mail: ${email}`);
    try {
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            console.warn(`Login fehlgeschlagen: Falsche E-Mail oder falsches Passwort für E-Mail: ${email}`);
            return res.status(401).json({ message: 'Falsche E-Mail oder falsches Passwort' });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
        console.log(`Login erfolgreich für E-Mail: ${email}. Token erstellt.`);
        res.status(200).json({ message: 'Anmeldung erfolgreich', token, username: user.username, isAdmin: user.isAdmin });
    } catch (err) {
        console.error(`Login-Fehler für E-Mail: ${email}. Fehler: ${err.message}`);
        res.status(500).json({ message: 'Serverfehler' });
    }
});

// --- Routen für den Benutzer-Account ---
app.get('/api/account', authMiddleware, async (req, res) => {
    res.status(200).json({
        username: req.user.username,
        email: req.user.email,
        isAdmin: req.user.isAdmin
    });
});

app.put('/api/account/password', authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (!(await user.comparePassword(oldPassword))) {
            return res.status(401).json({ message: 'Altes Passwort ist falsch.' });
        }
        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                message: 'Das neue Passwort muss mindestens 8 Zeichen lang sein und Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen enthalten.'
            });
        }
        user.password = newPassword;
        await user.save();
        res.status(200).json({ message: 'Passwort erfolgreich geändert.' });
    } catch (err) {
        res.status(500).json({ message: 'Passwortänderung fehlgeschlagen.', error: err.message });
    }
});

app.delete('/api/account', authMiddleware, async (req, res) => {
    try {
        await User.deleteOne({ _id: req.user._id });
        await File.deleteMany({ userId: req.user._id });
        res.status(200).json({ message: 'Account und alle Daten erfolgreich gelöscht.' });
    } catch (err) {
        res.status(500).json({ message: 'Account-Löschung fehlgeschlagen.', error: err.message });
    }
});

// --- Routen für verschlüsselte Dateien ---
app.post('/api/files', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const encryptedData = encrypt(content);
        const file = new File({
            userId: req.user._id,
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
        const file = await File.findOne({ _id: req.params.id, userId: req.user._id });
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }

        file.history.push({
            content: file.content,
            iv: file.iv,
            message: 'Änderung ohne Nachricht'
        });

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

app.get('/api/files/:id/history', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user._id });
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        const decryptedHistory = file.history.map(item => ({
            timestamp: item.timestamp,
            message: item.message,
            content: decrypt(item.content, item.iv)
        }));
        res.status(200).json(decryptedHistory);
    } catch (err) {
        res.status(500).json({ message: 'Verlauf abrufen fehlgeschlagen', error: err.message });
    }
});

app.put('/api/files/:id/revert', authMiddleware, async (req, res) => {
    const { historyIndex } = req.body;
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user._id });
        if (!file || !file.history[historyIndex]) {
            return res.status(404).json({ message: 'Datei oder Version nicht gefunden.' });
        }

        const oldVersion = file.history[historyIndex];

        file.history.push({
            content: file.content,
            iv: file.iv,
            message: `Wiederherstellung von Version vom ${oldVersion.timestamp.toLocaleString()}`
        });

        file.content = oldVersion.content;
        file.iv = oldVersion.iv;
        await file.save();

        res.status(200).json({ message: 'Datei erfolgreich wiederhergestellt.' });
    } catch (err) {
        res.status(500).json({ message: 'Wiederherstellung fehlgeschlagen', error: err.message });
    }
});

app.get('/api/files', authMiddleware, async (req, res) => {
    try {
        const files = await File.find({ userId: req.user._id });
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
        const file = await File.findOne({ _id: req.params.id, userId: req.user._id });
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        await file.deleteOne();
        res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
    } catch (err) {
        res.status(500).json({ message: 'Löschen fehlgeschlagen', error: err.message });
    }
});

// --- Admin-Routen ---
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const fileCount = await File.countDocuments();
        res.status(200).json({ userCount, fileCount });
    } catch (err) {
        res.status(500).json({ message: 'Statistiken abrufen fehlgeschlagen.' });
    }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: 'Benutzerliste abrufen fehlgeschlagen.' });
    }
});

app.put('/api/admin/users/:id/password', authMiddleware, adminMiddleware, async (req, res) => {
    const { newPassword } = req.body;
    if (!validatePassword(newPassword)) {
        return res.status(400).json({
            message: 'Das neue Passwort muss mindestens 8 Zeichen lang sein und Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen enthalten.'
        });
    }
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        user.password = newPassword;
        await user.save();
        res.status(200).json({ message: 'Passwort erfolgreich geändert.' });
    } catch (err) {
        res.status(500).json({ message: 'Passwortänderung fehlgeschlagen.', error: err.message });
    }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await User.deleteOne({ _id: req.params.id });
        await File.deleteMany({ userId: req.params.id });
        res.status(200).json({ message: 'Benutzer und alle Daten gelöscht.' });
    } catch (err) {
        res.status(500).json({ message: 'Löschung fehlgeschlagen.', error: err.message });
    }
});

app.get('/api/admin/files', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const files = await File.find().populate('userId', 'username email');
        const fileData = files.map(file => ({
            _id: file._id,
            title: file.title,
            username: file.userId.username,
            email: file.userId.email,
            createdAt: file.createdAt
        }));
        res.status(200).json(fileData);
    } catch (err) {
        res.status(500).json({ message: 'Dateiliste abrufen fehlgeschlagen.', error: err.message });
    }
});

app.delete('/api/admin/files/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        await file.deleteOne();
        res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
    } catch (err) {
        res.status(500).json({ message: 'Löschung fehlgeschlagen.', error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));