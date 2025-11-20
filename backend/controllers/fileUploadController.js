const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db');
const { formatJalali } = require('../utils/jalali');

// مسیر پایه ذخیره فایل‌ها
const BASE_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'freight-transactions');

// اطمینان از وجود پوشه پایه
if (!fs.existsSync(BASE_UPLOAD_DIR)) {
  fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true });
}

// تنظیمات multer - dynamic destination و filename
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // گرفتن branchCity از body یا query
      const branchCity = req.body.branchCity || req.query.branchCity || 'default';
      const safeBranchCity = branchCity.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_');
      
      // ایجاد پوشه برای شعبه
      const branchDir = path.join(BASE_UPLOAD_DIR, safeBranchCity);
      if (!fs.existsSync(branchDir)) {
        fs.mkdirSync(branchDir, { recursive: true });
      }
      
      cb(null, branchDir);
    } catch (error) {
      cb(error, BASE_UPLOAD_DIR);
    }
  },
  filename: async (req, file, cb) => {
    try {
      const announcementId = req.body.announcementId || req.query.announcementId;
      const transactionDateJalali = req.body.transactionDateJalali || req.query.transactionDateJalali;
      const billOfLadingNumber = req.body.billOfLadingNumber || req.query.billOfLadingNumber || '';
      const fileType = req.body.fileType || req.query.fileType || 'document'; // invoice, receipt, extra
      
      console.log('📝 [uploadFile] Request body:', {
        announcementId,
        transactionDateJalali,
        billOfLadingNumber,
        fileType,
        lineType: req.body.lineType,
        allBodyKeys: Object.keys(req.body)
      });
      
      // گرفتن لاین محصول - اول از body، سپس از database
      let lineType = req.body.lineType || req.query.lineType || '';
      if (!lineType && announcementId) {
        try {
          const result = await pool.query(
            'SELECT line_type FROM freight_announcements WHERE id = $1',
            [announcementId]
          );
          if (result.rows.length > 0 && result.rows[0].line_type) {
            lineType = result.rows[0].line_type;
            console.log('📝 [uploadFile] Fetched lineType from DB:', lineType);
          }
        } catch (error) {
          console.error('❌ [uploadFile] Error fetching line_type:', error);
        }
      }
      // اگر هنوز خالی است، از 'نامشخص' استفاده کن
      if (!lineType || lineType.trim() === '') {
        lineType = 'نامشخص';
      }
      console.log('📝 [uploadFile] Final lineType:', lineType);
      
      // نرمال‌سازی تاریخ شمسی - تبدیل / به - و اطمینان از فرمت YYYY-MM-DD
      let dateStr = transactionDateJalali || formatJalali(new Date());
      dateStr = dateStr.replace(/\//g, '-'); // تبدیل / به -
      // اطمینان از فرمت YYYY-MM-DD
      const dateParts = dateStr.split('-');
      if (dateParts.length === 3) {
        const year = dateParts[0];
        const month = String(dateParts[1]).padStart(2, '0');
        const day = String(dateParts[2]).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      }
      
      // نرمال‌سازی لاین محصول - حذف کاراکترهای غیرمجاز
      const safeLineType = lineType.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_');
      
      // نرمال‌سازی شماره بارنامه - حذف کاراکترهای غیرمجاز
      let safeBillOfLadingNumber = '';
      if (billOfLadingNumber && billOfLadingNumber.trim()) {
        safeBillOfLadingNumber = billOfLadingNumber.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_').trim();
      }
      // اگر بعد از normalize خالی شد، از 'بدون-بارنامه' استفاده کن
      if (!safeBillOfLadingNumber) {
        safeBillOfLadingNumber = 'بدون-بارنامه';
      }
      
      // نوع فایل (invoice, receipt, extra)
      const fileTypeMap = {
        'invoice': 'فاکتور',
        'receipt': 'رسید',
        'extra': 'سند-اضافی'
      };
      const fileTypeLabel = fileTypeMap[fileType] || 'سند';
      
      // پسوند فایل
      const ext = path.extname(file.originalname).toLowerCase();
      
      // استفاده از نام موقت - بعد از آپلود rename می‌کنیم
      const tempFilename = `temp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      
      cb(null, tempFilename);
    } catch (error) {
      console.error('❌ [uploadFile] Error generating filename:', error);
      // Fallback: استفاده از timestamp
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const ext = path.extname(file.originalname);
      cb(null, `file-${uniqueSuffix}${ext}`);
    }
  }
});

// فیلتر فایل‌ها - فقط تصاویر
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('فقط فایل‌های تصویری (jpg, png, gif) و PDF مجاز است'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB - افزایش limit برای فایل‌های بزرگتر
  },
  fileFilter: fileFilter
});

/**
 * آپلود فایل برای تراکنش‌های مالی
 * POST /api/v1/freight-transactions/upload
 * Body (multipart/form-data):
 *   - file: فایل برای آپلود
 *   - announcementId: شناسه اعلام بار
 *   - transactionDateJalali: تاریخ پرداخت شمسی (YYYY/MM/DD یا YYYY-MM-DD)
 *   - billOfLadingNumber: شماره بارنامه
 *   - fileType: نوع فایل (invoice, receipt, extra)
 *   - branchCity: شهر شعبه
 */
const uploadFile = (req, res) => {
  const uploadSingle = upload.single('file');
  
  // Log قبل از آپلود
  console.log('📤 [uploadFile] Starting upload, body keys:', Object.keys(req.body));
  console.log('📤 [uploadFile] Body values:', {
    announcementId: req.body.announcementId,
    transactionDateJalali: req.body.transactionDateJalali,
    billOfLadingNumber: req.body.billOfLadingNumber,
    fileType: req.body.fileType,
    lineType: req.body.lineType,
    branchCity: req.body.branchCity
  });
  
  uploadSingle(req, res, async (err) => {
    if (err) {
      console.error('❌ [uploadFile] Error:', err);
      return res.status(400).json({ 
        message: 'خطا در آپلود فایل', 
        details: err.message 
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'هیچ فایلی ارسال نشده است' });
    }

    // مسیر نسبی برای ذخیره در دیتابیس
    const relativePath = path.relative(path.join(__dirname, '..'), req.file.path);
    // تبدیل backslash به forward slash برای سازگاری با همه سیستم‌عامل‌ها
    const normalizedPath = relativePath.replace(/\\/g, '/');

    // حالا که body parse شده، نام فایل را تغییر بده
    const announcementId = req.body.announcementId;
    const transactionDateJalali = req.body.transactionDateJalali;
    const billOfLadingNumber = req.body.billOfLadingNumber || '';
    const fileType = req.body.fileType || 'document';
    
    // گرفتن لاین محصول
    let lineType = req.body.lineType || '';
    if (!lineType && announcementId) {
      try {
        const result = await pool.query(
          'SELECT line_type FROM freight_announcements WHERE id = $1',
          [announcementId]
        );
        if (result.rows.length > 0 && result.rows[0].line_type) {
          lineType = result.rows[0].line_type;
        }
      } catch (error) {
        console.error('❌ [uploadFile] Error fetching line_type:', error);
      }
    }
    if (!lineType || lineType.trim() === '') {
      lineType = 'نامشخص';
    }
    
    // نرمال‌سازی تاریخ
    let dateStr = transactionDateJalali || formatJalali(new Date());
    dateStr = dateStr.replace(/\//g, '-');
    const dateParts = dateStr.split('-');
    if (dateParts.length === 3) {
      const year = dateParts[0];
      const month = String(dateParts[1]).padStart(2, '0');
      const day = String(dateParts[2]).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    }
    
    // نرمال‌سازی
    const safeLineType = lineType.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_');
    let safeBillOfLadingNumber = '';
    if (billOfLadingNumber && billOfLadingNumber.trim()) {
      safeBillOfLadingNumber = billOfLadingNumber.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_').trim();
    }
    if (!safeBillOfLadingNumber) {
      safeBillOfLadingNumber = 'بدون-بارنامه';
    }
    
    const fileTypeMap = {
      'invoice': 'فاکتور',
      'receipt': 'رسید',
      'extra': 'سند-اضافی'
    };
    const fileTypeLabel = fileTypeMap[fileType] || 'سند';
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    // نام فایل جدید
    const newFilename = `${dateStr}-${safeLineType}-${safeBillOfLadingNumber}-${fileTypeLabel}${ext}`;
    
    // تغییر نام فایل
    const oldPath = req.file.path;
    const newPath = path.join(path.dirname(oldPath), newFilename);
    let finalPath = newPath;
    let finalFileName = newFilename;
    
    try {
      fs.renameSync(oldPath, newPath);
      console.log('✅ [uploadFile] File renamed:', {
        old: path.basename(oldPath),
        new: newFilename
      });
    } catch (renameError) {
      console.error('❌ [uploadFile] Error renaming file:', renameError);
      // اگر rename موفق نشد، از مسیر و نام قدیمی استفاده کن
      finalPath = oldPath;
      finalFileName = req.file.filename;
    }
    
    // مسیر نسبی نهایی
    const finalRelativePath = path.relative(path.join(__dirname, '..'), finalPath).replace(/\\/g, '/');

    console.log('✅ [uploadFile] File uploaded:', {
      originalName: req.file.originalname,
      savedPath: finalRelativePath,
      fileName: finalFileName,
      branchCity: req.body.branchCity || 'default',
      size: req.file.size,
      lineType,
      billOfLadingNumber: safeBillOfLadingNumber
    });

    res.json({
      success: true,
      filePath: finalRelativePath,
      fileName: finalFileName,
      originalName: req.file.originalname,
      size: req.file.size
    });
  });
};

/**
 * دریافت فایل
 * GET /api/v1/freight-transactions/files/:branchCity/:filename
 */
const getFile = (req, res) => {
  const branchCity = req.params.branchCity || req.query.branchCity || 'default';
  const filename = req.params.filename;
  const safeBranchCity = branchCity.replace(/[^a-zA-Z0-9آ-ی\-_]/g, '_');
  const branchDir = path.join(BASE_UPLOAD_DIR, safeBranchCity);
  const filePath = path.join(branchDir, filename);

  // بررسی وجود فایل
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'فایل یافت نشد' });
  }

  // ارسال فایل
  res.sendFile(filePath);
};

module.exports = {
  uploadFile,
  getFile,
  upload
};

