const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getCities,
  getCityById,
  createCity,
  updateCity,
  deleteCity,
  importCitiesFromExcel,
  importCitiesFromJson,
  exportCitiesToJson,
  exportCitiesToExcel
} = require('../controllers/cityController');

// تنظیم multer برای آپلود فایل Excel
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های Excel (.xlsx, .xls) مجاز هستند'), false);
    }
  }
});

// همه route ها نیاز به احراز هویت دارند
router.use(authenticateToken);

const { authorizeRole } = require('../middleware/authMiddleware');

// CRUD routes - فقط admin و transport_finance دسترسی دارند
router.get('/', getCities);
router.get('/:id', getCityById);
router.post('/', authorizeRole(['admin', 'transport_finance']), createCity);
router.put('/:id', authorizeRole(['admin', 'transport_finance']), updateCity);
router.delete('/:id', authorizeRole(['admin', 'transport_finance']), deleteCity);

// Import routes - فقط admin و transport_finance دسترسی دارند
router.post('/import-excel', authorizeRole(['admin', 'transport_finance']), upload.single('file'), importCitiesFromExcel);
router.post('/import-json', authorizeRole(['admin', 'transport_finance']), importCitiesFromJson);

// Export routes
router.get('/export/json', exportCitiesToJson);
router.get('/export/excel', exportCitiesToExcel);

module.exports = router;

