'use strict';

const LINE_KEY = {
  IceCream: 'IceCream',
  Dairy: 'Dairy',
  Ambient: 'Ambient',
};

const LINE_ALIASES = {
  IceCream: ['IceCream', 'بستنی', 'Basteni'],
  Dairy: ['Dairy', 'پاستوریزه', 'Pasturized'],
  Ambient: ['Ambient', 'لبنیات-فروتلند'],
};

const LINE_FA_LABEL = {
  IceCream: 'بستنی',
  Dairy: 'پاستوریزه',
  Ambient: 'لبنیات-فروتلند',
};

const STATUS_MAP = {
  Draft: 'Draft',
  'پیش‌نویس': 'Draft',
  PendingManagerApproval: 'PendingManagerApproval',
  'در انتظار تایید مدیر': 'PendingManagerApproval',
  Rejected: 'Rejected',
  'رد شده': 'Rejected',
  PendingPersonalAssignment: 'PendingPersonalAssignment',
  'در انتظار تخصیص (شخصی)': 'PendingPersonalAssignment',
  PendingCompanyAssignment: 'PendingCompanyAssignment',
  'در انتظار تخصیص (شرکت)': 'PendingCompanyAssignment',
  Assigned: 'Assigned',
  'تخصیص یافته': 'Assigned',
  InTransit: 'InTransit',
  'در حال حمل': 'InTransit',
  Finalized: 'Finalized',
  'نهایی شده': 'Finalized',
  'تکمیل شده': 'Finalized',
  Cancelled: 'Cancelled',
  'لغو شده': 'Cancelled',
  ReAnnounced: 'ReAnnounced',
  Reannounced: 'ReAnnounced',
  'اعلام مجدد شده': 'ReAnnounced',
  Leftover: 'Leftover',
  'بار مانده': 'Leftover',
  ReturnedToCreator: 'ReturnedToCreator',
  'برگشت به اعلام‌کننده': 'ReturnedToCreator',
  ChangeRequested: 'ChangeRequested',
  'درخواست تغییر': 'ChangeRequested',
  Archived: 'Archived',
  'بایگانی شده': 'Archived',
};

function normalizeFreightLineTypeKey(lineType) {
  const raw = String(lineType || '').trim();
  if (!raw) return raw;
  if (LINE_ALIASES.IceCream.includes(raw)) return LINE_KEY.IceCream;
  if (LINE_ALIASES.Dairy.includes(raw)) return LINE_KEY.Dairy;
  if (LINE_ALIASES.Ambient.includes(raw)) return LINE_KEY.Ambient;
  return raw;
}

function lineTypeSqlAliases(lineType) {
  const key = normalizeFreightLineTypeKey(lineType);
  if (LINE_ALIASES[key]) return [...LINE_ALIASES[key]];
  const raw = String(lineType || '').trim();
  return raw ? [raw] : [];
}

function allLineTypeSqlValues() {
  return [...LINE_ALIASES.IceCream, ...LINE_ALIASES.Dairy, ...LINE_ALIASES.Ambient];
}

function formatFreightLineTypeFa(lineType) {
  const key = normalizeFreightLineTypeKey(lineType);
  return LINE_FA_LABEL[key] || String(lineType || '').trim() || 'نامشخص';
}

function lineTypeMatches(actual, expected) {
  const a = normalizeFreightLineTypeKey(actual);
  const b = normalizeFreightLineTypeKey(expected);
  return !!a && a === b;
}

function isDairyLineTypeValue(lineType) {
  return normalizeFreightLineTypeKey(lineType) === LINE_KEY.Dairy;
}

function isAmbientLineType(lineType) {
  return normalizeFreightLineTypeKey(lineType) === LINE_KEY.Ambient;
}

function isIceCreamLineType(lineType) {
  return normalizeFreightLineTypeKey(lineType) === LINE_KEY.IceCream;
}

function isDairyOrAmbientLineType(lineType) {
  const key = normalizeFreightLineTypeKey(lineType);
  return key === LINE_KEY.Dairy || key === LINE_KEY.Ambient;
}

const DAIRY_LINE_TYPES_SQL = "('پاستوریزه', 'Dairy', 'Pasturized')";

function normalizeFreightAnnouncementStatus(status) {
  if (status == null || status === '') return status;
  return STATUS_MAP[status] || status;
}

function statusMatches(actual, expected) {
  return normalizeFreightAnnouncementStatus(actual) === normalizeFreightAnnouncementStatus(expected);
}

function statusMatchesAny(actual, expectedList) {
  const key = normalizeFreightAnnouncementStatus(actual);
  return expectedList.some((item) => normalizeFreightAnnouncementStatus(item) === key);
}

function isPlannerFullEditStatus(status) {
  return statusMatchesAny(status, [
    'Draft',
    'Rejected',
    'ReturnedToCreator',
    'Leftover',
    'ChangeRequested',
  ]);
}

function isTransportIntakeStatus(status) {
  return statusMatchesAny(status, ['PendingCompanyAssignment', 'PendingPersonalAssignment']);
}

function isEnteringTransportIntake(oldStatus, newStatus) {
  return isTransportIntakeStatus(newStatus) && !isTransportIntakeStatus(oldStatus);
}

/** بستنی→شرکتی، پاستوریزه/لبنیات→شخصی */
function resolveAssignmentQueueFromLineType(lineType) {
  const key = normalizeFreightLineTypeKey(lineType);
  if (key === LINE_KEY.IceCream) {
    return { status: 'PendingCompanyAssignment', assignmentType: 'company', queueLabel: 'شرکتی' };
  }
  if (key === LINE_KEY.Dairy || key === LINE_KEY.Ambient) {
    return { status: 'PendingPersonalAssignment', assignmentType: 'personal', queueLabel: 'شخصی' };
  }
  return { status: 'PendingCompanyAssignment', assignmentType: 'company', queueLabel: 'شرکتی' };
}

/**
 * کارمند/کارشناس: پاستوریزه همه را می‌بینند؛ بستنی و لبنیات فقط مالک اعلام‌بار یا مالک مقصد.
 */
function planningEmployeeCanSeeAnnouncement({ lineType, createdByUserId, destOwnerUserIds, viewerUserId }) {
  const uid = String(viewerUserId || '').trim();
  if (!uid) return false;
  if (isDairyLineTypeValue(lineType)) return true;
  if (String(createdByUserId || '') === uid) return true;
  const owners = Array.isArray(destOwnerUserIds) ? destOwnerUserIds : [];
  return owners.some((id) => String(id || '') === uid);
}

function managerRejectReturnsStatus() {
  return 'Draft';
}

function transportReturnStatus() {
  return 'ReturnedToCreator';
}

module.exports = {
  LINE_KEY,
  LINE_ALIASES,
  LINE_FA_LABEL,
  DAIRY_LINE_TYPES_SQL,
  normalizeFreightLineTypeKey,
  lineTypeSqlAliases,
  allLineTypeSqlValues,
  formatFreightLineTypeFa,
  lineTypeMatches,
  isDairyLineTypeValue,
  isAmbientLineType,
  isIceCreamLineType,
  isDairyOrAmbientLineType,
  normalizeFreightAnnouncementStatus,
  statusMatches,
  statusMatchesAny,
  isPlannerFullEditStatus,
  isTransportIntakeStatus,
  isEnteringTransportIntake,
  resolveAssignmentQueueFromLineType,
  planningEmployeeCanSeeAnnouncement,
  managerRejectReturnsStatus,
  transportReturnStatus,
};
