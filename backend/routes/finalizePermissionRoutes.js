const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getTransportUsers,
  getFinalizePermissions,
  checkFinalizePermission,
  addFinalizePermission,
  deleteFinalizePermission,
} = require('../controllers/finalizePermissionController');

// همه route ها نیاز به authentication دارند
router.get('/transport-users', authenticateToken, getTransportUsers);
router.get('/permissions', authenticateToken, getFinalizePermissions);
router.get('/check', authenticateToken, checkFinalizePermission);
router.post('/permissions', authenticateToken, addFinalizePermission);
router.delete('/permissions/:id', authenticateToken, deleteFinalizePermission);

module.exports = router;

