const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateLogin } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

router.post('/login', validateLogin, authController.login);
router.get('/profile', authenticate, authController.getProfile);
router.get('/settings', authenticate, authController.getSettings);
router.post('/settings', authenticate, authController.saveSettings);

module.exports = router;
