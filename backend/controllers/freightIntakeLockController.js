const {
  INTAKE_LOCK_MESSAGE,
  listFreightIntakeLocks,
  setLineIntakeLock,
} = require('../services/freightIntakeLockService');

const TRANSPORT_ROLES = new Set([
  'transport_user',
  'personal_transport_user',
  'کاربر ترابری (شرکت)',
  'کاربر ترابری (خودرو شخصی)',
  'کاربر ترابری شرکت',
  'کاربر ترابری شخصی',
  'کاربر ترابری (شخصی)',
  'ترابری',
  'TransportationUser',
  'Transportation_Personal_Vehicle_User',
  'admin',
  'Admin',
  'مدیر سیستم',
]);

function resolveActingUser(req) {
  const userId = req.user?.userId || req.user?.id || null;
  const username = req.user?.username || '';
  const name = req.user?.name || req.user?.fullName || '';
  const userName =
    username && name ? `${username} - ${name}` : username || name || 'کاربر ترابری';
  return { userId, userName, role: req.user?.role || '' };
}

function canToggleIntakeLock(role) {
  return TRANSPORT_ROLES.has(role);
}

/**
 * GET /api/v1/freight-intake-locks
 */
async function getFreightIntakeLocks(req, res) {
  try {
    const locks = await listFreightIntakeLocks();
    return res.json({ locks, message: INTAKE_LOCK_MESSAGE });
  } catch (error) {
    console.error('❌ [getFreightIntakeLocks]', error);
    return res.status(500).json({ message: 'خطا در دریافت وضعیت قفل اعلام‌بار' });
  }
}

/**
 * PUT /api/v1/freight-intake-locks/:lineType
 * body: { locked: boolean }
 */
async function updateFreightIntakeLock(req, res) {
  const { userId, userName, role } = resolveActingUser(req);
  if (!canToggleIntakeLock(role)) {
    return res.status(403).json({
      message: 'فقط کاربران ترابری می‌توانند قفل اعلام‌بار جدید را تغییر دهند.',
    });
  }

  const lineType = req.params.lineType;
  const locked = req.body?.locked;
  if (typeof locked !== 'boolean') {
    return res.status(400).json({ message: 'مقدار locked باید boolean باشد.' });
  }

  try {
    const lock = await setLineIntakeLock({
      lineType,
      isLocked: locked,
      userId,
      userName,
    });

    try {
      const realtimeService = require('../services/realtimeService');
      realtimeService.notifyGeneralUpdate(
        'freight_intake_lock_changed',
        {
          lineType: lock.lineType,
          isLocked: lock.isLocked,
          updatedByUserId: lock.updatedByUserId,
          updatedByUserName: lock.updatedByUserName,
          updatedAt: lock.updatedAt,
        },
        userId
      );
    } catch (realtimeError) {
      console.error('❌ [updateFreightIntakeLock] realtime:', realtimeError);
    }

    return res.json({
      ...lock,
      message: lock.isLocked
        ? 'قفل اعلام‌بار جدید برای این تب فعال شد.'
        : 'قفل اعلام‌بار جدید برای این تب برداشته شد.',
    });
  } catch (error) {
    console.error('❌ [updateFreightIntakeLock]', error);
    return res.status(error.statusCode || 500).json({
      message: error.message || 'خطا در تغییر قفل اعلام‌بار',
    });
  }
}

module.exports = {
  getFreightIntakeLocks,
  updateFreightIntakeLock,
};
