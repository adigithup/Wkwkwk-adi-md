const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  isConnected: { type: Boolean, default: false },
  number: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', sessionSchema);
