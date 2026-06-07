import React, { useMemo } from 'react';
import {
    DriverPreferenceCycleSummary,
    DriverPreferenceOpportunity,
    DriverPreferenceStats,
    DriverPreferencesResponse,
} from '../types';
import { gregorianToJalali } from '../utils/jalali';

const pad2 = (value: number) => (value < 10 ? `0${value}` : `${value}`);

const formatDistance = (km?: number | null) => {
    if (km == null || Number.isNaN(Number(km))) return '';
    return `${Number(km).toLocaleString('fa-IR')} km`;
};

type DayQueueEntry = {
    queuePosition: number | null;
    vehicleCode: string | null;
    driverName: string;
    destination: string;
    tripKm: number | null;
    isVeryFar: boolean;
    isTarget: boolean;
};

type DayRow = {
    key: string;
    jalaliLabel: string;
    far: DayQueueEntry[];
    near: DayQueueEntry[];
};

function dayKey(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function buildDayTable(
    data: DriverPreferencesResponse,
    targetDriverId: string,
    targetDriverName: string
): DayRow[] {
    const dayMap = new Map<string, DayRow>();

    const ensureDay = (isoLike: string, jalaliFallback?: string | null) => {
        const key = dayKey(isoLike);
        if (!key) return null;
        if (!dayMap.has(key)) {
            const date = new Date(isoLike);
            const [jy, jm, jd] = gregorianToJalali(
                date.getFullYear(),
                date.getMonth() + 1,
                date.getDate()
            );
            dayMap.set(key, {
                key,
                jalaliLabel: jalaliFallback || `${jy}/${pad2(jm)}/${pad2(jd)}`,
                far: [],
                near: [],
            });
        }
        return dayMap.get(key)!;
    };

    const pushFinalized = (
        assignedAt: string,
        assignedAtJalali: string | null | undefined,
        queueType: 'far' | 'near' | string,
        entry: DayQueueEntry
    ) => {
        const day = ensureDay(assignedAt, assignedAtJalali);
        if (!day) return;
        const bucket = queueType === 'far' ? day.far : day.near;
        bucket.push(entry);
    };

    for (const item of data.taken || []) {
        if (item.certainty !== 'finalized') continue;
        const queueType = item.queueType || (item.stage === 'stage1' ? 'far' : 'near');
        pushFinalized(item.assignedAt, item.assignedAtJalali, queueType, {
            queuePosition: item.queuePosition ?? null,
            vehicleCode: item.vehicleCode || null,
            driverName: targetDriverName,
            destination: item.destinationCity || item.originCity || '',
            tripKm: item.roundTripKm ?? null,
            isVeryFar: Boolean(item.isVeryFar),
            isTarget: true,
        });
    }

    for (const peer of data.peerAssignments || []) {
        if (peer.driverId === targetDriverId) continue;
        if (peer.certainty !== 'finalized') continue;
        const queueType = peer.queueType || (peer.stage === 'stage1' ? 'far' : 'near');
        pushFinalized(peer.assignedAt, peer.assignedAtJalali, queueType, {
            queuePosition: peer.queuePosition ?? null,
            vehicleCode: peer.vehicleCode || null,
            driverName: peer.driverName || 'راننده',
            destination: peer.destinationCity || '',
            tripKm: peer.roundTripKm ?? null,
            isVeryFar: Boolean(peer.isVeryFar),
            isTarget: false,
        });
    }

    const sortEntries = (list: DayQueueEntry[]) =>
        [...list].sort((a, b) => (a.queuePosition ?? 999) - (b.queuePosition ?? 999));

    return Array.from(dayMap.values())
        .map(day => ({
            ...day,
            far: sortEntries(day.far),
            near: sortEntries(day.near),
        }))
        .filter(day => day.far.length > 0 || day.near.length > 0)
        .sort((a, b) => a.key.localeCompare(b.key));
}

type SkippedDayRow = {
    key: string;
    jalaliLabel: string;
    items: DriverPreferenceOpportunity[];
};

function buildSkippedByDay(items: DriverPreferenceOpportunity[]): SkippedDayRow[] {
    const map = new Map<string, SkippedDayRow>();
    for (const item of items) {
        const key = dayKey(item.seenAt);
        if (!key) continue;
        if (!map.has(key)) {
            map.set(key, {
                key,
                jalaliLabel: item.seenAtJalali || key,
                items: [],
            });
        }
        map.get(key)!.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function CycleSummarySection({ summary }: { summary: DriverPreferenceCycleSummary }) {
    const blocks = [
        { key: 'veryFar', title: 'خیلی‌دور', accent: 'border-amber-300 bg-amber-50', items: summary.veryFar },
        { key: 'far', title: 'دور', accent: 'border-sky-300 bg-sky-50', items: summary.far },
        { key: 'near', title: 'نزدیک', accent: 'border-emerald-300 bg-emerald-50', items: summary.near },
    ] as const;

    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">خلاصه دوره (فقط نهایی)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {blocks.map(block => (
                    <div key={block.key} className={`rounded-xl border p-3 ${block.accent}`}>
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                            {block.title} ({block.items.length})
                        </div>
                        {block.items.length === 0 ? (
                            <div className="text-[11px] text-slate-400">—</div>
                        ) : (
                            <ul className="space-y-1.5 text-[11px] text-slate-700">
                                {block.items.map(item => (
                                    <li key={item.id}>
                                        <div className="font-medium">{item.destinationCity || 'نامشخص'}</div>
                                        <div className="text-slate-500">
                                            {formatDistance(item.roundTripKm)}
                                            {item.assignedAtJalali ? ` • ${item.assignedAtJalali}` : ''}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

function StatsBar({ stats }: { stats: DriverPreferenceStats }) {
    return (
        <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                نهایی: {stats.finalizedCount}
            </span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                موقت: {stats.pendingCount}
            </span>
            <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
                لغو: {stats.cancelledCount}
            </span>
        </div>
    );
}

function QueueEntryLine({ entry }: { entry: DayQueueEntry }) {
    return (
        <div
            className={`text-[10px] leading-relaxed py-0.5 border-b border-slate-100 last:border-0 ${
                entry.isTarget ? 'text-amber-950 bg-amber-50/60 -mx-1 px-1 rounded' : 'text-slate-600'
            }`}
        >
            <span className="font-semibold">{entry.queuePosition ?? '—'}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span className="text-slate-500">{entry.vehicleCode || '—'}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span className="font-medium">{entry.driverName}</span>
            {entry.destination && (
                <>
                    <span className="text-slate-400 mx-1">·</span>
                    <span>
                        {entry.isVeryFar && <span className="text-amber-700">خیلی‌دور </span>}
                        {entry.destination}
                        {entry.tripKm != null ? ` (${formatDistance(entry.tripKm)})` : ''}
                    </span>
                </>
            )}
        </div>
    );
}

function DayQueueTable({ days }: { days: DayRow[] }) {
    if (days.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                تخصیص نهایی‌شده‌ای در این بازه ثبت نشده است.
            </div>
        );
    }

    return (
        <div className="overflow-auto rounded-xl border border-slate-200 max-h-[420px]">
            <table className="min-w-full text-right text-[11px]">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 text-[10px]">
                    <tr>
                        <th className="px-3 py-2 font-medium w-28">تاریخ</th>
                        <th className="px-3 py-2 font-medium bg-sky-50/80">نوبت دور</th>
                        <th className="px-3 py-2 font-medium bg-emerald-50/80">نوبت نزدیک</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {days.map(day => (
                        <tr key={day.key} className="align-top">
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap font-medium">
                                {day.jalaliLabel}
                            </td>
                            <td className="px-2 py-2 bg-sky-50/20 min-w-[200px]">
                                {day.far.length === 0 ? (
                                    <span className="text-slate-300">—</span>
                                ) : (
                                    day.far.map((entry, i) => (
                                        <QueueEntryLine key={`far-${day.key}-${i}`} entry={entry} />
                                    ))
                                )}
                            </td>
                            <td className="px-2 py-2 bg-emerald-50/20 min-w-[200px]">
                                {day.near.length === 0 ? (
                                    <span className="text-slate-300">—</span>
                                ) : (
                                    day.near.map((entry, i) => (
                                        <QueueEntryLine key={`near-${day.key}-${i}`} entry={entry} />
                                    ))
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SkippedTable({ items }: { items: DriverPreferenceOpportunity[] }) {
    const rows = useMemo(() => buildSkippedByDay(items), [items]);
    if (rows.length === 0) return null;

    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">فرصت‌های استفاده‌نشده (دور / خیلی‌دور)</h3>
            <div className="overflow-auto rounded-xl border border-slate-200 max-h-[280px]">
                <table className="min-w-full text-right text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600 text-[10px]">
                        <tr>
                            <th className="px-3 py-2 font-medium w-28">تاریخ</th>
                            <th className="px-3 py-2 font-medium">بارهای برنداشته‌شده</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(row => (
                            <tr key={row.key} className="align-top">
                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                    {row.jalaliLabel}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                    {row.items.map((item, idx) => (
                                        <div key={item.id} className="py-0.5 text-[10px]">
                                            {item.isVeryFar && (
                                                <span className="text-amber-700">خیلی‌دور </span>
                                            )}
                                            <span className="font-medium text-slate-700">
                                                {item.destinationCity || item.originCity || 'نامشخص'}
                                            </span>
                                            {item.roundTripKm != null && (
                                                <span className="text-slate-500">
                                                    {' '}
                                                    ({formatDistance(item.roundTripKm)})
                                                </span>
                                            )}
                                            {item.note && (
                                                <span className="text-slate-500 block text-[9px] mt-0.5">
                                                    {item.note}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export type DriverPreferencesViewProps = {
    data: DriverPreferencesResponse;
    categoryLabel?: string | null;
    targetDriverId: string;
    targetDriverName: string;
};

export const DriverPreferencesView: React.FC<DriverPreferencesViewProps> = ({
    data,
    categoryLabel,
    targetDriverId,
    targetDriverName,
}) => {
    const dayRows = useMemo(
        () => buildDayTable(data, targetDriverId, targetDriverName),
        [data, targetDriverId, targetDriverName]
    );
    const farSkipped = useMemo(
        () =>
            (data.skipped || []).filter(
                item =>
                    item.isVeryFar ||
                    item.stage === 'stage1' ||
                    item.stage === 'stage2_far'
            ),
        [data.skipped]
    );
    const cycleSummary = data.cycleSummary || { veryFar: [], far: [], near: [] };
    const stats = data.stats || {
        finalizedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        totalTaken: data.taken?.length || 0,
    };

    return (
        <div className="space-y-5">
            {categoryLabel && (
                <div className="text-xs text-slate-500">
                    دسته خودرو: <span className="font-semibold text-slate-700">{categoryLabel}</span>
                </div>
            )}

            <StatsBar stats={stats} />

            <CycleSummarySection summary={cycleSummary} />

            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">نوبت‌های روزانه (فقط نهایی)</h3>
                    <div className="text-[10px] text-slate-500">
                        نوبت · کد خودرو · نام · مقصد — ردیف زرد = راننده جاری
                    </div>
                </div>
                <DayQueueTable days={dayRows} />
            </section>

            <SkippedTable items={farSkipped} />
        </div>
    );
};

export type PreferenceBriefData = {
    cycleSummary?: DriverPreferenceCycleSummary;
    stats?: DriverPreferenceStats;
    fromJalali?: string;
    toJalali?: string;
    takenCount?: number;
};

export const PreferenceBriefPanel: React.FC<{ brief: PreferenceBriefData | null; loading?: boolean }> = ({
    brief,
    loading,
}) => {
    if (loading) {
        return <div className="text-slate-400 text-[10px]">در حال بارگذاری خلاصه...</div>;
    }
    if (!brief?.cycleSummary) return null;

    const summary = brief.cycleSummary;
    const blocks = [
        { title: 'خیلی‌دور', count: summary.veryFar.length, sample: summary.veryFar[0] },
        { title: 'دور', count: summary.far.length, sample: summary.far[0] },
        { title: 'نزدیک', count: summary.near.length, sample: summary.near[0] },
    ];

    return (
        <div className="border-t border-violet-200 pt-2 space-y-2 text-violet-900">
            <div className="font-semibold text-[11px]">خلاصه دوره جاری</div>
            {brief.fromJalali && brief.toJalali && (
                <div className="text-[10px] text-slate-500">
                    {brief.fromJalali} — {brief.toJalali}
                </div>
            )}
            {brief.stats && (
                <div className="flex flex-wrap gap-1 text-[9px]">
                    <span className="text-emerald-700">نهایی {brief.stats.finalizedCount}</span>
                    <span className="text-amber-700">موقت {brief.stats.pendingCount}</span>
                    <span className="text-rose-700">لغو {brief.stats.cancelledCount}</span>
                </div>
            )}
            <div className="grid grid-cols-3 gap-1 text-[9px]">
                {blocks.map(b => (
                    <div key={b.title} className="rounded border border-violet-100 bg-white/70 px-1.5 py-1">
                        <div className="font-semibold">{b.title} ({b.count})</div>
                        {b.sample ? (
                            <div className="text-slate-600 truncate">
                                {b.sample.destinationCity} {formatDistance(b.sample.roundTripKm)}
                            </div>
                        ) : (
                            <div className="text-slate-400">—</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DriverPreferencesView;
