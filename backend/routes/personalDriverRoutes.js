const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { 
  searchPersonalDrivers, 
  getPersonalDriverByNationalId, 
  createPersonalDriver, 
  updatePersonalDriver, 
  getAllPersonalDrivers 
} = require('../controllers/personalDriverController');

// همه route ها نیاز به authentication دارند
router.get('/search', searchPersonalDrivers); // موقتاً بدون authentication
router.get('/national-id/:nationalId', authenticateToken, getPersonalDriverByNationalId);
router.get('/', authenticateToken, getAllPersonalDrivers);
router.post('/', authenticateToken, createPersonalDriver);
router.put('/:id', authenticateToken, updatePersonalDriver);

module.exports = router;
