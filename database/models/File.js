// database/models/File.js (überarbeitet)

const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    content: { type: String, required: true },
    iv: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const fileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    iv: { type: String, required: true },
    history: [historySchema] // Neues Feld für den Verlauf
}, { timestamps: true });

module.exports = mongoose.model('File', fileSchema);