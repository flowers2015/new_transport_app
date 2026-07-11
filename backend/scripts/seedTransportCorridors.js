/**
 * Seed کامل محورها / هاب‌ها / عضویت شهرها
 * مبدأ: اسلامشهر
 * منبع: شبکه جاده‌های ملی و آزادراه‌های ایران + dispatch_routes (فقط خواندن)
 *
 * اجرا:
 *   node backend/scripts/seedTransportCorridors.js
 */
const pool = require('../db');
const createTransportCorridorTables = require('../migrations/create_transport_corridor_tables');

const ORIGIN = 'ISLAMSHAHR';

/** محورهای ملی + آزادراه + شاخه‌های مهم — همه فعال */
const AXES = [
  // --- شرق / شمال‌شرق ---
  { code: 'R44', name: 'جاده ۴۴ امام‌رضا (تهران–مشهد)', type: 'national_road', direction: 'EW', terminus: 'مشهد', terminusProvince: 'خراسان رضوی', zone: 'NE', roads: ['44'], notes: 'محور اصلی شرق؛ گرمسار–سمنان–شاهرود–سبزوار–نیشابور–مشهد' },
  { code: 'FW14', name: 'آزادراه حرم‌تاحرم (قم–گرمسار–سمنان–مشهد)', type: 'freeway', direction: 'EW', terminus: 'مشهد', terminusProvince: 'خراسان رضوی', zone: 'NE', roads: ['FW14'], notes: 'تقویت‌کننده محور شرق؛ موازی/مکمل R44' },
  { code: 'R22_EAST', name: 'جاده ۲۲ شرقی (گرگان–بجنورد–مشهد)', type: 'national_road', direction: 'EW', terminus: 'مشهد', terminusProvince: 'خراسان رضوی', zone: 'NE', roads: ['22'], notes: 'محور شمالی خراسان؛ اتصال گلستان به خراسان شمالی/رضوی' },
  { code: 'R97', name: 'محور خراسان جنوبی (فردوس–بیرجند–نهبندان)', type: 'national_road', direction: 'NS', terminus: 'نهبندان', terminusProvince: 'خراسان جنوبی', zone: 'NE', roads: ['95', '97'], notes: 'شاخه جنوب‌شرقی خراسان' },

  // --- شمال: سه محور جدا ---
  { code: 'R59', name: 'جاده ۵۹ چالوس / کندوان', type: 'national_road', direction: 'NS', terminus: 'چالوس', terminusProvince: 'مازندران', zone: 'NORTH_WEST', roads: ['59'], notes: 'کرج–چالوس؛ غرب مازندران' },
  { code: 'FW3', name: 'آزادراه ۳ تهران–شمال (چالوس)', type: 'freeway', direction: 'NS', terminus: 'چالوس', terminusProvince: 'مازندران', zone: 'NORTH_WEST', roads: ['FW3'], notes: 'موازی R59' },
  { code: 'R77', name: 'جاده ۷۷ هراز / فیروزکوه', type: 'national_road', direction: 'NS', terminus: 'محمودآباد', terminusProvince: 'مازندران', zone: 'NORTH_EAST_MAZ', roads: ['77', '79'], notes: 'رودهن–آمل–ساری؛ شرق مازندران' },
  { code: 'R49', name: 'جاده ۴۹ قزوین–رشت–آستارا', type: 'national_road', direction: 'NS', terminus: 'آستارا', terminusProvince: 'گیلان', zone: 'NORTH_GILAN', roads: ['49'], notes: 'قزوین–منجیل–رشت' },
  { code: 'FW1', name: 'آزادراه ۱ قزوین–رشت', type: 'freeway', direction: 'NS', terminus: 'رشت', terminusProvince: 'گیلان', zone: 'NORTH_GILAN', roads: ['FW1'], notes: 'موازی بخش کوهستانی R49' },
  { code: 'R22_CASPIAN', name: 'جاده ۲۲ ساحلی خزر', type: 'national_road', direction: 'EW', terminus: 'گرگان', terminusProvince: 'گلستان', zone: 'NORTH_COAST', roads: ['22'], notes: 'آستارا–رشت–چالوس–ساری–گرگان؛ اتصال عرضی شمال' },

  // --- غرب / شمال‌غرب ---
  { code: 'R32', name: 'جاده ۳۲ تهران–تبریز–بازرگان', type: 'national_road', direction: 'EW', terminus: 'بازرگان', terminusProvince: 'آذربایجان غربی', zone: 'NW', roads: ['32'], notes: 'قزوین–زنجان–تبریز–مرند–ماکو' },
  { code: 'FW2', name: 'آزادراه ۲ تهران–کرج–قزوین–زنجان–تبریز', type: 'freeway', direction: 'EW', terminus: 'تبریز', terminusProvince: 'آذربایجان شرقی', zone: 'NW', roads: ['FW2'], notes: 'محور آزادراهی غرب/شمال‌غرب' },
  { code: 'R14', name: 'محور اردبیل / آستارا–اردبیل', type: 'national_road', direction: 'NS', terminus: 'اردبیل', terminusProvince: 'اردبیل', zone: 'NW', roads: ['14', '33'], notes: 'انشعاب شمال‌غرب از محور تبریز/گیلان' },
  { code: 'R21', name: 'محور ارومیه / آذربایجان غربی', type: 'national_road', direction: 'NS', terminus: 'ارومیه', terminusProvince: 'آذربایجان غربی', zone: 'NW', roads: ['11', '21'], notes: 'تبریز–ارومیه و غرب دریاچه' },

  // --- غرب مرکزی ---
  { code: 'R48', name: 'جاده ۴۸ همدان–کرمانشاه–خسروی', type: 'national_road', direction: 'EW', terminus: 'خسروی', terminusProvince: 'کرمانشاه', zone: 'WEST', roads: ['48'], notes: 'محور غرب مرکزی' },
  { code: 'FW6', name: 'آزادراه ۶ ساوه–همدان', type: 'freeway', direction: 'EW', terminus: 'همدان', terminusProvince: 'همدان', zone: 'WEST', roads: ['FW6'], notes: 'اتصال مرکز به غرب' },
  { code: 'R46', name: 'محور سنندج / کردستان', type: 'national_road', direction: 'EW', terminus: 'سنندج', terminusProvince: 'کردستان', zone: 'WEST', roads: ['46', '35'], notes: 'همدان/قزوین به کردستان' },
  { code: 'R17', name: 'محور ایلام', type: 'national_road', direction: 'EW', terminus: 'ایلام', terminusProvince: 'ایلام', zone: 'WEST', roads: ['17', '19'], notes: 'کرمانشاه/لرستان به ایلام' },

  // --- جنوب / مرکز ---
  { code: 'R65', name: 'جاده ۶۵ اسلامشهر–ساوه–اصفهان–شیراز–بوشهر', type: 'national_road', direction: 'NS', terminus: 'بندر سیراف', terminusProvince: 'بوشهر', zone: 'SOUTH', roads: ['65'], notes: 'محور جنوب غربی؛ مبدأ نزدیک اسلامشهر' },
  { code: 'R71', name: 'جاده ۷۱ تهران–قم–یزد–کرمان–بندرعباس', type: 'national_road', direction: 'NS', terminus: 'بندرعباس', terminusProvince: 'هرمزگان', zone: 'SE', roads: ['71'], notes: 'محور جنوب شرقی' },
  { code: 'FW7', name: 'آزادراه ۷ خلیج فارس (تهران–قم–اصفهان–شیراز)', type: 'freeway', direction: 'NS', terminus: 'شیراز', terminusProvince: 'فارس', zone: 'SOUTH', roads: ['FW7'], notes: 'آزادراه اصلی مرکز–جنوب' },
  { code: 'FW5', name: 'آزادراه ۵ تهران–ساوه', type: 'freeway', direction: 'EW', terminus: 'ساوه', terminusProvince: 'مرکزی', zone: 'CENTER', roads: ['FW5'], notes: 'خروج غرب/جنوب‌غرب از تهران' },
  { code: 'R56', name: 'محور اراک / مرکزی', type: 'national_road', direction: 'EW', terminus: 'اراک', terminusProvince: 'مرکزی', zone: 'CENTER', roads: ['56', '5'], notes: 'قم/ساوه به اراک و لرستان' },
  { code: 'R37', name: 'محور خرم‌آباد / لرستان', type: 'national_road', direction: 'NS', terminus: 'خرم‌آباد', terminusProvince: 'لرستان', zone: 'WEST', roads: ['37', '39'], notes: 'اراک–بروجرد–خرم‌آباد به خوزستان' },
  { code: 'R39', name: 'محور اهواز / خوزستان', type: 'national_road', direction: 'NS', terminus: 'اهواز', terminusProvince: 'خوزستان', zone: 'SW', roads: ['39', '41'], notes: 'لرستان–اندیمشک–اهواز–آبادان' },
  { code: 'R86', name: 'محور بوشهر / فارس–بوشهر', type: 'national_road', direction: 'NS', terminus: 'بوشهر', terminusProvince: 'بوشهر', zone: 'SOUTH', roads: ['86', '94'], notes: 'شیراز–کازرون–بوشهر' },
  { code: 'R67', name: 'محور یاسوج / کهگیلویه', type: 'national_road', direction: 'NS', terminus: 'یاسوج', terminusProvince: 'کهگیلویه و بویراحمد', zone: 'SOUTH', roads: ['55', '67'], notes: 'انشعاب زاگرس جنوبی' },
  { code: 'R72', name: 'محور شهرکرد / چهارمحال', type: 'national_road', direction: 'EW', terminus: 'شهرکرد', terminusProvince: 'چهارمحال و بختیاری', zone: 'CENTER', roads: ['72', '51'], notes: 'اصفهان–شهرکرد' },

  // --- جنوب‌شرق ---
  { code: 'R84', name: 'محور کرمان–زاهدان', type: 'national_road', direction: 'EW', terminus: 'زاهدان', terminusProvince: 'سیستان و بلوچستان', zone: 'SE', roads: ['84', '91'], notes: 'کرمان به سیستان' },
  { code: 'R95', name: 'محور چابهار / جنوب سیستان', type: 'national_road', direction: 'NS', terminus: 'چابهار', terminusProvince: 'سیستان و بلوچستان', zone: 'SE', roads: ['95', '99'], notes: 'ایرانشهر–چابهار' },
  { code: 'R91', name: 'محور بندرعباس–سیرجان–کرمان', type: 'national_road', direction: 'NS', terminus: 'کرمان', terminusProvince: 'کرمان', zone: 'SE', roads: ['91', '92'], notes: 'اتصال هرمزگان به کرمان' },

  // --- محلی تهران / البرز ---
  { code: 'LOCAL_TEHRAN', name: 'حلقه محلی تهران و اسلامشهر', type: 'local', direction: 'LOCAL', terminus: 'تهران', terminusProvince: 'تهران', zone: 'LOCAL', roads: [], notes: 'مقاصد نزدیک مبدأ' },
  { code: 'LOCAL_ALBORZ', name: 'محور محلی البرز / کرج', type: 'local', direction: 'LOCAL', terminus: 'کرج', terminusProvince: 'البرز', zone: 'LOCAL', roads: ['FW2'], notes: 'شهرهای البرز نزدیک مبدأ' },
];

