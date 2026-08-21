const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getStatus,
  searchDrivers,
  lookupVehicle,
  lookupDriver,
} = require('../controllers/gpsLiveController');

const router = express.Router();

const LIVE_ROLES = [
  'admin',
  'ادمین',
  'transport_finance',
  'مالی ترابری',
  'TransportationFinance',
  'transportation_finance',
  'کاربر ترابری (شرکت)',
  'TransportationUser',
  'transportation_user',
  'transport_user',
  'کاربر ترابری (خودرو شخصی)',
  'کاربر ترابری (شخصی)',
  'Transportation_Personal_Vehicle_User',
  'transportation_personal',
  'personal_transport_user',
  'ترابری',
  'transport',
  'Transportation',
  'کارمند برنامه‌ریزی',
  'مدیر برنامه‌ریزی',
  'کارشناس فروش',
  'planner',
  'planner_manager',
  'sales_expert',
];

router.get('/status', authenticateToken, authorizeRole(LIVE_ROLES), getStatus);

router.get(
  '/search-drivers',
  authenticateToken,
  authorizeRole(LIVE_ROLES),
  searchDrivers
);

router.post(
  '/lookup-vehicle',
  authenticateToken,
  authorizeRole(LIVE_ROLES),
  lookupVehicle
);

router.post(
  '/lookup-driver',
  authenticateToken,
  authorizeRole(LIVE_ROLES),
  lookupDriver
);

module.exports = router;
