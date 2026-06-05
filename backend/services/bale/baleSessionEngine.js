const pool = require('../../db');
const baleApi = require('./baleApi');
const {
  fetchStageCandidates,
  assignFreightFromBale,
} = require('./baleDispatchBridge');
const {
  filterEligibleForDriver,
  pickAutoAnnouncement,
  canSemiAutoAssign,
} = require('./baleDecision');
const {
  buildPreferenceBrief,
  incrementAutoAssignStats,
} = require('./balePreferenceBrief');
const {
  formatCountdown,
  formatAnnouncementList,
  formatQueueSnapshot,
  formatAnnouncementRow,
  formatAnnouncementRowHtml,
  formatAnnouncementListHtml,
  formatAssignmentGroupMessage,
  formatGroupStageTitle,
  stageLabel,
  parseRowNumber,
  looksLikeDriverSelectionAttempt,
} = require('./baleFormat');
const { enrichAnnouncements } = require('./baleAnnouncementEnrich');
const {
  getDispatchChannelPlans,
  announcementMatchesCategory,
} = require('./baleCategoryChannels');

const TICK_MS = 15000;
let tickTimer = null;
let timerRunning = false;

async function logEvent(sessionId, eventType, payload = {}) {
  await pool.query(
    `INSERT INTO bale_session_logs (session_id, event_type, payload) VALUES ($1, $2, $3)`,
    [sessionId, eventType, JSON.stringify(payload)]
  );
}

async function loadSession(sessionId) {
  const { rows } = await pool.query(`SELECT * FROM bale_sessions WHERE id = $1`, [sessionId]);
  return rows[0] || null;
}

async function getActiveSessions() {
  const { rows } = await pool.query(
    `SELECT * FROM bale_sessions
     WHERE status IN ('running', 'awaiting_admin', 'awaiting_confirm')
     ORDER BY vehicle_category NULLS LAST, updated_at DESC`
  );
  return rows;
}

async function getActiveSession() {
  const sessions = await getActiveSessions();
  return sessions[0] || null;
}

async function getActiveSessionForCategory(vehicleCategory) {
  const { rows } = await pool.query(
    `SELECT * FROM bale_sessions
     WHERE status IN ('running', 'awaiting_admin', 'awaiting_confirm')
       AND vehicle_category IS NOT DISTINCT FROM $1
     ORDER BY updated_at DESC LIMIT 1`,
    [vehicleCategory || null]
  );
  return rows[0] || null;
}

async function findSessionForInbound(chatId) {
  const sessions = await getActiveSessions();
  if (sessions.length === 0) return null;

  const matchingTurn = [];
  for (const session of sessions) {
    if (['completed', 'stopped'].includes(session.status)) continue;
    const entry = currentTurnEntry(session);
    if (!entry) continue;
    const driverId = entry.driverId || entry.driver_id;
    const outreach = await getDriverOutreach(driverId);
    if (outreach && String(outreach.outreach_chat_id) === String(chatId)) {
      matchingTurn.push(session);
    }
  }

  if (matchingTurn.length === 1) return matchingTurn[0];
  if (matchingTurn.length > 1) {
    const pending = matchingTurn.find(s => s.status === 'awaiting_confirm');
    return pending || matchingTurn[0];
  }

  for (const session of sessions) {
    if (session.status !== 'awaiting_confirm' || !session.pending_selection) continue;
    const pending =
      typeof session.pending_selection === 'object'
        ? session.pending_selection
        : JSON.parse(session.pending_selection);
    const outreach = await getDriverOutreach(pending.driverId);
    if (outreach && String(outreach.outreach_chat_id) === String(chatId)) {
      return session;
    }
  }

  return null;
}

let groupChatIdsCache = { at: 0, ids: new Set() };

async function getBaleGroupChatIds() {
  if (Date.now() - groupChatIdsCache.at < 60_000) return groupChatIdsCache.ids;
  const { rows } = await pool.query(
    `SELECT chat_id FROM bale_channels WHERE chat_id IS NOT NULL AND is_active = TRUE`
  );
  groupChatIdsCache = {
    at: Date.now(),
    ids: new Set(rows.map(r => String(r.chat_id))),
  };
  return groupChatIdsCache.ids;
}

async function isBaleGroupChat(chatId) {
  const ids = await getBaleGroupChatIds();
  return ids.has(String(chatId));
}

function isGroupLikeChat(chat) {
  const type = chat?.type;
  return type === 'group' || type === 'supergroup' || type === 'channel';
}

async function updateSession(sessionId, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await pool.query(
    `UPDATE bale_sessions SET ${sets}, updated_at = NOW() WHERE id = $1`,
    [sessionId, ...values]
  );
}

async function getChannelChatId(slot) {
  const { rows } = await pool.query(
    `SELECT chat_id FROM bale_channels WHERE slot_number = $1 AND is_active = TRUE`,
    [slot]
  );
  return rows[0]?.chat_id || null;
}

async function getDriverOutreach(driverId) {
  const { rows } = await pool.query(
    `SELECT * FROM bale_driver_outreach WHERE driver_id = $1`,
    [driverId]
  );
  return rows[0] || null;
}

function parseQueueSnapshot(session) {
  const raw = session.queue_snapshot;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function parseAnnouncements(session) {
  const raw = session.eligible_announcements;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function parseRejected(session) {
  const raw = session.rejected_rows;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function currentTurnEntry(session) {
  const queue = parseQueueSnapshot(session);
  return queue[session.current_turn_index] || null;
}

function confirmKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ تأیید', callback_data: `bale_confirm:${sessionId}` },
        { text: '❌ انصراف', callback_data: `bale_cancel:${sessionId}` },
      ],
    ],
  };
}

