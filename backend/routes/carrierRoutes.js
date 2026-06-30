const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  listCarriers,
  getCarrierById,
  createCarrier,
  updateCarrier,
  listCarrierUsers,
  createCarrierUser,
  resetCarrierUserPassword,
  deleteCarrierUser,
} = require('../controllers/carrierController');

const CARRIER_READ_ROLES = [
  'admin',
  'ادمین',
  'personal_transport_user',
  'کاربر ترابری (خودرو شخصی)',
  'carrier_user',
  'transport_user',
  'planner',
  'planner_manager',
];

const CARRIER_WRITE_ROLES = [
  'admin',
  'ادمین',
  'personal_transport_user',
  'کاربر ترابری (خودرو شخصی)',
];

router.get(
  '/',
  authenticateToken,
  authorizeRole(CARRIER_READ_ROLES),
  listCarriers
);

router.get(
  '/:id',
  authenticateToken,
  authorizeRole(CARRIER_READ_ROLES),
  getCarrierById
);

router.post(
  '/',
  authenticateToken,
  authorizeRole(CARRIER_WRITE_ROLES),
  createCarrier
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRole(CARRIER_WRITE_ROLES),
  updateCarrier
);

router.get(
  '/:id/users',
  authenticateToken,
  authorizeRole(['admin', 'ادمین']),
  listCarrierUsers
);

router.post(
  '/:id/users',
  authenticateToken,
  authorizeRole(['admin', 'ادمین']),
  createCarrierUser
);

router.put(
  '/:id/users/:userId/password',
  authenticateToken,
  authorizeRole(['admin', 'ادمین']),
  resetCarrierUserPassword
);

router.delete(
  '/:id/users/:userId',
  authenticateToken,
  authorizeRole(['admin', 'ادمین']),
  deleteCarrierUser
);

module.exports = router;
