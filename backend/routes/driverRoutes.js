const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getDrivers, getDriverById, createDriver, updateDriver, deleteDriver } = require('../controllers/driverController');

// All driver routes require authentication
router.get('/', authenticateToken, getDrivers);
router.get('/:id', authenticateToken, getDriverById);
router.post('/', authenticateToken, createDriver);
router.put('/:id', authenticateToken, updateDriver);
router.delete('/:id', authenticateToken, deleteDriver);

module.exports = router;



























