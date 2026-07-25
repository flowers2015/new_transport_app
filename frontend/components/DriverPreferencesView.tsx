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
    announcementId?: string;
    certainty?: 'finalized' | 'pending' | 'cancelled' | string;
    routeBucket?: 'veryFar' | 'far' | 'near' | string;
    queueType?: 'far' | 'near' | string;
};

type DayRow = {
    key: string;
    category: string;
    jalaliLabel: string;
    far: DayQueueEntry[];
    near: DayQueueEntry[];
};

type CategoryDayGroup = {
    category: string;
    days: DayRow[];
};

function dayKey(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** کلید روز بر اساس شمسی — پایدارتر از تبدیل timezone روی ISO */
function dayKeyFromJalali(jalali?: string | null): string | null {
    if (!jalali) return null;
    const m = String(jalali)
        .trim()
        .replace(/-/g, '/')
        .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
}

function buildDayTable(
    data: DriverPreferencesResponse,
    targetDriverId: string,
    targetDriverName: string
): CategoryDayGroup[] {
    const dayMap = new Map<string, DayRow>();
    const targetCatsByDay = new Map<string, Set<string>>();

    const ensureDay = (
        category: string,
        isoLike: string,
        jalaliFallback?: string | null
    ) => {
        const dKey = dayKeyFromJalali(jalaliFallback) || dayKey(isoLike);
        if (!dKey) return null;
        const mapKey = `${category}::${dKey}`;
        if (!dayMap.has(mapKey)) {
            let jalaliLabel = jalaliFallback || '';
            if (!jalaliLabel) {
                const date = new Date(isoLike);
                const [jy, jm, jd] = gregorianToJalali(
                    date.getFullYear(),
                    date.getMonth() + 1,
                    date.getDate()
                );
                jalaliLabel = `${jy}/${pad2(jm)}/${pad2(jd)}`;
            } else {
                jalaliLabel = jalaliLabel.replace(/-/g, '/');
            }
            dayMap.set(mapKey, {
                key: mapKey,
                category,
                jalaliLabel,
                far: [],
                near: [],
            });
        }
        return { day: dayMap.get(mapKey)!, dayKey: dKey };
    };

    const pushEntry = (
        category: string,
        assignedAt: string,
        assignedAtJalali: string | null | undefined,
        column: 'far' | 'near',
        entry: DayQueueEntry
    ) => {
        const ensured = ensureDay(category, assignedAt, assignedAtJalali);
        if (!ensured) return;
        const bucket = column === 'far' ? ensured.day.far : ensured.day.near;
        bucket.push(entry);
    };

    const columnForItem = (
        queueType?: string | null,
        routeBucket?: string | null
    ): 'far' | 'near' => {
        if (queueType === 'far' || queueType === 'near') return queueType;
        if (routeBucket === 'near') return 'near';
        return 'far';
    };

    for (const item of data.taken || []) {
        const category = (item.vehicleCategory || '').trim() || 'نامشخص';
        const queueType = item.queueType || (item.stage === 'stage1' ? 'far' : 'near');
        const column = columnForItem(queueType, item.routeBucket);
        const ensured = ensureDay(category, item.assignedAt, item.assignedAtJalali);
        if (ensured) {
            const set = targetCatsByDay.get(ensured.dayKey) || new Set<string>();
            set.add(category);
            targetCatsByDay.set(ensured.dayKey, set);
        }
        pushEntry(category, item.assignedAt, item.assignedAtJalali, column, {
            queuePosition: item.queuePosition ?? null,
            vehicleCode: item.vehicleCode || null,
            driverName: targetDriverName,
            destination: item.destinationCity || item.originCity || '',
            tripKm: item.roundTripKm ?? null,
            isVeryFar: Boolean(item.isVeryFar) || item.routeBucket === 'veryFar',
            isTarget: true,
            announcementId: item.announcementId,
            certainty: item.certainty,
            routeBucket: item.routeBucket,
            queueType,
        });
    }

    for (const peer of data.peerAssignments || []) {
        if (peer.driverId === targetDriverId) continue;
        if (peer.certainty !== 'finalized') continue;
        const peerName = (peer.driverName || '').trim();
        if (!peerName) continue;
        const destination = (peer.destinationCity || '').trim();
        const vehicleCode = (peer.vehicleCode || '').trim();
        if (!destination && !vehicleCode) continue;

        const peerCat = (peer.vehicleCategory || '').trim() || 'نامشخص';
        const dKey = dayKeyFromJalali(peer.assignedAtJalali) || dayKey(peer.assignedAt);
        if (!dKey) continue;
        const allowedCats = targetCatsByDay.get(dKey);
        // فقط اگر راننده هدف همان روز در همین دسته بار گرفته باشد
        if (!allowedCats || !allowedCats.has(peerCat)) continue;

        const queueType = peer.queueType || (peer.stage === 'stage1' ? 'far' : 'near');
        const column = columnForItem(queueType, null);
        pushEntry(peerCat, peer.assignedAt, peer.assignedAtJalali, column, {
            queuePosition: peer.queuePosition ?? null,
            vehicleCode: vehicleCode || null,
            driverName: peerName,
            destination,
            tripKm: peer.roundTripKm ?? null,
            isVeryFar: Boolean(peer.isVeryFar),
            isTarget: false,
            announcementId: peer.announcementId,
            certainty: peer.certainty,
            queueType,
        });
    }

    const dedupeBucket = (list: DayQueueEntry[]) => {
        const seen = new Set<string>();
        const out: DayQueueEntry[] = [];
        for (const entry of list) {
            const key =
                entry.announcementId && entry.driverName
                    ? `${entry.announcementId}:${entry.driverName}:${entry.certainty || ''}`
                    : `${entry.driverName}:${entry.destination}:${entry.tripKm ?? ''}:${entry.certainty || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(entry);
        }
        return out;
    };

    const sortEntries = (list: DayQueueEntry[]) =>
        [...list].sort((a, b) => {
            if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
            return (a.queuePosition ?? 999) - (b.queuePosition ?? 999);
        });

    const categoryOrder = ['تریلی', 'مینی تریلی', 'ده چرخ', 'نامشخص'];
    const byCategory = new Map<string, DayRow[]>();

    for (const day of dayMap.values()) {
        if (!day.far.some(e => e.isTarget) && !day.near.some(e => e.isTarget)) continue;
        const normalized: DayRow = {
            ...day,
            far: sortEntries(dedupeBucket(day.far)),
            near: sortEntries(dedupeBucket(day.near)),
        };
        const list = byCategory.get(day.category) || [];
        list.push(normalized);
        byCategory.set(day.category, list);
    }

    const groups: CategoryDayGroup[] = [];
    const seenCats = new Set<string>();
    for (const cat of categoryOrder) {
        const days = byCategory.get(cat);
        if (!days?.length) continue;
        days.sort((a, b) => a.jalaliLabel.localeCompare(b.jalaliLabel, 'fa'));
        groups.push({ category: cat, days });
        seenCats.add(cat);
    }
    for (const [cat, days] of byCategory) {
        if (seenCats.has(cat)) continue;
        days.sort((a, b) => a.jalaliLabel.localeCompare(b.jalaliLabel, 'fa'));
        groups.push({ category: cat, days });
    }
    return groups;
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
    const certaintyLabel =
        entry.certainty === 'cancelled'
            ? 'لغو'
            : entry.certainty === 'pending'
              ? 'موقت'
              : entry.certainty === 'finalized'
                ? null
                : null;
    const routeLabel =
        entry.routeBucket === 'veryFar'
            ? 'مسیر خیلی‌دور'
            : entry.routeBucket === 'far'
              ? 'مسیر دور'
              : entry.routeBucket === 'near'
                ? 'مسیر نزدیک'
                : null;

    return (
        <div
            className={`text-[10px] leading-relaxed py-0.5 border-b border-slate-100 last:border-0 ${
                entry.isTarget
                    ? entry.certainty === 'cancelled'
                        ? 'text-rose-900 bg-rose-50/70 -mx-1 px-1 rounded'
                        : entry.certainty === 'pending'
                          ? 'text-amber-950 bg-amber-50/70 -mx-1 px-1 rounded'
                          : 'text-amber-950 bg-amber-50/60 -mx-1 px-1 rounded'
                    : 'text-slate-600'
            }`}
        >
            <span className="font-semibold">{entry.queuePosition ?? '—'}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span className="font-medium">{entry.driverName}</span>
            {entry.vehicleCode && (
                <>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-slate-500" title="کد خودرو">
                        خودرو {entry.vehicleCode}
                    </span>
                </>
            )}
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
            {(certaintyLabel || routeLabel) && (
                <div className="text-[9px] text-slate-500 mt-0.5 flex flex-wrap gap-1">
                    {certaintyLabel && (
                        <span
                            className={
                                entry.certainty === 'cancelled'
                                    ? 'text-rose-700'
                                    : 'text-amber-700'
                            }
                        >
                            {certaintyLabel}
                        </span>
                    )}
                    {routeLabel && <span>{routeLabel}</span>}
                    {entry.queueType && (
                        <span>نوبت {entry.queueType === 'far' ? 'دور' : 'نزدیک'}</span>
                    )}
                </div>
            )}
        </div>
    );
}

function DayQueueTable({ groups }: { groups: CategoryDayGroup[] }) {
    if (groups.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                در این بازه تخصیصی برای این راننده ثبت نشده است.
            </div>
        );
    }

    return (
        <div className="space-y-4 max-h-[520px] overflow-y-auto">
            {groups.map(group => (
                <div
                    key={group.category}
                    className="rounded-xl border border-slate-200 overflow-hidden"
                >
                    <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">
                            دسته {group.category}
                        </span>
                        <span className="text-[10px] text-slate-500">
                            {group.days.length.toLocaleString('fa-IR')} روز تخصیص
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-right text-[11px]">
                            <thead className="bg-slate-50 text-slate-600 text-[10px]">
                                <tr>
                                    <th className="px-3 py-2 font-medium w-28">تاریخ</th>
                                    <th className="px-3 py-2 font-medium bg-sky-50/80">نوبت دور</th>
                                    <th className="px-3 py-2 font-medium bg-emerald-50/80">
                                        نوبت نزدیک
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {group.days.map(day => (
                                    <tr key={day.key} className="align-top">
                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap font-medium">
                                            {day.jalaliLabel}
                                        </td>
                                        <td className="px-2 py-2 bg-sky-50/20 min-w-[200px]">
                                            {day.far.length === 0 ? (
                                                <span className="text-slate-300">—</span>
                                            ) : (
                                                day.far.map((entry, i) => (
                                                    <QueueEntryLine
                                                        key={`far-${day.key}-${i}`}
                                                        entry={entry}
                                                    />
                                                ))
                                            )}
                                        </td>
                                        <td className="px-2 py-2 bg-emerald-50/20 min-w-[200px]">
                                            {day.near.length === 0 ? (
                                                <span className="text-slate-300">—</span>
                                            ) : (
                                                day.near.map((entry, i) => (
                                                    <QueueEntryLine
                                                        key={`near-${day.key}-${i}`}
                                                        entry={entry}
                                                    />
                                                ))
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
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
    const categoryGroups = useMemo(
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

            {stats.finalizedCount === 0 && stats.cancelledCount === 0 && stats.pendingCount === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    این راننده در بازهٔ انتخاب‌شده تخصیصی ندارد — خلاصه دوره صفر است.
                </div>
            )}
            {stats.finalizedCount === 0 && (stats.cancelledCount > 0 || stats.pendingCount > 0) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                    تخصیص نهایی ندارد؛ موارد موقت/لغو در جدول روزانه آمده است.
                </div>
            )}

            <CycleSummarySection summary={cycleSummary} />

            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">
                        نوبت‌های روزانه (به تفکیک دسته خودرو)
                    </h3>
                    <div className="text-[10px] text-slate-500">
                        فقط هم‌دسته‌های همان روز — نوبت · نام · کد خودرو · مقصد
                    </div>
                </div>
                <DayQueueTable groups={categoryGroups} />
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
