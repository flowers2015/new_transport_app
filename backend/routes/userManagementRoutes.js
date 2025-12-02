const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAdminActions
} = require('../controllers/userManagementController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// همه routes نیاز به authentication دارند
router.use(authenticateToken);

// فقط admin می‌تواند به این routes دسترسی داشته باشد
router.use(authorizeRole(['admin']));

// Routes برای مدیریت کاربران
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Routes برای مشاهده لاگ تغییرات
router.get('/admin-actions', getAdminActions);

module.exports = router;

