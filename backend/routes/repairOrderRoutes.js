const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { 
  addPartUsage, 
  getRepairOrders, 
  getRepairOrderById, 
  getMyRepairOrders,
  getPartUsages,
  createOutsourcingRequest,
  assignTechnician,
  updateStatus
} = require('../controllers/repairOrderController');
const { logAudit } = require('../middleware/auditLogMiddleware');

// Route for technicians to get their assigned orders
router.get('/my-orders', authenticateToken, authorizeRole(['Technician']), getMyRepairOrders);

// Public or broadly accessible routes
router.get('/', authenticateToken, getRepairOrders); // Protect this as needed
router.get('/:id', authenticateToken, getRepairOrderById); // Protect this as needed

// This route is protected and will be audited
router.post(
  '/:id/part-usages',
  authenticateToken,
  authorizeRole(['Admin', 'Technician']), // Example: Only Admins and Technicians can add parts
  logAudit,
  addPartUsage
);

// Additional routes for repair order management
router.get('/:id/part-usages', authenticateToken, getPartUsages);
router.post('/:id/outsourcing-requests', authenticateToken, createOutsourcingRequest);
router.post('/:id/assign-technician', authenticateToken, assignTechnician);
router.patch('/:id/status', authenticateToken, updateStatus);

module.exports = router;
