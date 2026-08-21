const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  requireGpsAdminEnabled,
  getStatus,
  listModels,
  createModel,
  updateModel,
  listResources,
  listVehicleOptions,
  createResource,
  updateResource,
  deleteResource,
} = require('../controllers/gpsResourceController');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'ادمین', 'inspector', 'بازرسی'];

router.get('/status', authenticateToken, authorizeRole(ADMIN_ROLES), getStatus);

router.use(authenticateToken, authorizeRole(ADMIN_ROLES), requireGpsAdminEnabled);

router.get('/models', listModels);
router.post('/models', createModel);
router.put('/models/:id', updateModel);

router.get('/vehicle-options', listVehicleOptions);
router.get('/', listResources);
router.post('/', createResource);
router.put('/:id', updateResource);
router.delete('/:id', deleteResource);

module.exports = router;