const HUBS = [
  { code: 'HUB_ISLAMSHAHR', name: 'اسلامشهر (مبدأ)', city: 'اسلامشهر', province: 'تهران', km: 40 },
  { code: 'HUB_TEHRAN', name: 'تهران', city: 'تهران', province: 'تهران', km: 60 },
  { code: 'HUB_KARAJ', name: 'کرج', city: 'کرج', province: 'البرز', km: 100 },
  { code: 'HUB_GARMSAR', name: 'گرمسار', city: 'گرمسار', province: 'سمنان', km: 220 },
  { code: 'HUB_QOM', name: 'قم', city: 'قم', province: 'قم', km: 420 },
  { code: 'HUB_QAZVIN', name: 'قزوین', city: 'قزوین', province: 'قزوین', km: 495 },
  { code: 'HUB_SEMNAN', name: 'سمنان', city: 'سمنان', province: 'سمنان', km: 550 },
  { code: 'HUB_SAVEH', name: 'ساوه', city: 'ساوه', province: 'مرکزی', km: 280 },
  { code: 'HUB_SHAHRUD', name: 'شاهرود', city: 'شاهرود', province: 'سمنان', km: 930 },
  { code: 'HUB_ZANJAN', name: 'زنجان', city: 'زنجان', province: 'زنجان', km: 700 },
  { code: 'HUB_HAMEDAN', name: 'همدان', city: 'همدان', province: 'همدان', km: 750 },
  { code: 'HUB_ISFAHAN', name: 'اصفهان', city: 'اصفهان', province: 'اصفهان', km: 870 },
  { code: 'HUB_RASHT', name: 'رشت', city: 'رشت', province: 'گیلان', km: 800 },
  { code: 'HUB_SARI', name: 'ساری', city: 'ساری', province: 'مازندران', km: 900 },
  { code: 'HUB_CHALUS', name: 'چالوس', city: 'چالوس', province: 'مازندران', km: 1020 },
  { code: 'HUB_GORGAN', name: 'گرگان', city: 'گرگان', province: 'گلستان', km: 1100 },
  { code: 'HUB_ARAK', name: 'اراک', city: 'اراک', province: 'مرکزی', km: 600 },
  { code: 'HUB_KHORRAMABAD', name: 'خرم‌آباد', city: 'خرم آباد', province: 'لرستان', km: 1000 },
  { code: 'HUB_Kermanshah', name: 'کرمانشاه', city: 'کرمانشاه', province: 'کرمانشاه', km: 1200 },
  { code: 'HUB_TABRIZ', name: 'تبریز', city: 'تبریز', province: 'آذربایجان شرقی', km: 1400 },
  { code: 'HUB_YAZD', name: 'یزد', city: 'یزد', province: 'یزد', km: 1400 },
  { code: 'HUB_Ahwaz', name: 'اهواز', city: 'اهواز', province: 'خوزستان', km: 1750 },
  { code: 'HUB_SHIRAZ', name: 'شیراز', city: 'شیراز', province: 'فارس', km: 2000 },
  { code: 'HUB_SABZEVAR', name: 'سبزوار', city: 'سبزوار', province: 'خراسان رضوی', km: 1500 },
  { code: 'HUB_MASHHAD', name: 'مشهد', city: 'مشهد', province: 'خراسان رضوی', km: 2160 },
  { code: 'HUB_KERMAN', name: 'کرمان', city: 'کرمان', province: 'کرمان', km: 2200 },
  { code: 'HUB_BANDARABBAS', name: 'بندرعباس', city: 'بندرعباس', province: 'هرمزگان', km: 2700 },
  { code: 'HUB_ZAHEDAN', name: 'زاهدان', city: 'زاهدان', province: 'سیستان و بلوچستان', km: 3400 },
  { code: 'HUB_BOJNURD', name: 'بجنورد', city: 'بجنورد', province: 'خراسان شمالی', km: 1750 },
  { code: 'HUB_BIRJAND', name: 'بیرجند', city: 'بیرجند', province: 'خراسان جنوبی', km: 2600 },
];

