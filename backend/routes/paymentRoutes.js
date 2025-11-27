const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  savePayment,
  getLastPayment,
  getPayments,
} = require('../controllers/paymentController');

const financeRoles = ['finance', 'central_finance', 'transport_finance', 'admin'];

// ثبت پرداخت
router.post(
  '/',
  authenticateToken,
  authorizeRole(financeRoles),
  savePayment
);

// دریافت آخرین پرداخت برای یک راننده
router.get(
  '/last/:driverId',
  authenticateToken,
  authorizeRole(financeRoles),
  getLastPayment
);

// دریافت تمام پرداخت‌ها
router.get(
  '/',
  authenticateToken,
  authorizeRole(financeRoles),
  getPayments
);

module.exports = router;

