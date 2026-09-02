const LINE_PAIRS = [
  ['Basteni', 'بستنی'],
  ['Pasturized', 'پاستوریزه'],
  ['Ambient', 'لبنیات-فروتلند'],
];

const ALLOWED_START_STATUSES = [
  'Assigned',
  'InTransit',
  'PendingPersonalAssignment',
  'PendingCompanyAssignment',
  'ChangeRequested',
];

function linesMatch(warehouseLine, announcementLine) {
  const w = String(warehouseLine || '').trim();
  const a = String(announcementLine || '').trim();
  if (!w || !a) return false;
  if (w === a) return true;
  return LINE_PAIRS.some(
    ([en, fa]) => (w === en && a === fa) || (w === fa && a === en)
  );
}

function cityKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
}

function isShahrLabaniatPlace(value) {
  const n = cityKey(value);
  return n.includes('شهرلبنیات') || (n.includes('لبنیات') && n.includes('میهن'));
}

function citiesMatch(warehouseCity, originCity) {
  const w = cityKey(warehouseCity);
  const o = cityKey(originCity);
  if (!w || !o) return false;
  if (w === o) return true;
  if (isShahrLabaniatPlace(warehouseCity) && isShahrLabaniatPlace(originCity)) return true;
  return o.includes(w) || w.includes(o);
}

function warehouseMatchesAnnouncement(warehouse, announcement) {
  const origin = announcement && announcement.origin_city;
  const cityOk =
    citiesMatch(warehouse && warehouse.city, origin) ||
    citiesMatch(warehouse && warehouse.name, origin);
  return cityOk && linesMatch(warehouse && warehouse.line_type, announcement && announcement.line_type);
}

function loadingStatusOf(row) {
  return row && row.loading_status ? String(row.loading_status) : '';
}

function canStart(row) {
  if (!row) return false;
  if (!ALLOWED_START_STATUSES.includes(row.status)) return false;
  if (!row.assigned_driver_id) return false;
  const st = loadingStatusOf(row);
  return !st || st === 'not_started';
}

function canEnd(row) {
  return loadingStatusOf(row) === 'in_progress';
}

function canCancelStart(row) {
  return loadingStatusOf(row) === 'in_progress';
}

function canReopen(row) {
  return loadingStatusOf(row) === 'completed';
}

function canReset(row) {
  const st = loadingStatusOf(row);
  return st === 'in_progress' || st === 'completed';
}

function isWarehouseKeeperRole(role) {
  return String(role || '').toLowerCase() === 'warehouse_keeper';
}

module.exports = {
  LINE_PAIRS,
  ALLOWED_START_STATUSES,
  linesMatch,
  citiesMatch,
  warehouseMatchesAnnouncement,
  canStart,
  canEnd,
  canCancelStart,
  canReopen,
  canReset,
  isWarehouseKeeperRole,
};
