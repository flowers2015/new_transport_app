import { getApiUrl } from './apiConfig';

export async function confirmBillOfLadingNotDuplicate(
    number: string,
    excludeId?: string
): Promise<boolean> {
    const trimmed = String(number || '').trim();
    if (!trimmed) return true;
    try {
        const tk = localStorage.getItem('token');
        const qs = new URLSearchParams({ number: trimmed });
        if (excludeId) qs.set('excludeId', String(excludeId));
        const r = await fetch(getApiUrl(`freight-announcements/bill-of-lading-duplicates?${qs.toString()}`), {
            headers: { Authorization: 'Bearer ' + tk },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            console.warn('[BOL duplicate] check failed', r.status, data);
            return true;
        }
        if (!data.duplicate) return true;
        const codes = (data.matches || [])
            .map((m: { announcementCode?: string; announcement_code?: string }) => m.announcementCode || m.announcement_code)
            .filter(Boolean);
        const extra = codes.length ? `\nاعلام‌بار: ${codes.join('، ')}` : '';
        return window.confirm(
            `شماره بارنامه تکراری است (سه ماه اخیر، شامل آرشیو).${extra}\nادامه می‌دهید؟`
        );
    } catch (e) {
        console.warn('[BOL duplicate] check error', e);
        return true;
    }
}
