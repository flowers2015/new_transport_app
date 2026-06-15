const express = require('express');
const router = express.Router();
const {
  getFinancialPeriods,
  checkPeriodStatus,
  closePeriod,
  reopenPeriod,
  archivePeriod,
  getPeriodTours,
  getDriverCommissionHistory,
  getAuditLogs
} = require('../controllers/financialPeriodController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// نقش‌های مالی
const financeRoles = ['finance', 'central_finance', 'transport_finance', 'admin', 'مالی ترابری', 'مالی مرکزی'];
// فقط ادمین می‌تونه دوره رو باز کنه
const adminRoles = ['admin'];

// دریافت همه دوره‌های مالی
router.get(
  '/periods',
  authenticateToken,
  authorizeRole(financeRoles),
  getFinancialPeriods
);

// تاریخچه پورسانت راننده در دوره‌های بسته (قبل از :periodId)
router.get(
  '/periods/driver-history',
  authenticateToken,
  authorizeRole(financeRoles),
  getDriverCommissionHistory
);

// دریافت تورهای یک دوره
router.get(
  '/periods/:periodId/tours',
  authenticateToken,
  authorizeRole(financeRoles),
  getPeriodTours
);

// بررسی وضعیت قبل از بستن دوره
router.get(
  '/periods/check',
  authenticateToken,
  authorizeRole(financeRoles),
  checkPeriodStatus
);

// بستن دوره مالی
router.post(
  '/periods/close',
  authenticateToken,
  authorizeRole(financeRoles),
  closePeriod
);

// باز کردن دوره مالی (فقط ادمین)
router.post(
  '/periods/reopen',
  authenticateToken,
  authorizeRole(adminRoles),
  reopenPeriod
);

// بایگانی دوره مالی
router.post(
  '/periods/archive',
  authenticateToken,
  authorizeRole(adminRoles),
  archivePeriod
);

// دریافت لاگ‌های تغییرات
router.get(
  '/audit-logs',
  authenticateToken,
  authorizeRole(adminRoles),
  getAuditLogs
);

module.exports = router;

