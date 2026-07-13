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

export async function fetchDairyArrangementState(): Promise<DairyArrangementState | null> {
    const res = await fetch(getApiUrl('freight-announcements/dairy-arrangement'), {
        headers: authHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
}

export async function saveDairyArrangementState(
    routes: DairyArrangementRoute[],
    baseVersion: number | null
): Promise<
    | { ok: true; state: DairyArrangementState }
    | { ok: false; conflict: true; state: DairyArrangementState; message?: string }
    | { ok: false; conflict: false; state?: undefined; message?: string }
> {
    const res = await fetch(getApiUrl('freight-announcements/dairy-arrangement'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ routes, baseVersion }),
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
    action: 'acquire' | 'release' | 'heartbeat'
): Promise<{ ok: boolean; locks?: Record<string, ArrangementLock>; lock?: ArrangementLock | null; message?: string }> {
    const res = await fetch(getApiUrl('freight-announcements/dairy-arrangement/locks'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ routeId, action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, locks: body.locks, lock: body.lock, message: body.message };
    }
    return { ok: true, locks: body.locks, lock: body.lock };
}
