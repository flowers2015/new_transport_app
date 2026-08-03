const express = require('express');
const { requireIntegrationApiKey } = require('../middleware/integrationApiKey');
const { lookupByLisCode } = require('../controllers/integrationLisController');

const router = express.Router();

// همه مسیرهای این روتر فقط با X-API-Key — فقط خواندنی
router.use(requireIntegrationApiKey);

/**
 * GET  /api/v1/integrations/lis-lookup?lisCode=...
 * POST /api/v1/integrations/lis-lookup  body: { "lisCode": "..." }
 */
router.get('/lis-lookup', lookupByLisCode);
router.post('/lis-lookup', lookupByLisCode);

module.exports = router;
