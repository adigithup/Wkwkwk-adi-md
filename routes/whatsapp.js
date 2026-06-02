const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getAllSessions } = require('../controllers/whatsappController');

router.get('/sessions', authenticate, (req, res) => {
  res.json({ success: true, sessions: getAllSessions() });
});

module.exports = router;
