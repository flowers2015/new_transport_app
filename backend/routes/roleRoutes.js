const express = require('express');
const router = express.Router();
const { authenticateToken, getUserRoleInfo } = require('../middleware/authMiddleware');
const { getAllRoles, getRoleInfo, getAccessibleMenus, hasMenuAccess } = require('../config/rolePermissions');

// دریافت اطلاعات نقش کاربر فعلی
router.get('/current-user-role', authenticateToken, getUserRoleInfo, (req, res) => {
  res.json({
    success: true,
    data: req.userRoleInfo
  });
});

// دریافت تمام نقش‌های موجود
router.get('/all-roles', authenticateToken, (req, res) => {
  // فقط ادمین می‌تواند تمام نقش‌ها را ببیند
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'فقط ادمین می‌تواند تمام نقش‌ها را مشاهده کند' 
    });
  }

  const allRoles = getAllRoles();
  const rolesWithInfo = allRoles.map(role => ({
    role,
    ...getRoleInfo(role)
  }));

  res.json({
    success: true,
    data: rolesWithInfo
  });
});

// دریافت اطلاعات یک نقش خاص
router.get('/role/:roleName', authenticateToken, (req, res) => {
  const { roleName } = req.params;
  
  // فقط ادمین می‌تواند اطلاعات نقش‌ها را ببیند
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'فقط ادمین می‌تواند اطلاعات نقش‌ها را مشاهده کند' 
    });
  }

  const roleInfo = getRoleInfo(roleName);
  
  if (!roleInfo) {
    return res.status(404).json({
      success: false,
      message: 'نقش مورد نظر یافت نشد'
    });
  }

  res.json({
    success: true,
    data: {
      role: roleName,
      ...roleInfo
    }
  });
});

// بررسی دسترسی به یک منو خاص
router.post('/check-menu-access', authenticateToken, (req, res) => {
  const { menuName } = req.body;
  
  if (!menuName) {
    return res.status(400).json({
      success: false,
      message: 'نام منو الزامی است'
    });
  }

  const hasAccess = hasMenuAccess(req.user.role, menuName);
  
  res.json({
    success: true,
    data: {
      menuName,
      hasAccess,
      userRole: req.user.role
    }
  });
});

// دریافت منوهای قابل دسترسی برای کاربر فعلی
router.get('/accessible-menus', authenticateToken, (req, res) => {
  const accessibleMenus = getAccessibleMenus(req.user.role);
  
  res.json({
    success: true,
    data: {
      userRole: req.user.role,
      accessibleMenus
    }
  });
});

// دریافت منوهای قابل دسترسی برای یک نقش خاص
router.get('/role/:roleName/menus', authenticateToken, (req, res) => {
  const { roleName } = req.params;
  
  // فقط ادمین می‌تواند منوهای نقش‌های دیگر را ببیند
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'فقط ادمین می‌تواند منوهای نقش‌های دیگر را مشاهده کند' 
    });
  }

  const accessibleMenus = getAccessibleMenus(roleName);
  
  if (accessibleMenus.length === 0 && !getRoleInfo(roleName)) {
    return res.status(404).json({
      success: false,
      message: 'نقش مورد نظر یافت نشد'
    });
  }

  res.json({
    success: true,
    data: {
      role: roleName,
      accessibleMenus
    }
  });
});

module.exports = router;


























