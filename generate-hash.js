const bcrypt = require('bcrypt');
const passwordToHash = 'giga'; // <--- HIER DAS PASSWORT EINGEBEN

const saltRounds = 10; // Die Anzahl der Runden für das Hashing. 10 ist ein guter Standard.

bcrypt.hash(passwordToHash, saltRounds, (err, hash) => {
    if (err) {
        console.error('Fehler beim Hashing:', err);
        return;
    }
    console.log('Ihr neuer Admin-Passwort-Hash ist:');
    console.log(hash);
    console.log('\nKopieren Sie diesen Hash in Ihre server.js oder als Umgebungsvariable.');
});