const AXIS_HUB_CHAINS = {
  R44: ['HUB_ISLAMSHAHR', 'HUB_GARMSAR', 'HUB_SEMNAN', 'HUB_SHAHRUD', 'HUB_SABZEVAR', 'HUB_MASHHAD'],
  FW14: ['HUB_ISLAMSHAHR', 'HUB_QOM', 'HUB_GARMSAR', 'HUB_SEMNAN', 'HUB_MASHHAD'],
  R59: ['HUB_ISLAMSHAHR', 'HUB_KARAJ', 'HUB_CHALUS'],
  FW3: ['HUB_ISLAMSHAHR', 'HUB_KARAJ', 'HUB_CHALUS'],
  R77: ['HUB_ISLAMSHAHR', 'HUB_SARI', 'HUB_GORGAN'],
  R49: ['HUB_ISLAMSHAHR', 'HUB_QAZVIN', 'HUB_RASHT'],
  FW1: ['HUB_ISLAMSHAHR', 'HUB_QAZVIN', 'HUB_RASHT'],
  R32: ['HUB_ISLAMSHAHR', 'HUB_KARAJ', 'HUB_QAZVIN', 'HUB_ZANJAN', 'HUB_TABRIZ'],
  FW2: ['HUB_ISLAMSHAHR', 'HUB_KARAJ', 'HUB_QAZVIN', 'HUB_ZANJAN', 'HUB_TABRIZ'],
  R65: ['HUB_ISLAMSHAHR', 'HUB_SAVEH', 'HUB_QOM', 'HUB_ISFAHAN', 'HUB_SHIRAZ'],
  R71: ['HUB_ISLAMSHAHR', 'HUB_QOM', 'HUB_ISFAHAN', 'HUB_YAZD', 'HUB_KERMAN', 'HUB_BANDARABBAS'],
  FW7: ['HUB_ISLAMSHAHR', 'HUB_QOM', 'HUB_ISFAHAN', 'HUB_SHIRAZ'],
  FW5: ['HUB_ISLAMSHAHR', 'HUB_SAVEH'],
  R48: ['HUB_ISLAMSHAHR', 'HUB_SAVEH', 'HUB_HAMEDAN', 'HUB_Kermanshah'],
  FW6: ['HUB_ISLAMSHAHR', 'HUB_SAVEH', 'HUB_HAMEDAN'],
  R56: ['HUB_ISLAMSHAHR', 'HUB_QOM', 'HUB_ARAK'],
  R37: ['HUB_ISLAMSHAHR', 'HUB_ARAK', 'HUB_KHORRAMABAD'],
  R39: ['HUB_ISLAMSHAHR', 'HUB_KHORRAMABAD', 'HUB_Ahwaz'],
  R22_EAST: ['HUB_GORGAN', 'HUB_BOJNURD', 'HUB_MASHHAD'],
  R97: ['HUB_MASHHAD', 'HUB_BIRJAND'],
  R84: ['HUB_KERMAN', 'HUB_ZAHEDAN'],
  R91: ['HUB_BANDARABBAS', 'HUB_KERMAN'],
  R95: ['HUB_ZAHEDAN'],
  R22_CASPIAN: ['HUB_RASHT', 'HUB_CHALUS', 'HUB_SARI', 'HUB_GORGAN'],
  LOCAL_TEHRAN: ['HUB_ISLAMSHAHR', 'HUB_TEHRAN'],
  LOCAL_ALBORZ: ['HUB_ISLAMSHAHR', 'HUB_KARAJ'],
};

