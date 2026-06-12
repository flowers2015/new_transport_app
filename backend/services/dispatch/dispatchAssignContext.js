const pool = require('../../db');
const { filterEligibleForDriver } = require('../bale/baleDecision');
const { isVeryFarAnnouncement } = require('./dispatchRouteRules');
const { computeJalaliCycleRange } = require('./dispatchCycle');

function getStageCandidatesHandler() {
  return require('../../controllers/dispatchController').getStageCandidates;
}

const CATEGORY_KEY_TO_LABEL = {
  trailer: 'تریلی',
  'mini-trailer': 'مینی تریلی',
  'ten-wheel': 'ده چرخ',
};

const PHASE_LABELS = {
  stage1: 'مرحله اول — خیلی‌دور (نوبت دور)',
  stage2_far: 'مرحله دوم — نوبت دور',
  stage2_near_vf: 'مرحله دوم — خیلی‌دور برای نوبت نزدیک',
  stage2_near_all: 'مرحله دوم — نوبت نزدیک (بارهای باقی‌مانده)',
};

const LOCK_REASONS = {
  wrong_phase: 'در این فاز مجاز نیست',
  very_far_history: 'سابقه خیلی‌دور در دوره جاری',
  near_vf_pending: 'ابتدا بار خیلی‌دور برای نوبت نزدیک',
  deferred: 'برای مرحله بعد مانده‌اید',
  wrong_queue: 'نوبت این راننده در این فاز فعال نیست',
  wrong_category: 'دسته خودرو نامطابق',
};

function invokeGetStageCandidates(query, user = null) {
  const getStageCandidates = getStageCandidatesHandler();
  return new Promise((resolve, reject) => {
    const req = { query, user: user || null };
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
    Promise.resolve(getStageCandidates(req, res)).catch(reject);
  });
}

function normalizeCategoryLabel(category) {
  if (!category) return '';
  return CATEGORY_KEY_TO_LABEL[category] || category;
}

function phaseToQuery(phase) {
  switch (phase) {
    case 'stage1':
      return { stage: 'stage1', subPhase: '', forceStage2: 'false' };
    case 'stage2_far':
      return { stage: 'stage2', subPhase: 'far', forceStage2: 'true' };
    case 'stage2_near_vf':
      return { stage: 'stage2', subPhase: 'near_vf', forceStage2: 'true' };
    case 'stage2_near_all':
      return { stage: 'stage2', subPhase: 'near_all', forceStage2: 'true' };
    default:
      return { stage: 'stage1', subPhase: '', forceStage2: 'false' };
  }
}

function assignStageFromPhase(phase) {
  return phase === 'stage1' ? 'stage1' : 'stage2';
}

function canDeferPhase(phase) {
  return phase === 'stage1' || phase === 'stage2_near_vf';
}

async function fetchPhasePayload(vehicleCategory, phase, userId) {
  const q = phaseToQuery(phase);
  const { statusCode, data } = await invokeGetStageCandidates(
    {
      ...q,
      category: vehicleCategory,
      queueEntryId: '',
    },
    userId ? { id: userId } : null
  );
  if (statusCode >= 400) {
    throw new Error(data?.message || 'خطا در دریافت داده‌های فاز');
  }
  return data;
}

