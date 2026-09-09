import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiUrl } from '../utils/apiConfig';
import { formatJalaliDateTime } from '../utils/jalali';

export type InsightDriver = {
    driver_id: string;
    driver_name?: string | null;
    employee_id?: string | null;
};

type LastAnnouncement = {
    found?: boolean;
    announcementCode?: string | null;
    lineLabel?: string | null;
    brand?: string | null;
    originCity?: string | null;
    destinationCity?: string | null;
    destinationCities?: string[];
    distanceLabel?: string | null;
    assignedAt?: string | null;
    routeText?: string | null;
} | null;

type PrefsBlock = {
    present: boolean;
    followTurn: boolean;
    rejectLineLabel?: string | null;
    rejectDistanceLabel?: string | null;
    rejectProvinces: string[];
    preferProvinces: string[];
    summary: string;
    completedAt?: string | null;
    expiresAt?: string | null;
};

type DriverInsight = {
    driver: { id: string; name?: string | null; employeeId?: string | null; mobile?: string | null };
    lastAnnouncement: LastAnnouncement;
    prefs: PrefsBlock;
    comparison?: { notes?: string[] };
};

type QueueInsightEntry = {
    id: string;
    position: number;
    queueType: 'far' | 'near';
    queueTypeLabel?: string;
    vehicleCode?: string | null;
    driverId?: string | null;
    driverName: string;
    employeeId?: string | null;
    lastAnnouncement: LastAnnouncement;
    prefs: PrefsBlock;
};

type CategoryQueueInsight = {
    category: string;
    far: QueueInsightEntry[];
    near: QueueInsightEntry[];
};

function normalizeQuery(value: string) {
    return value.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
}

async function readApiError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message || res.statusText || 'خطا';
}

function PrefSummary({ prefs }: { prefs: PrefsBlock }) {
    if (!prefs?.present) {
        return <p className="text-slate-500">ترجیحی برای اعلام بار بعدی ثبت نشده است.</p>;
    }
    if (prefs.followTurn) {
        return <p className="text-slate-700">طبق نوبت — فیلتر نگفته</p>;
    }
    const rejects = [
        prefs.rejectLineLabel ? `لاین ${prefs.rejectLineLabel}` : null,
        prefs.rejectDistanceLabel || null,
        prefs.rejectProvinces.length ? `استان ${prefs.rejectProvinces.join('، ')}` : null,
    ].filter(Boolean);
    return (
        <div className="space-y-1">
            {rejects.length > 0 && (
                <p>
                    <span className="text-rose-700 font-medium">رد / نمی‌رود: </span>
                    {rejects.join(' · ')}
                </p>
            )}
            {prefs.preferProvinces.length > 0 && (
                <p>
                    <span className="text-emerald-700 font-medium">ترجیح / می‌رود: </span>
                    {prefs.preferProvinces.join('، ')}
                </p>
            )}
            {!rejects.length && !prefs.preferProvinces.length && (
                <p className="whitespace-pre-line">{prefs.summary}</p>
            )}
        </div>
    );
}

