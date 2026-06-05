const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const baleController = require('../controllers/baleController');

const transportRoles = ['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin'];

router.post('/webhook', baleController.webhook);

router.get('/status', authenticateToken, authorizeRole(transportRoles), baleController.getStatus);
router.put('/channels/:slot', authenticateToken, authorizeRole(transportRoles), baleController.updateChannel);
router.get('/drivers/outreach', authenticateToken, authorizeRole(transportRoles), baleController.listDriverOutreach);
router.put('/drivers/:driverId/outreach', authenticateToken, authorizeRole(transportRoles), baleController.upsertDriverOutreach);
router.post('/test/seed-drivers', authenticateToken, authorizeRole(transportRoles), baleController.seedTestDrivers);
router.post('/test/ping', authenticateToken, authorizeRole(transportRoles), baleController.testPing);
router.post('/webhook/register', authenticateToken, authorizeRole(transportRoles), baleController.setWebhookUrl);

router.post('/sessions/start', authenticateToken, authorizeRole(transportRoles), baleController.startSession);
router.post('/sessions/stop', authenticateToken, authorizeRole(transportRoles), baleController.stopSession);
router.post('/sessions/skip-turn', authenticateToken, authorizeRole(transportRoles), baleController.skipTurn);
router.post('/sessions/extend-turn', authenticateToken, authorizeRole(transportRoles), baleController.extendTurn);
router.post('/sessions/manual-assign', authenticateToken, authorizeRole(transportRoles), baleController.manualAssign);
router.get('/sessions/:sessionId/logs', authenticateToken, authorizeRole(transportRoles), baleController.getSessionLogs);

router.get('/preference-brief/:driverId', authenticateToken, authorizeRole(transportRoles), baleController.getPreferenceBrief);

module.exports = router;
