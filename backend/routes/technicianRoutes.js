const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getTechnicians, getTechnicianById } = require('../controllers/technicianController');

// All technician routes require authentication
router.get('/', authenticateToken, getTechnicians);
router.get('/:id', authenticateToken, getTechnicianById);

module.exports = router;



























