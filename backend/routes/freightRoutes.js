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
  getFreightHistory,
  finalizeAssignments,
  getTransportStatistics,
  getRepresentativeStatistics,
  getRepresentativeDetails,
  getCityStatistics,
  getCityDetails,
  getLineAnalytics,
  cancelAssignment,
  searchDispatchRoutes,
  createChangeRequest,
  listChangeRequests,
  approveChangeRequest,
  rejectChangeRequest,
  archiveChangeRequest,
  transferDestination,
  getVehicleTypes,
  changeVehicleType,
} = require('../controllers/freightController');

// Note: The roles 'PlanningManager' and 'Transportation Users' are placeholders.
// You should replace them with the actual roles defined in your user_role_enum.
// For example, 'Admin', 'LogisticsCoordinator', etc.

// GET routes for fetching freight announcements
router.get('/', authenticateToken, getFreightAnnouncements);

// Get freight history (Finalized announcements) with filters
router.get('/history', authenticateToken, getFreightHistory);

// Get transport statistics for dashboard
router.get('/statistics', authenticateToken, getTransportStatistics);

// Get representative statistics (for transport dashboard)
router.get('/representative-statistics', authenticateToken, getRepresentativeStatistics);

// Get representative details (vehicle assignments for a specific representative)
router.get('/representative-details', authenticateToken, getRepresentativeDetails);

// Get line analytics (per line/vehicle/destination medians)
router.get('/line-analytics', authenticateToken, getLineAnalytics);

router.get(
  '/routes/search',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'admin']),
  searchDispatchRoutes
);

// Get city statistics (for transport dashboard)
router.get('/city-statistics', authenticateToken, getCityStatistics);

// Get city details (vehicle assignments for a specific city)
router.get('/city-details', authenticateToken, getCityDetails);

// Finalize assignments - اتمام تخصیص
router.post(
  '/finalize-assignments',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner_manager', 'admin']),
  finalizeAssignments
);

// Get history for a specific announcement (must be before /:id route)
router.get(
  '/:id/history',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'finance', 'central_finance', 'transport_finance', 'admin']),
  getFreightAnnouncementHistory
);

// List change requests for planners (must be before /:id route)
router.get(
  '/change-requests',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  listChangeRequests
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

// Cancel an assignment on an announcement (returns it to its queue)
router.post(
  '/:id/cancel',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user']),
  cancelAssignment
);

// Create change/split/merge request by transport
router.post(
  '/:id/change-request',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user']),
  createChangeRequest
);

// Approve/Reject change requests
router.post(
  '/change-requests/:id/approve',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  approveChangeRequest
);

router.post(
  '/change-requests/:id/reject',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  rejectChangeRequest
);

// Archive change request (remove from queue)
router.post(
  '/change-requests/:id/archive',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  archiveChangeRequest
);

// Switch assignment queue between company/personal
router.post(
  '/:id/assignment-queue',
  authenticateToken,
  authorizeRole(['planner', 'transport_user', 'personal_transport_user', 'planner_manager', 'admin']),
  setAssignmentQueue
);

// Get available vehicle types
router.get(
  '/vehicle-types',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin']),
  getVehicleTypes
);

// Transfer destination from one announcement to another
router.put(
  '/:id/transfer-destination',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin']),
  transferDestination
);

// Change vehicle type for an announcement
router.put(
  '/:id/vehicle-type',
  authenticateToken,
  authorizeRole(['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin']),
  changeVehicleType
);

// Delete an announcement (allowed for planner/manager/admin when not finalized)
router.delete(
  '/:id',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
  deleteFreightAnnouncement
);

module.exports = router;
