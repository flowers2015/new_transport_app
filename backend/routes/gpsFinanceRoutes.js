const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  requireGpsFinance,
  getStatus,
  triggerFleetIngest,
  calculateTours,
  enrichDriving,
  applyTourSelection,
} = require('../controllers/gpsFinanceController');

const router = express.Router();

const FINANCE_ROLES = [
  'admin',
  'ادمین',
  'transport_finance',
  'مالی ترابری',
  'TransportationFinance',
  'transportation_finance',
];

router.get('/status', authenticateToken, authorizeRole(FINANCE_ROLES), getStatus);

router.post(
  '/ingest-now',
  authenticateToken,
  authorizeRole(FINANCE_ROLES),
  requireGpsFinance,
  triggerFleetIngest
);

router.post(
  '/calculate-tours',
  authenticateToken,
  authorizeRole(FINANCE_ROLES),
  requireGpsFinance,
  calculateTours
);

router.post(
  '/enrich-driving',
  authenticateToken,
  authorizeRole(FINANCE_ROLES),
  requireGpsFinance,
  enrichDriving
);

router.post(
  '/apply-selection',
  authenticateToken,
  authorizeRole(FINANCE_ROLES),
  requireGpsFinance,
  applyTourSelection
);

module.exports = router;
