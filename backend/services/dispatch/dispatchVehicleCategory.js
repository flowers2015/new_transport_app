const presetCategories = [
  { key: 'trailer', label: 'تریلی' },
  { key: 'mini-trailer', label: 'مینی تریلی' },
  { key: 'ten-wheel', label: 'ده چرخ' },
];

const normalizeVehicleText = (value) =>
  (value || '').toString().replace(/[\s_\-‌]/g, '').toLowerCase();

const categoryVehicleKeywords = {
  trailer: [
    'تریلی',
    'تریلر',
    'trailer',
    'semi',
    'semi-trailer',
    'semitrailer',
    'semtrailer',
    'semi trailer',
    'semitrail',
    'semitrailers',
    'نیمهتریلی',
    'کفی',
    'چادری',
  ],
  'mini-trailer': ['مینی', 'mini', 'mini-trailer', 'minitrailer', 'مینی‌تریلی', 'مینیتریلی'],
  'ten-wheel': [
    'دهچرخ',
    '10چرخ',
    'دهتن',
    'tenwheel',
    'tenwheeler',
    'ده-چرخ',
    'دهچرخکمپرسی',
    'دهچرخباری',
    'دهچرخخاور',
    'دهتنکفی',
  ],
};

const categoryVehicleKeywordsNormalized = Object.fromEntries(
  Object.entries(categoryVehicleKeywords).map(([key, keywords]) => [
    key,
    keywords.map(keyword => normalizeVehicleText(keyword)),
  ])
);

const categoryDetectionOrder = ['mini-trailer', 'ten-wheel', 'trailer'];

function resolveCategoryKey(value) {
  if (!value) return null;
  const normalized = normalizeVehicleText(value);
  for (const preset of presetCategories) {
    if (
      normalizeVehicleText(preset.label) === normalized ||
      normalizeVehicleText(preset.key) === normalized
    ) {
      return preset.key;
    }
  }
  return null;
}

function detectVehicleCategoryKey(vehicleType) {
  const normalized = normalizeVehicleText(vehicleType);
  if (!normalized) return null;
  for (const key of categoryDetectionOrder) {
    const keywords = categoryVehicleKeywordsNormalized[key] || [];
    if (keywords.some(keyword => keyword && normalized.includes(keyword))) {
      return key;
    }
  }
  return null;
}

/** تطابق سخت‌گیرانه: صف تریلی فقط تریلی، مینی‌تریلی فقط مینی‌تریلی، ده‌چرخ فقط ده‌چرخ */
function vehicleMatchesCategory(vehicleType, categoryValue) {
  const presetKey = resolveCategoryKey(categoryValue);
  if (!presetKey) return false;
  const normalizedType = normalizeVehicleText(vehicleType);
  if (!normalizedType) return false;

  const detectedKey = detectVehicleCategoryKey(vehicleType);
  if (detectedKey) {
    return detectedKey === presetKey;
  }

  const keywords = categoryVehicleKeywordsNormalized[presetKey] || [];
  return keywords.some(keyword => keyword && normalizedType.includes(keyword));
}

function isCompanyAssignedRow(row) {
  const assignmentType = (row.assignment_type || '').toString().trim().toLowerCase();
  const status = row.status || '';
  return (
    assignmentType === 'company' ||
    assignmentType === 'شرکتی' ||
    status === 'PendingCompanyAssignment'
  );
}

/** بار ارجاع‌شده به ترابری شخصی — نباید در تابلوی نوبت شرکت برای تخصیص بیاید */
function isCompanyDispatchAssignable(row) {
  const assignmentType = (row.assignment_type || '').toString().trim().toLowerCase();
  const status = row.status || '';
  if (assignmentType === 'personal' || assignmentType === 'شخصی') return false;
  if (status === 'PendingPersonalAssignment') return false;

  const lineType = row.line_type || '';
  const isKnownLine =
    lineType === 'IceCream' ||
    lineType === 'بستنی' ||
    lineType === 'Dairy' ||
    lineType === 'پاستوریزه' ||
    lineType === 'Ambient' ||
    lineType === 'لبنیات-فروتلند' ||
    String(lineType).includes('فروتلند');

  if (isKnownLine) {
    return isCompanyAssignedRow(row);
  }

  return isCompanyAssignedRow(row);
}

module.exports = {
  presetCategories,
  normalizeVehicleText,
  resolveCategoryKey,
  detectVehicleCategoryKey,
  vehicleMatchesCategory,
  isCompanyDispatchAssignable,
};
