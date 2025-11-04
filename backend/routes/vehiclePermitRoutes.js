const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getVehiclePermits, getVehiclePermitById } = require('../controllers/vehiclePermitController');

// All vehicle permit routes require authentication
router.get('/', authenticateToken, getVehiclePermits);
router.get('/:id', authenticateToken, getVehiclePermitById);

module.exports = router;




































