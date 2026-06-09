const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const controller = require('../controllers/supportTicketController');

router.use(authenticateToken);

router.get('/', controller.listTickets);
router.get('/stats', controller.getTicketStats);
router.post('/', controller.createTicket);
router.patch('/:id', controller.updateTicket);

module.exports = router;
