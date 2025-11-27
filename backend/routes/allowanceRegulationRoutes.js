const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getFoodRegulations,
  getHelperRegulations,
  getMileageRegulations,
  getExcessMissionRegulations,
  getMultiUnloadRegulations,
  saveFoodRegulation,
  saveHelperRegulation,
  saveMileageRegulation,
  saveExcessMissionRegulation,
  saveMultiUnloadRegulation,
  deleteFoodRegulation,
  deleteHelperRegulation,
  deleteMileageRegulation,
  deleteExcessMissionRegulation,
  deleteMultiUnloadRegulation,
  calculateAllowance,
  uploadRegulationDocument,
} = require('../controllers/allowanceRegulationController');

const financeRoles = ['finance', 'central_finance', 'transport_finance', 'admin'];

// Routes for Food Regulations
router.get(
  '/food',
  authenticateToken,
  authorizeRole(financeRoles),
  getFoodRegulations
);
router.post(
  '/food',
  authenticateToken,
  authorizeRole(financeRoles),
  saveFoodRegulation
);
router.delete(
  '/food/:id',
  authenticateToken,
  authorizeRole(financeRoles),
  deleteFoodRegulation
);

// Routes for Helper Allowance Regulations
router.get(
  '/helper',
  authenticateToken,
  authorizeRole(financeRoles),
  getHelperRegulations
);
router.post(
  '/helper',
  authenticateToken,
  authorizeRole(financeRoles),
  saveHelperRegulation
);
router.delete(
  '/helper/:id',
  authenticateToken,
  authorizeRole(financeRoles),
  deleteHelperRegulation
);

// Routes for Mileage Regulations
router.get(
  '/mileage',
  authenticateToken,
  authorizeRole(financeRoles),
  getMileageRegulations
);
router.post(
  '/mileage',
  authenticateToken,
  authorizeRole(financeRoles),
  saveMileageRegulation
);
router.delete(
  '/mileage/:id',
  authenticateToken,
  authorizeRole(financeRoles),
  deleteMileageRegulation
);

// Routes for Excess Mission Regulations
router.get(
  '/excess-mission',
  authenticateToken,
  authorizeRole(financeRoles),
  getExcessMissionRegulations
);
router.post(
  '/excess-mission',
  authenticateToken,
  authorizeRole(financeRoles),
  saveExcessMissionRegulation
);
router.delete(
  '/excess-mission/:id',
  authenticateToken,
  authorizeRole(financeRoles),
  deleteExcessMissionRegulation
);

// Routes for Multi Unload Regulations
router.get(
  '/multi-unload',
  authenticateToken,
  authorizeRole(financeRoles),
  getMultiUnloadRegulations
);
router.post(
  '/multi-unload',
  authenticateToken,
  authorizeRole(financeRoles),
  saveMultiUnloadRegulation
);
router.delete(
  '/multi-unload/:id',
  authenticateToken,
  authorizeRole(financeRoles),
  deleteMultiUnloadRegulation
);

// Route to calculate allowance
router.get(
  '/calculate',
  authenticateToken,
  authorizeRole(financeRoles),
  calculateAllowance
);

// Route to upload document
router.post(
  '/upload',
  authenticateToken,
  authorizeRole(financeRoles),
  uploadRegulationDocument
);

module.exports = router;
