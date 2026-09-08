const STAGE_PUBLIC_NAME = {
  stage1: 'اعلام بار مسیرهای خیلی دور',
  stage2: 'اعلام بار نهایی',
  stage2_far: 'اعلام بار نهایی',
  stage2_near_vf: 'اعلام بار نهایی',
  stage2_near_all: 'اعلام بار نهایی',
};

function publicStageName(stage) {
  return STAGE_PUBLIC_NAME[stage] || STAGE_PUBLIC_NAME.stage2;
}

function isVeryFarPublicStage(stage) {
  return stage === 'stage1';
}

function sessionStartIntro(stage) {
  if (isVeryFarPublicStage(stage)) {
    return (
      'ابتدا بار برای راننده‌هایی که مسیر خیلی دور نرفته‌اند اعلام خواهد شد.\n' +
      'سپس در مرحله دوم مسیرهای باقی‌مانده طبق نوبت از ابتدا اعلام بار خواهد شد.'
    );
  }
  return 'اعلام بار نهایی آغاز شد.\nمسیرهای باقی‌مانده طبق نوبت از ابتدا اعلام می‌شود.';
}

function namesAfterImageText(stage, namesText) {
  if (isVeryFarPublicStage(stage)) {
    return (
      'اعلام بار مسیرهای خیلی دور\n' +
      'ابتدا به نفراتی که اعزام نشده‌اند اعلام خواهد شد:\n\n' +
      namesText
    );
  }
  return `اعلام بار نهایی\nترتیب اعلام طبق نوبت از ابتدا:\n\n${namesText}`;
}

function loadsImageCaption(vehicleCategory, count, { allCategory = false } = {}) {
  const cat = vehicleCategory ? ` — ${vehicleCategory}` : '';
  const scope = allCategory ? 'همه بارهای این دسته' : 'لیست بار';
  return `${scope}${cat}\n${count} مورد`;
}

function queueTypeOf(item) {
  return item?.queueType || item?.queue_type || '';
}

function sortQueueByPosition(list) {
  return [...(list || [])].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
}

function orderQueueFarThenNear(queue) {
  const list = queue || [];
  const far = sortQueueByPosition(list.filter(item => queueTypeOf(item) === 'far'));
  const near = sortQueueByPosition(list.filter(item => queueTypeOf(item) === 'near'));
  const other = sortQueueByPosition(
    list.filter(item => !['far', 'near'].includes(queueTypeOf(item)))
  );
  return [...far, ...near, ...other];
}

function namesQueueForGroup(stage, turnQueue, displayQueue) {
  if (isVeryFarPublicStage(stage)) {
    return turnQueue && turnQueue.length ? turnQueue : displayQueue || [];
  }
  const board = displayQueue && displayQueue.length ? displayQueue : turnQueue || [];
  return orderQueueFarThenNear(board);
}

function formatAnnouncementOrderNames(queue) {
  const list = queue || [];
  if (list.length === 0) return 'راننده‌ای در صف این اعلام نیست.';
  return list
    .map((item, i) => {
      const name = item.driver?.name || item.driver_name || '—';
      return `${i + 1}. ${name}`;
    })
    .join('\n');
}

function skippedStage1ToFinal(reason) {
  if (reason === 'no_far_queue') {
    return 'نوبت «دور» خالی است — جلسه از اعلام بار نهایی ادامه می‌یابد.';
  }
  return 'بار مسیرهای خیلی دور موجود نبود — جلسه مستقیماً از اعلام بار نهایی ادامه می‌یابد.';
}

function finalPhaseStarted(vehicleCategory, loadCount, driverCount) {
  const cat = vehicleCategory ? ` — ${vehicleCategory}` : '';
  return `🔄 اعلام بار نهایی${cat}\n${loadCount} بار باقی‌مانده برای ${driverCount} راننده`;
}

function driverSkippedVeryFarGroup(driverName) {
  return `${driverName || '—'} بار خیلی دور برنداشت؛ ماند برای اعلام بار نهایی.`;
}

function officeSkippedTurnGroup(driverName) {
  return `دفتر ترابری رد نوبت ${driverName || '—'} را زد.`;
}

function officeSkippedTurnPv() {
  return 'دفتر ترابری رد نوبت شما را زد.';
}

function deferStayPvAck() {
  return 'ثبت شد — اگر الان بار خیلی دور برندارید، در اعلام بار نهایی به شما اعلام بار خواهد شد.';
}

function autoHeldForFinalBecausePrefsPv() {
  return (
    'در اعلام بار مسیرهای خیلی دور، باری مطابق ترجیح ثبت‌شده شما نبود.\n' +
    'نوبت شما برای اعلام بار نهایی نگه داشته شد.'
  );
}

module.exports = {
  STAGE_PUBLIC_NAME,
  publicStageName,
  isVeryFarPublicStage,
  sessionStartIntro,
  namesAfterImageText,
  loadsImageCaption,
  namesQueueForGroup,
  formatAnnouncementOrderNames,
  skippedStage1ToFinal,
  finalPhaseStarted,
  driverSkippedVeryFarGroup,
  officeSkippedTurnGroup,
  officeSkippedTurnPv,
  deferStayPvAck,
  autoHeldForFinalBecausePrefsPv,
};