async function sendToDriver(driverId, text, options = {}) {
  const outreach = await getDriverOutreach(driverId);
  if (!outreach?.outreach_chat_id) {
    throw new Error(`chat ارسال برای راننده ${driverId} تنظیم نشده`);
  }
  return baleApi.sendMessage(outreach.outreach_chat_id, text, options);
}

async function sendGroupMessage(session, text, options = {}) {
  if (!session?.group_channel_slot) return;
  const groupChatId = await getChannelChatId(session.group_channel_slot);
  if (!groupChatId) return;
  try {
    await baleApi.sendMessage(Number(groupChatId), text, {
      parseMode: options.parseMode,
    });
  } catch (err) {
    if (options.parseMode) {
      try {
        await baleApi.sendMessage(Number(groupChatId), text.replace(/<[^>]+>/g, ''));
        return;
      } catch (_) {}
    }
    throw err;
  }
}

async function announceToGroup(session, text, options = {}) {
  try {
    await sendGroupMessage(session, text, options);
  } catch (err) {
    console.warn('⚠️ [bale] group announce:', err.message);
    await logEvent(session.id, 'group_announce_failed', { error: err.message });
  }
}

async function broadcastSessionStartToGroup(session, queue, announcements, stage, vehicleCategory) {
  const list = (announcements || []).slice(0, 30);

  await sendGroupMessage(
    session,
    `📋 <b>نوبت</b>${vehicleCategory ? ` — ${vehicleCategory}` : ''}\n\n${formatQueueSnapshot(queue)}`,
    { parseMode: 'HTML' }
  );

  await sendGroupMessage(
    session,
    `📦 <b>لیست بارها</b>\n\n${formatAnnouncementListHtml(announcements)}`,
    { parseMode: 'HTML' }
  );

  await sendGroupMessage(session, formatGroupStageTitle(stage, vehicleCategory), {
    parseMode: 'HTML',
  });

  await logEvent(session.id, 'group_broadcast', {
    type: 'session_start',
    queueMessage: true,
    announcementCount: list.length,
    stageTitle: true,
  });
}

async function freezeCurrentTurnPv(session, text) {
  if (!session?.current_turn_message_id || !session?.current_turn_chat_id) return;
  try {
    await baleApi.editMessageText(session.current_turn_chat_id, session.current_turn_message_id, text);
  } catch (err) {
    if (!String(err.message).includes('message is not modified')) {
      console.warn('⚠️ [bale] freeze turn pv:', err.message);
    }
  }
}

async function clearTurnTimer(sessionId, { freezeText = null } = {}) {
  const session = await loadSession(sessionId);
  if (!session) return;
  if (freezeText) {
    await freezeCurrentTurnPv(session, freezeText);
  }
  await updateSession(sessionId, {
    turn_deadline_at: null,
    current_turn_message_id: null,
    current_turn_chat_id: null,
  });
}

