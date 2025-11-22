const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getFreightTransactions,
  createFreightTransaction,
  referTransactionToHeadquarters,
  approveTransaction,
  rejectTransaction,
} = require('../controllers/freightController');
const { uploadFile, getFile } = require('../controllers/fileUploadController');

// GET /api/v1/freight-transactions - دریافت لیست تراکنش‌ها
router.get(
  '/',
  authenticateToken,
  getFreightTransactions
);

// POST /api/v1/freight-transactions - ایجاد تراکنش جدید
router.post(
  '/',
  authenticateToken,
  authorizeRole(['finance', 'central_finance', 'transport_finance', 'admin']),
  createFreightTransaction
);

// POST /api/v1/freight-transactions/upload - آپلود فایل
router.post(
  '/upload',
  authenticateToken,
  authorizeRole(['finance', 'central_finance', 'transport_finance', 'admin']),
  uploadFile
);

// GET /api/v1/freight-transactions/files/:branchCity/:filename - دریافت فایل
router.get(
  '/files/:branchCity/:filename',
  authenticateToken,
  getFile
);

// POST /api/v1/freight-transactions/:announcementId/refer - ارجاع تراکنش به ستاد مالی
router.post(
  '/:announcementId/refer',
  authenticateToken,
  authorizeRole(['finance', 'transport_finance', 'admin']),
  referTransactionToHeadquarters
);

// POST /api/v1/freight-transactions/:announcementId/approve - تأیید تراکنش توسط ستاد مالی
router.post(
  '/:announcementId/approve',
  authenticateToken,
  authorizeRole(['central_finance', 'admin']),
  approveTransaction
);

// POST /api/v1/freight-transactions/:announcementId/reject - رد تراکنش توسط ستاد مالی
router.post(
  '/:announcementId/reject',
  authenticateToken,
  authorizeRole(['central_finance', 'admin']),
  rejectTransaction
);

module.exports = router;

