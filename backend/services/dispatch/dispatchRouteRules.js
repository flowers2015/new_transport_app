/**
 * قوانین مشترک دسته‌بندی مسیر (خیلی‌دور و ...) برای وب و بله.
 */

function normalizeDistanceText(value) {
  return (value || '')
    .toString()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]/g, '')
    .toLowerCase();
}

const VERY_FAR_DISTANCE_TOKENS = ['خیلی‌دور', 'خیلیدور', 'veryfar'];
const FAR_DISTANCE_TOKENS = ['دور', 'far'];
const NEAR_DISTANCE_TOKENS = ['نزدیک', 'near'];

function includesDistanceToken(normalized, tokens) {
  if (!normalized) return false;
  return tokens.some(token => {
    const t = normalizeDistanceText(token);
    return normalized === t || normalized.includes(t);
  });
}

function isVeryFarAnnouncement(announcement) {
  const distanceCategoryNormalized = normalizeDistanceText(
    announcement?.route?.distance_category || ''
  );
  if (distanceCategoryNormalized) {
    return VERY_FAR_DISTANCE_TOKENS.some(token => distanceCategoryNormalized.includes(token));
  }
  const routeCategoryNormalized = normalizeDistanceText(
    announcement?.route?.route_category || ''
  );
  if (routeCategoryNormalized) {
    return VERY_FAR_DISTANCE_TOKENS.some(token => routeCategoryNormalized.includes(token));
  }
  return false;
}

/**
 * دسته مسیر (خیلی‌دور / دور / نزدیک) فقط از دیتای مسیر — نه از نوبت دور/نزدیک.
 */
function classifyRouteDistanceBucket(routeLike) {
  const row = routeLike?.route || routeLike || {};

  if (isVeryFarAnnouncement({ route: row })) return 'veryFar';

  const distNorm = normalizeDistanceText(row.distance_category || '');
  const routeNorm = normalizeDistanceText(row.route_category || '');

  if (includesDistanceToken(distNorm, NEAR_DISTANCE_TOKENS)) return 'near';
  if (includesDistanceToken(routeNorm, NEAR_DISTANCE_TOKENS)) return 'near';

  if (includesDistanceToken(distNorm, FAR_DISTANCE_TOKENS)) return 'far';
  if (includesDistanceToken(routeNorm, FAR_DISTANCE_TOKENS)) return 'far';

  if (row.stage === 'stage1') return 'veryFar';

  const km =
    row.round_trip_km != null
      ? Number(row.round_trip_km)
      : row.distance_km != null
        ? Number(row.distance_km)
        : null;
  if (km != null && !Number.isNaN(km)) {
    return km >= 500 ? 'far' : 'near';
  }

  return null;
}

module.exports = {
  normalizeDistanceText,
  VERY_FAR_DISTANCE_TOKENS,
  FAR_DISTANCE_TOKENS,
  NEAR_DISTANCE_TOKENS,
  isVeryFarAnnouncement,
  classifyRouteDistanceBucket,
};