const GEO_ZONES = [
  { code: 'LOCAL', name: 'محلی تهران/البرز' },
  { code: 'CENTER', name: 'مرکز' },
  { code: 'NORTH_WEST', name: 'شمال غرب مازندران (چالوس)' },
  { code: 'NORTH_EAST_MAZ', name: 'شمال شرق مازندران (هراز)' },
  { code: 'NORTH_GILAN', name: 'گیلان' },
  { code: 'NORTH_COAST', name: 'ساحل خزر' },
  { code: 'NE', name: 'شمال‌شرق / خراسان' },
  { code: 'NW', name: 'شمال‌غرب / آذربایجان' },
  { code: 'WEST', name: 'غرب' },
  { code: 'SW', name: 'جنوب‌غرب / خوزستان' },
  { code: 'SOUTH', name: 'جنوب / فارس–بوشهر' },
  { code: 'SE', name: 'جنوب‌شرق / کرمان–سیستان' },
];

const COMBINATION_RULES = [
  { code: 'SAME_AXIS_PRIMARY', name: 'همان محور اصلی', score: 100, maxKmSpread: 1200, notes: 'بالاترین اولویت ترکیب' },
  { code: 'SAME_AXIS_SECONDARY', name: 'همان محور فرعی/انشعاب', score: 80, maxKmSpread: 1000, notes: '' },
  { code: 'SHARED_HUB', name: 'هاب مشترک در زنجیره محور', score: 70, maxKmSpread: 900, notes: 'مثلاً هر دو از قزوین می‌گذرند' },
  { code: 'SAME_GEO_ZONE', name: 'فقط منطقه جغرافیایی یکسان', score: 30, maxKmSpread: 600, notes: 'مثل چالوس+رشت — ممکن ولی ضعیف' },
  { code: 'COASTAL_LINK', name: 'اتصال ساحلی خزر (R22)', score: 55, maxKmSpread: 800, notes: 'ترکیب عرضی شمال با اولویت متوسط' },
];

