import { getApiUrl } from './apiConfig';
import type { DairyArrangementRoute } from './dairyRouteArrangement';

export type ArrangementLock = {
    routeId: string;
    userId: string;
    userName: string;
    lockedAt?: string;
    expiresAt: string;
};

export type DairyArrangementState = {
    id: string;
    routes: DairyArrangementRoute[];
    locks: Record<string, ArrangementLock>;
    version: number;
    updatedByUserId?: string | null;
    updatedByUserName?: string | null;
    updatedAt?: string;
};

function authHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
    };
}

function weekDayQuery(weekDay?: string | null): string {
    const day = String(weekDay || '').trim();
    return day ? `?weekDay=${encodeURIComponent(day)}` : '';
}

export async function fetchDairyArrangementState(
    weekDay?: string | null
): Promise<DairyArrangementState | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(
            getApiUrl(`freight-announcements/dairy-arrangement${weekDayQuery(weekDay)}`),
            {
                headers: authHeaders(),
                signal: controller.signal,
            }
        );
        if (!res.ok) return null;
        return (await res.json()) as DairyArrangementState;
    } catch (err) {
        console.error('❌ [fetchDairyArrangementState]', err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function saveDairyArrangementState(
    routes: DairyArrangementRoute[],
    baseVersion: number | null,
    weekDay?: string | null
): Promise<
    | { ok: true; state: DairyArrangementState }
    | { ok: false; conflict: true; state: DairyArrangementState; message?: string }
    | { ok: false; conflict: false; state?: undefined; message?: string }
> {
    const res = await fetch(getApiUrl('freight-announcements/dairy-arrangement'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ routes, baseVersion, weekDay: weekDay || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
        return {
            ok: false,
            conflict: true,
            state: body.state as DairyArrangementState,
            message: body.message,
        };
    }
    if (!res.ok) {
        return { ok: false, conflict: false, message: body.message || 'خطا در ذخیره چیدمان' };
    }
    return { ok: true, state: body as DairyArrangementState };
}

export async function updateDairyArrangementLockApi(
    routeId: string,
    action: 'acquire' | 'release' | 'heartbeat',
    weekDay?: string | null
): Promise<{ ok: boolean; locks?: Record<string, ArrangementLock>; lock?: ArrangementLock | null; message?: string }> {
    const res = await fetch(getApiUrl('freight-announcements/dairy-arrangement/locks'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ routeId, action, weekDay: weekDay || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, locks: body.locks, lock: body.lock, message: body.message };
    }
    return { ok: true, locks: body.locks, lock: body.lock };
}
