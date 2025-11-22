const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getSuppliers, getSupplierById } = require('../controllers/supplierController');

// All supplier routes require authentication
router.get('/', authenticateToken, getSuppliers);
router.get('/:id', authenticateToken, getSupplierById);

module.exports = router;












