/**
 * قوانین استان → محور(ها)
 * primary اول، secondary بعدی
 */
function axesForProvince(province, city, km) {
  const p = (province || '').trim();
  const c = (city || '').trim();
  const k = Number(km) || 0;
  const out = [];

  const add = (axis, type, zone, confidence = 'medium') => {
    if (!out.find((x) => x.axis === axis && x.type === type)) {
      out.push({ axis, type, zone, confidence });
    }
  };

  // محلی
  if (p === 'تهران') {
    if (k <= 200 || ['اسلامشهر', 'تهران', 'ری', 'شهریار', 'قدس', 'ملارد', 'پردیس', 'بومهن', 'رودهن'].some((x) => c.includes(x))) {
      add('LOCAL_TEHRAN', 'primary', 'LOCAL', 'high');
    }
    if (c.includes('رودهن') || c.includes('بومهن') || c.includes('پردیس') || c.includes('دماوند') || c.includes('فیروزکوه')) {
      add('R77', 'primary', 'NORTH_EAST_MAZ', 'high');
    }
    if (c.includes('ورامین') || c.includes('پاکدشت') || c.includes('پیشوا')) {
      add('R44', 'secondary', 'NE', 'medium');
      add('FW7', 'secondary', 'SOUTH', 'low');
    }
  }

  if (p === 'البرز') {
    add('LOCAL_ALBORZ', 'primary', 'LOCAL', 'high');
    add('FW2', 'secondary', 'NW', 'medium');
    if (c.includes('آسارا') || c.includes('طالقان') || k >= 180) {
      add('R59', 'secondary', 'NORTH_WEST', 'medium');
      add('FW3', 'secondary', 'NORTH_WEST', 'medium');
    }
  }

  if (p === 'قم') {
    add('FW7', 'primary', 'SOUTH', 'high');
    add('R71', 'primary', 'SE', 'high');
    add('R65', 'secondary', 'SOUTH', 'medium');
    add('FW14', 'secondary', 'NE', 'medium');
  }

  if (p === 'سمنان') {
    add('R44', 'primary', 'NE', 'high');
    add('FW14', 'secondary', 'NE', 'high');
  }

  if (p === 'خراسان رضوی') {
    add('R44', 'primary', 'NE', 'high');
    add('FW14', 'secondary', 'NE', 'medium');
    if (c.includes('قوچان') || c.includes('درگز') || c.includes('کلات') || c.includes('چناران')) {
      add('R22_EAST', 'secondary', 'NE', 'medium');
    }
  }

  if (p === 'خراسان شمالی') {
    add('R22_EAST', 'primary', 'NE', 'high');
    add('R44', 'secondary', 'NE', 'medium');
  }

  if (p === 'خراسان جنوبی') {
    add('R97', 'primary', 'NE', 'high');
    add('R44', 'secondary', 'NE', 'low');
  }

  if (p === 'گلستان') {
    add('R77', 'primary', 'NORTH_EAST_MAZ', 'high');
    add('R22_CASPIAN', 'primary', 'NORTH_COAST', 'high');
    add('R22_EAST', 'secondary', 'NE', 'medium');
  }

  if (p === 'مازندران') {
    const westCoast = ['چالوس', 'نوشهر', 'کلاردشت', 'عباس آباد', 'تنکابن', 'رامسر', 'نشتارود', 'مرزن آباد', 'کجور'];
    const isWest = westCoast.some((x) => c.includes(x));
    if (isWest) {
      add('R59', 'primary', 'NORTH_WEST', 'high');
      add('FW3', 'secondary', 'NORTH_WEST', 'high');
      add('R22_CASPIAN', 'secondary', 'NORTH_COAST', 'medium');
    } else {
      add('R77', 'primary', 'NORTH_EAST_MAZ', 'high');
      add('R22_CASPIAN', 'secondary', 'NORTH_COAST', 'medium');
      // شهرهای میانی ساحل ممکن است هر دو را لمس کنند
      if (['نور', 'محمودآباد', 'فریدونکنار'].some((x) => c.includes(x))) {
        add('R59', 'secondary', 'NORTH_WEST', 'low');
      }
    }
  }

  if (p === 'گیلان') {
    add('R49', 'primary', 'NORTH_GILAN', 'high');
    add('FW1', 'secondary', 'NORTH_GILAN', 'high');
    add('R22_CASPIAN', 'secondary', 'NORTH_COAST', 'medium');
    if (c.includes('آستارا') || c.includes('تالش') || c.includes('هشتپر') || c.includes('رضوانشهر')) {
      add('R14', 'secondary', 'NW', 'medium');
    }
  }

  if (p === 'قزوین') {
    add('FW2', 'primary', 'NW', 'high');
    add('R32', 'secondary', 'NW', 'high');
    add('R49', 'secondary', 'NORTH_GILAN', 'high');
    add('FW1', 'secondary', 'NORTH_GILAN', 'medium');
  }

  if (p === 'زنجان') {
    add('R32', 'primary', 'NW', 'high');
    add('FW2', 'primary', 'NW', 'high');
  }

  if (p === 'آذربایجان شرقی') {
    add('R32', 'primary', 'NW', 'high');
    add('FW2', 'primary', 'NW', 'high');
  }

  if (p === 'آذربایجان غربی') {
    add('R21', 'primary', 'NW', 'high');
    add('R32', 'secondary', 'NW', 'medium');
  }

  if (p === 'اردبیل') {
    add('R14', 'primary', 'NW', 'high');
    add('R32', 'secondary', 'NW', 'low');
  }

  if (p === 'همدان') {
    add('R48', 'primary', 'WEST', 'high');
    add('FW6', 'primary', 'WEST', 'high');
  }

  if (p === 'کرمانشاه') {
    add('R48', 'primary', 'WEST', 'high');
    add('R17', 'secondary', 'WEST', 'medium');
  }

  if (p === 'کردستان') {
    add('R46', 'primary', 'WEST', 'high');
    add('R48', 'secondary', 'WEST', 'medium');
  }

  if (p === 'ایلام') {
    add('R17', 'primary', 'WEST', 'high');
  }

  if (p === 'مرکزی') {
    if (c.includes('ساوه') || k < 400) {
      add('FW5', 'primary', 'CENTER', 'high');
      add('R65', 'secondary', 'SOUTH', 'medium');
      add('FW6', 'secondary', 'WEST', 'medium');
    } else {
      add('R56', 'primary', 'CENTER', 'high');
      add('R37', 'secondary', 'WEST', 'medium');
    }
  }

  if (p === 'لرستان') {
    add('R37', 'primary', 'WEST', 'high');
    add('R39', 'secondary', 'SW', 'medium');
  }

  if (p === 'خوزستان') {
    add('R39', 'primary', 'SW', 'high');
  }

  if (p === 'اصفهان') {
    add('FW7', 'primary', 'SOUTH', 'high');
    add('R65', 'primary', 'SOUTH', 'high');
    add('R71', 'secondary', 'SE', 'medium');
    add('R72', 'secondary', 'CENTER', 'medium');
  }

  if (p === 'چهارمحال و بختیاری') {
    add('R72', 'primary', 'CENTER', 'high');
    add('R65', 'secondary', 'SOUTH', 'low');
  }

  if (p === 'کهگیلویه و بویراحمد') {
    add('R67', 'primary', 'SOUTH', 'high');
    add('R65', 'secondary', 'SOUTH', 'medium');
  }

  if (p === 'فارس') {
    add('FW7', 'primary', 'SOUTH', 'high');
    add('R65', 'primary', 'SOUTH', 'high');
    add('R86', 'secondary', 'SOUTH', 'medium');
  }

  if (p === 'بوشهر') {
    add('R86', 'primary', 'SOUTH', 'high');
    add('R65', 'secondary', 'SOUTH', 'medium');
  }

  if (p === 'یزد') {
    add('R71', 'primary', 'SE', 'high');
  }

  if (p === 'کرمان') {
    add('R71', 'primary', 'SE', 'high');
    add('R91', 'secondary', 'SE', 'high');
    add('R84', 'secondary', 'SE', 'medium');
  }

  if (p === 'هرمزگان') {
    add('R71', 'primary', 'SE', 'high');
    add('R91', 'primary', 'SE', 'high');
  }

  if (p === 'سیستان و بلوچستان') {
    if (c.includes('چابهار') || c.includes('کنارک') || c.includes('نیک شهر') || c.includes('ایرانشهر') || c.includes('سرباز') || c.includes('راسک')) {
      add('R95', 'primary', 'SE', 'high');
      add('R84', 'secondary', 'SE', 'medium');
    } else {
      add('R84', 'primary', 'SE', 'high');
      add('R95', 'secondary', 'SE', 'medium');
    }
  }

  // fallback: اگر هیچ محوری پیدا نشد
  if (out.length === 0) {
    add('LOCAL_TEHRAN', 'secondary', 'LOCAL', 'low');
  }

  return out;
}

