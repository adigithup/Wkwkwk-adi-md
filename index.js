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

// ─── TELEGRAM BOT (Optional) ───
if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    logger.info('Telegram bot initialized');

    bot.onText(/\/connect/, (msg) => {
      bot.sendMessage(msg.chat.id, 'Silakan buka dashboard web untuk menghubungkan WhatsApp.');
    });

    bot.onText(/\/status/, (msg) => {
      bot.sendMessage(msg.chat.id, 'Status WhatsApp: Periksa dashboard web untuk info real-time.');
    });
  } catch (err) {
    logger.error('Telegram bot failed:', err.message);
  }
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
