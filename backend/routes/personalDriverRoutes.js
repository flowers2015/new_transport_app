const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { 
  searchPersonalDrivers, 
  getPersonalDriverByNationalId, 
  createPersonalDriver, 
  updatePersonalDriver, 
  getAllPersonalDrivers,
  getPersonalDriverById,
  deletePersonalDriver
} = require('../controllers/personalDriverController');

// همه route ها نیاز به authentication دارند
router.get('/search', searchPersonalDrivers); // موقتاً بدون authentication
router.get('/national-id/:nationalId', authenticateToken, getPersonalDriverByNationalId);
router.get('/', authenticateToken, getAllPersonalDrivers);
router.get('/:id', authenticateToken, getPersonalDriverById);
router.post('/', authenticateToken, createPersonalDriver);
router.put('/:id', authenticateToken, updatePersonalDriver);
router.delete('/:id', authenticateToken, deletePersonalDriver);

module.exports = router;
