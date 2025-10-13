const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getInvoices, getInvoiceById } = require('../controllers/invoiceController');

// All invoice routes require authentication
router.get('/', authenticateToken, getInvoices);
router.get('/:id', authenticateToken, getInvoiceById);

module.exports = router;

