const pool = require('../db');

/**
 * ثبت یک رویداد در تاریخچه اعلام بار
 * @param {Object} params - پارامترهای ورودی
 * @param {string} params.announcementId - شناسه اعلام بار
 * @param {string} params.userId - شناسه کاربر
 * @param {string} params.userName - نام کاربر
 * @param {string} params.action - نوع عملیات
 * @param {string} params.oldStatus - وضعیت قبلی
 * @param {string} params.newStatus - وضعیت جدید
 * @param {Object} params.fieldChanges - تغییرات فیلدها
 * @param {string} params.description - شرح تغییر
 * @param {string} params.ipAddress - آدرس IP
 * @param {Object} params.client - کلاینت تراکنش (اختیاری)
 */
async function logFreightHistory({
  announcementId,
  userId,
  userName,
  action,
  oldStatus,
  newStatus,
  fieldChanges,
  description,
  ipAddress,
  client
}) {
  const query = `
    INSERT INTO freight_announcement_history 
      (freight_announcement_id, user_id, user_name, action, old_status, new_status, field_changes, description, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  
  const values = [
    announcementId,
    userId || null,
    userName || 'سیستم',
    action,
    oldStatus || null,
    newStatus || null,
    fieldChanges ? JSON.stringify(fieldChanges) : null,
    description,
    ipAddress || null
  ];
  
  try {
    if (client) {
      return await client.query(query, values);
    } else {
      return await pool.query(query, values);
    }
  } catch (error) {
    console.error('❌ [FreightHistory] Failed to log history:', error);
    // Don't throw - we don't want history logging to break the main operation
    return null;
  }
}

/**
 * مقایسه دو شیء و استخراج تغییرات
 * @param {Object} oldObj - شیء قبلی
 * @param {Object} newObj - شیء جدید
 * @param {Array<string>} fieldsToTrack - فیلدهایی که باید ردیابی شوند
 * @returns {Object|null} - تغییرات یا null
 */
function compareObjects(oldObj, newObj, fieldsToTrack) {
  const changes = {};
  
  for (const field of fieldsToTrack) {
    const oldValue = oldObj?.[field];
    const newValue = newObj?.[field];
    
    // Skip undefined values in new object
    if (newValue === undefined) continue;
    
    // مقایسه عمیق برای آرایه‌ها و آبجکت‌ها
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);
    
    if (oldStr !== newStr) {
      changes[field] = {
        old: oldValue,
        new: newValue
      };
    }
  }
  
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * مقایسه دقیق مقاصد و شناسایی تغییرات
 * این تابع تغییرات دقیق هر مقصد را شناسایی می‌کند
 * @param {Array} oldDestinations - مقاصد قبلی
 * @param {Array} newDestinations - مقاصد جدید
 * @returns {Object|null} - تغییرات دقیق مقاصد
 */
function compareDestinations(oldDestinations = [], newDestinations = []) {
  const changes = {};
  const maxLength = Math.max(oldDestinations.length, newDestinations.length);
  
  for (let i = 0; i < maxLength; i++) {
    const oldDest = oldDestinations[i];
    const newDest = newDestinations[i];
    
    // مقصد جدید اضافه شده
    if (!oldDest && newDest) {
      changes[`destination_${i + 1}_added`] = {
        old: null,
        new: {
          city: newDest.city,
          representativeName: newDest.representative_name || newDest.representativeName,
          tonnage: newDest.tonnage,
          unloadTime: newDest.unload_time || newDest.unloadTime,
          freightCost: newDest.freight_cost || newDest.freightCost
        }
      };
      continue;
    }
    
    // مقصد حذف شده
    if (oldDest && !newDest) {
      changes[`destination_${i + 1}_removed`] = {
        old: {
          city: oldDest.city,
          representativeName: oldDest.representative_name || oldDest.representativeName,
          tonnage: oldDest.tonnage,
          unloadTime: oldDest.unload_time || oldDest.unloadTime,
          freightCost: oldDest.freight_cost || oldDest.freightCost
        },
        new: null
      };
      continue;
    }
    
    // مقایسه فیلدهای مقصد موجود
    if (oldDest && newDest) {
      const destChanges = {};
      
      // شهر
      const oldCity = oldDest.city;
      const newCity = newDest.city;
      if (oldCity !== newCity) {
        destChanges.city = { old: oldCity, new: newCity };
      }
      
      // نام نماینده
      const oldRep = oldDest.representative_name || oldDest.representativeName;
      const newRep = newDest.representative_name || newDest.representativeName;
      if (oldRep !== newRep) {
        destChanges.representativeName = { old: oldRep, new: newRep };
      }
      
      // تناژ
      const oldTonnage = Number(oldDest.tonnage) || 0;
      const newTonnage = Number(newDest.tonnage) || 0;
      if (oldTonnage !== newTonnage) {
        destChanges.tonnage = { old: oldTonnage, new: newTonnage };
      }
      
      // ساعت تخلیه
      const oldUnload = oldDest.unload_time || oldDest.unloadTime;
      const newUnload = newDest.unload_time || newDest.unloadTime;
      if (oldUnload !== newUnload) {
        destChanges.unloadTime = { old: oldUnload, new: newUnload };
      }
      
      // کرایه (مهم!)
      const oldFreight = Number(oldDest.freight_cost || oldDest.freightCost) || 0;
      const newFreight = Number(newDest.freight_cost || newDest.freightCost) || 0;
      if (oldFreight !== newFreight) {
        destChanges.freightCost = { old: oldFreight, new: newFreight };
      }
      
      if (Object.keys(destChanges).length > 0) {
        changes[`destination_${i + 1}`] = destChanges;
      }
    }
  }
  
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * محاسبه کرایه کل از مقاصد
 * @param {Array} destinations - آرایه مقاصد
 * @returns {number} - مجموع کرایه‌ها
 */
function calculateTotalFreightCost(destinations = []) {
  return destinations.reduce((sum, dest) => {
    const cost = Number(dest.freight_cost || dest.freightCost) || 0;
    return sum + cost;
  }, 0);
}

/**
 * تولید توضیحات فارسی برای تغییرات
 * @param {string} action - نوع عملیات
 * @param {Object} fieldChanges - تغییرات فیلدها
 * @param {string} oldStatus - وضعیت قبلی
 * @param {string} newStatus - وضعیت جدید
 * @param {string} lineType - نوع لاین (بستنی، پاستوریزه، لبنیات)
 * @returns {string} - توضیحات فارسی
 */
function generateChangeDescription(action, fieldChanges, oldStatus, newStatus, lineType) {
  const descriptions = [];
  
  // تغییر وضعیت
  if (oldStatus && newStatus && oldStatus !== newStatus) {
    const statusLabels = {
      'Draft': 'پیش‌نویس',
      'PendingManagerApproval': 'در انتظار تایید مدیر',
      'PendingCompanyAssignment': 'در انتظار تخصیص شرکتی',
      'PendingPersonalAssignment': 'در انتظار تخصیص شخصی',
      'Assigned': 'تخصیص یافته',
      'InTransit': 'در حال حمل',
      'Delivered': 'تحویل داده شده',
      'Cancelled': 'لغو شده',
      'Rejected': 'رد شده',
      'رد شده': 'رد شده',
      'پیش‌نویس': 'پیش‌نویس',
      'در انتظار تایید مدیر': 'در انتظار تایید مدیر',
      'در انتظار تخصیص شرکتی': 'در انتظار تخصیص شرکتی',
      'در انتظار تخصیص شخصی': 'در انتظار تخصیص شخصی',
      'تخصیص یافته': 'تخصیص یافته',
      'در حال حمل': 'در حال حمل',
      'تحویل داده شده': 'تحویل داده شده',
      'لغو شده': 'لغو شده'
    };
    
    const oldStatusLabel = statusLabels[oldStatus] || oldStatus;
    const newStatusLabel = statusLabels[newStatus] || newStatus;
    descriptions.push(`وضعیت از "${oldStatusLabel}" به "${newStatusLabel}" تغییر کرد`);
  }
  
  // تغییرات فیلدها
  if (fieldChanges) {
    const fieldLabels = {
      // فیلدهای مشترک
      loadingDate: 'تاریخ بارگیری',
      loading_date: 'تاریخ بارگیری',
      cargoValue: 'ارزش بار',
      cargo_value: 'ارزش بار',
      vehicleType: 'نوع خودرو',
      vehicle_type: 'نوع خودرو',
      notes: 'توضیحات',
      assignedDriverId: 'راننده',
      assigned_driver_id: 'راننده',
      assignedVehicleId: 'خودرو',
      assigned_vehicle_id: 'خودرو',
      totalFreightCost: 'کرایه کل',
      total_freight_cost: 'کرایه کل',
      billOfLadingNumber: 'شماره بارنامه',
      bill_of_lading_number: 'شماره بارنامه',
      assignmentType: 'صف تخصیص',
      assignment_type: 'صف تخصیص',
      rejectionReason: 'علت رد',
      rejection_reason: 'علت رد',
      
      // فیلدهای بستنی
      originCity: 'مبدا',
      origin_city: 'مبدا',
      brand: 'برند',
      representativeType: 'نوع نماینده',
      representative_type: 'نوع نماینده',
      representativeName: 'نام نماینده',
      representative_name: 'نام نماینده',
      cartonCount: 'تعداد کارتن',
      carton_count: 'تعداد کارتن',
      priority: 'اولویت',
      products: 'محصولات',
      
      // فیلدهای پاستوریزه و لبنیات
      platformArrivalTime: 'ساعت حضور در سکو',
      platform_arrival_time: 'ساعت حضور در سکو'
    };
    
    for (const [field, change] of Object.entries(fieldChanges)) {
      // فیلتر تغییرات بی‌معنا
      // اگه از null/undefined به 0 تغییر کرده، نشون نده
      if ((change.old === null || change.old === undefined || change.old === '') && 
          (change.new === 0 || change.new === '0')) {
        continue;
      }
      
      // تغییرات مقاصد
      if (field.startsWith('destination_')) {
        if (field.endsWith('_added')) {
          const destNum = field.match(/\d+/)[0];
          descriptions.push(`مقصد ${destNum} اضافه شد (${change.new.city})`);
        } else if (field.endsWith('_removed')) {
          const destNum = field.match(/\d+/)[0];
          descriptions.push(`مقصد ${destNum} حذف شد (${change.old.city})`);
        } else {
          const destNum = field.match(/\d+/)[0];
          const subChanges = [];
          if (change.city) subChanges.push('شهر');
          if (change.representativeName) subChanges.push('نام نماینده');
          if (change.tonnage) subChanges.push('تناژ');
          if (change.unloadTime) subChanges.push('ساعت تخلیه');
          if (change.freightCost) subChanges.push(`کرایه (${formatNumber(change.freightCost.old)} ← ${formatNumber(change.freightCost.new)})`);
          
          if (subChanges.length > 0) {
            descriptions.push(`مقصد ${destNum}: ${subChanges.join('، ')}`);
          }
        }
      } else if (field === 'assignmentType') {
        // ترجمه صف تخصیص
        const oldQueue = change.old === 'company' ? 'شرکتی' : change.old === 'personal' ? 'شخصی' : change.old;
        const newQueue = change.new === 'company' ? 'شرکتی' : change.new === 'personal' ? 'شخصی' : change.new;
        descriptions.push(`صف تخصیص: ${oldQueue || '-'} ← ${newQueue}`);
      } else {
        const label = fieldLabels[field] || field;
        
        // نمایش مقدار قبل و بعد برای فیلدهای مهم (به جز totalFreightCost که در مرحله اول نباید نمایش داده شود)
        if (['cargoValue', 'cartonCount'].includes(field)) {
          // اگه هر دو مقدار معتبر باشند
          if ((change.old !== null && change.old !== undefined) || (change.new !== null && change.new !== undefined)) {
            descriptions.push(`${label}: ${formatNumber(change.old)} ← ${formatNumber(change.new)}`);
          }
        } else if (field === 'totalFreightCost') {
          // totalFreightCost رو نمایش نده (حذف شده)
          continue;
        } else if (field === 'products') {
          descriptions.push(`${label} تغییر کرد`);
        } else if (field === 'status') {
          // این قبلاً در بالا اضافه شده
          continue;
        } else {
          descriptions.push(`${label} تغییر کرد`);
        }
      }
    }
  }
  
  // اگه هیچ توضیحی نبود، یه توضیح کلی بده
  if (descriptions.length === 0) {
    const actionLabels = {
      CREATED: 'اعلام بار ایجاد شد',
      EDITED: 'اعلام بار ویرایش شد',
      STATUS_CHANGED: 'وضعیت تغییر کرد',
      APPROVED: 'اعلام بار تایید شد',
      REJECTED: 'اعلام بار رد شد',
      QUEUE_CHANGED: 'صف تخصیص تغییر کرد',
      ASSIGNED: 'راننده و خودرو تخصیص یافت',
      REASSIGNED: 'تخصیص تغییر کرد',
      DESTINATIONS_CHANGED: 'مقاصد تغییر کرد',
      PAYMENT_RECORDED: 'اطلاعات پرداخت ثبت شد',
      PAYMENT_CONFIRMED: 'پرداخت تایید شد',
      DELETED: 'اعلام بار حذف شد',
      REANNOUNCED: 'اعلام بار مجدد انجام شد'
    };
    return actionLabels[action] || 'تغییر انجام شد';
  }
  
  return descriptions.join(' • ');
}

/**
 * فرمت کردن اعداد برای نمایش
 */
function formatNumber(value) {
  if (!value && value !== 0) return '-';
  return Number(value).toLocaleString('fa-IR');
}

/**
 * دریافت تاریخچه کامل یک اعلام بار
 * @param {string} announcementId - شناسه اعلام بار
 * @returns {Array} - آرایه رویدادهای تاریخچه
 */
async function getAnnouncementHistory(announcementId) {
  const query = `
    SELECT 
      id,
      freight_announcement_id,
      user_id,
      user_name,
      action,
      old_status,
      new_status,
      field_changes,
      description,
      ip_address,
      created_at
    FROM freight_announcement_history
    WHERE freight_announcement_id = $1
    ORDER BY created_at DESC
  `;
  
  try {
    const { rows } = await pool.query(query, [announcementId]);
    return rows;
  } catch (error) {
    console.error('❌ [FreightHistory] Failed to get history:', error);
    return [];
  }
}

/**
 * دریافت آخرین رویداد تاریخچه
 * @param {string} announcementId - شناسه اعلام بار
 * @returns {Object|null} - آخرین رویداد یا null
 */
async function getLatestHistory(announcementId) {
  const query = `
    SELECT * FROM freight_announcement_history
    WHERE freight_announcement_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  try {
    const { rows } = await pool.query(query, [announcementId]);
    return rows[0] || null;
  } catch (error) {
    console.error('❌ [FreightHistory] Failed to get latest history:', error);
    return null;
  }
}

/**
 * شمارش رویدادهای تاریخچه
 * @param {string} announcementId - شناسه اعلام بار
 * @returns {number} - تعداد رویدادها
 */
async function countHistory(announcementId) {
  const query = `
    SELECT COUNT(*) as count
    FROM freight_announcement_history
    WHERE freight_announcement_id = $1
  `;
  
  try {
    const { rows } = await pool.query(query, [announcementId]);
    return parseInt(rows[0].count) || 0;
  } catch (error) {
    console.error('❌ [FreightHistory] Failed to count history:', error);
    return 0;
  }
}

module.exports = {
  logFreightHistory,
  compareObjects,
  compareDestinations,
  calculateTotalFreightCost,
  generateChangeDescription,
  getAnnouncementHistory,
  getLatestHistory,
  countHistory
};

