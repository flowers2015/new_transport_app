const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getFreightAnnouncements,
  getFreightAnnouncementById,
  approveAnnouncement,
  rejectAnnouncement,
  assignVehicleAndDriver,
  createFreightAnnouncement,
  updateFreightAnnouncement,
  setAssignmentQueue,
  deleteFreightAnnouncement,
  getFreightAnnouncementHistory,
} = require('../controllers/freightController');

// Note: The roles 'PlanningManager' and 'Transportation Users' are placeholders.
// You should replace them with the actual roles defined in your user_role_enum.
// For example, 'Admin', 'LogisticsCoordinator', etc.

// GET routes for fetching freight announcements
router.get('/', authenticateToken, getFreightAnnouncements);

// Get history for a specific announcement (must be before /:id route)
router.get(
  '/:id/history',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'finance', 'central_finance', 'transport_finance', 'admin']),
  getFreightAnnouncementHistory
);

router.get('/:id', authenticateToken, getFreightAnnouncementById);

// Create a new freight announcement
router.post(
  '/',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  createFreightAnnouncement
);

// Update an announcement (editable by planner before assignment, manager for status changes)
router.put(
  '/:id',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  updateFreightAnnouncement
);

// Route to approve a freight announcement
// Accessible only by users with the 'PlanningManager' role.
router.post(
  '/:id/approve',
  authenticateToken,
  authorizeRole(['planner_manager', 'admin']),
  approveAnnouncement
);

// Route to reject a freight announcement
// Accessible only by users with the 'PlanningManager' role.
router.post(
  '/:id/reject',
  authenticateToken,
  authorizeRole(['planner_manager', 'admin']),
  rejectAnnouncement
);

// Route to assign a vehicle and driver to a freight announcement
// Accessible by 'Transportation Users'.
router.put(
  '/:id/assignment',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner_manager', 'admin']),
  assignVehicleAndDriver
);

// Switch assignment queue between company/personal
router.post(
  '/:id/assignment-queue',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner_manager', 'admin']),
  setAssignmentQueue
);

// Delete an announcement (allowed for planner/manager/admin when not finalized)
router.delete(
  '/:id',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  deleteFreightAnnouncement
);

module.exports = router;
