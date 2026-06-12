const { isVeryFarAnnouncement, classifyRouteDistanceBucket } = require('./dispatchRouteRules');

const CATEGORY_KEY_TO_LABEL = {
  trailer: 'تریلی',
  'mini-trailer': 'مینی تریلی',
  'ten-wheel': 'ده چرخ',
};

function normalizeCategoryFilter(categoryParam) {
  if (!categoryParam || typeof categoryParam !== 'string') return null;
  const trimmed = categoryParam.trim();
  if (!trimmed) return null;
  return CATEGORY_KEY_TO_LABEL[trimmed] || trimmed;
}

function vehicleMatchesCategory(vehicleType, categoryLabel) {
  if (!categoryLabel) return true;
  if (!vehicleType) return false;
  if (categoryLabel === 'تریلی' || categoryLabel === 'مینی تریلی') {
    return vehicleType === 'تریلی' || vehicleType === 'مینی تریلی';
  }
  return vehicleType === categoryLabel;
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
  const isCancelled = Boolean(row.is_cancelled) || freightStatus === 'Cancelled';
  const finalizedAt = row.assignment_finalized_at || null;
  const isFinalized =
    Boolean(finalizedAt) || freightStatus === 'Finalized' || freightStatus === 'InTransit';

  if (isCancelled) {
    return { certainty: 'cancelled', certaintyLabel: 'لغو / تعیین‌تکلیف نشده' };
  }
  if (isFinalized) {
    return { certainty: 'finalized', certaintyLabel: 'نهایی' };
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
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    routeCategory: row.route_category,
    distanceCategory: row.distance_category,
    roundTripKm:
      row.round_trip_km != null
        ? Number(row.round_trip_km)
        : row.distance_km != null
          ? Number(row.distance_km)
          : null,
    queuePosition: row.queue_position ?? null,
    vehicleCode: row.vehicle_code || null,
    assignedAt: row.created_at,
    assignedAtJalali: row.assigned_at_jalali || timestampToJalaliDate(row.created_at),
    isCancelled: row.is_cancelled || false,
    freightStatus: row.freight_status || null,
    assignmentFinalizedAt: row.assignment_finalized_at || null,
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

    if (item.certainty === 'cancelled') {
      const sameDayTaken = (takenByDay.get(dayKey) || []).filter(
        t => t.id !== item.id && t.certainty !== 'cancelled'
      );
      const sameDaySkipped = (skippedByDay.get(dayKey) || []).filter(s => s.isVeryFar);
      if (sameDayTaken.length > 0) {
        const chosen = sameDayTaken[0];
        item.note = `(لغو — در همان روز «${formatDestination(chosen)}» انتخاب شد)`;
      } else if (sameDaySkipped.length > 0) {
        const missed = sameDaySkipped[0];
        item.note = `(لغو — بار خیلی‌دور «${formatDestination(missed)}» ${formatKm(missed.roundTripKm)} در دسترس بود)`;
      } else {
        item.note = '(لغو — تعیین‌تکلیف نشده)';
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
    const activeTaken = sameDayTaken.filter(t => t.certainty !== 'cancelled');
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
    totalTaken: taken.length,
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

async function fetchDriversFinalizedKm(pool, driverIds, cycleStart, cycleEnd) {
  const map = new Map();
  if (!driverIds?.length) return map;

  const { rows } = await pool.query(
    `
      SELECT
        da.driver_id,
        SUM(COALESCE(dr.round_trip_km, da.distance_km, 0))::float AS total_km
      FROM dispatch_assignments da
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
      WHERE da.driver_id = ANY($1::varchar[])
        AND da.created_at >= $2
        AND da.created_at <= $3
        AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
        AND fa.status NOT IN ('Cancelled')
        AND COALESCE(fa.finance_disposition, '') <> 'rejected'
        AND (
          COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at) IS NOT NULL
          OR fa.status = 'Finalized'
        )
      GROUP BY da.driver_id
    `,
    [driverIds, cycleStart, cycleEnd]
  );

  for (const row of rows) {
    if (row.driver_id) {
      map.set(row.driver_id, Math.round(Number(row.total_km) || 0));
    }
  }
  return map;
}

module.exports = {
  normalizeCategoryFilter,
  vehicleMatchesCategory,
  mapAssignmentRow,
  mapOpportunityRow,
  buildAssignmentNotes,
  buildCycleSummary,
  buildStats,
  routeIsVeryFar,
  resolveAssignmentCertainty,
  isFarOrVeryFarOpportunity,
  fetchDriversFinalizedKm,
};