async function getLastTurnStartedAt(sessionId) {
  const { rows } = await pool.query(
    `SELECT payload FROM bale_session_logs
     WHERE session_id = $1 AND event_type = 'turn_started'
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  const startedAt = rows[0]?.payload?.startedAt;
  return startedAt ? new Date(startedAt) : null;
}

function filterQueueByCategory(queue, vehicleCategory) {
  return (queue || []).filter(
    item => (item.vehicleCategory || item.vehicle_category || '') === vehicleCategory
  );
}

function stageFetchOpts(session) {
  return {
    userId: session?.started_by_user_id,
    forceStage2: session?.stage === 'stage2',
  };
}

async function loadStagePayload(stage, vehicleCategory, { userId, forceStage2 = false } = {}) {
  const candidates = await fetchStageCandidates({
    stage,
    category: vehicleCategory,
    forceStage2,
    userId,
  });
  const queue = filterQueueByCategory(candidates.queue, vehicleCategory);
  let announcements = await enrichAnnouncements(candidates.announcements || []);
  announcements = announcements.filter(ann =>
    announcementMatchesCategory(ann.vehicleType, vehicleCategory)
  );
  return { queue, announcements };
}

async function resolveInitialStage({ stage = 'stage1', vehicleCategory, userId, forceStage2 = false }) {
  if (stage === 'stage2') {
    const s2 = await loadStagePayload('stage2', vehicleCategory, { userId, forceStage2 });
    if (s2.queue.length === 0) {
      throw new Error(`صف نوبت «${vehicleCategory}» خالی است. ابتدا در «ثبت نوبت» راننده اضافه کنید.`);
    }
    if (s2.announcements.length === 0) {
      throw new Error('بار مرحله دوم موجود نیست.');
    }
    return { effectiveStage: 'stage2', ...s2, autoPromoted: false };
  }

  const s1 = await loadStagePayload('stage1', vehicleCategory, { userId, forceStage2 });
  if (s1.announcements.length > 0) {
    if (s1.queue.length === 0) {
      throw new Error(`صف نوبت «${vehicleCategory}» خالی است. ابتدا در «ثبت نوبت» راننده اضافه کنید.`);
    }
    return { effectiveStage: 'stage1', ...s1, autoPromoted: false };
  }

  const s2 = await loadStagePayload('stage2', vehicleCategory, { userId });
  if (s2.announcements.length > 0 && s2.queue.length > 0) {
    return { effectiveStage: 'stage2', ...s2, autoPromoted: true };
  }

  if (s1.queue.length === 0) {
    throw new Error(`صف نوبت «${vehicleCategory}» خالی است. ابتدا در «ثبت نوبت» راننده اضافه کنید.`);
  }
  throw new Error(
    'بار مرحله اول (مسیرهای دور) موجود نیست. بار مرحله دوم هم برای ادامه یافت نشد.'
  );
}

async function refreshSessionAnnouncements(sessionId, { fallback = null } = {}) {
  const session = await loadSession(sessionId);
  if (!session) return fallback || [];
  const { announcements } = await loadStagePayload(
    session.stage,
    session.vehicle_category || '',
    stageFetchOpts(session)
  );
  const list =
    announcements.length > 0 ? announcements : Array.isArray(fallback) ? fallback : announcements;
  await updateSession(sessionId, { eligible_announcements: JSON.stringify(list) });
  return list;
}

async function syncQueueFromServer(sessionId) {
  const session = await loadSession(sessionId);
  if (!session) return [];
  const { queue } = await loadStagePayload(
    session.stage,
    session.vehicle_category || '',
    stageFetchOpts(session)
  );
  await updateSession(sessionId, { queue_snapshot: JSON.stringify(queue) });
  return queue;
}

async function advanceAfterAssignment(sessionId, { localRemaining = null } = {}) {
  const queue = await syncQueueFromServer(sessionId);
  await refreshSessionAnnouncements(sessionId, { fallback: localRemaining });

  if (queue.length === 0) {
    await finishQueueIfDone(sessionId);
    return null;
  }

  await updateSession(sessionId, {
    current_turn_index: 0,
    status: 'running',
    pending_selection: null,
    turn_deadline_at: null,
    current_turn_message_id: null,
    current_turn_chat_id: null,
  });

  let advanced = await advanceToCurrentTurn(sessionId);
  if (!advanced && queue.length > 0) {
    console.warn('⚠️ [bale] advanceAfterAssignment retry', sessionId);
    advanced = await advanceToCurrentTurn(sessionId);
  }
  if (!advanced) {
    const session = await loadSession(sessionId);
    console.warn('⚠️ [bale] advanceAfterAssignment failed', {
      sessionId,
      status: session?.status,
      queueLen: queue.length,
    });
  }
  return advanced;
}

async function skipTurnInternal(sessionId, reason) {
  const session = await loadSession(sessionId);
  if (!session) return;
  const entry = currentTurnEntry(session);
  const driverName = entry?.driver?.name || entry?.driver_name || '—';
  await updateSession(sessionId, {
    current_turn_index: session.current_turn_index + 1,
    status: 'running',
    pending_selection: null,
    turn_deadline_at: null,
    current_turn_message_id: null,
    current_turn_chat_id: null,
  });
  await logEvent(sessionId, 'turn_skipped_auto', {
    reason,
    index: session.current_turn_index,
    driverId: entry?.driverId || entry?.driver_id,
  });
  if (reason === 'no_eligible_bars') {
    await announceToGroup(
      session,
      `⏭ عبور خودکار — ${driverName} (${session.vehicle_category || '—'})\nبار مجاز برای این نوبت در ${session.stage === 'stage1' ? 'مرحله اول' : 'مرحله دوم'} نبود.`
    );
  }
}

async function tryStartStage2(sessionId) {
  const session = await loadSession(sessionId);
  if (!session || session.stage !== 'stage1') return false;

  const vehicleCategory = session.vehicle_category || '';
  const { queue, announcements } = await loadStagePayload('stage2', vehicleCategory, {
    userId: session.started_by_user_id,
    forceStage2: true,
  });

  if (queue.length === 0 || announcements.length === 0) {
    return false;
  }

  await updateSession(sessionId, {
    stage: 'stage2',
    status: 'running',
    current_turn_index: 0,
    queue_snapshot: JSON.stringify(queue),
    eligible_announcements: JSON.stringify(announcements),
    pending_selection: null,
    turn_deadline_at: null,
    current_turn_message_id: null,
    current_turn_chat_id: null,
  });

  const refreshed = await loadSession(sessionId);
  await announceToGroup(
    refreshed,
    `🔄 <b>شروع مرحله دوم</b> — ${vehicleCategory}\n` +
      `${announcements.length} بار باقی‌مانده برای ${queue.length} راننده در صف`,
    { parseMode: 'HTML' }
  );
  await broadcastSessionStartToGroup(
    refreshed,
    queue,
    announcements,
    'stage2',
    vehicleCategory
  );
  await logEvent(sessionId, 'stage2_started', {
    queueSize: queue.length,
    loads: announcements.length,
  });
  await advanceToCurrentTurn(sessionId);
  return true;
}

async function finishQueueIfDone(sessionId) {
  const session = await loadSession(sessionId);
  if (!session) return true;
  const queue = parseQueueSnapshot(session);
  const remaining = parseAnnouncements(session);
  if (session.current_turn_index < queue.length) return false;

  if (session.stage === 'stage1') {
    const startedStage2 = await tryStartStage2(sessionId);
    if (startedStage2) return false;
  }

  if (remaining.length > 0) {
    await updateSession(sessionId, { status: 'awaiting_admin' });
    await announceToGroup(
      session,
      `⚠️ نوبت‌ها تمام شد (${queue.length} راننده).\n` +
        `${remaining.length} بار هنوز بدون تخصیص مانده:\n\n` +
        formatAnnouncementList(remaining) +
        `\n\nاپراتور از وب تخصیص دستی کنید.`
    );
    await logEvent(sessionId, 'queue_exhausted_loads_remain', {
      drivers: queue.length,
      remainingLoads: remaining.length,
    });
    return true;
  }

  await updateSession(sessionId, { status: 'completed' });
  await announceToGroup(session, '✅ جلسه اعلام بار پایان یافت.');
  await logEvent(sessionId, 'session_completed', {});
  return true;
}

async function startSessionForCategory({
  mode = 'hybrid',
  stage = 'stage1',
  vehicleCategory,
  groupChannelSlot = 1,
  turnTimeoutSec = 180,
  userId = null,
  forceStage2 = false,
}) {
  if (!vehicleCategory) {
    throw new Error('دسته خودرو مشخص نیست.');
  }

  const existing = await getActiveSessionForCategory(vehicleCategory);
  if (existing) {
    throw new Error(`جلسه فعال برای «${vehicleCategory}» وجود دارد. ابتدا آن را متوقف کنید.`);
  }

  const { effectiveStage, queue, announcements, autoPromoted } = await resolveInitialStage({
    stage,
    vehicleCategory,
    userId,
    forceStage2,
  });

  const { rows } = await pool.query(
    `INSERT INTO bale_sessions
      (status, mode, stage, vehicle_category, group_channel_slot, queue_snapshot,
       eligible_announcements, turn_timeout_sec, started_by_user_id)
     VALUES ('running', $1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      mode,
      effectiveStage,
      vehicleCategory || null,
      groupChannelSlot,
      JSON.stringify(queue),
      JSON.stringify(announcements),
      turnTimeoutSec,
      userId,
    ]
  );
  const session = rows[0];

  try {
    const groupChatId = await getChannelChatId(groupChannelSlot);
    if (groupChatId) {
      try {
        if (autoPromoted) {
          await baleApi.sendMessage(
            Number(groupChatId),
            `ℹ️ بار مرحله اول (دور) موجود نبود — جلسه مستقیماً از <b>مرحله دوم</b> ادامه می‌یابد.`,
            { parseMode: 'HTML' }
          );
        }
        await broadcastSessionStartToGroup(
          session,
          queue,
          announcements,
          effectiveStage,
          vehicleCategory
        );
      } catch (groupErr) {
        console.warn('⚠️ [bale] group broadcast failed:', groupErr.message);
        await logEvent(session.id, 'group_broadcast_failed', { error: groupErr.message });
      }
    }

    await logEvent(session.id, 'session_started', {
      mode,
      stage: effectiveStage,
      queueSize: queue.length,
      loads: announcements.length,
      autoPromoted,
    });
    ensureTickTimer();
    await advanceToCurrentTurn(session.id);
    return loadSession(session.id);
  } catch (error) {
    await pool.query(`DELETE FROM bale_sessions WHERE id = $1`, [session.id]);
    throw error;
  }
}

