const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getAlerts, getAlertById } = require('../controllers/alertController');

// All alert routes require authentication
router.get('/', authenticateToken, getAlerts);
router.get('/:id', authenticateToken, getAlertById);

module.exports = router;

