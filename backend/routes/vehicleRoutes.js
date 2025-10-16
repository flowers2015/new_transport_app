const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getVehicles, getVehicleById, createVehicle, updateVehicle } = require('../controllers/vehicleController');

// All vehicle routes require authentication
router.get('/', authenticateToken, getVehicles);
router.get('/:id', authenticateToken, getVehicleById);
router.post('/', authenticateToken, createVehicle);
router.put('/:id', authenticateToken, updateVehicle);

module.exports = router;

