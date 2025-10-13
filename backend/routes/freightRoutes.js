const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getFreightAnnouncements,
  getFreightAnnouncementById,
  approveAnnouncement,
  rejectAnnouncement,
  assignVehicleAndDriver,
} = require('../controllers/freightController');

// Note: The roles 'PlanningManager' and 'Transportation Users' are placeholders.
// You should replace them with the actual roles defined in your user_role_enum.
// For example, 'Admin', 'LogisticsCoordinator', etc.

// GET routes for fetching freight announcements
router.get('/', authenticateToken, getFreightAnnouncements);
router.get('/:id', authenticateToken, getFreightAnnouncementById);

// Route to approve a freight announcement
// Accessible only by users with the 'PlanningManager' role.
router.post(
  '/:id/approve',
  authenticateToken,
  authorizeRole(['Admin', 'LogisticsCoordinator']), // Assuming LogisticsCoordinator is the PlanningManager
  approveAnnouncement
);

// Route to reject a freight announcement
// Accessible only by users with the 'PlanningManager' role.
router.post(
  '/:id/reject',
  authenticateToken,
  authorizeRole(['Admin', 'LogisticsCoordinator']), // Assuming LogisticsCoordinator is the PlanningManager
  rejectAnnouncement
);

// Route to assign a vehicle and driver to a freight announcement
// Accessible by 'Transportation Users'.
router.put(
  '/:id/assignment',
  authenticateToken,
  authorizeRole(['Admin', 'LogisticsCoordinator']), // Replace with appropriate roles
  assignVehicleAndDriver
);

module.exports = router;
