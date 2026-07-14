import { getApiUrl } from './apiConfig';
import { FreightLineType } from '../types';

export type FreightIntakeLock = {
    lineType: string;
    isLocked: boolean;
    updatedByUserId?: string | null;
    updatedByUserName?: string | null;
    updatedAt?: string;
};

export const FREIGHT_INTAKE_LOCK_MESSAGE =
    'بدلیل اتمام تایم اعلام بار، ارسال درخواست قفل می‌باشد. در صورت ضرورت با ترابری تماس بگیرید.';

function authHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
    };
}

export function lineTypeToIntakeLockKey(lineType: string): string {
    if (lineType === FreightLineType.IceCream || lineType === 'بستنی' || lineType === 'IceCream') {
        return 'IceCream';
    }
    if (lineType === FreightLineType.Dairy || lineType === 'پاستوریزه' || lineType === 'Dairy') {
        return 'Dairy';
    }
    if (
        lineType === FreightLineType.Ambient ||
        lineType === 'لبنیات-فروتلند' ||
        lineType === 'Ambient'
    ) {
        return 'Ambient';
    }
    return lineType;
}

export async function fetchFreightIntakeLocks(): Promise<Record<string, boolean>> {
    const res = await fetch(getApiUrl('freight-intake-locks'), { headers: authHeaders() });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, boolean> = {};
    for (const lock of data.locks || []) {
        map[lock.lineType] = Boolean(lock.isLocked);
        // کلید فارسی تب هم برای lookup آسان
        if (lock.lineType === 'IceCream') map[FreightLineType.IceCream] = Boolean(lock.isLocked);
        if (lock.lineType === 'Dairy') map[FreightLineType.Dairy] = Boolean(lock.isLocked);
        if (lock.lineType === 'Ambient') map[FreightLineType.Ambient] = Boolean(lock.isLocked);
    }
    return map;
}

export async function setFreightIntakeLock(
    lineType: string,
    locked: boolean
): Promise<{ ok: boolean; message?: string; isLocked?: boolean }> {
    const key = lineTypeToIntakeLockKey(lineType);
    const res = await fetch(getApiUrl(`freight-intake-locks/${key}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ locked }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, message: body.message || 'خطا در تغییر قفل اعلام‌بار' };
    }
    return { ok: true, message: body.message, isLocked: Boolean(body.isLocked) };
}

/** استخراج پیام API از متن خطا (JSON یا خام) */
export function parseFreightApiErrorMessage(raw: unknown, fallback = 'خطا در انجام عملیات'): string {
    const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '';
    if (!text) return fallback;
    try {
        const parsed = JSON.parse(text);
        if (parsed?.message) return String(parsed.message);
    } catch {
        // ممکن است کل پاسخ JSON باشد داخل Error("...status... {json}")
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                if (parsed?.message) return String(parsed.message);
            } catch {
                /* ignore */
            }
        }
    }
    return text.includes(FREIGHT_INTAKE_LOCK_MESSAGE) ? FREIGHT_INTAKE_LOCK_MESSAGE : text || fallback;
}

/** خطای قابل‌انتظار وقتی قفل پذیرش اعلام‌بار فعال است */
export function isFreightIntakeLockedError(raw: unknown): boolean {
    const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '';
    if (!text) return false;
    if (text.includes('FREIGHT_INTAKE_LOCKED') || text.includes(FREIGHT_INTAKE_LOCK_MESSAGE)) {
        return true;
    }
    try {
        const parsed = JSON.parse(text);
        return parsed?.code === 'FREIGHT_INTAKE_LOCKED';
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return false;
        try {
            const parsed = JSON.parse(match[0]);
            return parsed?.code === 'FREIGHT_INTAKE_LOCKED';
        } catch {
            return false;
        }
    }
}
