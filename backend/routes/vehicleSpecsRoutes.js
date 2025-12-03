/**
 * مسیرهای API مشخصات خودرو
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getAllVehicleSpecs,
  getBrands,
  getModels,
  getTips,
  getVehicleSpecById,
  createVehicleSpec,
  updateVehicleSpec,
  deleteVehicleSpec,
  getCategories
} = require('../controllers/vehicleSpecsController');

// مسیرهای عمومی (برای انتخاب در فرم‌ها)
router.get('/categories', authenticateToken, getCategories);
router.get('/brands', authenticateToken, getBrands);
router.get('/models', authenticateToken, getModels);
router.get('/tips', authenticateToken, getTips);

// مسیرهای CRUD
router.get('/', authenticateToken, getAllVehicleSpecs);
router.get('/:id', authenticateToken, getVehicleSpecById);
router.post('/', authenticateToken, createVehicleSpec);
router.put('/:id', authenticateToken, updateVehicleSpec);
router.delete('/:id', authenticateToken, deleteVehicleSpec);

module.exports = router;

