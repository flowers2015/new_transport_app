import { UserRole } from '../types';

/** نقش‌هایی که فقط مشاهده پیگیری اعلام بار دارند (بدون تخصیص/ویرایش) */
export function isFreightViewOnlyRole(role: UserRole | string | null | undefined): boolean {
  return (
    role === UserRole.Viewer ||
    role === UserRole.Inspection ||
    role === UserRole.BranchFinance ||
    role === UserRole.HQFinance ||
    role === UserRole.BranchFinanceManager ||
    role === UserRole.Auditor
  );
}

/** نقش بازرسی — مشاهده اعلام بار + مدیریت منابع GPS */
export function isInspectionRole(role: UserRole | string | null | undefined): boolean {
  return role === UserRole.Inspection;
}
