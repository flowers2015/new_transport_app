const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  saveDriverCalculation,
  getDriverCalculations,
  getCalculationsByDateRange,
  getPaidCalculations,
  debugListPaidCalculations,
  debugListAllCalculations,
  debugGetCalculation,
} = require('../controllers/driverCalculationController');

const financeRoles = ['finance', 'central_finance', 'transport_finance', 'admin'];

// POST /api/v1/driver-calculations - ذخیره محاسبات
router.post('/', authenticateToken, authorizeRole(financeRoles), saveDriverCalculation);

// GET /api/v1/driver-calculations - دریافت محاسبات
router.get('/', authenticateToken, authorizeRole(financeRoles), getDriverCalculations);

// GET /api/v1/driver-calculations/by-date-range - دریافت محاسبات بر اساس بازه تاریخ صدور بارنامه
router.get('/by-date-range', authenticateToken, authorizeRole(financeRoles), getCalculationsByDateRange);

// GET /api/v1/driver-calculations/paid - دریافت محاسبات پرداخت شده
router.get('/paid', authenticateToken, authorizeRole(financeRoles), getPaidCalculations);

// GET /api/v1/driver-calculations/debug/list-paid?driverId=xxx - Debug: لیست رکوردهای پرداخت شده
router.get('/debug/list-paid', authenticateToken, authorizeRole(financeRoles), debugListPaidCalculations);

// GET /api/v1/driver-calculations/debug/list-all?driverId=xxx OR ?employeeId=xxx - Debug: لیست همه محاسبات (برای تولید تصویر)
router.get('/debug/list-all', authenticateToken, authorizeRole(financeRoles), debugListAllCalculations);

// GET /api/v1/driver-calculations/debug/:driverId/:announcementId - Debug: دریافت تمام فیلدهای یک رکورد
router.get('/debug/:driverId/:announcementId', authenticateToken, authorizeRole(financeRoles), debugGetCalculation);

module.exports = router;

