/** آیا تور از نظر مالی رد شده و نباید در محاسبه/آمار ترابری بیاید؟ */
export function isFinanceRejectedAnn(ann: Record<string, unknown> | null | undefined): boolean {
  if (!ann) return false;
  const disposition =
    ann.finance_disposition ??
    ann.financeDisposition ??
    (ann as { finance_disposition?: string }).finance_disposition;
  return disposition === 'rejected';
}

export function getFinanceRejectType(ann: Record<string, unknown> | null | undefined): string | null {
  if (!ann) return null;
  const t = ann.finance_reject_type ?? ann.financeRejectType;
  return typeof t === 'string' ? t : null;
}

export function getFinanceRejectTypeLabel(
  rejectType: string | null | undefined
): string {
  if (rejectType === 'partial') return 'رد مالی — ناقص';
  if (rejectType === 'not_executed') return 'رد مالی — اجرا نشده';
  return 'رد مالی';
}
