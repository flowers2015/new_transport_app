const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getTrafficFines, getTrafficFineById } = require('../controllers/trafficFineController');

// All traffic fine routes require authentication
router.get('/', authenticateToken, getTrafficFines);
router.get('/:id', authenticateToken, getTrafficFineById);

module.exports = router;


