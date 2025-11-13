// Role-based Access Control Configuration
// تعریف سطح دسترسی‌ها برای هر نقش

const rolePermissions = {
  // نقش ادمین - دسترسی کامل به تمام بخش‌ها
  admin: {
    menus: [
      'dashboard',
      'freight_planning',
      'freight_tracking',
      'support_tickets',
      'invoice_management',
      'invoice_list',
      'branch_expense_report',
      'technician_management',
      'outsourcing',
      'alerts',
      'parts_consumption_report',
      'repair_order_registration',
      'branch_management',
      'vehicle_management',
      'vehicle_documents',
      'insurance_management',
      'driver_management',
      'supplier_management',
      'parts_warehouse',
      'purchase_procurement',
      'vehicle_allocation'
    ],
    description: 'مدیر سیستم - دسترسی کامل'
  },

  // کارمند برنامه‌ریزی
  planner: {
    menus: [
      'freight_planning',
      'freight_tracking',
      'support_tickets'
    ],
    description: 'کارمند برنامه‌ریزی'
  },

  // مدیر برنامه‌ریزی
  planner_manager: {
    menus: [
      'freight_planning',
      'freight_tracking',
      'support_tickets'
    ],
    description: 'مدیر برنامه‌ریزی'
  },

  // کاربر ترابری (شرکت)
  transport_user: {
    menus: [
      'freight_tracking'
    ],
    description: 'کاربر ترابری (شرکت)'
  },

  // کاربر ترابری (خودرو شخصی)
  personal_transport_user: {
    menus: [
      'freight_tracking'
    ],
    description: 'کاربر ترابری (خودرو شخصی)'
  },

  // مالی شعب
  finance: {
    menus: [
      'freight_tracking',
      'freight_finance',
      'invoice_registration',
      'invoice_list',
      'branch_expense_report',
      'support_tickets'
    ],
    description: 'مالی شعب'
  },

  // مالی مرکزی
  central_finance: {
    menus: [
      'freight_tracking',
      'freight_finance'
    ],
    description: 'مالی مرکزی'
  },

  // مالی ترابری
  transport_finance: {
    menus: [
      'freight_tracking',
      'freight_finance'
    ],
    description: 'مالی ترابری'
  },

  // تعمیرگاه
  workshop: {
    menus: [
      'technician_management',
      'outsourcing',
      'alerts',
      'parts_consumption_report',
      'support_tickets',
      'repair_order_registration'
    ],
    description: 'تعمیرگاه'
  },

  // ترابری (مدیریت ناوگان)
  transport: {
    menus: [
      'branch_management',
      'vehicle_management',
      'vehicle_documents',
      'insurance_management',
      'driver_management',
      'support_tickets',
      'repair_order_registration'
    ],
    description: 'ترابری (مدیریت ناوگان)'
  },

  // انبار
  warehouse: {
    menus: [
      'parts_warehouse',
      'purchase_procurement',
      'support_tickets'
    ],
    description: 'انبار'
  },

  // بازرگان (تدارکات)
  merchant: {
    menus: [
      'supplier_management',
      'parts_warehouse',
      'purchase_procurement'
    ],
    description: 'بازرگان (تدارکات)'
  },

  // کارشناس مدارک خودرو
  docs: {
    menus: [
      'vehicle_management',
      'vehicle_documents'
    ],
    description: 'کارشناس مدارک خودرو'
  },

  // کارشناس تصادفات
  accident: {
    menus: [
      'vehicle_management',
      'insurance_management'
    ],
    description: 'کارشناس تصادفات'
  },

  // کارشناس تغییر و تحول
  allocation: {
    menus: [
      'branch_management',
      'vehicle_management',
      'driver_management',
      'vehicle_allocation',
      'support_tickets'
    ],
    description: 'کارشناس تغییر و تحول'
  },

  // کارشناس بیمه
  insurance: {
    menus: [
      'vehicle_management',
      'insurance_management'
    ],
    description: 'کارشناس بیمه'
  }
};

// تابع برای بررسی دسترسی منو
function hasMenuAccess(userRole, menuName) {
  if (!rolePermissions[userRole]) {
    return false;
  }
  return rolePermissions[userRole].menus.includes(menuName);
}

// تابع برای دریافت منوهای قابل دسترسی برای یک نقش
function getAccessibleMenus(userRole) {
  if (!rolePermissions[userRole]) {
    return [];
  }
  return rolePermissions[userRole].menus;
}

// تابع برای دریافت اطلاعات نقش
function getRoleInfo(userRole) {
  return rolePermissions[userRole] || null;
}

// تابع برای دریافت تمام نقش‌ها
function getAllRoles() {
  return Object.keys(rolePermissions);
}

module.exports = {
  rolePermissions,
  hasMenuAccess,
  getAccessibleMenus,
  getRoleInfo,
  getAllRoles
};






































