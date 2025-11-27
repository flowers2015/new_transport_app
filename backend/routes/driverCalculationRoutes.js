const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  saveDriverCalculation,
  getDriverCalculations,
} = require('../controllers/driverCalculationController');

// POST /api/v1/driver-calculations - ذخیره محاسبات
router.post('/', authenticateToken, saveDriverCalculation);

// GET /api/v1/driver-calculations - دریافت محاسبات
router.get('/', authenticateToken, getDriverCalculations);

module.exports = router;

