const { isVeryFarAnnouncement, classifyRouteDistanceBucket } = require('./dispatchRouteRules');
const {
  vehicleMatchesCategory,
  detectVehicleCategoryKey,
  resolveCategoryKey,
  presetCategories,
} = require('./dispatchVehicleCategory');

const { parseJalaliDateString } = require('../../utils/jalali');

const CATEGORY_KEY_TO_LABEL = {
  trailer: 'تریلی',
  'mini-trailer': 'مینی تریلی',
  'ten-wheel': 'ده چرخ',
};

/**
 * رد مالی «اجرا نشده» یعنی راننده آن تور را نرفته — از سابقه نوبت حذف می‌شود.
 * رد مالی «ناقص» یعنی رفته ولی رکوردش با تور استثنایی جایگزین می‌شود — سابقه می‌ماند.
 */
const FINANCE_REJECT_NOT_EXECUTED = 'not_executed';

function isFinanceRejected(row) {
  return String(row?.finance_disposition || row?.financeDisposition || '') === 'rejected';
}

function isTripNotExecuted(row) {
  return (
    isFinanceRejected(row) &&
    String(row?.finance_reject_type || row?.financeRejectType || '') ===
      FINANCE_REJECT_NOT_EXECUTED
  );
}

function normalizeCategoryFilter(categoryParam) {
  if (!categoryParam || typeof categoryParam !== 'string') return null;
  const trimmed = categoryParam.trim();
  if (!trimmed) return null;
  return CATEGORY_KEY_TO_LABEL[trimmed] || trimmed;
}

/** برچسب فارسی دسته خودرو از نوع اعلام‌بار / دسته نوبت / خودرو */
function resolveAssignmentVehicleCategory(row) {
  const candidates = [
    row.vehicle_type,
    row.vehicleType,
    row.assignment_vehicle_category,
    row.vehicle_category,
    row.vehicleCategory,
  ];
  for (const raw of candidates) {
    if (!raw || !String(raw).trim()) continue;
    const key =
      resolveCategoryKey(String(raw)) || detectVehicleCategoryKey(String(raw));
    if (key && CATEGORY_KEY_TO_LABEL[key]) return CATEGORY_KEY_TO_LABEL[key];
    const preset = (presetCategories || []).find(
      p => p.label === String(raw).trim() || p.key === String(raw).trim()
    );
    if (preset) return preset.label;
  }
  return null;
}

function routeIsVeryFar(row) {
  return isVeryFarAnnouncement({
    route: {
      distance_category: row.distance_category,
      route_category: row.route_category,
    },
  });
}

function resolveAssignmentCertainty(row) {
  const freightStatus = row.freight_status || row.status || null;
  const isCancelledFlag = Boolean(row.is_cancelled);
  const freightCancelled = freightStatus === 'Cancelled';
  const finalizedAt = row.assignment_finalized_at || null;
  const isFinalized =
    Boolean(finalizedAt) || freightStatus === 'Finalized' || freightStatus === 'InTransit';

  // رد مالی «اجرا نشده»: سفر انجام نشده — نه در سابقه خیلی‌دور، نه در آمار دوره
  if (isTripNotExecuted(row)) {
    return { certainty: 'finance_rejected', certaintyLabel: 'رد مالی — اجرا نشده' };
  }
  // لغو واقعی اعلام‌بار (قبل از نهایی شدن)
  if (freightCancelled && !isFinalized) {
    return { certainty: 'cancelled', certaintyLabel: 'لغو / تعیین‌تکلیف نشده' };
  }
  // سفر نهایی‌شده برای سابقه ترجیحات حفظ می‌شود —
  // حتی اگر بعداً برای خروج از تابلو is_cancelled شده باشد (تخصیص بار جدید)
  if (isFinalized) {
    return { certainty: 'finalized', certaintyLabel: 'نهایی' };
  }
  // باطل‌شده قبل از نهایی (مثلاً جایگزینی روی تابلو)
  if (isCancelledFlag || freightCancelled) {
    return { certainty: 'cancelled', certaintyLabel: 'لغو / تعیین‌تکلیف نشده' };
  }
  return { certainty: 'pending', certaintyLabel: 'موقت' };
}

function classifyRouteBucket(row) {
  const bucket = classifyRouteDistanceBucket(row);
  if (bucket) return bucket;
  return 'far';
}

