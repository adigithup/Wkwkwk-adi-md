const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const waSessions = new Map();
const RANDOM_NAMES = ["Luai", "Ahmad", "Rizky", "Budi", "Sari", "Dewi", "Putra", "Indra", "Rina", "Fajar"];
const APPEAL_MESSAGES = [
  "Hello WhatsApp team, my name is (NAME). I'm having trouble registering my phone number (+NUMBER). I keep getting a 'login unavailable' error. Please help me resolve this issue.",
  "Hola equipo de WhatsApp, me llamo (NAME). Estoy teniendo problemas para registrar mi numero de telefono (+NUMBER). Aparece el mensaje 'inicio de sesion no disponible'. Por favor, ayudenme a resolver este problema.",
  "Bonjour l'equipe WhatsApp, je m'appelle (NAME). J'ai des difficultes a enregistrer mon numero de telephone (+NUMBER). Le message 'connexion non disponible' apparait. Aidez-moi a resoudre ce probleme, s'il vous plait.",
  "Hallo WhatsApp-Team, mein Name ist (NAME). Ich habe Probleme bei der Registrierung meiner Telefonnummer (+NUMBER). Die Meldung 'Anmeldung nicht verfugbar' erscheint. Bitte helfen Sie mir, dieses Problem zu losen."
];

