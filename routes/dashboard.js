const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.get('/mt', authenticate, dashboardController.getMtList);
router.post('/mt', authenticate, dashboardController.addMt);
router.post('/mt/active', authenticate, dashboardController.setActiveMt);
router.post('/fix', authenticate, dashboardController.fixNumber);
router.post('/banding', authenticate, dashboardController.generateBanding);
router.post('/upload-file', authenticate, upload.single('file'), dashboardController.uploadFile);

module.exports = router;