async function countQueueForCategory(category, opts) {
  try {
    const { queue } = await resolveInitialStage({
      stage: opts.stage || 'stage1',
      vehicleCategory: category,
      forceStage2: opts.forceStage2,
      userId: opts.userId,
    });
    return queue.length;
  } catch {
    return 0;
  }
}

async function startAllCategorySessions(opts) {
  let plans = await getDispatchChannelPlans();
  if (plans.length === 0) {
    throw new Error(
      'هیچ کانال بله فعالی تنظیم نشده. اسلات ۱ (تست) یا اسلات‌های ۲–۴ را با chat_id پر کنید.'
    );
  }

  const pilotCombined = Boolean(plans[0]?.pilotCombined);
  const skipped = [];

  if (pilotCombined) {
    const withQueue = [];
    for (const plan of plans) {
      const count = await countQueueForCategory(plan.category, opts);
      if (count > 0) {
        withQueue.push(plan);
      } else {
        skipped.push({
          category: plan.category,
          message: `صف نوبت «${plan.category}» خالی است — در حالت پایلوت رد شد.`,
        });
      }
    }
    plans = withQueue;
  }

  if (plans.length === 0) {
    throw new Error(
      skipped.map(s => s.message).join(' | ') ||
        'هیچ دسته‌ای با صف نوبت پر برای شروع وجود ندارد.'
    );
  }

  const started = [];
  const errors = [];

  for (const plan of plans) {
    try {
      const session = await startSessionForCategory({
        ...opts,
        vehicleCategory: plan.category,
        groupChannelSlot: plan.slot,
      });
      started.push({ category: plan.category, slot: plan.slot, session });
    } catch (err) {
      const emptyQueue = String(err.message).includes('خالی است');
      if (emptyQueue && !pilotCombined) {
        skipped.push({ category: plan.category, message: err.message });
      } else {
        errors.push({ category: plan.category, message: err.message });
      }
    }
  }

  if (started.length === 0) {
    const parts = [...errors, ...skipped].map(e => `${e.category}: ${e.message}`);
    throw new Error(parts.join(' | ') || 'شروع جلسه ناموفق بود.');
  }

  return {
    sessions: started.map(s => s.session),
    started: started.length,
    errors,
    skipped,
    pilotCombined,
  };
}

async function buildTurnMessage(session, entry, eligible) {
  const name = entry.driver?.name || entry.driver_name || '—';
  const countdown = formatCountdown(session.turn_deadline_at);

  return (
    `⏱ ${countdown} | نوبت شما\n` +
    `👤 ${name}\n\n` +
    `بارهای مجاز — فقط شماره را بفرستید:\n\n` +
    formatAnnouncementList(eligible)
  );
}

