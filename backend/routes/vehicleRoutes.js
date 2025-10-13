const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getVehicles, getVehicleById } = require('../controllers/vehicleController');

// All vehicle routes require authentication
router.get('/', authenticateToken, getVehicles);
router.get('/:id', authenticateToken, getVehicleById);

module.exports = router;

