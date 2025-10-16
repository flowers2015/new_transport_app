const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getBranches, getBranchById, createBranch, updateBranch, deleteBranch } = require('../controllers/branchController');

// All branch routes require authentication
router.get('/', authenticateToken, getBranches);
router.get('/:id', authenticateToken, getBranchById);
router.post('/', authenticateToken, createBranch);
router.put('/:id', authenticateToken, updateBranch);
router.delete('/:id', authenticateToken, deleteBranch);

module.exports = router;



