async function countRawQueueForCategory(vehicleCategory) {
  const label = normalizeCategoryLabel(vehicleCategory);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM dispatch_queue_entries
     WHERE queue_type IN ('far', 'near') AND vehicle_category = $1`,
    [label]
  );
  return rows[0]?.c || 0;
}

async function getDeferralsForCategory(vehicleCategory, cycleStart, cycleEnd) {
  const label = normalizeCategoryLabel(vehicleCategory);
  const [stage1, nearVf] = await Promise.all([
    getDeferredDriverIds(label, 'stage1', cycleStart, cycleEnd),
    getDeferredDriverIds(label, 'stage2_near_vf', cycleStart, cycleEnd),
  ]);
  return { stage1, nearVf };
}

function filterActiveStage1Queue(queue, stage1DeferredIds) {
  return (queue || []).filter(entry => {
    const driverId = entry.driverId || entry.driver_id;
    if (stage1DeferredIds.has(driverId)) return false;
    if (driverHasVeryFarHistory(entry)) return false;
    return (entry.queueType || entry.queue_type) === 'far';
  });
}

function filterActiveNearVfQueue(queue, nearVfDeferredIds) {
  return (queue || []).filter(entry => {
    const driverId = entry.driverId || entry.driver_id;
    if (nearVfDeferredIds.has(driverId)) return false;
    if (driverHasVeryFarHistory(entry)) return false;
    return (entry.queueType || entry.queue_type) === 'near';
  });
}

function collectPendingVeryFarAnnouncements(payloads) {
  const seen = new Map();
  // فقط فازهای خیلی‌دور — stage2_near_all همه بارها را دارد و نباید فاز را قفل کند
  for (const key of ['stage1', 'stage2_near_vf']) {
    for (const ann of payloads[key]?.announcements || []) {
      if (isVeryFarAnnouncement(ann)) seen.set(ann.id, ann);
    }
  }
  return [...seen.values()];
}

function isFreeAssignMode(assignMode) {
  return String(assignMode || '').toLowerCase() === 'free';
}

function mergeCategoryAnnouncements(payloads) {
  const seen = new Map();
  for (const key of ['stage1', 'stage2_far', 'stage2_near_vf', 'stage2_near_all']) {
    for (const ann of payloads[key]?.announcements || []) {
      seen.set(ann.id, ann);
    }
  }
  return [...seen.values()];
}

function hasPendingVeryFarLoads(payloads) {
  return collectPendingVeryFarAnnouncements(payloads).length > 0;
}

function isNearDriverInActiveVfTurn(entry, deferrals, payloads) {
  const queueType = entry.queueType || entry.queue_type;
  if (queueType !== 'near') return false;
  if (driverHasVeryFarHistory(entry)) return false;
  const activeNv = filterActiveNearVfQueue(payloads.stage2_near_vf?.queue, deferrals.nearVf);
  return activeNv.some(q => q.id === entry.id);
}

function shouldOfferNearVfDefer(entry, deferrals, payloads, globalPhase) {
  if (globalPhase !== 'stage2_near_vf' && globalPhase !== 'stage2_near_all') return false;
  const driverId = entry.driverId || entry.driver_id;
  if (deferrals.nearVf.has(driverId)) return false;
  if (!isNearDriverInActiveVfTurn(entry, deferrals, payloads)) return false;
  return hasPendingVeryFarLoads(payloads);
}

function resolveNearEntryPhase(entry, globalPhase, deferrals, payloads) {
  const driverId = entry.driverId || entry.driver_id;
  const entryId = entry.id;
  const nearVfPayload = payloads.stage2_near_vf || {};
  const s2all = payloads.stage2_near_all || {};

  if (deferrals.nearVf.has(driverId)) {
    if (globalPhase === 'stage2_near_all') {
      return {
        phase: 'stage2_near_all',
        data: s2all,
        isDeferredThisPhase: false,
        assignStage: 'stage2',
        inactive: (s2all.announcements || []).length === 0,
      };
    }
    return {
      phase: 'stage2_near_vf',
      data: nearVfPayload,
      isDeferredThisPhase: true,
      assignStage: 'stage2',
    };
  }

  if (globalPhase === 'stage2_near_all') {
    return {
      phase: 'stage2_near_all',
      data: s2all,
      isDeferredThisPhase: false,
      assignStage: 'stage2',
      inactive: (s2all.announcements || []).length === 0,
    };
  }

  const inActiveVfTurn = isNearDriverInActiveVfTurn(entry, deferrals, payloads);
  const vfLoadsPending = hasPendingVeryFarLoads(payloads);

  if (inActiveVfTurn && vfLoadsPending && globalPhase === 'stage2_near_vf') {
    return {
      phase: 'stage2_near_vf',
      data: nearVfPayload,
      isDeferredThisPhase: false,
      assignStage: 'stage2',
    };
  }

  if (globalPhase === 'stage2_near_vf') {
    if (driverHasVeryFarHistory(entry)) {
      return {
        phase: 'stage2_near_vf',
        data: nearVfPayload,
        isDeferredThisPhase: false,
        assignStage: 'stage2',
        inactive: true,
      };
    }
    const activeNv = filterActiveNearVfQueue(nearVfPayload.queue, deferrals.nearVf);
    if (
      activeNv.some(q => q.id === entryId) &&
      (nearVfPayload.announcements || []).length > 0
    ) {
      return {
        phase: 'stage2_near_vf',
        data: nearVfPayload,
        isDeferredThisPhase: false,
        assignStage: 'stage2',
      };
    }
    return {
      phase: 'stage2_near_vf',
      data: nearVfPayload,
      isDeferredThisPhase: false,
      assignStage: 'stage2',
      inactive: true,
    };
  }

  return {
    phase: 'stage2_near_all',
    data: s2all,
    isDeferredThisPhase: false,
    assignStage: 'stage2',
    inactive: (s2all.announcements || []).length === 0,
  };
}

async function loadPhasePayloads(vehicleCategory, userId = null) {
  const label = normalizeCategoryLabel(vehicleCategory);
  const phases = ['stage1', 'stage2_far', 'stage2_near_vf', 'stage2_near_all'];
  const payloads = {};
  for (const phase of phases) {
    payloads[phase] = await fetchPhasePayload(label, phase, userId);
  }
  return payloads;
}

function activeQueueForPhase(phase, data, deferrals) {
  const queue = data?.queue || [];
  if (phase === 'stage1') return filterActiveStage1Queue(queue, deferrals.stage1);
  if (phase === 'stage2_near_vf') return filterActiveNearVfQueue(queue, deferrals.nearVf);
  return queue;
}

function phaseHasWork(phase, data, deferrals) {
  const hasQueue = activeQueueForPhase(phase, data, deferrals).length > 0;
  if (!hasQueue) return false;
  const anns = data?.announcements || [];
  if (phase === 'stage2_near_vf') {
    return anns.some(isVeryFarAnnouncement);
  }
  return anns.length > 0;
}

function resolveEffectivePhaseFromPayloads(payloads, deferrals) {
  const tryPhases = phases => {
    for (const phase of phases) {
      const data = payloads[phase];
      if (!data) continue;
      if (phaseHasWork(phase, data, deferrals)) {
        return {
          phase,
          data: { ...data, queue: activeQueueForPhase(phase, data, deferrals) },
          autoPromoted: phase !== 'stage1',
        };
      }
    }
    return null;
  };

  const s1 = payloads.stage1 || {};
  const activeS1 = activeQueueForPhase('stage1', s1, deferrals);
  if ((s1.announcements || []).length > 0 && activeS1.length > 0) {
    return { phase: 'stage1', data: { ...s1, queue: activeS1 }, autoPromoted: false };
  }

  const promoted = tryPhases(['stage2_far', 'stage2_near_vf', 'stage2_near_all']);
  if (promoted) return promoted;

  const fallback = tryPhases(['stage2_near_all', 'stage2_near_vf', 'stage2_far']);
  if (fallback) return fallback;

  return { phase: null, data: s1, autoPromoted: false };
}

async function resolveEffectivePhase(vehicleCategory, userId = null) {
  const label = normalizeCategoryLabel(vehicleCategory);
  const { start, end } = computeJalaliCycleRange();
  const deferrals = await getDeferralsForCategory(label, start, end);
  const payloads = await loadPhasePayloads(label, userId);
  const resolved = resolveEffectivePhaseFromPayloads(payloads, deferrals);

  if (resolved.phase) return resolved;

  const rawCount = await countRawQueueForCategory(label);
  if (rawCount === 0) {
    return { phase: null, data: payloads.stage1, autoPromoted: false, emptyQueue: true };
  }

  return { phase: null, data: payloads.stage1, autoPromoted: false };
}

function resolveEntryAssignPhase(entry, globalPhase, deferrals, payloads) {
  const queueType = entry.queueType || entry.queue_type;
  const driverId = entry.driverId || entry.driver_id;
  const entryId = entry.id;

  if (queueType === 'far') {
    if (globalPhase === 'stage1') {
      if (deferrals.stage1.has(driverId)) {
        return {
          phase: 'stage1',
          data: payloads.stage1,
          isDeferredThisPhase: true,
          assignStage: 'stage1',
        };
      }
      const activeS1 = filterActiveStage1Queue(payloads.stage1?.queue, deferrals.stage1);
      if (activeS1.some(q => q.id === entryId) && (payloads.stage1?.announcements || []).length > 0) {
        return {
          phase: 'stage1',
          data: payloads.stage1,
          isDeferredThisPhase: false,
          assignStage: 'stage1',
        };
      }
    }
    const s2far = payloads.stage2_far || {};
    return {
      phase: 'stage2_far',
      data: s2far,
      isDeferredThisPhase: false,
      assignStage: 'stage2',
      inactive: (s2far.announcements || []).length === 0,
    };
  }

  if (queueType === 'near') {
    if (globalPhase === 'stage1' || globalPhase === 'stage2_far') {
      return { phase: null, data: null, isDeferredThisPhase: false, assignStage: null, inactive: true };
    }
    return resolveNearEntryPhase(entry, globalPhase, deferrals, payloads);
  }

  return { phase: null, data: null, isDeferredThisPhase: false, assignStage: null, inactive: true };
}

async function ensureDeferralsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_queue_deferrals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_entry_id UUID NOT NULL,
      driver_id VARCHAR(255) NOT NULL,
      vehicle_category VARCHAR(100),
      dispatch_phase VARCHAR(40) NOT NULL,
      cycle_start TIMESTAMPTZ NOT NULL,
      cycle_end TIMESTAMPTZ NOT NULL,
      deferred_by_user_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getDeferredDriverIds(vehicleCategory, phase, cycleStart, cycleEnd) {
  try {
    await ensureDeferralsTable();
    const { rows } = await pool.query(
      `SELECT driver_id FROM dispatch_queue_deferrals
     WHERE vehicle_category IS NOT DISTINCT FROM $1
       AND dispatch_phase = $2
       AND cycle_start = $3
       AND cycle_end = $4`,
      [normalizeCategoryLabel(vehicleCategory), phase, cycleStart, cycleEnd]
    );
    return new Set(rows.map(r => r.driver_id).filter(Boolean));
  } catch (err) {
    console.warn('⚠️ [dispatch] deferrals lookup skipped:', err.message);
    return new Set();
  }
}

async function isDriverDeferred(queueEntryId, phase, cycleStart, cycleEnd) {
  try {
    await ensureDeferralsTable();
    const { rows } = await pool.query(
      `SELECT id FROM dispatch_queue_deferrals
     WHERE queue_entry_id = $1 AND dispatch_phase = $2
       AND cycle_start = $3 AND cycle_end = $4
     LIMIT 1`,
      [queueEntryId, phase, cycleStart, cycleEnd]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

function driverHasVeryFarHistory(entry) {
  return Boolean(
    entry?.hasVeryFarHistory ||
      entry?.blockedStage1 ||
      (entry?.longRouteHistory || []).length > 0
  );
}

function sortAnnouncements(list) {
  return [...list].sort((a, b) => {
    const aVf = isVeryFarAnnouncement(a) ? 1 : 0;
    const bVf = isVeryFarAnnouncement(b) ? 1 : 0;
    if (bVf !== aVf) return bVf - aVf;
    return (b.route?.round_trip_km ?? 0) - (a.route?.round_trip_km ?? 0);
  });
}

function buildAnnouncementEligibility(announcements, driverEntry, phase, options = {}) {
  const { isDeferred = false, inActiveQueue = true, freeMode = false } = options;
  const eligibleIds = new Set(
    filterEligibleForDriver(announcements, driverEntry, phase, []).map(a => a.id)
  );

  return sortAnnouncements(announcements).map(ann => {
    let eligible = eligibleIds.has(ann.id);
    let lockReason = null;

    if (isDeferred) {
      eligible = false;
      lockReason = LOCK_REASONS.deferred;
    } else if (!inActiveQueue) {
      eligible = false;
      lockReason = LOCK_REASONS.wrong_queue;
    } else if (!eligible) {
      if (
        driverHasVeryFarHistory(driverEntry) &&
        isVeryFarAnnouncement(ann) &&
        phase !== 'stage2_far' &&
        phase !== 'stage2_near_all' &&
        phase !== 'stage2'
      ) {
        lockReason = LOCK_REASONS.very_far_history;
      } else if (phase === 'stage2_near_vf' && !isVeryFarAnnouncement(ann)) {
        lockReason = LOCK_REASONS.near_vf_pending;
      } else if (phase === 'stage1' && !isVeryFarAnnouncement(ann)) {
        lockReason = LOCK_REASONS.wrong_phase;
      } else {
        lockReason = LOCK_REASONS.wrong_phase;
      }
    }

    const strictEligible = eligible;

    return {
      ...ann,
      eligible: freeMode && !isDeferred ? true : eligible,
      strictEligible,
      lockReason,
      isVeryFar: isVeryFarAnnouncement(ann),
    };
  });
}

function computeRowStatus(entry, phase, phaseData, deferredIds) {
  const driverId = entry.driverId || entry.driver_id;
  if (phase === 'stage1' && driverHasVeryFarHistory(entry)) {
    return 'very_far_history';
  }
  if (deferredIds.has(driverId)) {
    return 'deferred';
  }

  const queueType = entry.queueType || entry.queue_type;
  const inActiveQueue =
    phase === 'stage2_far'
      ? queueType === 'far'
      : phase === 'stage2_near_all'
        ? queueType === 'near'
        : (phaseData.queue || []).some(q => (q.id || q.queueEntryId) === entry.id);

  if (!inActiveQueue) {
    return 'inactive';
  }
  const eligibleCount = filterEligibleForDriver(
    phaseData.announcements || [],
    entry,
    phase,
    []
  ).length;
  if (eligibleCount > 0) {
    return 'ready';
  }
  return 'inactive';
}

function computeCanAssign(entry, entryCtx, eligibleCount, globalPhase) {
  if (entryCtx.isDeferredThisPhase) return false;

  const queueType = entry.queueType || entry.queue_type;
  const hasVf = driverHasVeryFarHistory(entry);
  const entryPhase = entryCtx.phase;

  if (queueType === 'near' && globalPhase === 'stage2_near_all') {
    if (hasVf || entryCtx.inactive || !entryPhase) return false;
    return eligibleCount > 0;
  }

  if (eligibleCount <= 0) return false;

  if (queueType === 'near' && entryPhase === 'stage2_near_vf' && !entryCtx.inactive) {
    if (hasVf) return false;
    return true;
  }

  if (queueType === 'near' && globalPhase === 'stage2_near_vf') {
    if (hasVf || entryCtx.inactive) return false;
    return Boolean(entryCtx.phase);
  }

  if (!entryCtx.phase || entryCtx.inactive) return false;
  if (entryCtx.phase === 'stage1' && hasVf) return false;
  return true;
}

function computeEntryRowStatus(entry, entryCtx, eligibleCount, globalPhase) {
  const entryPhase = entryCtx.phase;
  const queueType = entry.queueType || entry.queue_type;
  const hasVf = driverHasVeryFarHistory(entry);

  if (entryCtx.isDeferredThisPhase) {
    return 'deferred';
  }

  if (queueType === 'near' && entryPhase === 'stage2_near_vf') {
    if (hasVf || entryCtx.inactive) return 'inactive';
    return eligibleCount > 0 ? 'ready' : 'inactive';
  }

  if (queueType === 'near') {
    if (globalPhase === 'stage2_near_vf') {
      if (hasVf || entryCtx.inactive) return 'inactive';
      return eligibleCount > 0 ? 'ready' : 'inactive';
    }
    if (globalPhase === 'stage2_near_all') {
      if (hasVf) return 'inactive';
      return eligibleCount > 0 ? 'ready' : 'inactive';
    }
  }

  if (entryCtx.inactive || !entryPhase) {
    return 'inactive';
  }
  if (entryPhase === 'stage1' && hasVf) {
    return 'very_far_history';
  }
  return eligibleCount > 0 ? 'ready' : 'inactive';
}

async function getQueueAssignHints(vehicleCategory, userId = null, assignMode = 'free') {
  const freeMode = isFreeAssignMode(assignMode);
  const label = normalizeCategoryLabel(vehicleCategory);
  const { start, end, fromJalali, toJalali } = computeJalaliCycleRange();
  const deferrals = await getDeferralsForCategory(label, start, end);
  const payloads = await loadPhasePayloads(label, userId);
  const resolved = resolveEffectivePhaseFromPayloads(payloads, deferrals);
  const globalPhase = resolved.phase;
  const globalPhaseData = resolved.data || {};

  const { rows: queueRows } = await pool.query(
    `SELECT q.*, d.name AS driver_name, d.mobile, d.employee_id,
            v.model AS vehicle_model, v.vehicle_code, v.brand
     FROM dispatch_queue_entries q
     LEFT JOIN drivers d ON d.id = q.driver_id
     LEFT JOIN vehicles v ON v.id = q.vehicle_id
     WHERE q.queue_type IN ('far', 'near')
       AND q.vehicle_category = $1
     ORDER BY q.queue_type, q.position, q.created_at`,
    [label]
  );

  const historyByDriver = {};
  for (const phaseKey of Object.keys(payloads)) {
    for (const item of payloads[phaseKey].displayQueue || payloads[phaseKey].queue || []) {
      historyByDriver[item.driverId || item.driver_id] = item;
    }
  }

  const categoryLoads = mergeCategoryAnnouncements(payloads);
  const categoryLoadCount = categoryLoads.length;

  const entries = queueRows.map(row => {
    const enriched = historyByDriver[row.driver_id] || {
      id: row.id,
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      queueType: row.queue_type,
      vehicleCategory: row.vehicle_category,
      position: row.position,
      driver: {
        id: row.driver_id,
        name: row.driver_name,
        mobile: row.mobile,
        employeeId: row.employee_id,
      },
      vehicle: {
        id: row.vehicle_id,
        model: row.vehicle_model,
        vehicleCode: row.vehicle_code,
        brand: row.brand,
      },
      longRouteHistory: [],
      hasVeryFarHistory: false,
      blockedStage1: false,
    };

    let entryCtx = resolveEntryAssignPhase(
      enriched,
      globalPhase,
      deferrals,
      payloads
    );
    const entryQueueType = enriched.queueType || enriched.queue_type || row.queue_type;

    const entryPhaseBefore = entryCtx.phase;
    const entryPhaseDataBefore = entryCtx.data || {};
    let eligibleCountBefore = 0;
    if (entryPhaseBefore) {
      const annSourceBefore =
        entryPhaseBefore === 'stage2_near_all' && entryQueueType === 'near'
          ? payloads.stage2_near_all?.announcements || entryPhaseDataBefore.announcements || []
          : entryPhaseDataBefore.announcements || [];
      eligibleCountBefore = filterEligibleForDriver(
        annSourceBefore,
        enriched,
        entryPhaseBefore,
        []
      ).length;
    }

    if (!freeMode && entryQueueType === 'near' && !entryCtx.isDeferredThisPhase) {
      const s2all = payloads.stage2_near_all || {};
      const nearAllEligible = filterEligibleForDriver(
        s2all.announcements || [],
        enriched,
        'stage2_near_all',
        []
      ).length;
      if (
        nearAllEligible > 0 &&
        (globalPhase === 'stage2_near_all' || eligibleCountBefore === 0)
      ) {
        entryCtx = {
          phase: 'stage2_near_all',
          data: s2all,
          isDeferredThisPhase: false,
          assignStage: 'stage2',
          inactive: false,
        };
      }
    }

    const entryPhase = entryCtx.phase;
    const entryPhaseData = entryCtx.data || {};

    let eligibleCount = 0;
    if (entryPhase) {
      const annSource =
        entryPhase === 'stage2_near_all' && entryQueueType === 'near'
          ? payloads.stage2_near_all?.announcements || entryPhaseData.announcements || []
          : entryPhaseData.announcements || [];
      eligibleCount = filterEligibleForDriver(annSource, enriched, entryPhase, []).length;
    }

    const rowStatus = computeEntryRowStatus(enriched, entryCtx, eligibleCount, globalPhase);
    const strictCanAssign = computeCanAssign(enriched, entryCtx, eligibleCount, globalPhase);
    const canAssign = freeMode
      ? !entryCtx.isDeferredThisPhase && categoryLoadCount > 0
      : strictCanAssign;

    return {
      queueEntryId: row.id,
      rowStatus,
      canAssign,
      eligibleLoadCount: freeMode ? categoryLoadCount : eligibleCount,
      hasVeryFarHistory: driverHasVeryFarHistory(enriched),
      isDeferred: entryCtx.isDeferredThisPhase,
      entryPhase,
    };
  });

  const rawCount = await countRawQueueForCategory(label);

  return {
    effectivePhase: globalPhase,
    phaseLabel: globalPhase ? PHASE_LABELS[globalPhase] : null,
    autoPromoted: resolved.autoPromoted,
    assignMode: freeMode ? 'free' : 'rules',
    cycleStart: start,
    cycleEnd: end,
    cycleFromJalali: fromJalali,
    cycleToJalali: toJalali,
    pendingStage1Count: globalPhaseData.pendingStage1Count ?? 0,
    entries,
    emptyQueue: !globalPhase && rawCount === 0,
  };
}

async function buildFreeAssignContext(queueEntryId, queueRow, baseEntry, payloads, vehicleCategory, userId, deferrals, globalPhase, resolved, cycleMeta) {
  const { start, end, fromJalali, toJalali } = cycleMeta;
  const entryCtx = resolveEntryAssignPhase(baseEntry, globalPhase, deferrals, payloads);

  if (entryCtx.isDeferredThisPhase) {
    return {
      effectivePhase: null,
      phaseLabel: null,
      entryPhase: null,
      entryPhaseLabel: null,
      assignStage: null,
      assignMode: 'free',
      canDefer: false,
      isDeferredThisPhase: true,
      driverRowStatus: 'deferred',
      canAssign: false,
      cycleFromJalali: fromJalali,
      cycleToJalali: toJalali,
      cycleStart: start,
      cycleEnd: end,
      announcements: [],
      eligibleCount: 0,
      queueEntry: baseEntry,
      message: 'این راننده برای مرحله بعد «بمانم» ثبت کرده است.',
      stageMeta: {
        pendingStage1Count: payloads.stage1?.pendingStage1Count,
        autoPromoted: resolved.autoPromoted,
      },
    };
  }

  let allAnnouncements = mergeCategoryAnnouncements(payloads);
  if (!allAnnouncements.length) {
    const fallback = await fetchPhasePayload(vehicleCategory, 'stage2_near_all', userId);
    allAnnouncements = fallback.announcements || [];
  }

  const announcements = buildAnnouncementEligibility(allAnnouncements, baseEntry, 'stage2_near_all', {
    isDeferred: false,
    inActiveQueue: true,
    freeMode: true,
  });
  const eligibleCount = announcements.filter(a => a.eligible).length;
  const strictEligibleCount = filterEligibleForDriver(
    allAnnouncements,
    baseEntry,
    'stage2_near_all',
    []
  ).length;
  const hintCtx = {
    phase: 'stage2_near_all',
    data: payloads.stage2_near_all || {},
    isDeferredThisPhase: false,
    inactive: false,
  };
  const driverRowStatus = computeEntryRowStatus(
    baseEntry,
    hintCtx,
    strictEligibleCount,
    globalPhase || 'stage2_near_all'
  );

  return {
    effectivePhase: null,
    phaseLabel: null,
    entryPhase: null,
    entryPhaseLabel: null,
    assignStage: 'stage2',
    assignMode: 'free',
    canDefer: false,
    isDeferredThisPhase: false,
    driverRowStatus,
    canAssign: eligibleCount > 0,
    cycleFromJalali: fromJalali,
    cycleToJalali: toJalali,
    cycleStart: start,
    cycleEnd: end,
    announcements,
    eligibleCount,
    queueEntry: baseEntry,
    message:
      eligibleCount === 0
        ? 'اعلام بار معلقی برای تخصیص یافت نشد.'
        : undefined,
    stageMeta: {
      pendingStage1Count: payloads.stage1?.pendingStage1Count,
      autoPromoted: resolved.autoPromoted,
    },
  };
}

async function getAssignContext(queueEntryId, userId = null, assignMode = 'free') {
  const freeMode = isFreeAssignMode(assignMode);
  const { rows } = await pool.query(
    `SELECT * FROM dispatch_queue_entries WHERE id = $1`,
    [queueEntryId]
  );
  if (!rows.length) {
    throw new Error('نوبت یافت نشد.');
  }
  const queueRow = rows[0];
  const vehicleCategory = normalizeCategoryLabel(queueRow.vehicle_category);
  const { start, end, fromJalali, toJalali } = computeJalaliCycleRange();
  const deferrals = await getDeferralsForCategory(vehicleCategory, start, end);
  const payloads = await loadPhasePayloads(vehicleCategory, userId);
  const resolved = resolveEffectivePhaseFromPayloads(payloads, deferrals);
  const globalPhase = resolved.phase;
  const cycleMeta = { start, end, fromJalali, toJalali };

  const baseEntry = {
    id: queueRow.id,
    driverId: queueRow.driver_id,
    vehicleId: queueRow.vehicle_id,
    queueType: queueRow.queue_type,
    vehicleCategory: queueRow.vehicle_category,
    position: queueRow.position,
    longRouteHistory: [],
    hasVeryFarHistory: false,
    blockedStage1: false,
  };

  for (const phaseKey of Object.keys(payloads)) {
    const fromPayload =
      (payloads[phaseKey].displayQueue || []).find(item => item.id === queueEntryId) ||
      (payloads[phaseKey].queue || []).find(item => item.id === queueEntryId);
    if (fromPayload) {
      Object.assign(baseEntry, fromPayload);
      break;
    }
  }

  if (freeMode) {
    return buildFreeAssignContext(
      queueEntryId,
      queueRow,
      baseEntry,
      payloads,
      vehicleCategory,
      userId,
      deferrals,
      globalPhase,
      resolved,
      cycleMeta
    );
  }

  let entryCtx = resolveEntryAssignPhase(baseEntry, globalPhase, deferrals, payloads);
  let phase = entryCtx.phase;

  if ((!phase || entryCtx.inactive) && queueRow.queue_type === 'near') {
    const s2all = payloads.stage2_near_all || {};
    if ((s2all.announcements || []).length > 0 && !entryCtx.isDeferredThisPhase) {
      entryCtx = {
        phase: 'stage2_near_all',
        data: s2all,
        isDeferredThisPhase: false,
        assignStage: 'stage2',
        inactive: false,
      };
      phase = 'stage2_near_all';
    }
  }

  if (!phase || entryCtx.inactive) {
    const rawCount = await countRawQueueForCategory(vehicleCategory);
    return {
      effectivePhase: globalPhase,
      phaseLabel: globalPhase ? PHASE_LABELS[globalPhase] : null,
      entryPhase: phase,
      entryPhaseLabel: phase ? PHASE_LABELS[phase] : null,
      assignStage: null,
      assignMode: 'rules',
      canDefer: false,
      isDeferredThisPhase: entryCtx.isDeferredThisPhase,
      driverRowStatus: entryCtx.isDeferredThisPhase
        ? 'deferred'
        : driverHasVeryFarHistory(baseEntry)
          ? 'very_far_history'
          : 'inactive',
      cycleFromJalali: fromJalali,
      cycleToJalali: toJalali,
      cycleStart: start,
      cycleEnd: end,
      announcements: [],
      eligibleCount: 0,
      queueEntry: baseEntry,
      message:
        rawCount === 0
          ? 'صف نوبت خالی است.'
          : 'بار مناسب برای تخصیص در هیچ فازی یافت نشد.',
      stageMeta: {
        pendingStage1Count: payloads.stage1?.pendingStage1Count,
        autoPromoted: resolved.autoPromoted,
      },
    };
  }

  const q = phaseToQuery(phase);
  const { statusCode, data } = await invokeGetStageCandidates(
    {
      ...q,
      category: vehicleCategory,
      queueEntryId,
    },
    userId ? { id: userId } : null
  );
  if (statusCode >= 400) {
    throw new Error(data?.message || 'خطا در دریافت اعلام بارها');
  }

  const driverEntry =
    (data.queue || []).find(item => item.id === queueEntryId) ||
    (data.displayQueue || []).find(item => item.id === queueEntryId) ||
    baseEntry;

  const isDeferred = entryCtx.isDeferredThisPhase;
  const inActiveNearVfTurn = isNearDriverInActiveVfTurn(driverEntry, deferrals, payloads);
  const inActiveQueue =
    phase === 'stage2_far' || phase === 'stage2_near_all'
      ? (driverEntry.queueType || driverEntry.queue_type) ===
        (queueRow.queue_type === 'far' ? 'far' : 'near')
      : phase === 'stage2_near_vf'
        ? inActiveNearVfTurn
        : (data.queue || []).some(item => item.id === queueEntryId);

  let allAnnouncements = data.announcements || [];
  if (phase === 'stage1' || phase === 'stage2_near_vf') {
    const allData = payloads.stage2_near_all || (await fetchPhasePayload(vehicleCategory, 'stage2_near_all', userId));
    const merged = new Map();
    for (const ann of allData.announcements || []) merged.set(ann.id, ann);
    for (const ann of data.announcements || []) merged.set(ann.id, ann);
    allAnnouncements = [...merged.values()];
  }

  const announcements = buildAnnouncementEligibility(allAnnouncements, driverEntry, phase, {
    isDeferred,
    inActiveQueue:
      inActiveQueue ||
      phase === 'stage2_far' ||
      phase === 'stage2_near_all' ||
      (phase === 'stage2_near_vf' && inActiveNearVfTurn),
    freeMode: false,
  });
  const eligibleCount = announcements.filter(a => a.eligible).length;

  const strictEligibleCount = filterEligibleForDriver(
    allAnnouncements,
    driverEntry,
    phase,
    []
  ).length;
  const driverRowStatus = computeEntryRowStatus(
    driverEntry,
    entryCtx,
    strictEligibleCount,
    globalPhase
  );
  const canAssignNow = computeCanAssign(driverEntry, entryCtx, eligibleCount, globalPhase);
  const canDeferNow =
    !isDeferred &&
    (phase === 'stage1'
      ? canDeferPhase(phase) && inActiveQueue
      : shouldOfferNearVfDefer(driverEntry, deferrals, payloads, globalPhase) ||
        (canDeferPhase(phase) && inActiveNearVfTurn));

  return {
    effectivePhase: globalPhase,
    phaseLabel: globalPhase ? PHASE_LABELS[globalPhase] : null,
    entryPhase: phase,
    entryPhaseLabel: PHASE_LABELS[phase],
    assignStage: entryCtx.assignStage || assignStageFromPhase(phase),
    assignMode: 'rules',
    canDefer: canDeferNow,
    isDeferredThisPhase: isDeferred,
    driverRowStatus,
    canAssign: canAssignNow,
    cycleFromJalali: fromJalali,
    cycleToJalali: toJalali,
    cycleStart: start,
    cycleEnd: end,
    announcements,
    eligibleCount,
    queueEntry: driverEntry,
    stageMeta: {
      pendingStage1Count: data.pendingStage1Count,
      autoPromoted: resolved.autoPromoted,
    },
  };
}

async function deferQueueEntry(queueEntryId, userId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM dispatch_queue_entries WHERE id = $1`,
    [queueEntryId]
  );
  if (!rows.length) throw new Error('نوبت یافت نشد.');
  const entry = rows[0];
  const vehicleCategory = normalizeCategoryLabel(entry.vehicle_category);
  const { start, end } = computeJalaliCycleRange();
  const deferrals = await getDeferralsForCategory(vehicleCategory, start, end);
  const payloads = await loadPhasePayloads(vehicleCategory, userId);
  const resolved = resolveEffectivePhaseFromPayloads(payloads, deferrals);
  const globalPhase = resolved.phase;

  const baseEntry = {
    id: entry.id,
    driverId: entry.driver_id,
    queueType: entry.queue_type,
    vehicleCategory: entry.vehicle_category,
    longRouteHistory: [],
    hasVeryFarHistory: false,
  };
  for (const phaseKey of Object.keys(payloads)) {
    const fromPayload =
      (payloads[phaseKey].displayQueue || []).find(item => item.id === queueEntryId) ||
      (payloads[phaseKey].queue || []).find(item => item.id === queueEntryId);
    if (fromPayload) Object.assign(baseEntry, fromPayload);
  }

  const entryCtx = resolveEntryAssignPhase(baseEntry, globalPhase, deferrals, payloads);
  const phase = entryCtx.phase;
  const deferPhase =
    phase && canDeferPhase(phase)
      ? phase
      : shouldOfferNearVfDefer(baseEntry, deferrals, payloads, globalPhase)
        ? 'stage2_near_vf'
        : null;

  if (!deferPhase || entryCtx.isDeferredThisPhase) {
    throw new Error('در این فاز امکان «بمانم برای مرحله بعد» وجود ندارد.');
  }

  const already = await isDriverDeferred(queueEntryId, deferPhase, start, end);
  if (already) {
    throw new Error('قبلاً برای این فاز ثبت «بمانم» شده است.');
  }

  await ensureDeferralsTable();
  await pool.query(
    `INSERT INTO dispatch_queue_deferrals
      (queue_entry_id, driver_id, vehicle_category, dispatch_phase, cycle_start, cycle_end, deferred_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      queueEntryId,
      entry.driver_id,
      vehicleCategory,
      deferPhase,
      start,
      end,
      userId || null,
    ]
  );

  return getAssignContext(queueEntryId, userId);
}

module.exports = {
  getAssignContext,
  getQueueAssignHints,
  deferQueueEntry,
  resolveEffectivePhase,
  PHASE_LABELS,
  LOCK_REASONS,
};
