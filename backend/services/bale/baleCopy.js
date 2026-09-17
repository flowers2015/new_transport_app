const STAGE_PUBLIC_NAME = {
  stage1: 'اعلام بار مسیرهای خیلی دور',
  stage2: 'اعلام بار نهایی',
  stage2_far: 'اعلام بار نهایی',
  stage2_near_vf: 'اعلام بار نهایی',
  stage2_near_all: 'اعلام بار نهایی',
  stage2_all: 'اعلام بار نهایی',
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

function boldTitle(text) {
  const clean = String(text || '').replace(/\*/g, '');
  return ` *${clean}* `;
}

function namesAfterImageText(stage, namesText) {
  if (isVeryFarPublicStage(stage)) {
    return (
      `${boldTitle('اعلام بار مسیرهای خیلی دور')}\n` +
      'ابتدا به نفراتی که اعزام نشده‌اند اعلام خواهد شد:\n\n' +
      namesText
    );
  }
  return (
    `${boldTitle('اعلام بار نهایی')}\n` +
    'ترتیب اعلام طبق نوبت از ابتدا:\n\n' +
    namesText
  );
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

function namesQueueForGroup(_stage, turnQueue, displayQueue) {
  const board = displayQueue && displayQueue.length ? displayQueue : turnQueue || [];
  return orderQueueFarThenNear(board);
}

function driverWentVeryFar(item) {
  return Boolean(
    item?.lastVeryFarAtJalali ||
      (Array.isArray(item?.longRouteHistory) && item.longRouteHistory.length > 0)
  );
}

function formatQueueNameLine(item, index) {
  const name = item.driver?.name || item.driver_name || '—';
  if (driverWentVeryFar(item)) {
    return `🔴 ${index}. ${name}  _قبلا خیلی دور رفته_ `;
  }
  return `🟢 ${index}. ${name}`;
}

function formatAnnouncementOrderNames(queue) {
  const list = queue || [];
  if (list.length === 0) return 'راننده‌ای در صف این اعلام نیست.';

  const far = list.filter(item => queueTypeOf(item) === 'far');
  const near = list.filter(item => queueTypeOf(item) === 'near');
  const other = list.filter(item => !['far', 'near'].includes(queueTypeOf(item)));

  const parts = [];
  if (far.length) {
    parts.push(boldTitle('دور'));
    far.forEach((item, i) => parts.push(formatQueueNameLine(item, i + 1)));
  }
  if (near.length) {
    if (parts.length) parts.push('');
    parts.push(boldTitle('نزدیک'));
    near.forEach((item, i) => parts.push(formatQueueNameLine(item, i + 1)));
  }
  if (!far.length && !near.length && other.length) {
    other.forEach((item, i) => parts.push(formatQueueNameLine(item, i + 1)));
  }
  return parts.join('\n');
}

function skippedStage1ToFinal(reason) {
  if (reason === 'none_very_far') {
    return (
      'در دوره جاری هیچ‌کس از این دسته مسیر خیلی‌دور نرفته است.\n' +
      'همه بارها از نفر اول تا انتهای نوبت در یک مرحله اعلام می‌شود.'
    );
  }
  if (reason === 'all_went_very_far') {
    return (
      'همه نفرات این دسته در دوره جاری مسیر خیلی‌دور رفته‌اند.\n' +
      'همه بارها از نفر اول تا انتهای نوبت در یک مرحله اعلام می‌شود.'
    );
  }
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
