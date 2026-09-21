'use strict';

/**
 * قوانین اعلام بار نوبت (بله + تابلو).
 *
 * قانون قدیم ترابری (نگه داشته شده، فعلاً اجرا نمی‌شود):
 *   مرحله ۱: فقط خیلی‌دور / فقط دورِ نرفته
 *   بعد stage2_far: همه بارها / نوبت دور از اول
 *   بعد stage2_near_vf: فقط خیلی‌دور / نزدیکِ نرفته
 *   بعد stage2_near_all: بقیه / نزدیک
 *
 * قانون جاری:
 *   مرحله ۱: فقط خیلی‌دور برای همهٔ نرفته‌ها (دور و نزدیک)، با «بمانم»
 *   بعد: هرچه ماند از ابتدای نوبت دور تا ته صف (دور سپس نزدیک)
 */
const QUEUE_ANNOUNCEMENT_LAW = {
  LEGACY_TRANSPORT: 'legacy_transport',
  CURRENT: 'vf_both_then_from_far',
};

/** برای برگشت به قانون قدیم ترابری این مقدار را عوض کنید؛ زنجیره قدیم حذف نشده است. */
const ACTIVE_QUEUE_ANNOUNCEMENT_LAW = QUEUE_ANNOUNCEMENT_LAW.CURRENT;

function isLegacyTransportQueueLaw() {
  return ACTIVE_QUEUE_ANNOUNCEMENT_LAW === QUEUE_ANNOUNCEMENT_LAW.LEGACY_TRANSPORT;
}

function isCurrentQueueAnnouncementLaw() {
  return !isLegacyTransportQueueLaw();
}

/** زنجیره فاز بله — قانون قدیم ترابری */
const LEGACY_TRANSPORT_PHASE_CHAIN = {
  stage1: [['stage2_far', null, 'stage2_far_started']],
  stage2_far: [
    ['stage2_near_vf', null, 'stage2_near_vf_started'],
    ['stage2_near_all', null, 'stage2_near_all_started'],
  ],
  stage2: [
    ['stage2_near_vf', null, 'stage2_near_vf_started'],
    ['stage2_near_all', null, 'stage2_near_all_started'],
  ],
  stage2_near_vf: [['stage2_near_all', null, 'stage2_near_all_started']],
};

/** زنجیره فاز بله — قانون جاری */
const CURRENT_PHASE_CHAIN = {
  stage1: [['stage2_all', null, 'stage2_all_started']],
};

function getDispatchPhaseChain() {
  return isLegacyTransportQueueLaw() ? LEGACY_TRANSPORT_PHASE_CHAIN : CURRENT_PHASE_CHAIN;
}

function getLegacyPromotePhases() {
  return ['stage2_far', 'stage2_near_vf', 'stage2_near_all'];
}

function getCurrentPromotePhases() {
  return ['stage2_all'];
}

function getInitialPromotePhases() {
  return isLegacyTransportQueueLaw() ? getLegacyPromotePhases() : getCurrentPromotePhases();
}

module.exports = {
  QUEUE_ANNOUNCEMENT_LAW,
  ACTIVE_QUEUE_ANNOUNCEMENT_LAW,
  LEGACY_TRANSPORT_PHASE_CHAIN,
  CURRENT_PHASE_CHAIN,
  isLegacyTransportQueueLaw,
  isCurrentQueueAnnouncementLaw,
  getDispatchPhaseChain,
  getLegacyPromotePhases,
  getCurrentPromotePhases,
  getInitialPromotePhases,
};
