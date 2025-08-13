const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportedChatType: { type: String, enum: ['chat', 'group'], required: true },
    reportedChatId: { type: mongoose.Schema.Types.ObjectId, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isResolved: { type: Boolean, default: false }
});

module.exports = mongoose.model('Report', ReportSchema);