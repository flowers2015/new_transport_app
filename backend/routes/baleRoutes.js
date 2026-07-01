const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const baleController = require('../controllers/baleController');

const transportRoles = ['transport_user', 'personal_transport_user', 'planner', 'planner_manager', 'admin'];
const adminRoles = ['admin'];
const companyTransportRoles = baleController.companyTransportRoles;

const reportImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.post('/webhook', baleController.webhook);

router.get('/status', authenticateToken, authorizeRole(transportRoles), baleController.getStatus);
router.put('/settings/runtime', authenticateToken, authorizeRole(adminRoles), baleController.updateRuntimeSettings);
router.put('/channels/:slot', authenticateToken, authorizeRole(adminRoles), baleController.updateChannel);
router.get('/drivers/outreach', authenticateToken, authorizeRole(transportRoles), baleController.listDriverOutreach);
router.put('/drivers/:driverId/outreach', authenticateToken, authorizeRole(transportRoles), baleController.upsertDriverOutreach);
router.post('/test/seed-drivers', authenticateToken, authorizeRole(transportRoles), baleController.seedTestDrivers);
router.post('/test/ping', authenticateToken, authorizeRole(transportRoles), baleController.testPing);
router.post('/webhook/register', authenticateToken, authorizeRole(adminRoles), baleController.setWebhookUrl);

router.post('/sessions/start', authenticateToken, authorizeRole(transportRoles), baleController.startSession);
router.post('/sessions/stop', authenticateToken, authorizeRole(transportRoles), baleController.stopSession);
router.post('/sessions/skip-turn', authenticateToken, authorizeRole(transportRoles), baleController.skipTurn);
router.post('/sessions/extend-turn', authenticateToken, authorizeRole(transportRoles), baleController.extendTurn);
router.post('/sessions/manual-assign', authenticateToken, authorizeRole(transportRoles), baleController.manualAssign);
router.get('/sessions/:sessionId/logs', authenticateToken, authorizeRole(transportRoles), baleController.getSessionLogs);

router.get('/preference-brief/:driverId', authenticateToken, authorizeRole(transportRoles), baleController.getPreferenceBrief);

router.get('/report/recipients', authenticateToken, authorizeRole(companyTransportRoles), baleController.listReportRecipients);
router.post('/report/recipients', authenticateToken, authorizeRole(companyTransportRoles), baleController.createReportRecipient);
router.delete('/report/recipients/:id', authenticateToken, authorizeRole(companyTransportRoles), baleController.deleteReportRecipient);
router.post(
  '/report/send',
  authenticateToken,
  authorizeRole(companyTransportRoles),
  reportImageUpload.single('image'),
  baleController.sendCompanyReportToBale
);

router.get(
  '/settings/ambient-notify',
  authenticateToken,
  authorizeRole(baleController.ambientNotifyRoles),
  baleController.getAmbientNotifySettingsHandler
);
router.put(
  '/settings/ambient-notify',
  authenticateToken,
  authorizeRole(baleController.ambientNotifyRoles),
  baleController.updateAmbientNotifySettingsHandler
);
router.post(
  '/settings/ambient-notify/test',
  authenticateToken,
  authorizeRole(baleController.ambientNotifyRoles),
  baleController.testAmbientNotifyHandler
);

module.exports = router;