async function upsertAxes(client) {
  for (const a of AXES) {
    await client.query(
      `INSERT INTO transport_axes (
        axis_code, axis_name_fa, axis_type, direction, origin_hub,
        terminus_city, terminus_province, geo_zone, road_numbers, notes, is_active, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW())
      ON CONFLICT (axis_code) DO UPDATE SET
        axis_name_fa = EXCLUDED.axis_name_fa,
        axis_type = EXCLUDED.axis_type,
        direction = EXCLUDED.direction,
        terminus_city = EXCLUDED.terminus_city,
        terminus_province = EXCLUDED.terminus_province,
        geo_zone = EXCLUDED.geo_zone,
        road_numbers = EXCLUDED.road_numbers,
        notes = EXCLUDED.notes,
        updated_at = NOW()`,
      [a.code, a.name, a.type, a.direction, ORIGIN, a.terminus, a.terminusProvince, a.zone, a.roads, a.notes]
    );
  }
}

async function upsertHubs(client) {
  for (const h of HUBS) {
    const route = await client.query(
      `SELECT id FROM dispatch_routes
       WHERE LOWER(TRIM(city)) = LOWER(TRIM($1)) AND LOWER(TRIM(province)) = LOWER(TRIM($2))
       LIMIT 1`,
      [h.city, h.province]
    );
    await client.query(
      `INSERT INTO transport_hubs (
        hub_code, hub_name_fa, city, province, dispatch_route_id, km_from_origin, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
      ON CONFLICT (hub_code) DO UPDATE SET
        hub_name_fa = EXCLUDED.hub_name_fa,
        city = EXCLUDED.city,
        province = EXCLUDED.province,
        dispatch_route_id = EXCLUDED.dispatch_route_id,
        km_from_origin = EXCLUDED.km_from_origin`,
      [h.code, h.name, h.city, h.province, route.rows[0]?.id || null, h.km]
    );
  }
}

