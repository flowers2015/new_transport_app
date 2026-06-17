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
  getAssignmentStatistics,
  getRepresentativeStatistics,
  getRepresentativeDetails,
  getCityStatistics,
  getCityDetails,
  getLineAnalytics,
  cancelAssignment,
  createFinanceExceptionTour,
  updateFinanceExceptionTour,
  finalizeFinanceExceptionMetadata,
  rejectFinanceTour,
  FINANCE_EXCEPTION_TRANSPORT_ROLES,
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

const { getPerformanceIndex, getPersonalPerformanceIndex } = require('../controllers/performanceIndexController');

const PLANNER_ROLES = [
  'planner',
  'planner_manager',
  'admin',
  'کارمند برنامه‌ریزی',
  'مدیر برنامه‌ریزی',
  'ادمین',
  'PlanningEmployee',
  'PlanningManager',
  'planning_employee',
  'planning_manager',
];

// Note: The roles 'PlanningManager' and 'Transportation Users' are placeholders.
// You should replace them with the actual roles defined in your user_role_enum.
// For example, 'Admin', 'LogisticsCoordinator', etc.

// GET routes for fetching freight announcements
router.get('/', authenticateToken, getFreightAnnouncements);

// Get freight history (Finalized announcements) with filters
router.get('/history', authenticateToken, getFreightHistory);

// Get transport statistics for dashboard
router.get('/statistics', authenticateToken, getTransportStatistics);

// Get assignment statistics (detailed statistics for finalized assignments)
router.get('/assignment-statistics', authenticateToken, getAssignmentStatistics);

// Get performance index (شاخص عملکرد)
router.get('/performance-index', authenticateToken, getPerformanceIndex);
router.get('/personal-performance-index', authenticateToken, getPersonalPerformanceIndex);

// Get representative statistics (for transport dashboard)
router.get('/representative-statistics', authenticateToken, getRepresentativeStatistics);

// Get representative details (vehicle assignments for a specific representative)
router.get('/representative-details', authenticateToken, getRepresentativeDetails);

// Get line analytics (per line/vehicle/destination medians)
router.get('/line-analytics', authenticateToken, getLineAnalytics);

router.get(
  '/routes/search',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'transport_finance', 'finance', 'admin']),
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
  authorizeRole(['transport_user', 'personal_transport_user', 'planner_manager', 'transport_finance', 'admin']),
  finalizeAssignments
);

// Get history for a specific announcement (must be before /:id route)
router.get(
  '/:id/history',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'finance', 'central_finance', 'transport_finance', 'viewer', 'admin']),
  getFreightAnnouncementHistory
);

// List change requests for planners (must be before /:id route)
router.get(
  '/change-requests',
  authenticateToken,
  authorizeRole(PLANNER_ROLES),
  listChangeRequests
);

// تور استثنایی مالی ترابری (قبل از /:id)
router.post(
  '/finance-exception',
  authenticateToken,
  authorizeRole(FINANCE_EXCEPTION_TRANSPORT_ROLES),
  createFinanceExceptionTour
);
router.put(
  '/:id/finance-exception',
  authenticateToken,
  authorizeRole(FINANCE_EXCEPTION_TRANSPORT_ROLES),
  updateFinanceExceptionTour
);
router.post(
  '/:id/finance-exception/finalize-metadata',
  authenticateToken,
  authorizeRole(FINANCE_EXCEPTION_TRANSPORT_ROLES),
  finalizeFinanceExceptionMetadata
);
router.post(
  '/:id/finance-reject',
  authenticateToken,
  authorizeRole(FINANCE_EXCEPTION_TRANSPORT_ROLES),
  rejectFinanceTour
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
// Accessible by planner, planner_manager, and admin
router.post(
  '/:id/approve',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'admin']),
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
const transportCancelRoles = [
  'transport_user',
  'personal_transport_user',
  'کاربر ترابری (شرکت)',
  'کاربر ترابری شرکت',
  'کاربر ترابری (خودرو شخصی)',
  'کاربر ترابری شخصی',
  'کاربر ترابری (شخصی)',
  'planner_manager',
  'مدیر برنامه‌ریزی',
  'admin',
  'ادمین',
];
router.post(
  '/:id/cancel',
  authenticateToken,
  authorizeRole(transportCancelRoles),
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
  authorizeRole(PLANNER_ROLES),
  approveChangeRequest
);

router.post(
  '/change-requests/:id/reject',
  authenticateToken,
  authorizeRole(PLANNER_ROLES),
  rejectChangeRequest
);

// Archive change request (remove from queue)
router.post(
  '/change-requests/:id/archive',
  authenticateToken,
  authorizeRole(PLANNER_ROLES),
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