const formatNumber = (raw) => {
  let n = raw.replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.substring(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n;
};

const isValidNumber = (n) => n.length >= 10 && n.length <= 15;

const isRepeNumber = (number) => {
  const s = number.toString();
  if (/(\d)\1{2,}/.test(s)) return true;
  const d = s.split('').map(Number);
  let up = true, down = true;
  for (let i = 1; i < d.length; i++) {
    if (d[i] !== d[i-1]+1) up = false;
    if (d[i] !== d[i-1]-1) down = false;
  }
  if (up || down) return true;
  if (s === s.split('').reverse().join('')) return true;
  if (s.length % 2 === 0 && s.slice(0, s.length/2) === s.slice(s.length/2)) return true;
  return false;
};

const getVerificationPercentage = (number) => {
  const s = number.toString();
  if (isRepeNumber(number)) return 99;
  if (/(\d)\1{3,}/.test(s)) return 95;
  if (/(\d)\1{2,}/.test(s)) return 90;
  const d = s.split('').map(Number);
  let up = true, down = true;
  for (let i = 1; i < d.length; i++) {
    if (d[i] !== d[i-1]+1) up = false;
    if (d[i] !== d[i-1]-1) down = false;
  }
  if (up || down) return 85;
  if (s.length >= 6) {
    if (s.length % 2 === 0 && s.slice(0, s.length/2) === s.slice(s.length/2)) return 80;
    if (/(\d)\1(\d)\2(\d)\3/.test(s)) return 75;
  }
  if (s.length >= 12) return 70;
  if (s.length >= 10) return 60;
  if (s.length >= 8) return 50;
  return 40;
};

const getJamPercentage = (bio, setAt, metaBusiness) => {
  let base = 50;
  if (bio && bio.length > 0) {
    if (bio.length > 100) base -= 20;
    else if (bio.length > 50) base -= 15;
    else if (bio.length > 20) base -= 10;
    else base -= 5;
  } else { base += 15; }
  if (setAt) {
    const diff = Math.ceil(Math.abs(new Date() - new Date(setAt)) / 86400000);
    if (diff < 30) base -= 20;
    else if (diff < 90) base -= 10;
    else if (diff > 730) base += 25;
    else if (diff > 365) base += 15;
  } else { base += 10; }
  if (metaBusiness) base -= 25;
  return Math.round(Math.max(10, Math.min(90, base)) / 10) * 10;
};

const getRandomName = () => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
const getRandomAppealMessage = (name, number) => {
  const idx = Math.floor(Math.random() * APPEAL_MESSAGES.length);
  return APPEAL_MESSAGES[idx].replace('(NAME)', name).replace('+NUMBER', number);
};

const startSession = async (sessionId, socket) => {
  if (waSessions.has(sessionId) && waSessions.get(sessionId).isConnected) {
    return socket.emit('wa-status', { status: 'connected', number: waSessions.get(sessionId).number });
  }

  const authDir = `./auth_${sessionId}`;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const pino = require('pino');
  const loggerPino = pino({ level: 'silent' });
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: loggerPino,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  waSessions.set(sessionId, { sock, isConnected: false, number: '', reconnectAttempt: 0 });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      try {
        const qrImage = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        socket.emit('wa-qr', qrImage);
      } catch (err) {
        logger.error('QR Generate Error:', err);
      }
    }

    if (connection === 'close') {
      const session = waSessions.get(sessionId);
      if (session) {
        session.isConnected = false;
        session.reconnectAttempt = (session.reconnectAttempt || 0) + 1;
      }
      socket.emit('wa-status', { status: 'disconnected' });
      
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect && session && session.reconnectAttempt < 5) {
        logger.info(`Reconnecting session ${sessionId} (attempt ${session.reconnectAttempt})`);
        setTimeout(() => startSession(sessionId, socket), 5000 * session.reconnectAttempt);
      } else if (!shouldReconnect) {
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        waSessions.delete(sessionId);
      }
    } else if (connection === 'open') {
      const session = waSessions.get(sessionId);
      if (session) {
        session.isConnected = true;
        session.number = sock.user?.id?.split(':')[0] || '';
        session.reconnectAttempt = 0;
        socket.emit('wa-status', { status: 'connected', number: session.number });
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
};

const getPairingCode = async (sessionId, phone) => {
  const session = waSessions.get(sessionId);
  if (session?.sock && !session.isConnected) {
    try {
      const code = await session.sock.requestPairingCode(phone);
      return code.match(/.{1,4}/g)?.join('-') || code;
    } catch (e) {
      logger.error('Pairing code error:', e);
      throw new Error('Failed to get pairing code');
    }
  }
  throw new Error('Session not ready or already connected');
};

const disconnectSession = (sessionId) => {
  const session = waSessions.get(sessionId);
  if (session?.sock) {
    session.sock.ev.removeAllListeners();
    session.sock.end();
    session.isConnected = false;
  }
  const authDir = `./auth_${sessionId}`;
  if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  waSessions.delete(sessionId);
};

const checkSingleNumber = async (sock, num) => {
  try {
    const jid = num + '@s.whatsapp.net';
    const [check] = await sock.onWhatsApp(jid);
    if (!check?.exists) {
      return { number: num, registered: false, bio: null, setAt: null, metaBusiness: false, repe: isRepeNumber(num), verifPercent: getVerificationPercentage(num), jamPercentage: 0 };
    }

    let bioData = '', setAt = null, metaBusiness = false;
    try {
      await new Promise(r => setTimeout(r, 300));
      const sr = await sock.fetchStatus(jid);
      if (sr?.[0]?.status) {
        bioData = sr[0].status.status || '';
        setAt = sr[0].status.setAt ? new Date(sr[0].status.setAt) : null;
      }
    } catch {}
    try {
      const bp = await sock.getBusinessProfile(jid);
      metaBusiness = !!bp;
    } catch {}

    return {
      number: num,
      registered: true,
      bio: bioData,
      setAt,
      metaBusiness,
      repe: isRepeNumber(num),
      verifPercent: getVerificationPercentage(num),
      jamPercentage: getJamPercentage(bioData, setAt, metaBusiness)
    };
  } catch {
    return { number: num, registered: false, bio: null, setAt: null, metaBusiness: false, repe: isRepeNumber(num), verifPercent: getVerificationPercentage(num), jamPercentage: 0, error: true };
  }
};

const checkNumbers = async (sessionId, numbers, delay, onProgress) => {
  const session = waSessions.get(sessionId);
  if (!session?.isConnected) throw new Error('WhatsApp not connected');

  const valid = numbers.map(formatNumber).filter(isValidNumber);
  const results = [];

  for (let i = 0; i < valid.length; i += 5) {
    const batch = valid.slice(i, i + 5);
    const batchRes = await Promise.all(batch.map(n => checkSingleNumber(session.sock, n)));
    results.push(...batchRes);
    onProgress?.(Math.min(i + 5, valid.length), valid.length);
    if (i + 5 < valid.length) await new Promise(r => setTimeout(r, delay));
  }

  return results;
};

const checkRegistered = async (sessionId, numbers, onProgress) => {
  const session = waSessions.get(sessionId);
  if (!session?.isConnected) throw new Error('WhatsApp not connected');

  const valid = numbers.map(formatNumber).filter(isValidNumber);
  const registered = [], notRegistered = [];

  for (let i = 0; i < valid.length; i += 10) {
    const batch = valid.slice(i, i + 10);
    const res = await Promise.all(batch.map(async n => {
      try { const [chk] = await session.sock.onWhatsApp(n + '@s.whatsapp.net'); return { n, ok: !!(chk?.exists) }; }
      catch { return { n, ok: false }; }
    }));
    res.forEach(r => (r.ok ? registered : notRegistered).push(r.n));
    onProgress?.(Math.min(i + 10, valid.length), valid.length);
  }

  return { registered, notRegistered };
};

const getSession = (sessionId) => waSessions.get(sessionId);
const getAllSessions = () => Array.from(waSessions.entries()).map(([id, s]) => ({ id, isConnected: s.isConnected, number: s.number }));

module.exports = {
  startSession,
  getPairingCode,
  disconnectSession,
  checkNumbers,
  checkRegistered,
  getSession,
  getAllSessions,
  formatNumber,
  isValidNumber,
  isRepeNumber,
  getVerificationPercentage,
  getJamPercentage,
  getRandomName,
  getRandomAppealMessage,
  RANDOM_NAMES,
  APPEAL_MESSAGES
};
