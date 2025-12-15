const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  saveDriverCalculation,
  getDriverCalculations,
  getCalculationsByDateRange,
} = require('../controllers/driverCalculationController');

const financeRoles = ['finance', 'central_finance', 'transport_finance', 'admin'];

// POST /api/v1/driver-calculations - ذخیره محاسبات
router.post('/', authenticateToken, authorizeRole(financeRoles), saveDriverCalculation);

// GET /api/v1/driver-calculations - دریافت محاسبات
router.get('/', authenticateToken, authorizeRole(financeRoles), getDriverCalculations);

// GET /api/v1/driver-calculations/by-date-range - دریافت محاسبات بر اساس بازه تاریخ صدور بارنامه
router.get('/by-date-range', authenticateToken, authorizeRole(financeRoles), getCalculationsByDateRange);

module.exports = router;

