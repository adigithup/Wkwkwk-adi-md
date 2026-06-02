const mongoose = require('mongoose');

const mtTemplateSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, default: '' },
  toEmail: { type: String, default: 'android@support.whatsapp.com' },
  subject: { type: String, default: '' },
  body: { type: String, default: '' },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MTTemplate', mtTemplateSchema);
