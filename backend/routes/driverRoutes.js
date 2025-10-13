const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getDrivers, getDriverById } = require('../controllers/driverController');

// All driver routes require authentication
router.get('/', authenticateToken, getDrivers);
router.get('/:id', authenticateToken, getDriverById);

module.exports = router;


