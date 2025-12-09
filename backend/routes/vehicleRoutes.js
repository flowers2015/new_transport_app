const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/authMiddleware');
const { getVehicles, getVehicleById, createVehicle, updateVehicle, importCompanyVehiclesFromExcel } = require('../controllers/vehicleController');

// تنظیمات multer برای آپلود فایل اکسل
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'excel-imports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'company-vehicles-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const excelUpload = multer({
  storage: excelStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های اکسل (.xlsx, .xls) مجاز هستند'), false);
    }
  }
});

// All vehicle routes require authentication
router.get('/', authenticateToken, getVehicles);
router.get('/:id', authenticateToken, getVehicleById);
router.post('/', authenticateToken, createVehicle);
router.post('/import-excel', authenticateToken, excelUpload.single('file'), importCompanyVehiclesFromExcel);
router.put('/:id', authenticateToken, updateVehicle);

module.exports = router;

