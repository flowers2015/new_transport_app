const {
  getStageCandidates,
  assignFreight,
  getDriverPreferences,
} = require('../../controllers/dispatchController');

function invokeExpressHandler(handler, reqShape = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      params: reqShape.params || {},
      query: reqShape.query || {},
      body: reqShape.body || {},
      user: reqShape.user || null,
    };
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ statusCode, data });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function fetchStageCandidates({
  stage = 'stage1',
  category = '',
  forceStage2 = false,
  queueEntryId = null,
  userId = null,
}) {
  const { statusCode, data } = await invokeExpressHandler(getStageCandidates, {
    query: {
      stage,
      category,
      forceStage2: forceStage2 ? 'true' : 'false',
      queueEntryId: queueEntryId || '',
    },
    user: userId ? { id: userId, name: 'سیستم بله' } : null,
  });
  if (statusCode >= 400) {
    throw new Error(data?.message || 'خطا در دریافت کاندیداهای تخصیص');
  }
  return data;
}

async function assignFreightFromBale({
  stage,
  freightAnnouncementId,
  destinationId,
  driverId,
  vehicleId,
  queueEntryId,
  userId,
  userName,
}) {
  const { statusCode, data } = await invokeExpressHandler(assignFreight, {
    body: {
      stage,
      freightAnnouncementId,
      destinationId,
      driverId,
      vehicleId,
      queueEntryId,
    },
    user: userId ? { id: userId, name: userName || 'سیستم بله' } : null,
  });
  return { ok: statusCode < 400, statusCode, data };
}

async function fetchDriverPreferences({ driverId, from, to, category }) {
  const query = {};
  if (from) query.from = from;
  if (to) query.to = to;
  if (category) query.category = category;
  const { statusCode, data } = await invokeExpressHandler(getDriverPreferences, {
    params: { driverId },
    query,
    user: null,
  });
  if (statusCode >= 400) {
    throw new Error(data?.message || 'خطا در دریافت ترجیحات');
  }
  return data;
}

module.exports = {
  fetchStageCandidates,
  assignFreightFromBale,
  fetchDriverPreferences,
};
