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

router.use(authorizeRole(['admin', 'branch_finance_manager']));

router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

router.get('/admin-actions', authorizeRole(['admin']), getAdminActions);

module.exports = router;

