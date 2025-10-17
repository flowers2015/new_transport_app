const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getParts, getPartById } = require('../controllers/partController');

// All part routes require authentication
router.get('/', authenticateToken, getParts);
router.get('/:id', authenticateToken, getPartById);

module.exports = router;





























