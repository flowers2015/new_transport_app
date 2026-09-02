const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  getWarehouses,
  getAllWarehouses,
  getOriginCities,
  getMyWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getAssignments,
  createAssignment,
  deleteAssignment,
  startLoading,
  endLoading,
  cancelLoading,
  reopenLoading,
  resetLoading,
  getWarehouseAnnouncements,
} = require('../controllers/warehouseController');

router.get('/', authenticateToken, authorizeRole(['admin']), getWarehouses);
router.get('/all', authenticateToken, authorizeRole(['admin']), getAllWarehouses);
router.get('/origin-cities', authenticateToken, authorizeRole(['admin']), getOriginCities);
router.get('/my', authenticateToken, getMyWarehouses);
router.post('/', authenticateToken, authorizeRole(['admin']), createWarehouse);

router.get('/assignments', authenticateToken, authorizeRole(['admin']), getAssignments);
router.post('/assignments', authenticateToken, authorizeRole(['admin']), createAssignment);
router.delete('/assignments/:id', authenticateToken, authorizeRole(['admin']), deleteAssignment);

router.get('/keeper-announcements', authenticateToken, getWarehouseAnnouncements);

router.put('/:id', authenticateToken, authorizeRole(['admin']), updateWarehouse);
router.delete('/:id', authenticateToken, authorizeRole(['admin']), deleteWarehouse);

router.post('/:id/start-loading', authenticateToken, startLoading);
router.post('/:id/end-loading', authenticateToken, endLoading);
router.post('/:id/cancel-loading', authenticateToken, cancelLoading);
router.post('/:id/reopen-loading', authenticateToken, reopenLoading);
router.post('/:id/reset-loading', authenticateToken, resetLoading);

module.exports = router;