function LastRouteBlock({ last }: { last: LastAnnouncement }) {
    if (!last) {
        return <p className="text-slate-500">آخرین اعلام بار تخصیص‌شده پیدا نشد.</p>;
    }
    return (
        <div className="space-y-0.5">
            <p className="font-medium text-slate-800">{last.routeText || '—'}</p>
            <p className="text-slate-600">
                {[
                    last.distanceLabel,
                    last.lineLabel,
                    last.brand,
                    last.announcementCode ? `کد ${last.announcementCode}` : null,
                ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {last.assignedAt && (
                <p className="text-[11px] text-slate-400">
                    تخصیص: {formatJalaliDateTime(last.assignedAt)}
                </p>
            )}
        </div>
    );
}

export function BaleNextLoadPrefLookupDialog({
    drivers,
    onClose,
}: {
    drivers: InsightDriver[];
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [insight, setInsight] = useState<DriverInsight | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const matches = useMemo(() => {
        const q = normalizeQuery(query);
        if (!q) return drivers.slice(0, 12);
        return drivers
            .filter(d => {
                const name = normalizeQuery(d.driver_name || '');
                const emp = normalizeQuery(d.employee_id || '');
                return name.includes(q) || emp.includes(q);
            })
            .slice(0, 12);
    }, [drivers, query]);

    useEffect(() => {
        if (!selectedId) {
            setInsight(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await apiFetch(
                    getApiUrl(`bale/next-load-insight/${encodeURIComponent(selectedId)}`)
                );
                if (!res.ok) throw new Error(await readApiError(res));
                const data = (await res.json()) as DriverInsight;
                if (!cancelled) setInsight(data);
            } catch (e) {
                if (!cancelled) {
                    setInsight(null);
                    setError(e instanceof Error ? e.message : 'خطا در دریافت');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedId]);

    return (
        <div
            className="fixed inset-0 bg-black/50 flex justify-center items-start z-50 p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4 my-8 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start gap-3 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">ترجیح و رد راننده</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            با اسم جستجو کنید؛ آخرین مسیر برداشته‌شده و ترجیح/رد اعلام بار بعدی دیده می‌شود.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300 shrink-0"
                    >
                        بستن
                    </button>
                </div>
                <label className="block text-xs text-slate-600 mb-1">جستجو با نام یا کد پرسنلی</label>
                <input
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    placeholder="مثلاً احمدی"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                />
                <ul className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-200 divide-y divide-slate-100">
                    {matches.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-slate-400">راننده‌ای پیدا نشد.</li>
                    ) : (
                        matches.map(d => (
                            <li key={d.driver_id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(d.driver_id)}
                                    className={`w-full text-right px-3 py-2 text-sm ${
                                        selectedId === d.driver_id
                                            ? 'bg-sky-50 text-sky-800'
                                            : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="font-medium">{d.driver_name || '—'}</span>
                                    {d.employee_id ? (
                                        <span className="text-xs text-slate-500 mr-2">
                                            {d.employee_id}
                                        </span>
                                    ) : null}
                                </button>
                            </li>
                        ))
                    )}
                </ul>
                {loading && <p className="mt-4 text-sm text-slate-500">در حال بارگذاری...</p>}
                {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
                {insight && !loading && (
                    <div className="mt-4 space-y-3">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                            {insight.driver.name || 'راننده'}
                            {insight.driver.employeeId ? ` • ${insight.driver.employeeId}` : ''}
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                            <div className="text-xs font-medium text-slate-500">آخرین اعلام بار</div>
                            <LastRouteBlock last={insight.lastAnnouncement} />
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
                            <div className="text-xs font-medium text-violet-700 mb-1">
                                ترجیح و رد اعلام بار بعدی
                            </div>
                            <PrefSummary prefs={insight.prefs} />
                            {insight.prefs.expiresAt && (
                                <p className="text-[11px] text-slate-500 mt-1">
                                    اعتبار تا {formatJalaliDateTime(insight.prefs.expiresAt)}
                                </p>
                            )}
                        </div>
                        {insight.comparison?.notes?.length ? (
                            <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                                {insight.comparison.notes.map(note => (
                                    <p key={note}>{note}</p>
                                ))}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}

function QueueTable({ title, entries }: { title: string; entries: QueueInsightEntry[] }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
                <span className="text-xs text-slate-500">{entries.length} نوبت</span>
            </div>
            {entries.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">نوبتی ثبت نشده است.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                        <thead className="text-[10px] text-slate-500 bg-slate-50/80">
                            <tr className="border-b border-slate-200">
                                <th className="px-2 py-1.5 font-medium w-10">#</th>
                                <th className="px-2 py-1.5 font-medium w-16">کد خودرو</th>
                                <th className="px-2 py-1.5 font-medium">راننده</th>
                                <th className="px-2 py-1.5 font-medium">آخرین مسیر</th>
                                <th className="px-2 py-1.5 font-medium">ترجیح / رد</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id} className="border-b border-slate-100 align-top">
                                    <td className="px-2 py-2 text-center">{entry.position}</td>
                                    <td className="px-2 py-2 text-center font-mono">
                                        {entry.vehicleCode || '—'}
                                    </td>
                                    <td className="px-2 py-2">
                                        <div className="font-medium text-slate-800">
                                            {entry.driverName}
                                        </div>
                                        {entry.employeeId && (
                                            <div className="text-[10px] text-slate-400">
                                                {entry.employeeId}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-2 py-2 text-slate-600">
                                        {entry.lastAnnouncement?.routeText || '—'}
                                        {entry.lastAnnouncement?.distanceLabel ? (
                                            <div className="text-[10px] text-slate-400">
                                                {entry.lastAnnouncement.distanceLabel}
                                                {entry.lastAnnouncement.lineLabel
                                                    ? ` · ${entry.lastAnnouncement.lineLabel}`
                                                    : ''}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="px-2 py-2">
                                        <PrefSummary prefs={entry.prefs} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export function BaleCategoryQueuePrefDialog({
    category,
    label,
    onClose,
}: {
    category: string;
    label: string;
    onClose: () => void;
}) {
    const [data, setData] = useState<CategoryQueueInsight | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await apiFetch(
                    getApiUrl(`bale/category-queue-insight?category=${encodeURIComponent(category)}`)
                );
                if (!res.ok) throw new Error(await readApiError(res));
                const json = (await res.json()) as CategoryQueueInsight;
                if (!cancelled) setData(json);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'خطا در دریافت نوبت');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [category]);

    return (
        <div
            className="fixed inset-0 bg-black/50 flex justify-center items-start z-50 p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-5xl p-4 my-8 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start gap-3 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">نوبت {label}</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            همان ترتیب ثبت نوبت (دور و نزدیک) به‌همراه ترجیح و رد اعلام بار بعدی.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300 shrink-0"
                    >
                        بستن
                    </button>
                </div>
                {loading && <p className="text-sm text-slate-500 py-8 text-center">در حال بارگذاری...</p>}
                {error && <p className="text-sm text-rose-600">{error}</p>}
                {data && !loading && (
                    <div className="space-y-4">
                        <QueueTable title="نوبت مسیر دور" entries={data.far} />
                        <QueueTable title="نوبت مسیر نزدیک" entries={data.near} />
                    </div>
                )}
            </div>
        </div>
    );
}
