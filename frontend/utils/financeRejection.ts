/** آیا تور از نظر مالی رد شده و نباید در محاسبه/آمار ترابری بیاید؟ */
export function isFinanceRejectedAnn(ann: Record<string, unknown> | null | undefined): boolean {
  if (!ann) return false;
  const disposition = ann.finance_disposition ?? ann.financeDisposition;
  return disposition === 'rejected';
}

export function getFinanceRejectTypeLabel(
  rejectType: string | null | undefined
): string {
  if (rejectType === 'partial') return 'رد مالی — ناقص';
  if (rejectType === 'not_executed') return 'رد مالی — اجرا نشده';
  return 'رد مالی';
}
