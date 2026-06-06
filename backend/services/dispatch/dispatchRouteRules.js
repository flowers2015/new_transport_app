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

module.exports = {
  normalizeDistanceText,
  VERY_FAR_DISTANCE_TOKENS,
  isVeryFarAnnouncement,
};
