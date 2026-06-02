const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

let settings = {
  check_delay: 1000,
  active_mt_id: 0,
  email: '',
  email_pass: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587
};

if (require('fs').existsSync('settings.json')) {
  settings = JSON.parse(require('fs').readFileSync('settings.json', 'utf8'));
}

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (username !== adminUser) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, adminPass) || password === adminPass;
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const token = generateToken({ username, role: 'admin' });
    res.json({ success: true, token, message: 'Login successful' });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getProfile = (req, res) => {
  res.json({ success: true, user: req.user });
};

const getSettings = (req, res) => {
  res.json({ success: true, settings: { ...settings, email_pass: undefined } });
};

const saveSettings = (req, res) => {
  try {
    const newSettings = req.body;
    settings = { ...settings, ...newSettings };
    require('fs').writeFileSync('settings.json', JSON.stringify(settings, null, 2));
    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    logger.error('Save settings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, getProfile, getSettings, saveSettings };
