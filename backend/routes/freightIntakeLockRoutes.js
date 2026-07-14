const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getFreightIntakeLocks,
  updateFreightIntakeLock,
} = require('../controllers/freightIntakeLockController');

router.get('/', authenticateToken, getFreightIntakeLocks);
router.put('/:lineType', authenticateToken, updateFreightIntakeLock);

module.exports = router;