async function advanceToCurrentTurn(sessionId, depth = 0) {
  if (depth > 30) {
    console.warn('⚠️ [bale] advanceToCurrentTurn max depth', sessionId);
    return null;
  }

  const session = await loadSession(sessionId);
  if (!session || session.status === 'completed' || session.status === 'stopped') return null;
  if (session.status === 'assigning') return null;

  const queue = parseQueueSnapshot(session);
  if (session.current_turn_index >= queue.length) {
    await finishQueueIfDone(sessionId);
    return null;
  }

  const entry = queue[session.current_turn_index];
  const driverId = entry.driverId || entry.driver_id;
  let allAnnouncements = parseAnnouncements(session);
  const rejected = parseRejected(session);
  let eligible = filterEligibleForDriver(allAnnouncements, entry, session.stage, rejected);

  if (eligible.length === 0) {
    allAnnouncements = await refreshSessionAnnouncements(sessionId);
    eligible = filterEligibleForDriver(allAnnouncements, entry, session.stage, rejected);
  }

  if (eligible.length === 0) {
    if (session.stage === 'stage1' && allAnnouncements.length === 0) {
      if (await tryStartStage2(sessionId)) {
        return loadSession(sessionId);
      }
      await finishQueueIfDone(sessionId);
      return null;
    }
    if (allAnnouncements.length > 0) {
      await skipTurnInternal(sessionId, 'no_eligible_bars');
      return advanceToCurrentTurn(sessionId, depth + 1);
    }
    await skipTurnInternal(sessionId, 'no_loads_left');
    if (session.current_turn_index + 1 >= queue.length) {
      await finishQueueIfDone(sessionId);
      return null;
    }
    return advanceToCurrentTurn(sessionId, depth + 1);
  }

  const deadline = new Date(Date.now() + session.turn_timeout_sec * 1000);

  await fetchStageCandidates({
    stage: session.stage,
    category: session.vehicle_category || '',
    queueEntryId: entry.id,
    userId: session.started_by_user_id,
    forceStage2: session.stage === 'stage2',
  });

  let messageId = null;
  let chatId = null;
  try {
    const outreach = await getDriverOutreach(driverId);
    if (!outreach?.outreach_chat_id) {
      await updateSession(sessionId, { status: 'awaiting_admin' });
      await logEvent(sessionId, 'missing_outreach', { driverId });
      return session;
    }
    chatId = outreach.outreach_chat_id;
    const text = await buildTurnMessage(
      { ...session, turn_deadline_at: deadline },
      entry,
      eligible
    );
    const sent = await baleApi.sendMessage(chatId, text);
    messageId = sent?.message_id;
  } catch (err) {
    console.error('❌ [bale] send turn failed:', err.message);
    await updateSession(sessionId, { status: 'awaiting_admin' });
    await logEvent(sessionId, 'send_turn_error', { error: err.message, driverId });
    return session;
  }

  await updateSession(sessionId, {
    status: 'running',
    pending_selection: null,
    current_turn_message_id: messageId,
    current_turn_chat_id: chatId,
    turn_deadline_at: deadline,
  });
  await logEvent(sessionId, 'turn_started', {
    driverId,
    employeeId: entry.driver?.employeeId,
    index: session.current_turn_index,
    startedAt: new Date().toISOString(),
    deadlineAt: deadline.toISOString(),
  });

  const driverName = entry.driver?.name || entry.driver_name || '—';
  await announceToGroup(
    session,
    `🔔 نوبت ${session.current_turn_index + 1} از ${queue.length} — ${session.vehicle_category || ''}\n` +
      `👤 ${driverName}\n` +
      `⏱ مهلت: ${Math.ceil(session.turn_timeout_sec / 60)} دقیقه\n` +
      `📦 ${eligible.length} بار در لیست انتخاب`
  );

  return loadSession(sessionId);
}

async function refreshTurnTimerMessage(sessionId) {
  const session = await loadSession(sessionId);
  if (!session || session.status !== 'running') return;
  if (!session.turn_deadline_at) return;
  if (!session.current_turn_message_id || !session.current_turn_chat_id) return;
  if (session.pending_selection) return;

  const entry = currentTurnEntry(session);
  if (!entry) return;
  const eligible = filterEligibleForDriver(
    parseAnnouncements(session),
    entry,
    session.stage,
    parseRejected(session)
  );

  try {
    const text = await buildTurnMessage(session, entry, eligible);
    await baleApi.editMessageText(
      session.current_turn_chat_id,
      session.current_turn_message_id,
      text
    );
  } catch (err) {
    if (!String(err.message).includes('message is not modified')) {
      console.warn('⚠️ [bale] timer edit:', err.message);
    }
  }
}

async function resolveDriverFromMessage(session, text, fromUserId) {
  const trimmed = (text || '').trim();
  const entry = currentTurnEntry(session);
  if (!entry) return { driverId: null, rowText: trimmed };

  const driverId = entry.driverId || entry.driver_id;
  const emp = String(entry.driver?.employeeId || entry.employee_id || '').trim();

  const empPrefix = /^(\d+)\s+(.+)$/.exec(trimmed);
  if (empPrefix) {
    const [, code, rest] = empPrefix;
    const { rows } = await pool.query(
      `SELECT driver_id FROM bale_driver_outreach WHERE employee_id = $1 LIMIT 1`,
      [code]
    );
    if (rows[0]) {
      return { driverId: rows[0].driver_id, rowText: rest.trim(), explicitEmployee: code };
    }
  }

  if (emp && trimmed.startsWith(emp)) {
    return { driverId, rowText: trimmed.slice(emp.length).trim() || trimmed, explicitEmployee: emp };
  }

  return { driverId, rowText: trimmed };
}

