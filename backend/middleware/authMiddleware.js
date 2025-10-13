const jwt = require('jsonwebtoken');
const { hasMenuAccess, getAccessibleMenus, getRoleInfo } = require('../config/rolePermissions');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authorizeRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: You do not have the required role.' });
    }
    next();
  };
}

// Middleware برای بررسی دسترسی به منو
function authorizeMenu(menuName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    
    if (!hasMenuAccess(req.user.role, menuName)) {
      return res.status(403).json({ 
        message: `Forbidden: You do not have access to ${menuName} menu.`,
        userRole: req.user.role,
        requiredMenu: menuName
      });
    }
    
    next();
  };
}

// Middleware برای دریافت اطلاعات نقش کاربر
function getUserRoleInfo(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  
  const roleInfo = getRoleInfo(req.user.role);
  const accessibleMenus = getAccessibleMenus(req.user.role);
  
  req.userRoleInfo = {
    role: req.user.role,
    description: roleInfo ? roleInfo.description : 'Unknown role',
    accessibleMenus: accessibleMenus
  };
  
  next();
}

module.exports = {
  authenticateToken,
  authorizeRole,
  authorizeMenu,
  getUserRoleInfo,
};
