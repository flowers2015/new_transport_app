const pool = require('../db');
const baleApi = require('../services/bale/baleApi');
const sessionEngine = require('../services/bale/baleSessionEngine');
const { buildPreferenceBrief } = require('../services/bale/balePreferenceBrief');
const { modeLabel, stageLabel } = require('../services/bale/baleFormat');
const {
  getRuntimeSettings,
  setRuntimeSettings,
} = require('../services/bale/baleSettings');
const {
  getDispatchChannelPlans,
  loadChannelRows,
  describeChannelBlocker,
  getCategoryQueueCounts,
} = require('../services/bale/baleCategoryChannels');
const { sendCompanyReport } = require('../services/bale/baleReportService');

const companyTransportRoles = [
  'transport_user',
  'کاربر ترابری (شرکت)',
  'کاربر ترابری شرکت',
  'TransportationUser',
];

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    modeLabel: modeLabel(row.mode),
    stage: row.stage,
    stageLabel: stageLabel(row.stage),
    vehicleCategory: row.vehicle_category,
    groupChannelSlot: row.group_channel_slot,
    currentTurnIndex: row.current_turn_index,
    turnTimeoutSec: row.turn_timeout_sec,
    turnDeadlineAt: row.turn_deadline_at,
    pendingSelection: row.pending_selection,
    queueSnapshot: row.queue_snapshot,
    eligibleAnnouncements: row.eligible_announcements,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function webhook(req, res) {
  try {
    if (!baleApi.isConfigured()) {
      return res.status(503).json({ ok: false });
    }
    const secret = process.env.BALE_WEBHOOK_SECRET;
    if (secret && req.headers['x-bale-webhook-secret'] !== secret) {
      return res.status(401).json({ ok: false });
    }
    sessionEngine.ensureTickTimer();
    await sessionEngine.processWebhookUpdate(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    console.error('❌ [bale] webhook error:', error);
    res.json({ ok: true });
  }
}

async function getStatus(req, res) {
  try {
    const configured = baleApi.isConfigured();
    let bot = null;
    if (configured) {
      try {
        bot = await baleApi.getMe();
      } catch (e) {
        bot = { error: e.message };
      }
    }
    const activeSessions = await sessionEngine.getActiveSessions();
    const runtime = await getRuntimeSettings();
    const { rows: channels } = await pool.query(
      `SELECT slot_number, chat_id, vehicle_category, label, is_active
       FROM bale_channels ORDER BY slot_number`
    );
    const [channelPlans, categoryQueues] = await Promise.all([
      getDispatchChannelPlans(),
      getCategoryQueueCounts(),
    ]);
    res.json({
      configured,
      bot,
      runtime,
      activeSession: activeSessions[0] ? mapSession(activeSessions[0]) : null,
      activeSessions: activeSessions.map(mapSession),
      channels,
      channelPlans,
      categoryQueues,
    });
  } catch (error) {
    console.error('❌ [bale] getStatus:', error);
    res.status(500).json({ message: 'خطا در وضعیت بله' });
  }
}

async function updateChannel(req, res) {
  const slot = Number(req.params.slot);
  if (!slot || slot < 1 || slot > 4) {
    return res.status(400).json({ message: 'اسلات نامعتبر' });
  }
  const { chatId, vehicleCategory, label, isActive, confirmClear } = req.body || {};
  try {
    const updates = [];
    const values = [slot];
    let idx = 2;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'chatId')) {
      if (chatId == null || chatId === '') {
        if (!confirmClear) {
          return res.status(400).json({
            message: 'برای پاک کردن chat_id گزینه تأیید حذف را فعال کنید.',
          });
        }
        updates.push(`chat_id = $${idx++}`);
        values.push(null);
      } else {
        updates.push(`chat_id = $${idx++}`);
        values.push(Number(chatId));
      }
    }
    if (vehicleCategory !== undefined) {
      updates.push(`vehicle_category = $${idx++}`);
      values.push(vehicleCategory ?? null);
    }
    if (label !== undefined) {
      updates.push(`label = $${idx++}`);
      values.push(label ?? null);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(Boolean(isActive));
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'فیلدی برای به‌روزرسانی ارسال نشده' });
    }

    updates.push('updated_at = NOW()');
    await pool.query(
      `UPDATE bale_channels SET ${updates.join(', ')} WHERE slot_number = $1`,
      values
    );
    const { rows } = await pool.query(
      `SELECT * FROM bale_channels WHERE slot_number = $1`,
      [slot]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ [bale] updateChannel:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی کانال' });
  }
}

