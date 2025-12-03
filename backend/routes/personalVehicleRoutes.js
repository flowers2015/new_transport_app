const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { 
  searchPersonalVehicles, 
  getPersonalVehicleByTruckSmartId, 
  createPersonalVehicle, 
  updatePersonalVehicle, 
  getAllPersonalVehicles,
  getPersonalVehicleById,
  deletePersonalVehicle
} = require('../controllers/personalVehicleController');

// همه route ها نیاز به authentication دارند
router.get('/search', searchPersonalVehicles); // موقتاً بدون authentication
router.get('/truck-smart-id/:truckSmartId', authenticateToken, getPersonalVehicleByTruckSmartId);
router.get('/', authenticateToken, getAllPersonalVehicles);
router.get('/:id', authenticateToken, getPersonalVehicleById);
router.post('/', authenticateToken, createPersonalVehicle);
router.put('/:id', authenticateToken, updatePersonalVehicle);
router.delete('/:id', authenticateToken, deletePersonalVehicle);

module.exports = router;
