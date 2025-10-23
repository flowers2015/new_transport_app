const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { 
  searchPersonalVehicles, 
  getPersonalVehicleByTruckSmartId, 
  createPersonalVehicle, 
  updatePersonalVehicle, 
  getAllPersonalVehicles 
} = require('../controllers/personalVehicleController');

// همه route ها نیاز به authentication دارند
router.get('/search', searchPersonalVehicles); // موقتاً بدون authentication
router.get('/truck-smart-id/:truckSmartId', authenticateToken, getPersonalVehicleByTruckSmartId);
router.get('/', authenticateToken, getAllPersonalVehicles);
router.post('/', authenticateToken, createPersonalVehicle);
router.put('/:id', authenticateToken, updatePersonalVehicle);

module.exports = router;
