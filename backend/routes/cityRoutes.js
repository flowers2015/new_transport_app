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
  importCitiesFromJson
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

// CRUD routes
router.get('/', getCities);
router.get('/:id', getCityById);
router.post('/', createCity);
router.put('/:id', updateCity);
router.delete('/:id', deleteCity);

// Import routes
router.post('/import-excel', upload.single('file'), importCitiesFromExcel);
router.post('/import-json', importCitiesFromJson);

module.exports = router;

