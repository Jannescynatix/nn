// /database/models/Chat.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    reported: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ChatSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true
    },
    isGroup: {
        type: Boolean,
        default: false
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    admin: { // Nur für Gruppenchats
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    messages: [MessageSchema]
});

module.exports = mongoose.model('Chat', ChatSchema);