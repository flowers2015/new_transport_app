const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getPlanningManagers,
  getPlanningEmployees,
  getApprovalPermissions,
  checkApprovalPermission,
  addApprovalPermission,
  deleteApprovalPermission,
} = require('../controllers/planningManagerApprovalPermissionController');

// همه route ها نیاز به authentication دارند
router.get('/planning-managers', authenticateToken, getPlanningManagers);
router.get('/planning-employees', authenticateToken, getPlanningEmployees);
router.get('/permissions', authenticateToken, getApprovalPermissions);
router.get('/check', authenticateToken, checkApprovalPermission);
router.post('/permissions', authenticateToken, addApprovalPermission);
router.delete('/permissions/:id', authenticateToken, deleteApprovalPermission);

module.exports = router;