async function handleTextMessage(chatId, text, fromUserId, chat = null) {
  if (isGroupLikeChat(chat) || (await isBaleGroupChat(chatId))) {
    return { handled: false };
  }

  const session = await findSessionForInbound(chatId);
  console.log('📩 [bale] inbound:', { chatId, text, status: session?.status, sessionId: session?.id });
  if (!session) {
    if (!looksLikeDriverSelectionAttempt(text)) {
      return { handled: false };
    }
    const active = await getActiveSessions();
    if (active.length > 0) {
      await baleApi.sendMessage(chatId, 'الان نوبت شما در هیچ جلسه فعالی نیست.');
    } else {
      await baleApi.sendMessage(chatId, 'جلسه فعال اعلام بار نیست.');
    }
    return { handled: true };
  }

  if (session.status === 'awaiting_admin') {
    await baleApi.sendMessage(
      chatId,
      `جلسه «${session.vehicle_category || '—'}» منتظر تصمیم اپراتور است. لطفاً از وب اقدام کنید.`
    );
    return { handled: true };
  }

  const { driverId, rowText } = await resolveDriverFromMessage(session, text, fromUserId);
  const entry = currentTurnEntry(session);
  const turnDriverId = entry?.driverId || entry?.driver_id;

  if (driverId && turnDriverId && driverId !== turnDriverId) {
    const turnName = entry.driver?.name || entry.driver_name || '—';
    await baleApi.sendMessage(chatId, `الان نوبت ${turnName} است (${session.vehicle_category || '—'}).`);
    return { handled: true };
  }

  const pending = session.pending_selection
    ? typeof session.pending_selection === 'object'
      ? session.pending_selection
      : JSON.parse(session.pending_selection)
    : null;

  if (pending) {
    await baleApi.sendMessage(chatId, 'ابتدا گزینه تأیید یا انصراف را انتخاب کنید.');
    return { handled: true };
  }

  const rowNum = parseRowNumber(rowText);
  if (!Number.isFinite(rowNum) || rowNum < 1) {
    if (looksLikeDriverSelectionAttempt(rowText)) {
      await baleApi.sendMessage(chatId, 'لطفاً فقط شماره از لیست بالا را بفرستید (مثلاً ۱ یا ۲).');
    }
    return { handled: true };
  }

  const eligible = filterEligibleForDriver(
    parseAnnouncements(session),
    entry,
    session.stage,
    parseRejected(session)
  );

  if (rowNum > eligible.length) {
    await baleApi.sendMessage(
      chatId,
      `${rowNum} نامعتبر است. از ۱ تا ${eligible.length} انتخاب کنید.`
    );
    return { handled: true };
  }

  const ann = eligible[rowNum - 1];
  const confirmText =
    `انتخاب شما:\n` +
    formatAnnouncementRow(rowNum, ann) +
    `\n\nآیا تأیید می‌کنید؟`;

  await clearTurnTimer(session.id, {
    freezeText: `⏸ منتظر تأیید شما — تایمر متوقف شد\n👤 ${entry.driver?.name || entry.driver_name || '—'}`,
  });

  await updateSession(session.id, {
    status: 'awaiting_confirm',
    pending_selection: JSON.stringify({
      rowNumber: rowNum,
      announcementId: ann.id,
      destinationId: ann.destination?.id,
      driverId: turnDriverId,
      queueEntryId: entry.id,
      vehicleId: entry.vehicleId || entry.vehicle_id,
    }),
    turn_deadline_at: null,
  });

  const sent = await baleApi.sendMessage(chatId, confirmText, {
    replyMarkup: confirmKeyboard(session.id),
  });
  await logEvent(session.id, 'selection_pending', { rowNum, announcementId: ann.id });
  return { handled: true, messageId: sent?.message_id };
}

async function completeAssignment(session, selection, source) {
  const turnStartedAt = await getLastTurnStartedAt(session.id);
  const selectionDurationSec = turnStartedAt
    ? Math.max(0, Math.round((Date.now() - turnStartedAt.getTime()) / 1000))
    : null;

  const liveSession = await loadSession(session.id);
  await updateSession(session.id, { status: 'assigning', turn_deadline_at: null });
  await freezeCurrentTurnPv(liveSession, '⏳ در حال ثبت تخصیص...');

  const result = await assignFreightFromBale({
    stage: session.stage,
    freightAnnouncementId: selection.announcementId,
    destinationId: selection.destinationId,
    driverId: selection.driverId,
    vehicleId: selection.vehicleId,
    queueEntryId: selection.queueEntryId,
    userId: session.started_by_user_id,
    userName: source === 'auto' ? 'سیستم بله (خودکار)' : 'سیستم بله',
  });

  if (!result.ok) {
    await updateSession(session.id, { status: 'awaiting_admin', pending_selection: null });
    const errMsg =
      result.data?.message ||
      result.data?.details ||
      'تخصیص ناموفق';
    await logEvent(session.id, 'assign_failed', {
      error: errMsg,
      details: result.data?.details,
      source,
    });
    throw new Error(errMsg);
  }

  if (source === 'auto' || source === 'semi_auto') {
    await incrementAutoAssignStats(selection.driverId);
    const ann = parseAnnouncements(session).find(a => a.id === selection.announcementId);
    const brief = await buildPreferenceBrief(selection.driverId, { announcement: ann });
    try {
      await sendToDriver(selection.driverId, brief.driverAutoPvText);
    } catch (e) {
      console.warn('⚠️ [bale] auto pv:', e.message);
    }
  }

  const assignedAnn = parseAnnouncements(session).find(a => a.id === selection.announcementId);
  const remaining = parseAnnouncements(session).filter(a => a.id !== selection.announcementId);

  const assignedStage = session.stage;

  await updateSession(session.id, {
    status: 'running',
    pending_selection: null,
    eligible_announcements: JSON.stringify(remaining),
    current_turn_message_id: null,
    turn_deadline_at: null,
    current_turn_chat_id: null,
  });
  await logEvent(session.id, 'assigned', {
    ...selection,
    source,
    selectionDurationSec,
    stage: assignedStage,
  });

  const { rows: dr } = await pool.query(`SELECT name, employee_id FROM drivers WHERE id = $1`, [
    selection.driverId,
  ]);
  const driverName = dr[0]?.name || '—';
  if (assignedAnn) {
    await announceToGroup(
      session,
      formatAssignmentGroupMessage(driverName, selection.rowNumber || 1, assignedAnn),
      { parseMode: 'HTML' }
    );
  } else {
    await announceToGroup(session, `✅ <b>${driverName}</b> انتخاب کرد`, { parseMode: 'HTML' });
  }

  if (assignedStage === 'stage1' && remaining.length === 0) {
    const startedStage2 = await tryStartStage2(session.id);
    if (startedStage2) {
      return { completed: false, selectionDurationSec, stage2Started: true };
    }
  }

  await advanceAfterAssignment(session.id, { localRemaining: remaining });
  const refreshed = await loadSession(session.id);
  const done = refreshed?.status === 'completed' || refreshed?.status === 'awaiting_admin';
  return { completed: done, selectionDurationSec };
}

