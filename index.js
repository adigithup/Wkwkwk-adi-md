require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');

const logger = require('./utils/logger');
const connectDB = require('./config/database');
const { authenticate } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const whatsappRoutes = require('./routes/whatsapp');

const {
  startSession,
  getPairingCode,
  disconnectSession,
  checkNumbers,
  checkRegistered,
  formatNumber,
  isValidNumber,
  getRandomName,
  getRandomAppealMessage
} = require('./controllers/whatsappController');

const { fixNumber, generateBanding } = require('./controllers/dashboardController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── DATABASE ───
connectDB();

// ─── MIDDLEWARE ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Session
const sessionSecret = process.env.SESSION_SECRET || 'adi-fix-merah-session-secret';
const sessionConfig = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
};

if (process.env.MONGODB_URI) {
  try {
    sessionConfig.store = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600
    });
  } catch (err) {
    logger.warn('MongoDB session store failed, using memory store:', err.message);
  }
}

app.use(session(sessionConfig));

// ─── STATIC FILES ───
app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ───
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ─── PAGE ROUTES ───
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Route root redirect ke login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// ─── SOCKET.IO ───
io.on('connection', (socket) => {
  const sessionId = socket.id;
  logger.info(`Socket connected: ${sessionId}`);

  socket.on('connect-wa', () => {
    startSession(sessionId, socket).catch(err => {
      logger.error('WA start error:', err);
      socket.emit('error-msg', 'Gagal memulai sesi WhatsApp');
    });
  });

  socket.on('get-pairing', async (phone) => {
    try {
      const code = await getPairingCode(sessionId, phone);
      socket.emit('pairing-code', code);
    } catch (err) {
      socket.emit('error-msg', err.message);
    }
  });

  socket.on('disconnect-wa', () => {
    disconnectSession(sessionId);
    socket.emit('wa-status', { status: 'disconnected' });
  });

  socket.on('cek-bio', async (numbers) => {
    try {
      const results = await checkNumbers(
        sessionId, numbers, 1000,
        (current, total) => socket.emit('bio-progress', { current, total })
      );
      socket.emit('bio-result', results);
    } catch (err) {
      socket.emit('error-msg', err.message);
    }
  });

  socket.on('cek-nomor', async (numbers) => {
    try {
      const results = await checkRegistered(
        sessionId, numbers,
        (current, total) => socket.emit('nomor-progress', { current, total })
      );
      socket.emit('nomor-result', results);
    } catch (err) {
      socket.emit('error-msg', err.message);
    }
  });

  socket.on('fix-nomor', async (number) => {
    try {
      const { success, message } = await new Promise((resolve, reject) => {
        const req = { body: { number } };
        const res = {
          json: (data) => resolve(data),
          status: (code) => ({ json: (data) => resolve({ success: false, ...data }) })
        };
        fixNumber(req, res);
      });
      socket.emit('fix-result', { success, message });
    } catch (err) {
      socket.emit('fix-result', { success: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${sessionId}`);
    disconnectSession(sessionId);
  });
});

// ─── TELEGRAM BOT (Lengkap) ───
if (process.env.TELEGRAM_BOT_TOKEN) {
  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  logger.info('Telegram bot initialized');

  // Simpan sesi aktif per chatId
  const activeSessions = new Map();

  // Helper: dummy socket untuk komunikasi dengan controller WhatsApp
  function createDummySocket(chatId) {
    const events = {};
    const dummySocket = {
      emit: (event, ...args) => {
        if (events[event]) events[event](...args);
        switch (event) {
          case 'qr':
            bot.sendMessage(chatId, `📱 Scan QR code:\n${args[0]}`);
            break;
          case 'wa-status':
            bot.sendMessage(chatId, `📟 Status: ${args[0].status} ${args[0].info || ''}`);
            break;
          case 'error-msg':
            bot.sendMessage(chatId, `❌ Error: ${args[0]}`);
            break;
          case 'pairing-code':
            bot.sendMessage(chatId, `🔢 Kode pairing: ${args[0]}`);
            break;
          case 'bio-result': {
            let txt = '📊 Hasil cek bio:\n';
            args[0].forEach(r => txt += `${r.number}: ${r.exists ? '✅ Ada' : '❌ Tidak'} (${r.name || '-'})\n`);
            bot.sendMessage(chatId, txt.substring(0, 4096));
            break;
          }
          case 'nomor-result': {
            let txt = '📞 Hasil cek nomor:\n';
            args[0].forEach(r => txt += `${r.number}: ${r.registered ? '✅ Terdaftar' : '❌ Tidak'}\n`);
            bot.sendMessage(chatId, txt.substring(0, 4096));
            break;
          }
          case 'fix-result':
            bot.sendMessage(chatId, args[0].success ? `✅ ${args[0].message}` : `❌ Gagal: ${args[0].message}`);
            break;
        }
      },
      on: (event, cb) => { events[event] = cb; },
      off: (event) => { delete events[event]; }
    };
    return dummySocket;
  }

  // Watchlist per chat
  const watchlist = new Map();

  // Helper formatting nomor
  const cleanNumber = (num) => {
    let n = num.replace(/\D/g, '');
    if (n.startsWith('0')) n = '62' + n.substring(1);
    if (!n.startsWith('62')) n = '62' + n;
    return n;
  };

  // ─── COMMANDS ───
  bot.onText(/\/pairing (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const phone = cleanNumber(match[1].trim());
    const sessionId = `telegram_${chatId}`;
    try {
      const code = await getPairingCode(sessionId, phone);
      bot.sendMessage(chatId, `🔢 Kode pairing untuk ${phone}: ${code}`);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Gagal: ${err.message}`);
    }
  });

  bot.onText(/\/getqr/, async (msg) => {
    const chatId = msg.chat.id;
    const sessionId = `telegram_${chatId}`;
    if (activeSessions.has(sessionId)) {
      disconnectSession(sessionId);
      activeSessions.delete(sessionId);
    }
    const dummySocket = createDummySocket(chatId);
    activeSessions.set(sessionId, dummySocket);
    try {
      await startSession(sessionId, dummySocket);
      bot.sendMessage(chatId, '🔄 Memulai sesi WhatsApp. Tunggu QR code atau status.');
    } catch (err) {
      bot.sendMessage(chatId, `❌ Gagal memulai: ${err.message}`);
      activeSessions.delete(sessionId);
    }
  });

  bot.onText(/\/add (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    let number = cleanNumber(match[1].trim());
    if (!isValidNumber(number)) {
      return bot.sendMessage(chatId, '❌ Nomor tidak valid. Gunakan format 628xxxxxxxxxx');
    }
    if (!watchlist.has(chatId)) watchlist.set(chatId, []);
    const list = watchlist.get(chatId);
    if (!list.includes(number)) {
      list.push(number);
      bot.sendMessage(chatId, `✅ ${number} ditambahkan ke watchlist.`);
    } else {
      bot.sendMessage(chatId, `ℹ️ ${number} sudah ada.`);
    }
  });

  bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    const list = watchlist.get(chatId) || [];
    if (!list.length) return bot.sendMessage(chatId, '📭 Watchlist kosong. Gunakan /add');
    bot.sendMessage(chatId, `📋 Watchlist:\n${list.join('\n')}`);
  });

  bot.onText(/\/remove (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    let number = cleanNumber(match[1].trim());
    if (!watchlist.has(chatId)) return bot.sendMessage(chatId, 'Watchlist kosong.');
    const list = watchlist.get(chatId);
    const idx = list.indexOf(number);
    if (idx === -1) return bot.sendMessage(chatId, `❌ ${number} tidak ditemukan.`);
    list.splice(idx, 1);
    bot.sendMessage(chatId, `✅ ${number} dihapus dari watchlist.`);
  });

  bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    const sessionId = `telegram_${chatId}`;
    const list = watchlist.get(chatId) || [];
    if (!list.length) return bot.sendMessage(chatId, 'Watchlist kosong. Tambah dengan /add');
    if (!activeSessions.has(sessionId)) {
      return bot.sendMessage(chatId, '❌ Sesi WhatsApp belum aktif. Gunakan /getqr dulu.');
    }
    bot.sendMessage(chatId, `🔍 Mengecek ${list.length} nomor...`);
    try {
      const results = await checkRegistered(sessionId, list);
      let msgText = '📊 Hasil pengecekan:\n';
      results.forEach(r => {
        msgText += `${r.number}: ${r.registered ? '✅ Terdaftar' : '❌ Tidak terdaftar'}\n`;
      });
      bot.sendMessage(chatId, msgText.substring(0, 4096));
    } catch (err) {
      bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/disconnect/, (msg) => {
    const chatId = msg.chat.id;
    const sessionId = `telegram_${chatId}`;
    if (activeSessions.has(sessionId)) {
      disconnectSession(sessionId);
      activeSessions.delete(sessionId);
      bot.sendMessage(chatId, '✅ Sesi WhatsApp diputuskan.');
    } else {
      bot.sendMessage(chatId, 'ℹ️ Tidak ada sesi aktif.');
    }
  });

  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const sessionId = `telegram_${chatId}`;
    const aktif = activeSessions.has(sessionId);
    bot.sendMessage(chatId, aktif ? '✅ Sesi WhatsApp aktif.' : '❌ Sesi tidak aktif. Gunakan /getqr');
  });

  bot.onText(/\/help/, (msg) => {
    const helpText = `
🤖 *Command Bot WhatsApp*

/pairing <nomor> - Dapatkan kode pairing
/getqr - Mulai sesi dengan QR code
/add <nomor> - Tambah nomor ke watchlist
/list - Lihat watchlist
/remove <nomor> - Hapus dari watchlist
/check - Cek semua nomor di watchlist (terdaftar/tidak)
/disconnect - Putuskan sesi WhatsApp
/status - Cek status sesi
/connect - Info dashboard web
/help - Bantuan ini

Format nomor: 628xxxxxxxxxx (contoh: 628123456789)
    `;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
  });

  // Command /connect (tetap)
  bot.onText(/\/connect/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Silakan buka dashboard web untuk menghubungkan WhatsApp.');
  });
}

// ─── ERROR HANDLERS ───
app.use(notFound);
app.use(errorHandler);

// ─── START SERVER ───
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`ADI FIX MERAH V12 running on http://${HOST}:${PORT}`);
});

module.exports = { app, server, io };