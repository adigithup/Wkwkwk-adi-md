const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const fs = require('fs');
const { getRandomName, getRandomAppealMessage } = require('./whatsappController');

let mtTexts = [];
if (fs.existsSync('mt_texts.json')) mtTexts = JSON.parse(fs.readFileSync('mt_texts.json', 'utf8'));

let settings = {
  check_delay: 1000,
  active_mt_id: 0,
  email: '',
  email_pass: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587
};
if (fs.existsSync('settings.json')) settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

function saveMt() { fs.writeFileSync('mt_texts.json', JSON.stringify(mtTexts, null, 2)); }

const getMtList = (req, res) => {
  res.json({ success: true, mtTexts });
};

const addMt = (req, res) => {
  try {
    const newMt = { id: Date.now(), ...req.body };
    mtTexts.push(newMt);
    saveMt();
    res.json({ success: true, mt: newMt });
  } catch (err) {
    logger.error('Add MT error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const setActiveMt = (req, res) => {
  try {
    settings.active_mt_id = req.body.id;
    if (fs.existsSync('settings.json')) {
      const s = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
      s.active_mt_id = req.body.id;
      fs.writeFileSync('settings.json', JSON.stringify(s, null, 2));
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Set active MT error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const fixNumber = async (req, res) => {
  try {
    const { number } = req.body;
    const num = number.replace(/\D/g, '');
    const activeMt = mtTexts.find(m => m.id === settings.active_mt_id);
    if (!activeMt) {
      return res.status(400).json({ success: false, message: 'No active MT template. Set one in Admin.' });
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host || 'smtp.gmail.com',
      port: settings.smtp_port || 587,
      secure: false,
      auth: { user: settings.email, pass: settings.email_pass }
    });

    await transporter.sendMail({
      from: settings.email,
      to: activeMt.to_email || 'android@support.whatsapp.com',
      subject: activeMt.subject,
      text: activeMt.body.replace(/{nomor}/g, num)
    });

    res.json({ success: true, message: `Number ${num} sent to ${activeMt.to_email || 'android@support.whatsapp.com'}` });
  } catch (err) {
    logger.error('Fix number error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const generateBanding = (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false, message: 'Number required' });
  const num = number.replace(/\D/g, '');
  const name = getRandomName();
  const msg = getRandomAppealMessage(name, num);
  res.json({ success: true, name, number: num, message: msg, email: 'android@support.whatsapp.com', subject: 'Appeal Issue' });
};

const uploadFile = (req, res) => {
  try {
    const XLSX = require('xlsx');
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let numbers = [];
    if (ext === 'txt') {
      numbers = fs.readFileSync(req.file.path, 'utf8').split(/[\r\n]+/).filter(l => l.trim());
    } else if (ext === 'xlsx') {
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      numbers = XLSX.utils.sheet_to_json(ws, { header: 1 }).flat().filter(Boolean).map(String);
    }
    fs.unlinkSync(req.file.path);
    const { formatNumber, isValidNumber } = require('./whatsappController');
    res.json({ success: true, numbers: numbers.map(formatNumber).filter(isValidNumber) });
  } catch (err) {
    logger.error('Upload file error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getMtList, addMt, setActiveMt, fixNumber, generateBanding, uploadFile };