function mapAssignmentRow(row, timestampToJalaliDate) {
  const queueType = row.queue_type || (row.stage === 'stage1' ? 'far' : 'near');
  const certaintyInfo = resolveAssignmentCertainty(row);
  const isVeryFar = routeIsVeryFar(row);
  const routeBucket = classifyRouteBucket(row);
  const vehicleCategory = resolveAssignmentVehicleCategory(row);

  return {
    id: row.id,
    announcementId: row.freight_announcement_id,
    announcementCode: row.announcement_code,
    stage: row.stage,
    queueType,
    routeBucket,
    isVeryFar,
    lineType: row.line_type,
    vehicleType: row.vehicle_type,
    vehicleCategory,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    destinationOrder: row.destination_created_at
      ? new Date(row.destination_created_at).getTime()
      : 0,
    routeCategory: row.route_category,
    distanceCategory: row.distance_category,
    roundTripKm:
      row.round_trip_km != null
        ? Number(row.round_trip_km)
        : row.distance_km != null
          ? Number(row.distance_km)
          : null,
    queuePosition: row.queue_position ?? null,
    queueEntryId: row.queue_entry_id || null,
    vehicleCode: row.vehicle_code || null,
    assignedAt: row.created_at,
    assignedAtJalali: row.assigned_at_jalali || timestampToJalaliDate(row.created_at),
    isCancelled: row.is_cancelled || false,
    freightStatus: row.freight_status || null,
    assignmentFinalizedAt: row.assignment_finalized_at || null,
    financeDisposition: row.finance_disposition || null,
    financeRejectType: row.finance_reject_type || null,
    certainty: certaintyInfo.certainty,
    certaintyLabel: certaintyInfo.certaintyLabel,
    note: null,
  };
}

function sameDayKey(dateValue) {
  if (!dateValue) return null;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDestination(item) {
  return item.destinationCity || item.originCity || 'نامشخص';
}

function formatKm(km) {
  if (km == null || Number.isNaN(Number(km))) return '';
  return `${Math.round(Number(km)).toLocaleString('fa-IR')} km`;
}

/** تخصیص‌هایی که سفرشان انجام نشده و نباید در سابقه و تحلیل بیایند */
const EXCLUDED_CERTAINTIES = new Set(['cancelled', 'finance_rejected']);

function buildAssignmentNotes(taken, skipped) {
  const takenByDay = new Map();
  for (const item of taken) {
    const key = sameDayKey(item.assignedAt);
    if (!key) continue;
    const list = takenByDay.get(key) || [];
    list.push(item);
    takenByDay.set(key, list);
  }

  const skippedByDay = new Map();
  for (const item of skipped) {
    const key = sameDayKey(item.seenAt);
    if (!key) continue;
    const list = skippedByDay.get(key) || [];
    list.push(item);
    skippedByDay.set(key, list);
  }

  for (const item of taken) {
    const dayKey = sameDayKey(item.assignedAt);
    if (!dayKey) continue;

    if (EXCLUDED_CERTAINTIES.has(item.certainty)) {
      const label = item.certainty === 'finance_rejected' ? 'رد مالی — اجرا نشده' : 'لغو';
      const sameDayTaken = (takenByDay.get(dayKey) || []).filter(
        t => t.id !== item.id && !EXCLUDED_CERTAINTIES.has(t.certainty)
      );
      const sameDaySkipped = (skippedByDay.get(dayKey) || []).filter(s => s.isVeryFar);
      if (sameDayTaken.length > 0) {
        const chosen = sameDayTaken[0];
        item.note = `(${label} — در همان روز «${formatDestination(chosen)}» انتخاب شد)`;
      } else if (sameDaySkipped.length > 0) {
        const missed = sameDaySkipped[0];
        item.note = `(${label} — بار خیلی‌دور «${formatDestination(missed)}» ${formatKm(missed.roundTripKm)} در دسترس بود)`;
      } else {
        item.note = `(${label} — تعیین‌تکلیف نشده)`;
      }
      continue;
    }

    const sameDaySkippedVf = (skippedByDay.get(dayKey) || []).filter(
      s => s.isVeryFar && s.announcementId !== item.announcementId
    );
    if (sameDaySkippedVf.length > 0 && !item.isVeryFar) {
      const missed = sameDaySkippedVf[0];
      item.note = `(بار خیلی‌دور «${formatDestination(missed)}» ${formatKm(missed.roundTripKm)} — انتخاب: «${formatDestination(item)}»)`;
    }
  }

  for (const item of skipped) {
    const dayKey = sameDayKey(item.seenAt);
    const sameDayTaken = dayKey ? takenByDay.get(dayKey) || [] : [];
    const activeTaken = sameDayTaken.filter(t => !EXCLUDED_CERTAINTIES.has(t.certainty));
    if (activeTaken.length > 0) {
      const chosen = activeTaken[0];
      const vfLabel = item.isVeryFar ? 'بار خیلی‌دور' : 'بار';
      item.note = `(${vfLabel} «${formatDestination(item)}» ${formatKm(item.roundTripKm)} — انتخاب: «${formatDestination(chosen)}»)`;
    } else {
      item.note = item.isVeryFar
        ? `(بار خیلی‌دور «${formatDestination(item)}» ${formatKm(item.roundTripKm)} — برداشته نشد)`
        : `(فرصت «${formatDestination(item)}» — برداشته نشد)`;
    }
  }
}

function buildCycleSummary(taken) {
  const summary = { veryFar: [], far: [], near: [] };
  const finalized = taken.filter(item => item.certainty === 'finalized');

  for (const item of finalized) {
    const entry = {
      id: item.id,
      announcementCode: item.announcementCode,
      destinationCity: item.destinationCity,
      originCity: item.originCity,
      roundTripKm: item.roundTripKm,
      queueType: item.queueType,
      isVeryFar: item.isVeryFar,
      assignedAtJalali: item.assignedAtJalali,
      queuePosition: item.queuePosition,
    };
    if (item.routeBucket === 'veryFar') summary.veryFar.push(entry);
    else if (item.routeBucket === 'far') summary.far.push(entry);
    else summary.near.push(entry);
  }

  const byKmDesc = (a, b) => (b.roundTripKm ?? 0) - (a.roundTripKm ?? 0);
  summary.veryFar.sort(byKmDesc);
  summary.far.sort(byKmDesc);
  summary.near.sort(byKmDesc);
  return summary;
}

function buildStats(taken) {
  return {
    finalizedCount: taken.filter(t => t.certainty === 'finalized').length,
    pendingCount: taken.filter(t => t.certainty === 'pending').length,
    cancelledCount: taken.filter(t => t.certainty === 'cancelled').length,
    financeRejectedCount: taken.filter(t => t.certainty === 'finance_rejected').length,
    totalTaken: taken.length,
  };
}

const TOP_QUEUE_POSITION = 4;

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function normalizeLineKey(lineType) {
  const raw = String(lineType || '')
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
  const lower = raw.toLowerCase();
  if (raw === 'پاستوریزه' || lower === 'dairy' || lower === 'pasturized' || lower === 'pasteurized') {
    return 'dairy';
  }
  if (raw === 'بستنی' || lower === 'icecream' || lower === 'ice-cream' || lower === 'basteni') {
    return 'iceCream';
  }
  if (raw === 'لبنیات-فروتلند' || raw === 'لبنیات فروتلند' || lower === 'ambient') {
    return 'ambient';
  }
  return 'other';
}

function isFarQueueType(queueType) {
  return queueType === 'far';
}

function isNearQueueType(queueType) {
  return queueType === 'near';
}

function isTopQueuePosition(position) {
  const n = Number(position);
  return Number.isFinite(n) && n >= 1 && n <= TOP_QUEUE_POSITION;
}

function routeMixOf(items) {
  const veryFar = items.filter(item => item.routeBucket === 'veryFar' || item.isVeryFar).length;
  const far = items.filter(item => item.routeBucket === 'far' && !item.isVeryFar).length;
  const near = items.filter(item => item.routeBucket === 'near').length;
  const total = items.length;
  return {
    veryFar: { count: veryFar, percent: percent(veryFar, total) },
    far: { count: far, percent: percent(far, total) },
    near: { count: near, percent: percent(near, total) },
  };
}

function averageKmOf(items) {
  const kms = items
    .map(item => Number(item.roundTripKm))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!kms.length) return null;
  return Math.round(kms.reduce((s, n) => s + n, 0) / kms.length);
}

