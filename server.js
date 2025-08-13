// server.js (überarbeitet)

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
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.warn(`Autorisierungsfehler: Kein Token vorhanden für ${req.originalUrl}`);
        return res.status(401).send('Zugriff verweigert. Kein Token vorhanden.');
    }
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        console.log(`Token verifiziert. Benutzer-ID: ${req.user.id}`);
        next();
    } catch (err) {
        console.error(`Ungültiger Token: ${err.message}`);
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
    res.status(200).json({ message: 'Erfolgreich abgemeldet.' });
});

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
        res.status(200).json({ message: 'Anmeldung erfolgreich', token, username: user.username });
    } catch (err) {
        console.error(`Login-Fehler für E-Mail: ${email}. Fehler: ${err.message}`);
        res.status(500).json({ message: 'Serverfehler' });
    }
});

// Routen für verschlüsselte Dateien (geschützt durch Middleware)
app.post('/api/files', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    console.log(`Speicher-Versuch für Benutzer-ID: ${req.user.id}, Titel: "${title}"`);
    try {
        const encryptedData = encrypt(content);
        const file = new File({
            userId: req.user.id,
            title,
            iv: encryptedData.iv,
            content: encryptedData.encryptedData
        });
        await file.save();
        console.log(`Datei erfolgreich gespeichert. Benutzer-ID: ${req.user.id}, Datei-ID: ${file._id}`);
        res.status(201).json({ message: 'Datei erfolgreich gespeichert.' });
    } catch (err) {
        console.error(`Speichern fehlgeschlagen. Benutzer-ID: ${req.user.id}, Fehler: ${err.message}`);
        res.status(500).json({ message: 'Speichern fehlgeschlagen', error: err.message });
    }
});

app.put('/api/files/:id', authMiddleware, async (req, res) => {
    const { title, content, message } = req.body;
    console.log(`Aktualisierungsversuch für Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}`);
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
        if (!file) {
            console.warn(`Aktualisierung fehlgeschlagen: Datei nicht gefunden. Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }

        // Speichere die aktuelle Version im Verlauf
        file.history.push({
            content: file.content,
            iv: file.iv,
            message: message || 'Änderung ohne Nachricht'
        });

        const encryptedData = encrypt(content);
        file.title = title;
        file.content = encryptedData.encryptedData;
        file.iv = encryptedData.iv;
        await file.save();

        console.log(`Datei erfolgreich aktualisiert. Benutzer-ID: ${req.user.id}, Datei-ID: ${file._id}`);
        res.status(200).json({ message: 'Datei erfolgreich aktualisiert.' });
    } catch (err) {
        console.error(`Aktualisierung fehlgeschlagen. Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}, Fehler: ${err.message}`);
        res.status(500).json({ message: 'Aktualisierung fehlgeschlagen', error: err.message });
    }
});

// NEUE ROUTE: Dateiverlauf abrufen
app.get('/api/files/:id/history', authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
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

// NEUE ROUTE: Datei auf eine alte Version zurücksetzen
app.put('/api/files/:id/revert', authMiddleware, async (req, res) => {
    const { historyIndex } = req.body;
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
        if (!file || !file.history[historyIndex]) {
            return res.status(404).json({ message: 'Datei oder Version nicht gefunden.' });
        }

        const oldVersion = file.history[historyIndex];

        // Speichere die aktuelle Version im Verlauf, bevor du zurücksetzt
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
    console.log(`Abrufversuch für Dateien von Benutzer-ID: ${req.user.id}`);
    try {
        const files = await File.find({ userId: req.user.id });
        const decryptedFiles = files.map(file => ({
            _id: file._id,
            title: file.title,
            createdAt: file.createdAt,
            content: decrypt(file.content, file.iv)
        }));
        console.log(`${decryptedFiles.length} Dateien erfolgreich für Benutzer-ID ${req.user.id} abgerufen.`);
        res.status(200).json(decryptedFiles);
    } catch (err) {
        console.error(`Abrufen der Dateien fehlgeschlagen. Benutzer-ID: ${req.user.id}, Fehler: ${err.message}`);
        res.status(500).json({ message: 'Abrufen fehlgeschlagen', error: err.message });
    }
});

app.delete('/api/files/:id', authMiddleware, async (req, res) => {
    console.log(`Löschversuch für Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}`);
    try {
        const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
        if (!file) {
            console.warn(`Löschen fehlgeschlagen: Datei nicht gefunden. Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
        await file.deleteOne();
        console.log(`Datei erfolgreich gelöscht. Benutzer-ID: ${req.user.id}, Datei-ID: ${file._id}`);
        res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
    } catch (err) {
        console.error(`Löschen fehlgeschlagen. Benutzer-ID: ${req.user.id}, Datei-ID: ${req.params.id}, Fehler: ${err.message}`);
        res.status(500).json({ message: 'Löschen fehlgeschlagen', error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));