async function listDriverOutreach(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         d.id AS driver_id,
         d.name AS driver_name,
         d.employee_id,
         d.mobile,
         o.outreach_chat_id,
         o.bale_user_id,
         o.is_test_simulation,
         o.notes,
         o.updated_at AS outreach_updated_at
       FROM drivers d
       LEFT JOIN bale_driver_outreach o ON o.driver_id = d.id
       WHERE (d.is_deleted IS NULL OR d.is_deleted = FALSE)
         AND d.employee_id IS NOT NULL
         AND TRIM(d.employee_id) <> ''
       ORDER BY d.name ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'خطا در لیست رانندگان بله' });
  }
}

async function updateRuntimeSettings(req, res) {
  try {
    const { environment } = req.body || {};
    const runtime = await setRuntimeSettings({ environment });
    res.json(runtime);
  } catch (error) {
    res.status(500).json({ message: 'خطا در ذخیره حالت اجرا' });
  }
}

async function upsertDriverOutreach(req, res) {
  const { driverId } = req.params;
  const { outreachChatId, employeeId, isTestSimulation, notes } = req.body || {};
  if (!driverId || outreachChatId == null) {
    return res.status(400).json({ message: 'driverId و outreachChatId الزامی است' });
  }
  try {
    let emp = employeeId;
    if (!emp) {
      const { rows } = await pool.query(`SELECT employee_id FROM drivers WHERE id = $1`, [driverId]);
      emp = rows[0]?.employee_id;
    }
    if (!emp) {
      return res.status(400).json({ message: 'کد پرسنلی راننده یافت نشد' });
    }
    await pool.query(
      `INSERT INTO bale_driver_outreach
        (driver_id, employee_id, outreach_chat_id, is_test_simulation, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (driver_id)
       DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         outreach_chat_id = EXCLUDED.outreach_chat_id,
         is_test_simulation = EXCLUDED.is_test_simulation,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [driverId, emp, Number(outreachChatId), Boolean(isTestSimulation), notes || null]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'خطا در ذخیره ارتباط راننده' });
  }
}

async function seedTestDrivers(req, res) {
  const { outreachChatId, limit } = req.body || {};
  if (outreachChatId == null) {
    return res.status(400).json({ message: 'outreachChatId الزامی است' });
  }
  try {
    const linked = await sessionEngine.seedTestDrivers(Number(outreachChatId), limit || 10);
    res.json({ linked, count: linked.length });
  } catch (error) {
    res.status(500).json({ message: error.message || 'خطا در seed' });
  }
}

async function testPing(req, res) {
  const { chatId, text } = req.body || {};
  if (!chatId) return res.status(400).json({ message: 'chatId الزامی است' });
  try {
    const result = await baleApi.sendMessage(
      Number(chatId),
      text || '✅ تست اتصال بازوی اعلام بار'
    );
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function setWebhookUrl(req, res) {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ message: 'url الزامی است' });
  try {
    await baleApi.setWebhook(url);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function startSession(req, res) {
  try {
    const {
      mode = 'hybrid',
      stage = 'stage1',
      turnTimeoutSec = 180,
      forceStage2 = false,
      forceRestart = false,
      vehicleCategory,
      slot,
    } = req.body || {};
    sessionEngine.ensureTickTimer();

    if (vehicleCategory || slot != null) {
      const [plans, channelRows] = await Promise.all([
        getDispatchChannelPlans(),
        loadChannelRows(),
      ]);
      const plan = slot != null
        ? plans.find(p => p.slot === Number(slot))
        : plans.find(p => p.category === vehicleCategory);
      if (!plan) {
        return res.status(400).json({
          message: describeChannelBlocker(channelRows, { vehicleCategory, slot }),
        });
      }

      const session = await sessionEngine.startSessionForCategory({
        mode,
        stage,
        turnTimeoutSec,
        userId: req.user?.userId || req.user?.id,
        forceStage2,
        vehicleCategory: plan.category,
        groupChannelSlot: plan.slot,
      });
      return res.json({
        sessions: [mapSession(session)],
        started: 1,
        errors: [],
        skipped: [],
        pilotCombined: Boolean(plan.pilotCombined),
        stoppedPrior: 0,
        forceRestart: false,
        category: plan.category,
      });
    }

    const result = await sessionEngine.startAllCategorySessions({
      mode,
      stage,
      turnTimeoutSec,
      userId: req.user?.userId || req.user?.id,
      forceStage2,
      forceRestart,
    });
    res.json({
      sessions: result.sessions.map(mapSession),
      started: result.started,
      errors: result.errors,
      skipped: result.skipped,
      pilotCombined: result.pilotCombined,
      stoppedPrior: result.stoppedPrior,
      forceRestart: result.forceRestart,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function resolveSessionFromRequest(req) {
  const { sessionId } = req.body || {};
  if (sessionId) {
    const session = await sessionEngine.loadSession(sessionId);
    if (!session) return { error: 'جلسه یافت نشد', status: 404 };
    if (!['running', 'awaiting_admin', 'awaiting_confirm'].includes(session.status)) {
      return { error: 'این جلسه فعال نیست', status: 400 };
    }
    return { session };
  }

  const sessions = await sessionEngine.getActiveSessions();
  if (sessions.length === 0) return { error: 'جلسه فعالی نیست', status: 404 };
  if (sessions.length > 1) {
    return {
      error: 'چند جلسه فعال است — sessionId را مشخص کنید',
      status: 400,
      sessionIds: sessions.map(s => s.id),
    };
  }
  return { session: sessions[0] };
}

async function stopSession(req, res) {
  try {
    const { sessionId, vehicleCategory } = req.body || {};

    if (sessionId) {
      const session = await sessionEngine.loadSession(sessionId);
      if (!session) return res.status(404).json({ message: 'جلسه یافت نشد' });
      if (['completed', 'stopped'].includes(session.status)) {
        return res.status(400).json({ message: 'این جلسه از قبل متوقف شده' });
      }
      const stopped = await sessionEngine.stopSession(sessionId);
      return res.json({ sessions: [mapSession(stopped)], stopped: 1 });
    }

    if (vehicleCategory) {
      const active = await sessionEngine.getActiveSessions();
      const session = active.find(
        s => s.vehicle_category === vehicleCategory
      );
      if (!session) {
        return res.status(404).json({
          message: `جلسه فعالی برای «${vehicleCategory}» نیست`,
        });
      }
      const stopped = await sessionEngine.stopSession(session.id);
      return res.json({ sessions: [mapSession(stopped)], stopped: 1 });
    }

    const sessions = await sessionEngine.getActiveSessions();
    if (sessions.length === 0) return res.status(404).json({ message: 'جلسه فعالی نیست' });
    const stopped = await sessionEngine.stopAllSessions();
    res.json({ sessions: stopped.map(mapSession), stopped: stopped.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function skipTurn(req, res) {
  try {
    const resolved = await resolveSessionFromRequest(req);
    if (resolved.error) {
      return res.status(resolved.status).json({
        message: resolved.error,
        sessionIds: resolved.sessionIds,
      });
    }
    const updated = await sessionEngine.skipCurrentTurn(resolved.session.id);
    res.json(mapSession(updated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function extendTurn(req, res) {
  try {
    const resolved = await resolveSessionFromRequest(req);
    if (resolved.error) {
      return res.status(resolved.status).json({
        message: resolved.error,
        sessionIds: resolved.sessionIds,
      });
    }
    const extraSec = Number(req.body?.extraSec) || 120;
    const updated = await sessionEngine.extendCurrentTurn(resolved.session.id, extraSec);
    res.json(mapSession(updated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function manualAssign(req, res) {
  try {
    const resolved = await resolveSessionFromRequest(req);
    if (resolved.error) {
      return res.status(resolved.status).json({
        message: resolved.error,
        sessionIds: resolved.sessionIds,
      });
    }
    const updated = await sessionEngine.manualAssign(resolved.session.id, req.body, req.user?.id);
    res.json(mapSession(updated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function getSessionLogs(req, res) {
  const sessionId = req.params.sessionId;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bale_session_logs WHERE session_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [sessionId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'خطا در لاگ' });
  }
}

async function getPreferenceBrief(req, res) {
  const { driverId } = req.params;
  const { freightAnnouncementId } = req.query || {};
  try {
    let announcement = null;
    if (freightAnnouncementId) {
      const { rows } = await pool.query(
        `SELECT fa.id, fa.announcement_code, fa.line_type, fa.origin_city,
                (SELECT string_agg(city, '-') FROM freight_destinations fd
                 WHERE fd.freight_announcement_id = fa.id) AS destination_cities
         FROM freight_announcements fa WHERE fa.id = $1`,
        [freightAnnouncementId]
      );
      if (rows[0]) {
        announcement = {
          announcementCode: rows[0].announcement_code,
          lineType: rows[0].line_type,
          originCity: rows[0].origin_city,
          destinationCity: rows[0].destination_cities,
        };
      }
    }
    const brief = await buildPreferenceBrief(driverId, {
      category: req.query.category,
      announcement,
    });
    res.json(brief);
  } catch (error) {
    res.status(500).json({ message: error.message || 'خطا در ترجیحات' });
  }
}

function getUserId(req) {
  return req.user?.userId || req.user?.id;
}

async function listReportRecipients(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'کاربر شناسایی نشد.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, label, chat_id, is_default, created_at, updated_at
       FROM bale_report_recipients
       WHERE user_id = $1
       ORDER BY is_default DESC, label ASC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('❌ [bale] listReportRecipients:', error);
    res.status(500).json({ message: 'خطا در بارگذاری مخاطبین' });
  }
}

async function createReportRecipient(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'کاربر شناسایی نشد.' });
  }
  const { label, chatId, isDefault } = req.body || {};
  if (!label || !String(label).trim()) {
    return res.status(400).json({ message: 'نام مخاطب الزامی است.' });
  }
  const chat_id = Number(chatId);
  if (!Number.isFinite(chat_id)) {
    return res.status(400).json({ message: 'chat_id عددی معتبر وارد کنید.' });
  }
  try {
    if (isDefault) {
      await pool.query(
        `UPDATE bale_report_recipients SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }
    const { rows } = await pool.query(
      `INSERT INTO bale_report_recipients (user_id, label, chat_id, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, chat_id) DO UPDATE SET
         label = EXCLUDED.label,
         is_default = EXCLUDED.is_default,
         updated_at = NOW()
       RETURNING id, label, chat_id, is_default, created_at, updated_at`,
      [userId, String(label).trim(), chat_id, Boolean(isDefault)]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('❌ [bale] createReportRecipient:', error);
    res.status(500).json({ message: 'خطا در ذخیره مخاطب' });
  }
}

async function deleteReportRecipient(req, res) {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  if (!userId || !id) {
    return res.status(400).json({ message: 'درخواست نامعتبر' });
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM bale_report_recipients WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!rowCount) {
      return res.status(404).json({ message: 'مخاطب یافت نشد.' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('❌ [bale] deleteReportRecipient:', error);
    res.status(500).json({ message: 'خطا در حذف مخاطب' });
  }
}

async function sendCompanyReportToBale(req, res) {
  let { chatId, format, rows, imageBase64 } = req.body || {};
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      return res.status(400).json({ message: 'فرمت rows نامعتبر است.' });
    }
  }
  const imageBuffer = req.file?.buffer;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const inferredBase = host ? `${forwardedProto || req.protocol}://${host}` : '';
  const publicBaseUrl = process.env.PUBLIC_API_BASE_URL || inferredBase;
  try {
    const result = await sendCompanyReport({
      chatId: chatId ?? req.body?.chat_id,
      format,
      rows,
      imageBase64,
      imageBuffer,
      imageMimeType: req.file?.mimetype,
      publicBaseUrl,
    });
    res.json(result);
  } catch (error) {
    console.error('❌ [bale] sendCompanyReport:', error);
    res.status(400).json({ message: error.message || 'خطا در ارسال به بله' });
  }
}

module.exports = {
  webhook,
  getStatus,
  updateRuntimeSettings,
  updateChannel,
  listDriverOutreach,
  upsertDriverOutreach,
  seedTestDrivers,
  testPing,
  setWebhookUrl,
  startSession,
  stopSession,
  skipTurn,
  extendTurn,
  manualAssign,
  getSessionLogs,
  getPreferenceBrief,
  companyTransportRoles,
  listReportRecipients,
  createReportRecipient,
  deleteReportRecipient,
  sendCompanyReportToBale,
};
