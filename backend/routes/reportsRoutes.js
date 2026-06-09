const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const reportsController = require('../controllers/reportsController');

const reportRoles = [
  'admin',
  'transport_user',
  'personal_transport_user',
  'transport_finance',
  'planner',
  'planner_manager',
  'finance',
  'central_finance',
];

router.get('/metabase', authenticateToken, authorizeRole(reportRoles), reportsController.getMetabaseConfig);

module.exports = router;