async function upsertHubChains(client) {
  await client.query('DELETE FROM axis_hub_chain');
  for (const [axis, hubs] of Object.entries(AXIS_HUB_CHAINS)) {
    for (let i = 0; i < hubs.length; i++) {
      await client.query(
        `INSERT INTO axis_hub_chain (axis_code, hub_code, sequence_order, leg_description)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [axis, hubs[i], i + 1, null]
      );
    }
  }
}

async function upsertZonesAndRules(client) {
  for (const z of GEO_ZONES) {
    await client.query(
      `INSERT INTO city_geo_zones (zone_code, zone_name_fa)
       VALUES ($1,$2)
       ON CONFLICT (zone_code) DO UPDATE SET zone_name_fa = EXCLUDED.zone_name_fa`,
      [z.code, z.name]
    );
  }
  for (const r of COMBINATION_RULES) {
    await client.query(
      `INSERT INTO axis_combination_rules (rule_code, rule_name_fa, score, max_km_spread, max_stops, notes, is_active)
       VALUES ($1,$2,$3,$4,4,$5,TRUE)
       ON CONFLICT (rule_code) DO UPDATE SET
         rule_name_fa = EXCLUDED.rule_name_fa,
         score = EXCLUDED.score,
         max_km_spread = EXCLUDED.max_km_spread,
         notes = EXCLUDED.notes`,
      [r.code, r.name, r.score, r.maxKmSpread, r.notes]
    );
  }
}

async function mapAllCities(client) {
  await client.query('DELETE FROM city_axis_membership');

  const cities = await client.query(`
    SELECT id::text AS id, city, province, round_trip_km::numeric AS km
    FROM dispatch_routes
    WHERE is_active IS NOT FALSE
    ORDER BY province, round_trip_km NULLS LAST, city
  `);

  const rows = [];
  for (const row of cities.rows) {
    const memberships = axesForProvince(row.province, row.city, row.km);
    const km = row.km != null ? Number(row.km) : null;
    const seq = km != null ? Math.round(km) : null;
    for (const m of memberships) {
      rows.push({
        id: row.id,
        city: row.city,
        province: row.province,
        axis: m.axis,
        type: m.type,
        seq,
        km,
        zone: m.zone,
        confidence: m.confidence,
      });
    }
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      values.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'province_km_rules')`
      );
      params.push(r.id, r.city, r.province, r.axis, r.type, r.seq, r.km, r.zone, r.confidence);
    }
    await client.query(
      `INSERT INTO city_axis_membership (
        dispatch_route_id, city, province, axis_code, membership_type,
        sequence_on_axis, km_from_origin, geo_zone, confidence, source
      ) VALUES ${values.join(',')}
      ON CONFLICT (dispatch_route_id, axis_code, membership_type) DO NOTHING`,
      params
    );
    console.log(`  memberships ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  return { cityCount: cities.rows.length, membershipCount: rows.length };
}

async function printStats(client) {
  const axes = await client.query('SELECT COUNT(*)::int c FROM transport_axes');
  const hubs = await client.query('SELECT COUNT(*)::int c FROM transport_hubs');
  const mem = await client.query('SELECT COUNT(*)::int c FROM city_axis_membership');
  const covered = await client.query(`
    SELECT COUNT(DISTINCT dispatch_route_id)::int c FROM city_axis_membership
  `);
  const byAxis = await client.query(`
    SELECT axis_code, membership_type, COUNT(*)::int c
    FROM city_axis_membership
    GROUP BY axis_code, membership_type
    ORDER BY axis_code, membership_type
  `);
  const uncovered = await client.query(`
    SELECT COUNT(*)::int c FROM dispatch_routes dr
    WHERE dr.is_active IS NOT FALSE
      AND NOT EXISTS (
        SELECT 1 FROM city_axis_membership m WHERE m.dispatch_route_id = dr.id
      )
  `);

  console.log('\n=== coverage ===');
  console.log({
    axes: axes.rows[0].c,
    hubs: hubs.rows[0].c,
    memberships: mem.rows[0].c,
    coveredCities: covered.rows[0].c,
    uncoveredCities: uncovered.rows[0].c,
  });
  console.log('\n=== memberships by axis ===');
  console.table(byAxis.rows);

  // نمونه شمال: چالوس vs رشت
  const sample = await client.query(`
    SELECT city, province, axis_code, membership_type, geo_zone, km_from_origin
    FROM city_axis_membership
    WHERE city IN ('چالوس','رشت','ساری','آمل','سمنان','مشهد','قزوین')
    ORDER BY city, membership_type, axis_code
  `);
  console.log('\n=== sample north/east cities ===');
  console.table(sample.rows);
}

async function main() {
  await createTransportCorridorTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertAxes(client);
    await upsertHubs(client);
    await upsertHubChains(client);
    await upsertZonesAndRules(client);
    const mapped = await mapAllCities(client);
    await client.query('COMMIT');
    console.log('✅ seed done', mapped);
    await printStats(client);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main, axesForProvince, AXES };