async function handleCallback(callbackQuery) {
  const data = callbackQuery.data || '';
  const [action, sessionId] = data.split(':');
  if (!sessionId) return { handled: false };

  const session = await loadSession(sessionId);
  if (!session) {
    await baleApi.answerCallbackQuery(callbackQuery.id, 'جلسه یافت نشد');
    return { handled: true };
  }

  const pending = session.pending_selection
    ? typeof session.pending_selection === 'object'
      ? session.pending_selection
      : JSON.parse(session.pending_selection)
    : null;

  if (action === 'bale_confirm' && pending) {
    await baleApi.answerCallbackQuery(callbackQuery.id);
    try {
      const assignResult = await completeAssignment(session, pending, 'driver');
      const durationNote =
        assignResult.selectionDurationSec != null
          ? `\n⏱ زمان انتخاب: ${assignResult.selectionDurationSec} ثانیه`
          : '';
      await baleApi.sendMessage(
        callbackQuery.message?.chat?.id,
        `✅ تخصیص با موفقیت ثبت شد.${durationNote}`
      );
    } catch (err) {
      await baleApi.sendMessage(callbackQuery.message?.chat?.id, `❌ ${err.message}`);
    }
    return { handled: true };
  }

  if (action === 'bale_cancel') {
    await baleApi.answerCallbackQuery(callbackQuery.id, 'انصراف');
    await updateSession(sessionId, {
      status: 'running',
      pending_selection: null,
    });
    await baleApi.sendMessage(
      callbackQuery.message?.chat?.id,
      'انصراف شد. دوباره شماره را از لیست نوبت فعلی بفرستید.'
    );
    await logEvent(sessionId, 'selection_cancelled', {});
    await advanceToCurrentTurn(sessionId);
    return { handled: true };
  }

  return { handled: false };
}

async function handleTimeout(sessionId) {
  let session = await loadSession(sessionId);
  if (!session || session.status !== 'running') return;
  if (session.pending_selection) return;
  if (!session.turn_deadline_at) return;
  if (new Date(session.turn_deadline_at).getTime() > Date.now()) return;

  const turnIndex = session.current_turn_index;
  const deadlineAt = new Date(session.turn_deadline_at).getTime();
  const entry = currentTurnEntry(session);
  if (!entry) return;

  session = await loadSession(sessionId);
  if (!session || session.status !== 'running' || session.pending_selection) return;
  if (session.current_turn_index !== turnIndex) return;
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() !== deadlineAt) {
    return;
  }
  if (new Date(session.turn_deadline_at).getTime() > Date.now()) return;

  const eligible = filterEligibleForDriver(
    parseAnnouncements(session),
    entry,
    session.stage,
    parseRejected(session)
  );

  const mode = session.mode;

  if (mode === 'hybrid' || mode === 'manual') {
    await updateSession(sessionId, { status: 'awaiting_admin' });
    await logEvent(sessionId, 'timeout_awaiting_admin', { driverId: entry.driverId });
    const driverName = entry.driver?.name || entry.driver_name || '—';
    await announceToGroup(
      session,
      `⏰ مهلت تمام شد — نوبت ${driverName} (${session.vehicle_category || '—'})\nمنتظر تصمیم اپراتور در وب.`
    );
    try {
      await sendToDriver(
        entry.driverId || entry.driver_id,
        '⏰ مهلت نوبت شما تمام شد.\nمنتظر تصمیم اپراتور بمانید.'
      );
    } catch (_) {}
    return;
  }

  if (mode === 'semi_auto' && canSemiAutoAssign(eligible)) {
    const ann = eligible[0];
    const selection = {
      rowNumber: 1,
      announcementId: ann.id,
      destinationId: ann.destination?.id,
      driverId: entry.driverId || entry.driver_id,
      queueEntryId: entry.id,
      vehicleId: entry.vehicleId || entry.vehicle_id,
    };
    try {
      await completeAssignment(session, selection, 'semi_auto');
    } catch (err) {
      await updateSession(sessionId, { status: 'awaiting_admin' });
    }
    return;
  }

  if (mode === 'auto' || mode === 'semi_auto') {
    const brief = await buildPreferenceBrief(entry.driverId || entry.driver_id, {
      category: session.vehicle_category,
    });
    const ann = pickAutoAnnouncement(eligible, brief.recentTaken);
    if (!ann) {
      await updateSession(sessionId, { status: 'awaiting_admin' });
      await logEvent(sessionId, 'timeout_no_candidate', {});
      return;
    }
    const idx = eligible.findIndex(a => a.id === ann.id);
    const selection = {
      rowNumber: idx + 1,
      announcementId: ann.id,
      destinationId: ann.destination?.id,
      driverId: entry.driverId || entry.driver_id,
      queueEntryId: entry.id,
      vehicleId: entry.vehicleId || entry.vehicle_id,
    };
    try {
      await completeAssignment(session, selection, 'auto');
    } catch (err) {
      await updateSession(sessionId, { status: 'awaiting_admin' });
    }
    return;
  }

  await updateSession(sessionId, { status: 'awaiting_admin' });
}

async function skipCurrentTurn(sessionId) {
  const session = await loadSession(sessionId);
  if (!session) throw new Error('جلسه یافت نشد');
  const entry = currentTurnEntry(session);
  const driverName = entry?.driver?.name || entry?.driver_name || '—';
  await announceToGroup(
    session,
    `⏭ رد نوبت / عبور — ${driverName} (${session.vehicle_category || '—'})`
  );
  await updateSession(sessionId, {
    current_turn_index: session.current_turn_index + 1,
    status: 'running',
    pending_selection: null,
    turn_deadline_at: null,
    current_turn_message_id: null,
  });
  await logEvent(sessionId, 'turn_skipped', { index: session.current_turn_index });
  if (await finishQueueIfDone(sessionId)) {
    return loadSession(sessionId);
  }
  return advanceToCurrentTurn(sessionId);
}