function topDestinationsOf(items, limit = 3) {
  const counts = new Map();
  for (const item of items) {
    const city = String(item.destinationCity || '').trim();
    if (!city) continue;
    counts.set(city, (counts.get(city) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([city, count]) => ({ city, count }));
}

function buildSituationBucket(key, title, items) {
  return {
    key,
    title,
    tripCount: items.length,
    routeMix: routeMixOf(items),
    averageKm: averageKmOf(items),
    topDestinations: topDestinationsOf(items),
  };
}

function lineShare(count, total) {
  return { count, percent: percent(count, total) };
}

function buildLineMix(items) {
  const dairy = items.filter(item => normalizeLineKey(item.lineType) === 'dairy').length;
  const iceCream = items.filter(item => normalizeLineKey(item.lineType) === 'iceCream').length;
  const ambient = items.filter(item => normalizeLineKey(item.lineType) === 'ambient').length;
  const other = items.length - dairy - iceCream - ambient;
  const dairyIceTotal = dairy + iceCream;
  return {
    dairy: lineShare(dairy, items.length),
    iceCream: lineShare(iceCream, items.length),
    ambient: lineShare(ambient, items.length),
    other: lineShare(other, items.length),
    dairyVsIceCream: {
      dairy: lineShare(dairy, dairyIceTotal),
      iceCream: lineShare(iceCream, dairyIceTotal),
      comparedCount: dairyIceTotal,
    },
  };
}

function situationHint(bucket) {
  if (!bucket || bucket.tripCount < 3) {
    return 'نمونه کافی نیست.';
  }
  const vf = bucket.routeMix.veryFar.percent;
  const near = bucket.routeMix.near.percent;
  if (vf >= 45) return 'در این وضعیت بیشتر بار خیلی‌دور برداشته.';
  if (near >= 55) return 'در این وضعیت تمایل به بار نزدیک داشته.';
  return 'ترکیب بار در این وضعیت متعادل بوده.';
}

function buildBehaviorNarrative(situations, lineMix, meta) {
  const parts = [];
  const far = situations.find(s => s.key === 'farQueue');
  const near = situations.find(s => s.key === 'nearQueue');
  const farTop = situations.find(s => s.key === 'farTop4');
  const nearTop = situations.find(s => s.key === 'nearTop4');

  if (!meta.tripCount) {
    return 'در این بازه سفر نهایی ثبت نشده؛ برای تحلیل رفتار باید حداقل چند تخصیص قطعی باشد.';
  }

  parts.push(
    `در ${meta.fromJalali} تا ${meta.toJalali}، ${meta.tripCount} سفر نهایی بررسی شد.`
  );

  if (meta.missingQueuePositionCount > 0) {
    parts.push(
      `شماره نوبت در ${meta.missingQueuePositionCount} سفر خالی است؛ دستهٔ نفرات ۱ تا ۴ فقط روی سفرهایی است که شماره نوبت دارند.`
    );
  }

  if (far && far.tripCount >= 3) {
    if (far.routeMix.near.percent >= 50) {
      parts.push('حتی وقتی در نوبت دور بوده، بیشتر بار نزدیک برداشته — برای اعلام خودکار بله بهتر است اول بار نزدیک پیشنهاد شود.');
    } else if (far.routeMix.veryFar.percent >= 40) {
      parts.push('وقتی در نوبت دور بوده بار خیلی‌دور را خوب برداشته؛ در فاز دور می‌توان او را در اولویت خیلی‌دور گذاشت.');
    } else {
      parts.push(situationHint(far));
    }
  }

  if (near && near.tripCount >= 3) {
    if (near.routeMix.veryFar.percent >= 35) {
      parts.push('در نوبت نزدیک هم گاهی خیلی‌دور برداشته؛ یعنی الزاماً به بار کوتاه محدود نیست.');
    } else if (near.routeMix.near.percent >= 55) {
      parts.push('در نوبت نزدیک رفتار کلاسیک داشته و عمدتاً بار نزدیک برداشته.');
    }
  }

  if (far && farTop && far.tripCount >= 4 && farTop.tripCount >= 2) {
    const delta = farTop.routeMix.veryFar.percent - far.routeMix.veryFar.percent;
    if (delta >= 10) {
      parts.push('وقتی جزء ۴ نفر اول نوبت دور بوده، سهم خیلی‌دور بالاتر رفته — یعنی اول صف دور را جدی می‌گیرد.');
    } else if (farTop.routeMix.near.percent >= 55) {
      parts.push('حتی بین ۴ نفر اول نوبت دور، باز هم بار نزدیک را ترجیح داده.');
    }
  }

  if (nearTop && nearTop.tripCount >= 3) {
    if (nearTop.routeMix.near.percent >= 60) {
      parts.push('در ۴ نفر اول نوبت نزدیک تقریباً فقط بار نزدیک برداشته.');
    } else if (nearTop.routeMix.veryFar.percent >= 30) {
      parts.push('در ۴ نفر اول نوبت نزدیک هم خیلی‌دور قبول کرده؛ برای اتومات بله می‌توان خیلی‌دور را هم به او نشان داد.');
    }
  }

  const compared = lineMix.dairyVsIceCream.comparedCount;
  if (compared >= 3) {
    const dairyPct = lineMix.dairyVsIceCream.dairy.percent;
    const icePct = lineMix.dairyVsIceCream.iceCream.percent;
    if (icePct >= 60) {
      parts.push(`بین بستنی و پاستوریزه، بستنی غالب است (${icePct}٪ بستنی در برابر ${dairyPct}٪ پاستوریزه).`);
    } else if (dairyPct >= 60) {
      parts.push(`بین بستنی و پاستوریزه، پاستوریزه غالب است (${dairyPct}٪ پاستوریزه در برابر ${icePct}٪ بستنی).`);
    } else {
      parts.push(`بین بستنی و پاستوریزه تقریباً متعادل بوده (${dairyPct}٪ پاستوریزه و ${icePct}٪ بستنی).`);
    }
  } else if (lineMix.ambient.count > 0) {
    parts.push('بیشتر سفرها خارج از مقایسه بستنی/پاستوریزه بوده (مثلاً فروتلند).');
  }

  if (parts.length === 1) {
    parts.push('الگوی مشخصی از این نمونه درنمی‌آید؛ با سفرهای بیشتر تحلیل پایدارتر می‌شود.');
  }

  return parts.join(' ');
}

function buildBehaviorAnalysis(taken, meta = {}) {
  const source = (taken || []).filter(item => item && !EXCLUDED_CERTAINTIES.has(item.certainty));
  const finalized = source.filter(item => item.certainty === 'finalized');
  const trips = finalized.length ? finalized : source;

  const farQueue = trips.filter(item => isFarQueueType(item.queueType));
  const nearQueue = trips.filter(item => isNearQueueType(item.queueType));
  const farTop4 = farQueue.filter(item => isTopQueuePosition(item.queuePosition));
  const nearTop4 = nearQueue.filter(item => isTopQueuePosition(item.queuePosition));

  const situations = [
    buildSituationBucket('farQueue', 'وقتی در نوبت دور بوده', farQueue),
    buildSituationBucket('nearQueue', 'وقتی در نوبت نزدیک بوده', nearQueue),
    buildSituationBucket('farTop4', 'وقتی جزء نفرات ۱ تا ۴ نوبت دور بوده', farTop4),
    buildSituationBucket('nearTop4', 'وقتی جزء نفرات ۱ تا ۴ نوبت نزدیک بوده', nearTop4),
  ];

  const lineMix = buildLineMix(trips);
  const missingQueuePositionCount = trips.filter(
    item =>
      (isFarQueueType(item.queueType) || isNearQueueType(item.queueType)) &&
      !isTopQueuePosition(item.queuePosition) &&
      (item.queuePosition == null || item.queuePosition === '')
  ).length;

  const analysisMeta = {
    tripCount: trips.length,
    missingQueuePositionCount,
    fromJalali: meta.fromJalali || '',
    toJalali: meta.toJalali || '',
    usedFinalizedOnly: finalized.length > 0,
  };

  return {
    fromJalali: analysisMeta.fromJalali,
    toJalali: analysisMeta.toJalali,
    tripCount: analysisMeta.tripCount,
    usedFinalizedOnly: analysisMeta.usedFinalizedOnly,
    missingQueuePositionCount,
    situations,
    lineMix,
    narrative: buildBehaviorNarrative(situations, lineMix, analysisMeta),
  };
}

function mapOpportunityRow(row, timestampToJalaliDate) {
  const isVeryFar = routeIsVeryFar(row);
  return {
    id: String(row.id),
    announcementId: row.freight_announcement_id,
    announcementCode: row.announcement_code,
    stage: row.stage,
    lineType: row.line_type,
    vehicleType: row.vehicle_type,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    routeCategory: row.route_category,
    distanceCategory: row.distance_category,
    roundTripKm: row.round_trip_km != null ? Number(row.round_trip_km) : null,
    isVeryFar,
    queuePosition: row.queue_position ?? null,
    seenAt: row.seen_at,
    seenAtJalali: row.seen_at_jalali || timestampToJalaliDate(row.seen_at),
    note: null,
  };
}

function isFarOrVeryFarOpportunity(item) {
  if (item?.isVeryFar) return true;
  const stage = (item?.stage || '').toString();
  return stage === 'stage1' || stage === 'stage2_far';
}

function categoryKeyFromText(value) {
  if (!value || !String(value).trim()) return null;
  return resolveCategoryKey(String(value)) || detectVehicleCategoryKey(String(value));
}

function resolveTripCategoryLabel(row) {
  const keys = [
    categoryKeyFromText(row.assignment_vehicle_category),
    categoryKeyFromText(row.vehicle_type),
    categoryKeyFromText(row.current_vehicle_type),
    categoryKeyFromText(row.vehicle_model),
  ];
  for (const key of keys) {
    if (key === 'mini-trailer' || key === 'ten-wheel') {
      return CATEGORY_KEY_TO_LABEL[key];
    }
  }
  for (const key of keys) {
    if (key && CATEGORY_KEY_TO_LABEL[key]) return CATEGORY_KEY_TO_LABEL[key];
  }
  return null;
}

function resolveTripKmAndBucket(row) {
  const assignedKm = Number(row.assigned_route_km);
  const destKm = Number(row.dest_route_km);
  const assignKm = Number(row.assignment_distance_km);
  const kmCandidates = [assignedKm, destKm, assignKm].filter(n => Number.isFinite(n) && n > 0);
  const km = kmCandidates.length ? Math.max(...kmCandidates) : 0;

  const routeLike = {
    distance_category: row.assigned_distance_category || row.dest_distance_category || '',
    route_category: row.assigned_route_category || row.dest_route_category || '',
    round_trip_km: km || null,
    distance_km: km || null,
  };
  let bucket = classifyRouteDistanceBucket(routeLike);
  if (!bucket && isVeryFarAnnouncement({ route: routeLike })) bucket = 'veryFar';
  if (!bucket && km > 0) bucket = km >= 500 ? 'far' : 'near';
  return { km, bucket };
}

/** تاریخ قرارگرفتن تور در دوره نوبت: اتمام تخصیص روی نوبت، وگرنه روی اعلام‌بار */
const CYCLE_MEMBERSHIP_AT_SQL = `COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at)`;

async function fetchDriverCycleTrips(pool, driverIds, cycleStart, cycleEnd, options = {}) {
  if (!driverIds?.length) return [];
  const finalizedOnly = options.finalizedOnly !== false;
  const membershipSql = `
        AND ${CYCLE_MEMBERSHIP_AT_SQL} IS NOT NULL
        AND ${CYCLE_MEMBERSHIP_AT_SQL} >= $2
        AND ${CYCLE_MEMBERSHIP_AT_SQL} <= $3`;
  const finalizedSql = finalizedOnly
    ? `${membershipSql}
        AND (
          da.is_cancelled IS NULL
          OR da.is_cancelled = FALSE
          OR ${CYCLE_MEMBERSHIP_AT_SQL} IS NOT NULL
        )`
    : `${membershipSql}
        AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)`;
  const { rows } = await pool.query(
    `
      SELECT
        da.id,
        da.driver_id,
        da.freight_announcement_id,
        da.created_at,
        ${CYCLE_MEMBERSHIP_AT_SQL} AS cycle_at,
        da.stage,
        da.distance_km AS assignment_distance_km,
        da.vehicle_category AS assignment_vehicle_category,
        fa.vehicle_type,
        fa.announcement_code,
        v.current_vehicle_type,
        v.model AS vehicle_model,
        dr.round_trip_km AS assigned_route_km,
        dr.distance_category AS assigned_distance_category,
        dr.route_category AS assigned_route_category,
        dr.city AS assigned_route_city,
        dest.round_trip_km AS dest_route_km,
        dest.distance_category AS dest_distance_category,
        dest.route_category AS dest_route_category,
        dest.city AS dest_city,
        dest_cities.cities AS dest_cities_label
      FROM dispatch_assignments da
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      LEFT JOIN LATERAL (
        SELECT
          dr2.round_trip_km,
          dr2.distance_category,
          dr2.route_category,
          dr2.city
        FROM freight_destinations fd
        INNER JOIN dispatch_routes dr2
          ON dr2.is_active = TRUE
         AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(dr2.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
           = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(fd.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
        WHERE fd.freight_announcement_id = fa.id
        ORDER BY COALESCE(dr2.round_trip_km, 0) DESC NULLS LAST
        LIMIT 1
      ) dest ON TRUE
      LEFT JOIN LATERAL (
        SELECT string_agg(x.city, '، ' ORDER BY x.min_sort) AS cities
        FROM (
          SELECT
            MIN(TRIM(fd.city)) AS city,
            MIN(COALESCE(fd.sort_order, 999999)) AS min_sort
          FROM freight_destinations fd
          WHERE fd.freight_announcement_id = fa.id
            AND NULLIF(TRIM(fd.city), '') IS NOT NULL
          GROUP BY REPLACE(REPLACE(REPLACE(REPLACE(TRIM(fd.city), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
        ) x
      ) dest_cities ON TRUE
      WHERE da.driver_id = ANY($1::varchar[])
        AND (fa.id IS NULL OR fa.status IS NULL OR fa.status NOT IN ('Cancelled'))
        AND NOT (
          COALESCE(fa.finance_disposition, '') = 'rejected'
          AND COALESCE(fa.finance_reject_type, '') = '${FINANCE_REJECT_NOT_EXECUTED}'
        )
        ${finalizedSql}
    `,
    [driverIds, cycleStart, cycleEnd]
  );
  const trips = rows.map(row => {
    const { km, bucket } = resolveTripKmAndBucket(row);
    return {
      id: row.id,
      driverId: row.driver_id,
      announcementId: row.freight_announcement_id,
      announcementCode: row.announcement_code,
      createdAt: row.cycle_at || row.created_at,
      assignedAt: row.created_at,
      stage: row.stage,
      city: row.dest_cities_label || row.dest_city || row.assigned_route_city || null,
      categoryLabel: resolveTripCategoryLabel(row),
      km,
      bucket,
      isVeryFar: bucket === 'veryFar',
    };
  });

  const exceptionTrips = await fetchFinanceExceptionTrips(
    pool,
    driverIds,
    cycleStart,
    cycleEnd
  );
  return trips.concat(exceptionTrips);
}

/**
 * تاریخ واقعی سفرِ تور استثنایی. مرجع، تاریخ صدور بارنامه است؛
 * اول روی خود اعلام‌بار، بعد محاسبه راننده، بعد تراکنش بارنامه (میلادی).
 * تاریخ بارگیری فقط وقتی بارنامه هیچ‌جا ثبت نشده.
 */
function financeExceptionTripDate(row) {
  const fromJalali = raw => {
    const text = String(raw || '').trim();
    if (!text) return null;
    return parseJalaliDateString(text.replace(/-/g, '/').split(/[ T]/)[0]);
  };
  const fromGregorian = raw => {
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  return (
    fromJalali(row.bill_of_lading_date) ||
    fromJalali(row.calc_bill_of_lading_date) ||
    fromGregorian(row.txn_bill_of_lading_at) ||
    fromJalali(row.loading_date) ||
    fromGregorian(row.created_at)
  );
}

/**
 * تورهای استثنایی مالی رکورد تخصیص نوبت ندارند، ولی سفر واقعی راننده هستند.
 * دوره‌شان از تاریخ صدور بارنامه خوانده می‌شود، نه زمان ثبت مالی.
 * اگر جایگزینِ توری باشند که هنوز در سابقه هست (رد مالی «ناقص»)، دوباره شمرده نمی‌شوند.
 */
async function fetchFinanceExceptionTrips(pool, driverIds, cycleStart, cycleEnd) {
  let rows = [];
  try {
    const result = await pool.query(
      `
        SELECT
          fa.id,
          fa.assigned_driver_id AS driver_id,
          fa.announcement_code,
          fa.created_at,
          fa.loading_date,
          fa.bill_of_lading_date,
          calc.bill_of_lading_date AS calc_bill_of_lading_date,
          txn.transaction_date AS txn_bill_of_lading_at,
          fa.vehicle_type,
          v.current_vehicle_type,
          v.model AS vehicle_model,
          replaced.finance_reject_type AS replaced_reject_type,
          dest.round_trip_km AS dest_route_km,
          dest.distance_category AS dest_distance_category,
          dest.route_category AS dest_route_category,
          dest.city AS dest_city,
          dest_cities.cities AS dest_cities_label
        FROM freight_announcements fa
        LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
        LEFT JOIN freight_announcements replaced ON replaced.related_exception_id = fa.id
        LEFT JOIN LATERAL (
          SELECT NULLIF(TRIM(dc.bill_of_lading_date), '') AS bill_of_lading_date
          FROM driver_calculations dc
          WHERE dc.announcement_id = fa.id
            AND NULLIF(TRIM(dc.bill_of_lading_date), '') IS NOT NULL
          ORDER BY dc.created_at DESC
          LIMIT 1
        ) calc ON TRUE
        LEFT JOIN LATERAL (
          SELECT ft.transaction_date
          FROM freight_transactions ft
          WHERE ft.announcement_id = fa.id
            AND ft.transaction_date IS NOT NULL
          ORDER BY ft.created_at DESC
          LIMIT 1
        ) txn ON TRUE
        LEFT JOIN LATERAL (
          SELECT dr2.round_trip_km, dr2.distance_category, dr2.route_category, dr2.city
          FROM freight_destinations fd
          INNER JOIN dispatch_routes dr2
            ON dr2.is_active = TRUE
           AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(dr2.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
             = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(fd.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
          WHERE fd.freight_announcement_id = fa.id
          ORDER BY COALESCE(dr2.round_trip_km, 0) DESC NULLS LAST
          LIMIT 1
        ) dest ON TRUE
        LEFT JOIN LATERAL (
          SELECT string_agg(x.city, '، ' ORDER BY x.min_sort) AS cities
          FROM (
            SELECT
              MIN(TRIM(fd.city)) AS city,
              MIN(COALESCE(fd.sort_order, 999999)) AS min_sort
            FROM freight_destinations fd
            WHERE fd.freight_announcement_id = fa.id
              AND NULLIF(TRIM(fd.city), '') IS NOT NULL
            GROUP BY REPLACE(REPLACE(REPLACE(REPLACE(TRIM(fd.city), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
          ) x
        ) dest_cities ON TRUE
        WHERE COALESCE(fa.announcement_source, '') = 'finance_exception'
          AND fa.assigned_driver_id = ANY($1::varchar[])
          AND fa.status NOT IN ('Cancelled')
          AND COALESCE(fa.finance_disposition, '') <> 'rejected'
      `,
      [driverIds]
    );
    rows = result.rows || [];
  } catch (error) {
    console.warn('⚠️ [driverPreferences] finance exception trips skipped:', error.message);
    return [];
  }

  const from = new Date(cycleStart).getTime();
  const to = new Date(cycleEnd).getTime();

  return rows
    .filter(row => {
      // تور اصلی که «ناقص» رد شده هنوز در سابقه است — جایگزینش را دوباره نشمار
      const replacedType = row.replaced_reject_type;
      if (replacedType && replacedType !== FINANCE_REJECT_NOT_EXECUTED) return false;
      return true;
    })
    .map(row => ({ row, at: financeExceptionTripDate(row) }))
    .filter(({ at }) => at && at.getTime() >= from && at.getTime() <= to)
    .map(({ row, at }) => {
      const { km, bucket } = resolveTripKmAndBucket(row);
      return {
        id: row.id,
        driverId: row.driver_id,
        announcementId: row.id,
        announcementCode: row.announcement_code,
        createdAt: at,
        assignedAt: at,
        stage: 'finance_exception',
        city: row.dest_cities_label || row.dest_city || null,
        categoryLabel: resolveTripCategoryLabel(row),
        km,
        bucket,
        isVeryFar: bucket === 'veryFar',
      };
    });
}

async function fetchDriverCycleStatsAll(pool, driverIds, cycleStart, cycleEnd) {
  const trips = await fetchDriverCycleTrips(pool, driverIds, cycleStart, cycleEnd, {
    finalizedOnly: true,
  });
  return aggregateCycleTripStats(trips, null);
}

function aggregateCycleTripStats(trips, categoryLabel = null) {
  const perTrip = new Map();
  for (const trip of trips) {
    if (categoryLabel && trip.categoryLabel && trip.categoryLabel !== categoryLabel) continue;
    if (!trip.driverId) continue;
    const key = `${trip.driverId}::${trip.announcementId || trip.id}`;
    const prev = perTrip.get(key);
    if (!prev) {
      perTrip.set(key, { ...trip });
      continue;
    }
    prev.km = Math.max(prev.km || 0, trip.km || 0);
    if (trip.isVeryFar) {
      prev.isVeryFar = true;
      prev.bucket = 'veryFar';
    } else if (prev.bucket !== 'veryFar' && trip.bucket) {
      prev.bucket = trip.bucket;
    }
    if (trip.city && (!prev.city || trip.city.length > prev.city.length)) prev.city = trip.city;
  }

  const kmMap = new Map();
  const vfMap = new Map();
  const farMap = new Map();
  const nearMap = new Map();
  for (const trip of perTrip.values()) {
    kmMap.set(trip.driverId, (kmMap.get(trip.driverId) || 0) + Math.round(trip.km || 0));
    if (trip.bucket === 'veryFar') vfMap.set(trip.driverId, (vfMap.get(trip.driverId) || 0) + 1);
    else if (trip.bucket === 'far') farMap.set(trip.driverId, (farMap.get(trip.driverId) || 0) + 1);
    else if (trip.bucket === 'near') nearMap.set(trip.driverId, (nearMap.get(trip.driverId) || 0) + 1);
  }
  return { kmMap, vfMap, farMap, nearMap, perTrip };
}

async function fetchDriverCycleStatsByCategory(pool, driverIds, cycleStart, cycleEnd) {
  const trips = await fetchDriverCycleTrips(pool, driverIds, cycleStart, cycleEnd);
  const byCategory = new Map();
  const labels = [...new Set(trips.map(t => t.categoryLabel).filter(Boolean))];
  for (const label of labels) {
    byCategory.set(label, aggregateCycleTripStats(trips, label));
  }
  return { trips, byCategory };
}

async function fetchDriversFinalizedKm(pool, driverIds, cycleStart, cycleEnd, options = {}) {
  const trips = await fetchDriverCycleTrips(pool, driverIds, cycleStart, cycleEnd);
  return aggregateCycleTripStats(trips, options.categoryLabel || null).kmMap;
}

async function fetchDriversVeryFarCount(pool, driverIds, cycleStart, cycleEnd, options = {}) {
  const trips = await fetchDriverCycleTrips(pool, driverIds, cycleStart, cycleEnd);
  return aggregateCycleTripStats(trips, options.categoryLabel || null).vfMap;
}

module.exports = {
  normalizeCategoryFilter,
  vehicleMatchesCategory,
  resolveAssignmentVehicleCategory,
  mapAssignmentRow,
  mapOpportunityRow,
  buildAssignmentNotes,
  buildCycleSummary,
  buildStats,
  buildBehaviorAnalysis,
  routeIsVeryFar,
  resolveAssignmentCertainty,
  isFinanceRejected,
  isTripNotExecuted,
  financeExceptionTripDate,
  FINANCE_REJECT_NOT_EXECUTED,
  isFarOrVeryFarOpportunity,
  fetchDriversFinalizedKm,
  fetchDriversVeryFarCount,
  fetchDriverCycleTrips,
  fetchDriverCycleStatsByCategory,
  fetchDriverCycleStatsAll,
  aggregateCycleTripStats,
  groupAssignmentsByTrip: require('./multiDestinationAssignments').groupAssignmentsByTrip,
};
