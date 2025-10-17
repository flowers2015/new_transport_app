const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getFuelCardRequests, getFuelCardRequestById } = require('../controllers/fuelCardController');

// All fuel card routes require authentication
router.get('/', authenticateToken, getFuelCardRequests);
router.get('/:id', authenticateToken, getFuelCardRequestById);

module.exports = router;





























