/** همگام‌سازی داده بین صفحات مالی (محاسبه هزینه ↔ لیست پرداخت) */
export const FINANCE_DATA_CHANGED_EVENT = 'transport-finance-data-changed';

export function notifyFinanceDataChanged(detail?: { source?: string }) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent(FINANCE_DATA_CHANGED_EVENT, { detail: detail ?? {} })
    );
}

export function subscribeFinanceDataChanged(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(FINANCE_DATA_CHANGED_EVENT, listener);
    return () => window.removeEventListener(FINANCE_DATA_CHANGED_EVENT, listener);
}
