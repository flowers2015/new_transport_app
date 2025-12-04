const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  saveDriverCalculation,
  getDriverCalculations,
  getCalculationsByDateRange,
} = require('../controllers/driverCalculationController');

// POST /api/v1/driver-calculations - ذخیره محاسبات
router.post('/', authenticateToken, saveDriverCalculation);

// GET /api/v1/driver-calculations - دریافت محاسبات
router.get('/', authenticateToken, getDriverCalculations);

// GET /api/v1/driver-calculations/by-date-range - دریافت محاسبات بر اساس بازه تاریخ صدور بارنامه
router.get('/by-date-range', authenticateToken, getCalculationsByDateRange);

module.exports = router;