async function extendCurrentTurn(sessionId, extraSec = 120) {
  const session = await loadSession(sessionId);
  if (!session) throw new Error('جلسه یافت نشد');
  const entry = currentTurnEntry(session);
  const base = session.turn_deadline_at
    ? new Date(session.turn_deadline_at).getTime()
    : Date.now();
  const deadline = new Date(Math.max(base, Date.now()) + extraSec * 1000);
  await updateSession(sessionId, {
    status: 'running',
    turn_deadline_at: deadline,
    pending_selection: null,
  });
  await logEvent(sessionId, 'turn_extended', { extraSec });

  const driverName = entry?.driver?.name || entry?.driver_name || '—';
  const extraMin = Math.round(extraSec / 60);

  await announceToGroup(
    session,
    `⏱ تمدید +${extraMin} دقیقه — ${session.vehicle_category || '—'}\n👤 ${driverName}`
  );

  if (entry) {
    const driverId = entry.driverId || entry.driver_id;
    try {
      await sendToDriver(
        driverId,
        `⏱ مهلت نوبت شما ${extraMin} دقیقه تمدید شد.\nلطفاً شماره بار را بفرستید.`
      );
    } catch (err) {
      console.warn('⚠️ [bale] extend pv:', err.message);
    }
  }

  if (session.current_turn_message_id && session.current_turn_chat_id) {
    await refreshTurnTimerMessage(sessionId);
  } else if (entry) {
    const refreshed = await loadSession(sessionId);
    const eligible = filterEligibleForDriver(
      parseAnnouncements(refreshed),
      entry,
      refreshed.stage,
      parseRejected(refreshed)
    );
    const outreach = await getDriverOutreach(entry.driverId || entry.driver_id);
    if (outreach?.outreach_chat_id) {
      const text = await buildTurnMessage({ ...refreshed, turn_deadline_at: deadline }, entry, eligible);
      const sent = await baleApi.sendMessage(outreach.outreach_chat_id, text);
      await updateSession(sessionId, {
        current_turn_message_id: sent?.message_id,
        current_turn_chat_id: outreach.outreach_chat_id,
      });
    }
  }

  return loadSession(sessionId);
}

async function stopSession(sessionId) {
  await updateSession(sessionId, { status: 'stopped' });
  await logEvent(sessionId, 'session_stopped', {});
  return loadSession(sessionId);
}

async function stopAllSessions() {
  const sessions = await getActiveSessions();
  const stopped = [];
  for (const session of sessions) {
    stopped.push(await stopSession(session.id));
  }
  return stopped;
}

async function manualAssign(sessionId, body, userId) {
  const session = await loadSession(sessionId);
  if (!session) throw new Error('جلسه یافت نشد');
  const selection = {
    announcementId: body.freightAnnouncementId,
    destinationId: body.destinationId,
    driverId: body.driverId,
    vehicleId: body.vehicleId,
    queueEntryId: body.queueEntryId,
  };
  await completeAssignment(session, selection, 'admin_manual');
  return loadSession(sessionId);
}

async function processWebhookUpdate(update) {
  if (update.callback_query) {
    return handleCallback(update.callback_query);
  }
  const msg = update.message;
  if (!msg?.text) return { handled: false };
  return handleTextMessage(msg.chat.id, msg.text, msg.from?.id, msg.chat);
}

function ensureTickTimer() {
  if (tickTimer) return;
  tickTimer = setInterval(async () => {
    if (timerRunning) return;
    timerRunning = true;
    try {
      const sessions = await getActiveSessions();
      for (const session of sessions) {
        if (session.status === 'running') {
          await refreshTurnTimerMessage(session.id);
          await handleTimeout(session.id);
        }
      }
    } catch (err) {
      console.error('❌ [bale] tick error:', err.message);
    } finally {
      timerRunning = false;
    }
  }, TICK_MS);
}

async function seedTestDrivers(outreachChatId, limit = 10) {
  const { rows: queueDrivers } = await pool.query(
    `SELECT q.driver_id, d.employee_id, d.name, q.position
     FROM dispatch_queue_entries q
     JOIN drivers d ON d.id = q.driver_id
     WHERE d.employee_id IS NOT NULL AND TRIM(d.employee_id) <> ''
     ORDER BY q.queue_type ASC, q.position ASC
     LIMIT $1`,
    [limit]
  );

  if (queueDrivers.length === 0) {
    const { rows: fallback } = await pool.query(
      `SELECT id AS driver_id, employee_id, name FROM drivers
       WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> ''
       ORDER BY name ASC LIMIT $1`,
      [limit]
    );
    queueDrivers.push(...fallback);
  }

  const linked = [];
  for (const row of queueDrivers) {
    await pool.query(
      `INSERT INTO bale_driver_outreach
        (driver_id, employee_id, outreach_chat_id, is_test_simulation, notes, updated_at)
       VALUES ($1, $2, $3, TRUE, 'تست — chat مشترک', NOW())
       ON CONFLICT (driver_id)
       DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         outreach_chat_id = EXCLUDED.outreach_chat_id,
         is_test_simulation = TRUE,
         updated_at = NOW()`,
      [row.driver_id, row.employee_id, outreachChatId]
    );
    linked.push({
      driverId: row.driver_id,
      employeeId: row.employee_id,
      name: row.name,
      outreachChatId,
    });
  }
  return linked;
}

module.exports = {
  getActiveSession,
  getActiveSessions,
  loadSession,
  startSessionForCategory,
  startAllCategorySessions,
  stopSession,
  stopAllSessions,
  skipCurrentTurn,
  extendCurrentTurn,
  manualAssign,
  processWebhookUpdate,
  seedTestDrivers,
  ensureTickTimer,
  logEvent,
};
