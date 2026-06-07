const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getQueue,
  createQueueEntry,
  deleteQueueEntry,
  updateQueuePosition,
  getStageCandidates,
  assignFreight,
  getDriverPreferences,
  getBoard,
  searchVehicles,
  searchDrivers,
  getAssignmentContext,
  getQueueAssignmentHints,
  deferQueueTurn,
} = require('../controllers/dispatchController');

const transportRoles = ['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin'];

router.get(
  '/queue',
  authenticateToken,
  authorizeRole(transportRoles),
  getQueue
);

router.post(
  '/queue',
  authenticateToken,
  authorizeRole(transportRoles),
  createQueueEntry
);

router.delete(
  '/queue/:id',
  authenticateToken,
  authorizeRole(transportRoles),
  deleteQueueEntry
);

router.patch(
  '/queue/:id/position',
  authenticateToken,
  authorizeRole(transportRoles),
  updateQueuePosition
);

router.get(
  '/assignments/candidates',
  authenticateToken,
  authorizeRole(transportRoles),
  getStageCandidates
);

router.post(
  '/assignments',
  authenticateToken,
  authorizeRole(transportRoles),
  assignFreight
);

router.get(
  '/drivers/:driverId/preferences',
  authenticateToken,
  authorizeRole(transportRoles),
  getDriverPreferences
);

router.get(
  '/board',
  authenticateToken,
  authorizeRole(transportRoles),
  getBoard
);

router.get(
  '/search/vehicles',
  authenticateToken,
  authorizeRole(transportRoles),
  searchVehicles
);

router.get(
  '/search/drivers',
  authenticateToken,
  authorizeRole([...transportRoles, 'system_user']),
  searchDrivers
);

router.get(
  '/assignments/context',
  authenticateToken,
  authorizeRole(transportRoles),
  getAssignmentContext
);

router.get(
  '/queue/assign-hints',
  authenticateToken,
  authorizeRole(transportRoles),
  getQueueAssignmentHints
);

router.post(
  '/queue/:id/defer',
  authenticateToken,
  authorizeRole(transportRoles),
  deferQueueTurn
);

module.exports = router;

