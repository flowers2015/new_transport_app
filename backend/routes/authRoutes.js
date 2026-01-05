const express = require('express');
const router = express.Router();
const { login, changePassword, resetPassword } = require('../controllers/authController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

router.post('/login', login);

// تغییر رمز عبور توسط کاربر (نیاز به authentication دارد)
router.post('/change-password', authenticateToken, changePassword);

// ریست رمز عبور توسط ادمین (نیاز به authentication و admin role دارد)
router.post('/reset-password', authenticateToken, authorizeRole(['admin']), resetPassword);

module.exports = router;
