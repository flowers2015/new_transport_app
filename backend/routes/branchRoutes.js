const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getBranches, getBranchById } = require('../controllers/branchController');

// All branch routes require authentication
router.get('/', authenticateToken, getBranches);
router.get('/:id', authenticateToken, getBranchById);

module.exports = router;



























