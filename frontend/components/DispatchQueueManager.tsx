import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DispatchQueueEntry,
    DispatchQueueType,
    DispatchQueueDriver,
    DispatchVehicleSearchResult,
    DispatchDriverSearchResult,
    DispatchAnnouncementCandidate,
    DriverPreferencesResponse,
    View,
    UserRole,
    User,
} from '../types';
import { DriverPreferencesView, PreferenceBriefPanel, PreferenceBriefData } from './DriverPreferencesView';
import { gregorianToJalali } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';
import WorkflowRules from './WorkflowRules';

type QueueBuckets = Record<DispatchQueueType | 'other', DispatchQueueEntry[]>;
type QueueGroup = Record<string, QueueBuckets>;

type PresetCategory = {
    key: string;
    label: string;
};

type RowEditor = {
    id: string;
    categoryKey: string;
    categoryLabel: string;
    queueType: DispatchQueueType;
    notes: string;
    vehicleQuery: string;
    driverQuery: string;
    vehicleResults: DispatchVehicleSearchResult[];
    driverResults: DispatchDriverSearchResult[];
    selectedVehicle: DispatchVehicleSearchResult | null;
    selectedDriver: DispatchDriverSearchResult | null;
    vehicleSearching: boolean;
    driverSearching: boolean;
    submitting: boolean;
};

type PositionEditState = {
    value: string;
    saving: boolean;
};

type DispatchPhase = 'stage1' | 'stage2_far' | 'stage2_near_vf' | 'stage2_near_all';
type AssignMode = 'rules' | 'free';

type QueueRowStatus = 'ready' | 'very_far_history' | 'deferred' | 'inactive';

type AnnouncementWithEligibility = DispatchAnnouncementCandidate & {
    eligible: boolean;
    strictEligible?: boolean;
    lockReason?: string | null;
    isVeryFar?: boolean;
};

type AssignContext = {
    effectivePhase: DispatchPhase | null;
    phaseLabel: string | null;
    entryPhase?: DispatchPhase | null;
    entryPhaseLabel?: string | null;
    assignStage: 'stage1' | 'stage2' | null;
    assignMode?: AssignMode;
    canDefer: boolean;
    isDeferredThisPhase: boolean;
    driverRowStatus: QueueRowStatus;
    canAssign?: boolean;
    cycleFromJalali?: string;
    cycleToJalali?: string;
    announcements: AnnouncementWithEligibility[];
    eligibleCount: number;
    queueEntry?: DispatchQueueEntry | null;
    message?: string;
    stageMeta?: { pendingStage1Count?: number; autoPromoted?: boolean };
};

type QueueAssignHints = {
    effectivePhase: DispatchPhase | null;
    phaseLabel: string | null;
    cycleFromJalali?: string;
    cycleToJalali?: string;
    entries: Array<{
        queueEntryId: string;
        rowStatus: QueueRowStatus;
        canAssign?: boolean;
        eligibleLoadCount: number;
        hasVeryFarHistory: boolean;
        isDeferred: boolean;
        entryPhase?: DispatchPhase | null;
    }>;
};

type AssignDialogState = {
    isOpen: boolean;
    entry: DispatchQueueEntry | null;
    categoryLabel: string | null;
    loading: boolean;
    context: AssignContext | null;
    selectedAnnouncementId: string;
    assigning: boolean;
    deferring: boolean;
    preferenceBrief: PreferenceBriefData | null;
    preferenceBriefLoading: boolean;
};

type PreferencesDialogState = {
    isOpen: boolean;
    driver: DispatchQueueDriver | null;
    queueEntry: DispatchQueueEntry | null;
    categoryLabel: string | null;
    dateFrom: string;
    dateTo: string;
    loading: boolean;
    data: DriverPreferencesResponse | null;
    error?: string | null;
};

const initialAssignDialogState: AssignDialogState = {
    isOpen: false,
    entry: null,
    categoryLabel: null,
    loading: false,
    context: null,
    selectedAnnouncementId: '',
    assigning: false,
    deferring: false,
    preferenceBrief: null,
    preferenceBriefLoading: false,
};

const rowStatusClasses: Record<
    QueueRowStatus,
    { row: string; badge: string; badgeLabel: string; assignBtn: string }
> = {
    ready: {
        row: 'bg-emerald-50/90 text-slate-800',
        badge: 'bg-emerald-100 text-emerald-800',
        badgeLabel: 'آماده تخصیص',
        assignBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    very_far_history: {
        row: 'bg-red-50/90 text-red-950',
        badge: 'bg-red-100 text-red-800',
        badgeLabel: 'سابقه خیلی‌دور',
        assignBtn: 'bg-red-600 hover:bg-red-700 text-white',
    },
    deferred: {
        row: 'bg-amber-50/70 text-amber-900',
        badge: 'bg-amber-100 text-amber-800',
        badgeLabel: 'مانده برای بعد',
        assignBtn: 'bg-slate-300 text-slate-500 cursor-not-allowed',
    },
    inactive: {
        row: 'bg-slate-100/80 text-slate-400',
        badge: 'bg-slate-200 text-slate-500',
        badgeLabel: 'غیرفعال در این فاز',
        assignBtn: 'bg-slate-300 text-slate-500 cursor-not-allowed',
    },
};

const lockReasonLabels: Record<string, string> = {
    wrong_phase: 'در این فاز مجاز نیست',
    very_far_history: 'سابقه خیلی‌دور در دوره جاری',
    near_vf_pending: 'ابتدا بار خیلی‌دور',
    deferred: 'برای مرحله بعد مانده‌اید',
    wrong_queue: 'نوبت در این فاز فعال نیست',
    wrong_category: 'دسته خودرو نامطابق',
};

const initialPreferencesDialogState: PreferencesDialogState = {
    isOpen: false,
    driver: null,
    queueEntry: null,
    categoryLabel: null,
    dateFrom: '',
    dateTo: '',
    loading: false,
    data: null,
    error: null,
};

const queueTypeLabels: Record<DispatchQueueType, string> = {
    near: 'مسیر نزدیک',
    far: 'مسیر دور',
    workshop: 'تعمیرگاه شرکت',
    external: 'تعمیرگاه خارج',
    leave: 'مرخصی راننده',
    other: 'سایر',
};

const presetCategories: PresetCategory[] = [
    { key: 'trailer', label: 'تریلی' },
    { key: 'mini-trailer', label: 'مینی تریلی' },
    { key: 'ten-wheel', label: 'ده چرخ' },
];

const ASSIGN_MODE_STORAGE_KEY = 'dispatch_queue_assign_mode_v2';

const defaultAssignModeByCategory = (): Record<string, AssignMode> =>
    Object.fromEntries(presetCategories.map(p => [p.key, 'free' as AssignMode]));

const loadAssignModeByCategory = (): Record<string, AssignMode> => {
    const defaults = defaultAssignModeByCategory();
    try {
        const raw = localStorage.getItem(ASSIGN_MODE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Record<string, AssignMode>;
            if (parsed && typeof parsed === 'object') {
                return { ...defaults, ...parsed };
            }
        }
    } catch {
        /* ignore */
    }
    return defaults;
};

const persistAssignModeByCategory = (map: Record<string, AssignMode>) => {
    try {
        localStorage.setItem(ASSIGN_MODE_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
};

const normalizeDistanceText = (value?: string | null) =>
    (value || '')
        .toString()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\s_\-‌]/g, '')
        .toLowerCase();

const isVeryFarAnnouncement = (announcement: {
    route?: { distance_category?: string; route_category?: string };
}) => {
    const distanceCategory = normalizeDistanceText(announcement?.route?.distance_category);
    if (distanceCategory && (distanceCategory.includes('خیلیدور') || distanceCategory.includes('veryfar'))) {
        return true;
    }
    const routeCategory = normalizeDistanceText(announcement?.route?.route_category);
    return Boolean(routeCategory && (routeCategory.includes('خیلیدور') || routeCategory.includes('veryfar')));
};

const categoryAccentClasses: Record<string, string> = {
    'trailer': 'bg-sky-600 text-white',
    'mini-trailer': 'bg-amber-500 text-white',
    'ten-wheel': 'bg-rose-500 text-white',
};

const categoryDotClasses: Record<string, string> = {
    'trailer': 'bg-sky-400',
    'mini-trailer': 'bg-amber-400',
    'ten-wheel': 'bg-rose-400',
};

const categoryPillInactiveClasses: Record<string, string> = {
    'trailer': 'border border-sky-400 text-sky-600 hover:bg-sky-50',
    'mini-trailer': 'border border-amber-400 text-amber-600 hover:bg-amber-50',
    'ten-wheel': 'border border-rose-400 text-rose-600 hover:bg-rose-50',
};

const normalizeVehicleText = (value?: string | null): string =>
    value ? value.replace(/[\s\u200c\-_]/g, '').toLowerCase() : '';

const categoryVehicleKeywords: Record<string, string[]> = {
    'trailer': [
        'تریلی',
        'تریلر',
        'trailer',
        'semi',
        'semi-trailer',
        'semtrailer',
        'semi trailer',
        'semitrailer',
        'semitrail',
        'semiTrailer',
        'نیمهتریلی',
        'کفی',
        'چادری',
    ],
    'mini-trailer': ['مینی', 'mini', 'mini-trailer', 'minitrailer', 'مینی‌تریلی', 'مینیتریلی'],
    'ten-wheel': [
        'دهچرخ',
        '10چرخ',
        'دهتن',
        'tenwheel',
        'tenwheeler',
        'ده-چرخ',
        'دهچرخکمپرسی',
        'دهچرخباری',
        'دهچرخخاور',
        'دهتنکفی',
    ],
};

const categoryVehicleKeywordsNormalized: Record<string, string[]> = Object.fromEntries(
    Object.entries(categoryVehicleKeywords).map(([key, keywords]) => [
        key,
        keywords.map(keyword => normalizeVehicleText(keyword)),
    ])
) as Record<string, string[]>;

const categoryDetectionOrder: Array<PresetCategory['key']> = ['mini-trailer', 'ten-wheel', 'trailer'];

const detectVehicleCategoryKey = (vehicleType?: string | null): PresetCategory['key'] | null => {
    const normalized = normalizeVehicleText(vehicleType);
    if (!normalized) return null;
    for (const key of categoryDetectionOrder) {
        const keywords = categoryVehicleKeywordsNormalized[key] || [];
        if (keywords.some(keyword => keyword && normalized.includes(keyword))) {
            return key;
        }
    }
    return null;
};

const resolveCategoryKey = (value?: string | null): PresetCategory['key'] | null => {
    if (!value) return null;
    const normalized = normalizeVehicleText(value);
    for (const preset of presetCategories) {
        if (
            normalizeVehicleText(preset.label) === normalized ||
            normalizeVehicleText(preset.key) === normalized
        ) {
            return preset.key;
        }
    }
    return null;
};

// تبدیل category key به label
const resolveCategoryLabel = (categoryKey?: string | null): string | null => {
    if (!categoryKey) return null;
    for (const preset of presetCategories) {
        if (preset.key === categoryKey) {
            return preset.label;
        }
    }
    return null;
};

const vehicleMatchesCategory = (vehicleType?: string | null, categoryLabel?: string | null): boolean => {
    const presetKey = resolveCategoryKey(categoryLabel);
    if (!presetKey) return false;
    const normalizedType = normalizeVehicleText(vehicleType);
    if (!normalizedType) return false;

    const detectedKey = detectVehicleCategoryKey(vehicleType);
    if (detectedKey) {
        return detectedKey === presetKey;
    }

    const keywords = categoryVehicleKeywordsNormalized[presetKey] || [];
    return keywords.some(keyword => keyword && normalizedType.includes(keyword));
};

function filterAnnouncementsForQueueCategory(
    announcements: AnnouncementWithEligibility[],
    categoryKey: string
): AnnouncementWithEligibility[] {
    return announcements.filter(ann => vehicleMatchesCategory(ann.vehicleType, categoryKey));
}

const normalizeRouteText = (value?: string | null): string =>
    value
        ? value
              .replace(/ي/g, 'ی')
              .replace(/ك/g, 'ک')
              .replace(/[\s\u200c\-_]/g, '')
              .toLowerCase()
        : '';

const farDistanceValues = ['خیلیدور', 'خیلی‌دور', 'veryfar'];

const isFarRouteCandidate = (item: DispatchAnnouncementCandidate): boolean => {
    const route = item.route;
    if (!route) return false;
    const primary = normalizeRouteText(route.distance_category);
    if (farDistanceValues.some(value => primary.includes(value))) {
        return true;
    }
    const secondary = normalizeRouteText(route.route_category);
    if (farDistanceValues.some(value => secondary.includes(value))) {
        return true;
    }
    return false;
};

const FREE_CANDIDATE_QUERIES = [
    { stage: 'stage2', subPhase: 'near_all', forceStage2: 'true' },
    { stage: 'stage2', subPhase: 'far', forceStage2: 'true' },
    { stage: 'stage2', forceStage2: 'true' },
    { stage: 'stage1' },
];

async function fetchFreeAnnouncementsForCategory(
    categoryKey: string,
    headers: Record<string, string>,
    cache: Record<string, AnnouncementWithEligibility[]>
): Promise<AnnouncementWithEligibility[]> {
    if (cache[categoryKey]?.length) return cache[categoryKey];

    const seen = new Map<string, AnnouncementWithEligibility>();

    const collectFromResponse = (
        rawAnns: DispatchAnnouncementCandidate[],
        filterByCategory: boolean
    ) => {
        for (const ann of rawAnns) {
            if (filterByCategory && !vehicleMatchesCategory(ann.vehicleType, categoryKey)) {
                continue;
            }
            if (!seen.has(ann.id)) {
                seen.set(ann.id, {
                    ...ann,
                    eligible: true,
                    strictEligible: false,
                    lockReason: null,
                    isVeryFar: isVeryFarAnnouncement(ann),
                });
            }
        }
    };

    for (const query of FREE_CANDIDATE_QUERIES) {
        try {
            const params = new URLSearchParams(query);
            const res = await fetch(
                getApiUrl(`dispatch/assignments/candidates?${params}`),
                { headers }
            );
            if (!res.ok) continue;
            const data = await res.json();
            collectFromResponse(data.announcements || [], true);
        } catch {
            /* try next */
        }
    }

    const list = [...seen.values()];
    if (list.length > 0) {
        cache[categoryKey] = list;
    }
    return list;
}

function buildFreeAssignContext(
    entry: DispatchQueueEntry,
    announcements: AnnouncementWithEligibility[]
): AssignContext {
    return {
        effectivePhase: null,
        phaseLabel: null,
        entryPhase: null,
        entryPhaseLabel: null,
        assignStage: 'stage2',
        assignMode: 'free',
        canDefer: false,
        isDeferredThisPhase: false,
        driverRowStatus: 'ready',
        canAssign: true,
        announcements,
        eligibleCount: announcements.length,
        queueEntry: entry,
        message:
            announcements.length === 0
                ? 'اعلام بار معلقی برای تخصیص یافت نشد.'
                : undefined,
    };
}

const queueAccent: Record<
    'far' | 'near',
    { border: string; headerBg: string; headerText: string; badge: string }
> = {
    far: {
        border: 'border-sky-300',
        headerBg: 'bg-sky-50',
        headerText: 'text-sky-700',
        badge: 'bg-sky-500/80',
    },
    near: {
        border: 'border-emerald-300',
        headerBg: 'bg-emerald-50',
        headerText: 'text-emerald-700',
        badge: 'bg-emerald-500/80',
    },
};

const lineTypeBadgeStyles: Record<string, string> = {
    'پاستوریزه': 'bg-teal-100 text-teal-700',
    'بستنی': 'bg-pink-100 text-pink-700',
    'لبنیات-فروتلند': 'bg-indigo-100 text-indigo-700',
};

const priorityBadgeStyles: Record<string, string> = {
    high: 'bg-rose-100 text-rose-700',
    normal: 'bg-amber-100 text-amber-700',
    low: 'bg-slate-100 text-slate-600',
};

const formatCurrencyToman = (value?: number | null) => {
    if (value == null) return 'نامشخص';
    const toman = Math.round(Number(value) / 10);
    return `${toman.toLocaleString('fa-IR')} تومان`;
};

const formatDistance = (km?: number | null) => {
    if (!km) return 'فاقد اطلاعات مسافت';
    return `${km.toLocaleString('fa-IR')} کیلومتر`;
};

/** مبدا (راست) ← مقصد (چپ) — مناسب RTL */
const formatOriginToDestination = (origin?: string | null, destination?: string | null) => {
    const from = (origin || '').trim() || 'مبدا';
    const to = (destination || '').trim();
    if (!to) return from;
    return `${from} ← ${to}`;
};

const priorityLabels: Record<string, string> = {
    high: 'فوری',
    urgent: 'فوری',
    normal: 'عادی',
    low: 'کم اهمیت',
};

const EyeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
    </svg>
);

const DispatchAnnouncementDetailDialog: React.FC<{
    item: AnnouncementWithEligibility;
    onClose: () => void;
}> = ({ item, onClose }) => {
    const destRows =
        item.allDestinations && item.allDestinations.length > 0
            ? item.allDestinations
            : item.destination
              ? [item.destination]
              : [];

    const detailRow = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5 border-b border-slate-100 last:border-0">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className="text-slate-800 font-medium break-words">{value}</dd>
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4 py-8"
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >
            <div
                className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">
                        جزئیات اعلام بار {item.announcementCode ? `#${item.announcementCode}` : ''}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-700 text-sm px-2 py-1"
                    >
                        بستن
                    </button>
                </div>
                <div className="px-4 py-3 overflow-y-auto text-xs">
                    <dl>
                        {detailRow('نوع خط', item.lineType || '—')}
                        {detailRow(
                            'مبدا ← مقصد',
                            formatOriginToDestination(item.originCity, item.destination?.city)
                        )}
                        {detailRow('نوع خودرو', item.vehicleType || '—')}
                        {detailRow('ارزش بار', formatCurrencyToman(item.cargoValue))}
                        {item.totalFreightCost != null &&
                            detailRow('کرایه کل', formatCurrencyToman(item.totalFreightCost))}
                        {item.brand && detailRow('برند', item.brand)}
                        {item.priority &&
                            detailRow(
                                'اولویت',
                                priorityLabels[String(item.priority).toLowerCase()] || item.priority
                            )}
                        {item.products && item.products.length > 0 &&
                            detailRow('محصولات', item.products.join('، '))}
                        {item.route &&
                            detailRow(
                                'مسیر / کیلومتر',
                                <>
                                    {item.route.route_category || item.route.distance_category || '—'}
                                    {item.route.round_trip_km
                                        ? ` • ${formatDistance(item.route.round_trip_km)}`
                                        : ''}
                                    {item.route.province ? ` • ${item.route.province}` : ''}
                                </>
                            )}
                        {item.createdAt &&
                            detailRow(
                                'تاریخ ثبت',
                                new Date(item.createdAt).toLocaleDateString('fa-IR', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                })
                            )}
                        {item.notes && detailRow('توضیحات', item.notes)}
                    </dl>
                    {destRows.length > 0 && (
                        <div className="mt-3">
                            <div className="text-slate-600 font-semibold mb-2">مقصدها</div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="min-w-full text-[11px]">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-2 py-1.5 text-right font-medium">شهر</th>
                                            <th className="px-2 py-1.5 text-right font-medium">نماینده</th>
                                            <th className="px-2 py-1.5 text-right font-medium">تناژ</th>
                                            <th className="px-2 py-1.5 text-right font-medium">کرایه</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {destRows.map((d) => (
                                            <tr key={d.id}>
                                                <td className="px-2 py-1.5">{d.city || '—'}</td>
                                                <td className="px-2 py-1.5">{d.representativeName || '—'}</td>
                                                <td className="px-2 py-1.5">
                                                    {d.tonnage != null
                                                        ? `${Number(d.tonnage).toLocaleString('fa-IR')} kg`
                                                        : '—'}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    {d.freightCost != null
                                                        ? formatCurrencyToman(d.freightCost)
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const pad2 = (value: number) => (value < 10 ? `0${value}` : `${value}`);

const getDefaultJalaliCycleRange = () => {
    const today = new Date();
    const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const currentYear = jy;
    const currentMonth = jm;
    const currentDay = jd;
    
    // اگر روز جاری >= 26 است، از 26 ماه جاری تا 25 ماه بعد
    // اگر روز جاری < 26 است، از 26 ماه قبل تا 25 ماه جاری
    let fromYear, fromMonth, fromDay;
    let toYear, toMonth, toDay;
    
    if (currentDay >= 26) {
        // از 26 ماه جاری تا 25 ماه بعد
        fromYear = currentYear;
        fromMonth = currentMonth;
        fromDay = 26;
        
        if (currentMonth === 12) {
            toYear = currentYear + 1;
            toMonth = 1;
        } else {
            toYear = currentYear;
            toMonth = currentMonth + 1;
        }
        toDay = 25;
    } else {
        // از 26 ماه قبل تا 25 ماه جاری
        if (currentMonth === 1) {
            fromYear = currentYear - 1;
            fromMonth = 12;
        } else {
            fromYear = currentYear;
            fromMonth = currentMonth - 1;
        }
        fromDay = 26;
        
        toYear = currentYear;
        toMonth = currentMonth;
        toDay = 25;
    }
    
    const from = `${fromYear}-${pad2(fromMonth)}-${pad2(fromDay)}`;
    const to = `${toYear}-${pad2(toMonth)}-${pad2(toDay)}`;
    return { from, to };
};

const formatDateTime = (value?: string | null) => {
    if (!value) return 'نامشخص';
    if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(value)) {
        return value.replace(/-/g, '/');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'نامشخص';
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    return `${jy}/${pad2(jm)}/${pad2(jd)} ${hh}:${mm}`;
};

const normalizeProducts = (items?: string[] | null): string[] => {
    if (!items) return [];
    if (Array.isArray(items)) return items.filter(Boolean);
    return [];
};

const buildTimelineDays = (fromIso?: string, toIso?: string, maxDays = 31) => {
    if (!fromIso || !toIso) return [];
    const days: Array<{
        key: string;
        iso: string;
        jalaliLabel: string;
        dayNumber: string;
    }> = [];
    const start = new Date(fromIso);
    const end = new Date(toIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    let cursor = new Date(start);
    while (cursor <= end && days.length < maxDays) {
        const iso = cursor.toISOString();
        const [jy, jm, jd] = gregorianToJalali(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
        days.push({
            key: iso,
            iso,
            jalaliLabel: `${jy}/${pad2(jm)}/${pad2(jd)}`,
            dayNumber: `${jd}`,
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
};

const useDriverSearch = (headers: Record<string, string>) => {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<DispatchDriverSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback(
        async (value: string) => {
            const query = value.trim();
            if (query.length < 2) {
                setResults([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    getApiUrl(`dispatch/search/drivers?q=${encodeURIComponent(query)}`),
                    { headers }
                );
                if (!res.ok) throw new Error(await res.text());
                const data = (await res.json()) as DispatchDriverSearchResult[];
                setResults(data);
            } catch (err: any) {
                console.error('driver search failed', err);
                let message = 'خطا در جستجوی راننده';
                if (typeof err?.message === 'string') {
                    try {
                        const parsed = JSON.parse(err.message);
                        message = parsed.message || parsed.details || message;
                    } catch {
                        message = err.message;
                    }
                }
                setError(message);
            } finally {
                setLoading(false);
            }
        },
        [headers]
    );

    const updateTerm = (value: string) => {
        setTerm(value);
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }
        searchTimeout.current = setTimeout(() => search(value), 300);
    };

    const clear = () => {
        setTerm('');
        setResults([]);
        setError(null);
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }
    };

    useEffect(() => {
        return () => {
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, []);

    return {
        term,
        results,
        loading,
        error,
        setTerm: updateTerm,
        clear,
    };
};

const createRow = (category: PresetCategory, queueType: DispatchQueueType = 'near'): RowEditor => ({
    id: Math.random().toString(36).slice(2),
    categoryKey: category.key,
    categoryLabel: category.label,
    queueType,
    notes: '',
    vehicleQuery: '',
    driverQuery: '',
    vehicleResults: [],
    driverResults: [],
    selectedVehicle: null,
    selectedDriver: null,
    vehicleSearching: false,
    driverSearching: false,
    submitting: false,
});

interface DispatchQueueManagerProps {
    currentUser?: User;
}

const DispatchQueueManager: React.FC<DispatchQueueManagerProps> = ({ currentUser }) => {
    const [rows, setRows] = useState<RowEditor[]>(() =>
        presetCategories.flatMap(category => [
            createRow(category, 'far'),
            createRow(category, 'near'),
        ])
    );
    const [queueData, setQueueData] = useState<QueueGroup>({});
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [registerQueueTab, setRegisterQueueTab] = useState<'far' | 'near'>('far');
    const [activeCategoryKey, setActiveCategoryKey] = useState(presetCategories[0]?.key || '');
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [positionEdits, setPositionEdits] = useState<Record<string, PositionEditState>>({});
    const [assignDialog, setAssignDialog] = useState<AssignDialogState>(initialAssignDialogState);
    const [assignPreviewAnnouncement, setAssignPreviewAnnouncement] =
        useState<AnnouncementWithEligibility | null>(null);
    const [assignHintsMap, setAssignHintsMap] = useState<Record<string, QueueAssignHints>>({});
    const [assignModeByCategory, setAssignModeByCategory] = useState<Record<string, AssignMode>>(
        () => loadAssignModeByCategory()
    );
    const [freeCategoryLoadCounts, setFreeCategoryLoadCounts] = useState<Record<string, number>>({});
    const freeAnnouncementsCacheRef = useRef<Record<string, AnnouncementWithEligibility[]>>({});
    const [preferencesDialog, setPreferencesDialog] = useState<PreferencesDialogState>(initialPreferencesDialogState);
    const [preferencesPanelOpen, setPreferencesPanelOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<DispatchDriverSearchResult | null>(null);
    const [preferencesRange, setPreferencesRange] = useState(getDefaultJalaliCycleRange);
    const [showRulesDialog, setShowRulesDialog] = useState(false);
    const searchTimers = useRef<Record<string, { vehicle?: ReturnType<typeof setTimeout>; driver?: ReturnType<typeof setTimeout> }>>({});

    const token = useMemo(() => localStorage.getItem('token') || '', []);

    const headers = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }),
        [token]
    );

    const driverSearch = useDriverSearch(headers);

    const getAssignModeForCategory = useCallback(
        (categoryKey: PresetCategory['key'] | null | undefined): AssignMode => {
            if (!categoryKey) return 'free';
            return assignModeByCategory[categoryKey] ?? 'free';
        },
        [assignModeByCategory]
    );

    const handleAssignModeChange = (categoryKey: PresetCategory['key'], mode: AssignMode) => {
        setAssignModeByCategory(prev => {
            const next = { ...prev, [categoryKey]: mode };
            persistAssignModeByCategory(next);
            return next;
        });
    };

    const updateRow = (rowId: string, patch: Partial<RowEditor> | ((row: RowEditor) => RowEditor)) => {
        setRows(prev =>
            prev.map(row => {
                if (row.id !== rowId) return row;
                return typeof patch === 'function' ? patch(row) : { ...row, ...patch };
            })
        );
    };

    const loadDriverPreferences = async (
        driverId: string,
        fromDate: string,
        toDate: string,
        options?: { category?: string | null }
    ) => {
        setPreferencesDialog(prev => ({
            ...prev,
            loading: true,
            error: null,
        }));
        try {
            const params = new URLSearchParams();
            if (fromDate) params.append('from', fromDate);
            if (toDate) params.append('to', toDate);
            if (options?.category) params.append('category', options.category);
            const res = await fetch(
                getApiUrl(`dispatch/drivers/${driverId}/preferences?${params.toString()}`),
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const payload = (await res.json()) as DriverPreferencesResponse;
            setPreferencesDialog(prev => ({
                ...prev,
                loading: false,
                data: payload,
                categoryLabel: payload.category || options?.category || prev.categoryLabel,
                dateFrom: payload.fromJalali ? payload.fromJalali.replace(/\//g, '-') : prev.dateFrom,
                dateTo: payload.toJalali ? payload.toJalali.replace(/\//g, '-') : prev.dateTo,
                error: null,
            }));
            setPreferencesRange(prev => ({
                from: payload.fromJalali ? payload.fromJalali.replace(/\//g, '-') : prev.from,
                to: payload.toJalali ? payload.toJalali.replace(/\//g, '-') : prev.to,
            }));
        } catch (error: any) {
            let message = 'خطا در دریافت ترجیحات راننده';
            if (typeof error?.message === 'string') {
                try {
                    const parsed = JSON.parse(error.message);
                    message = parsed.message || parsed.details || message;
                } catch {
                    message = error.message;
                }
            }
            setPreferencesDialog(prev => ({
                ...prev,
                loading: false,
                error: message,
            }));
        }
    };

    const openPreferencesPanel = () => {
        setPreferencesPanelOpen(true);
        setPreferencesRange(getDefaultJalaliCycleRange());
        setSelectedDriver(null);
        driverSearch.clear();
    };

    const closePreferencesPanel = () => {
        setPreferencesPanelOpen(false);
        driverSearch.clear();
        setSelectedDriver(null);
    };

    const handlePreferencesPanelSearchSelect = (driver: DispatchDriverSearchResult) => {
        setSelectedDriver(driver);
        driverSearch.setTerm(driver.name || driver.employeeId || '');
        if (driver.id) {
            setPreferencesDialog(prev => ({
                ...initialPreferencesDialogState,
                isOpen: false,
            }));
        }
    };

    const handlePreferencesRangeChange = (field: 'from' | 'to', value: string) => {
        setPreferencesRange(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const handlePreferencesPanelLoad = () => {
        if (!selectedDriver?.id) {
            alert('لطفاً راننده را انتخاب کنید.');
            return;
        }
        const { from, to } = preferencesRange;
        if (!from || !to) {
            alert('لطفاً بازه زمانی را مشخص کنید.');
            return;
        }
        setPreferencesDialog({
            isOpen: true,
            driver: {
                id: selectedDriver.id,
                name: selectedDriver.name,
                employeeId: selectedDriver.employeeId,
                mobile: selectedDriver.mobile,
            },
            queueEntry: null,
            categoryLabel: activeCategoryLabel,
            dateFrom: from,
            dateTo: to,
            loading: true,
            data: null,
            error: null,
        });
        setPreferencesPanelOpen(false);
        loadDriverPreferences(selectedDriver.id, from, to, {
            category: activeCategoryLabel || undefined,
        });
    };

    const closePreferencesDialog = () => {
        setPreferencesDialog(initialPreferencesDialogState);
    };

    const openPreferencesForEntry = (entry: DispatchQueueEntry, categoryLabel: string) => {
        const driverId = entry.driver?.id || entry.driverId;
        if (!driverId) {
            alert('شناسه راننده یافت نشد.');
            return;
        }
        const range = getDefaultJalaliCycleRange();
        const categoryKey = resolveCategoryKey(categoryLabel) || categoryLabel;
        setPreferencesDialog({
            isOpen: true,
            driver:
                entry.driver ||
                ({
                    id: driverId,
                    name: undefined,
                    employeeId: undefined,
                    mobile: undefined,
                } as DispatchQueueDriver),
            queueEntry: entry,
            categoryLabel,
            dateFrom: range.from,
            dateTo: range.to,
            loading: true,
            data: null,
            error: null,
        });
        loadDriverPreferences(driverId, range.from, range.to, { category: categoryKey });
    };

    const fetchAssignHintsForCategories = async (labels: string[]) => {
        const map: Record<string, QueueAssignHints> = {};
        const freeCounts: Record<string, number> = {};
        await Promise.all(
            labels.map(async label => {
                const preset = presetCategories.find(c => c.label === label);
                const categoryParam = preset?.key || label;
                const categoryKey = (preset?.key || resolveCategoryKey(label)) as PresetCategory['key'];
                const assignMode = getAssignModeForCategory(categoryKey);
                try {
                    const res = await fetch(
                        getApiUrl(
                            `dispatch/queue/assign-hints?category=${encodeURIComponent(categoryParam)}&assignMode=${assignMode}`
                        ),
                        { headers }
                    );
                    if (res.ok) {
                        map[label] = (await res.json()) as QueueAssignHints;
                    }
                } catch (error) {
                    console.warn('assign hints failed for', label, error);
                }
                if (assignMode === 'free') {
                    const anns = await fetchFreeAnnouncementsForCategory(
                        categoryKey || categoryParam,
                        headers,
                        freeAnnouncementsCacheRef.current
                    );
                    freeCounts[label] = anns.length;
                }
            })
        );
        setAssignHintsMap(map);
        if (Object.keys(freeCounts).length > 0) {
            setFreeCategoryLoadCounts(prev => ({ ...prev, ...freeCounts }));
        }
    };

    const fetchQueue = async () => {
        try {
            setLoadingQueue(true);
            freeAnnouncementsCacheRef.current = {};
            const res = await fetch(getApiUrl('dispatch/queue'), { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as QueueGroup;

            const normalizedData: QueueGroup = {};
            Object.keys(data || {}).forEach(key => {
                const label = resolveCategoryLabel(key) || key;
                normalizedData[label] = data[key];
            });

            setQueueData(normalizedData || {});
            void fetchAssignHintsForCategories(Object.keys(normalizedData));
        } catch (error) {
            console.error('Failed to load queue', error);
            setQueueData({});
            setAssignHintsMap({});
        } finally {
            setLoadingQueue(false);
        }
    };

    useEffect(() => {
        if (!loadingQueue && Object.keys(queueData).length > 0) {
            void fetchAssignHintsForCategories(Object.keys(queueData));
        }
    }, [assignModeByCategory]);

    useEffect(() => {
        fetchQueue();
        const onQueueUpdate = () => {
            fetchQueue();
        };
        window.addEventListener('dispatch-board:update', onQueueUpdate);
        return () => {
            window.removeEventListener('dispatch-board:update', onQueueUpdate);
            (Object.values(searchTimers.current) as Array<{
                vehicle?: ReturnType<typeof setTimeout>;
                driver?: ReturnType<typeof setTimeout>;
            }>).forEach(timer => {
                if (timer.vehicle) clearTimeout(timer.vehicle);
                if (timer.driver) clearTimeout(timer.driver);
            });
        };
    }, []);

    useEffect(() => {
        setPositionEdits({});
    }, [queueData]);

    // به‌روزرسانی خودکار بازه زمانی وقتی ماه عوض می‌شود
    useEffect(() => {
        const updateRangeIfNeeded = () => {
            const currentRange = getDefaultJalaliCycleRange();
            const [currentToYear, currentToMonth] = currentRange.to.split('-').map(Number);
            
            setPreferencesRange(prev => {
                const [prevToYear, prevToMonth] = prev.to.split('-').map(Number);
                
                // اگر ماه جاری با ماه ذخیره شده متفاوت است، به‌روزرسانی کن
                if (currentToYear !== prevToYear || currentToMonth !== prevToMonth) {
                    return currentRange;
                }
                return prev;
            });
        };
        
        // بررسی هر دقیقه
        const interval = setInterval(updateRangeIfNeeded, 60000);
        updateRangeIfNeeded(); // بررسی فوری
        
        return () => clearInterval(interval);
    }, []);

    const scheduleSearch = (
        rowId: string,
        kind: 'vehicle' | 'driver',
        term: string,
        fetcher: (rowId: string, query: string) => void
    ) => {
        if (!searchTimers.current[rowId]) {
            searchTimers.current[rowId] = {};
        }
        const timer = searchTimers.current[rowId][kind];
        if (timer) clearTimeout(timer);
        searchTimers.current[rowId][kind] = setTimeout(() => fetcher(rowId, term), 250);
    };

    const fetchVehicleSuggestions = async (rowId: string, term: string) => {
        const query = term.trim();
        if (query.length < 2) {
            updateRow(rowId, { vehicleResults: [], vehicleSearching: false });
            return;
        }
        updateRow(rowId, row => ({ ...row, vehicleSearching: true }));
        try {
            const res = await fetch(
                getApiUrl(`dispatch/search/vehicles?q=${encodeURIComponent(query)}`),
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as DispatchVehicleSearchResult[];
            updateRow(rowId, { vehicleResults: data, vehicleSearching: false });
        } catch (error) {
            console.error('Vehicle search failed', error);
            updateRow(rowId, { vehicleResults: [], vehicleSearching: false });
        }
    };

    const fetchDriverSuggestions = async (rowId: string, term: string) => {
        const query = term.trim();
        if (query.length < 2) {
            updateRow(rowId, { driverResults: [], driverSearching: false });
            return;
        }
        updateRow(rowId, row => ({ ...row, driverSearching: true }));
        try {
            const res = await fetch(
                getApiUrl(`dispatch/search/drivers?q=${encodeURIComponent(query)}`),
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as DispatchDriverSearchResult[];
            updateRow(rowId, { driverResults: data, driverSearching: false });
        } catch (error) {
            console.error('Driver search failed', error);
            updateRow(rowId, { driverResults: [], driverSearching: false });
        }
    };

    const handleRowSubmit = async (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row) return;
        if (!row.selectedVehicle || !row.selectedDriver) {
            alert('لطفاً خودرو و راننده را انتخاب کنید.');
            return;
        }
        updateRow(rowId, { submitting: true });
        try {
            const res = await fetch(getApiUrl('dispatch/queue'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    vehicleId: row.selectedVehicle.id,
                    driverId: row.selectedDriver.id,
                    vehicleCategory: row.categoryKey || row.selectedVehicle.vehicleCategory || '',
                    queueType: row.queueType,
                    notes: row.notes || undefined,
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                let errorMessage = 'ثبت نوبت ناموفق بود.';
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    }
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }
            updateRow(rowId, () => ({
                ...createRow({ key: row.categoryKey, label: row.categoryLabel }, row.queueType),
                id: rowId,
            }));
            // فراخوانی fetchQueue با delay کوتاه برای اطمینان از به‌روزرسانی
            setTimeout(() => {
                fetchQueue().catch(err => {
                    console.error('خطا در به‌روزرسانی لیست نوبت‌ها:', err);
                });
            }, 100);
        } catch (error: any) {
            alert(error?.message || 'ثبت نوبت ناموفق بود.');
            updateRow(rowId, { submitting: false });
        }
    };

    const handleDeleteQueueEntry = async (id: string) => {
        if (!window.confirm('آیا از حذف این نوبت مطمئن هستید؟')) return;
        try {
            const res = await fetch(getApiUrl(`dispatch/queue/${id}`), {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            fetchQueue();
        } catch (error) {
            alert('حذف نوبت انجام نشد.');
        }
    };

    const handleAddRow = (categoryKey: string, queueType: DispatchQueueType) => {
        const category = presetCategories.find(item => item.key === categoryKey);
        if (!category) return;
        setRows(prev => [...prev, createRow(category, queueType)]);
    };

    const resolveCategoryKeyForLabel = (categoryLabel: string): PresetCategory['key'] | null => {
        const preset = presetCategories.find(c => c.label === categoryLabel);
        return preset?.key || resolveCategoryKey(categoryLabel);
    };

    const loadAssignContext = async (entry: DispatchQueueEntry, categoryLabel?: string | null) => {
        setAssignDialog(prev => ({
            ...prev,
            loading: true,
            selectedAnnouncementId: '',
        }));
        try {
            const label = categoryLabel || entry.vehicleCategory || '';
            const categoryKey =
                resolveCategoryKeyForLabel(label) ||
                (activeCategoryKey as PresetCategory['key']) ||
                'trailer';
            const assignMode = getAssignModeForCategory(categoryKey);

            if (assignMode === 'free') {
                freeAnnouncementsCacheRef.current = {};
                const announcements = await fetchFreeAnnouncementsForCategory(
                    categoryKey,
                    headers,
                    freeAnnouncementsCacheRef.current
                );
                const context = buildFreeAssignContext(entry, announcements);
                setAssignDialog(prev => ({
                    ...prev,
                    loading: false,
                    context,
                    selectedAnnouncementId: '',
                }));
            } else {
                const res = await fetch(
                    getApiUrl(
                        `dispatch/assignments/context?queueEntryId=${encodeURIComponent(entry.id)}&assignMode=rules`
                    ),
                    { headers }
                );
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(errText);
                }
                const context = (await res.json()) as AssignContext;
                const filteredAnnouncements = filterAnnouncementsForQueueCategory(
                    context.announcements || [],
                    categoryKey
                );
                const eligibleCount = filteredAnnouncements.filter(a => a.eligible).length;
                setAssignDialog(prev => ({
                    ...prev,
                    loading: false,
                    context: {
                        ...context,
                        announcements: filteredAnnouncements,
                        eligibleCount,
                    },
                    selectedAnnouncementId: '',
                }));
            }

            const driverId = entry.driver?.id || entry.driverId;
            if (driverId) {
                setAssignDialog(prev => ({
                    ...prev,
                    preferenceBriefLoading: true,
                    preferenceBrief: null,
                }));
                try {
                    const categoryLabel = entry.vehicleCategory || '';
                    const categoryKey = resolveCategoryKey(categoryLabel);
                    const briefParams = new URLSearchParams();
                    if (categoryKey) briefParams.append('category', categoryKey);
                    const briefRes = await fetch(
                        getApiUrl(`bale/preference-brief/${driverId}?${briefParams.toString()}`),
                        { headers }
                    );
                    if (briefRes.ok) {
                        const brief = (await briefRes.json()) as PreferenceBriefData & {
                            takenCount?: number;
                        };
                        setAssignDialog(prev => ({
                            ...prev,
                            preferenceBrief: {
                                cycleSummary: brief.cycleSummary,
                                stats: brief.stats,
                                fromJalali: brief.fromJalali,
                                toJalali: brief.toJalali,
                                takenCount: brief.takenCount,
                            },
                            preferenceBriefLoading: false,
                        }));
                    } else {
                        setAssignDialog(prev => ({ ...prev, preferenceBriefLoading: false }));
                    }
                } catch {
                    setAssignDialog(prev => ({ ...prev, preferenceBriefLoading: false }));
                }
            }
        } catch (error) {
            console.error('Failed to load assignment context', error);
            setAssignDialog(prev => ({
                ...prev,
                loading: false,
                context: null,
            }));
        }
    };

    const openAssignDialog = (entry: DispatchQueueEntry, categoryLabel: string) => {
        setAssignPreviewAnnouncement(null);
        setAssignDialog({
            ...initialAssignDialogState,
            isOpen: true,
            entry,
            categoryLabel,
            loading: true,
        });
        loadAssignContext(entry, categoryLabel);
    };

    const closeAssignDialog = () => {
        setAssignPreviewAnnouncement(null);
        setAssignDialog(initialAssignDialogState);
    };

    const handleDeferTurn = async () => {
        if (!assignDialog.entry || !assignDialog.context?.canDefer) return;
        setAssignDialog(prev => ({ ...prev, deferring: true }));
        try {
            const res = await fetch(getApiUrl(`dispatch/queue/${assignDialog.entry!.id}/defer`), {
                method: 'POST',
                headers,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'ثبت «بمانم» ناموفق بود');
            }
            const context = (await res.json()) as AssignContext;
            setAssignDialog(prev => ({
                ...prev,
                context,
                deferring: false,
                selectedAnnouncementId: '',
            }));
            fetchQueue();
        } catch (error: any) {
            alert(error?.message || 'ثبت «بمانم» ناموفق بود');
            setAssignDialog(prev => ({ ...prev, deferring: false }));
        }
    };

    const activeQueueEntry = useMemo<DispatchQueueEntry | null>(() => {
        if (!assignDialog.entry) return null;
        const ctxEntry = assignDialog.context?.queueEntry;
        if (ctxEntry && typeof ctxEntry === 'object') {
            return { ...assignDialog.entry, ...ctxEntry } as DispatchQueueEntry;
        }
        return assignDialog.entry;
    }, [assignDialog.entry, assignDialog.context]);

    const sortedAnnouncements = useMemo(() => {
        return assignDialog.context?.announcements || [];
    }, [assignDialog.context]);

    const selectedAnnouncement = useMemo(
        () => sortedAnnouncements.find(a => a.id === assignDialog.selectedAnnouncementId) || null,
        [sortedAnnouncements, assignDialog.selectedAnnouncementId]
    );

    const dialogAssignMode = assignDialog.context?.assignMode || 'rules';
    const isDialogFreeMode = dialogAssignMode === 'free';

    const canConfirmAssign =
        Boolean(selectedAnnouncement) &&
        !assignDialog.context?.isDeferredThisPhase &&
        Boolean(assignDialog.context?.assignStage) &&
        !assignDialog.loading &&
        (isDialogFreeMode || Boolean(selectedAnnouncement?.eligible));

    const handleSelectAnnouncement = (announcementId: string, eligible: boolean) => {
        if (!eligible && !isDialogFreeMode) return;
        setAssignDialog(prev => ({
            ...prev,
            selectedAnnouncementId: announcementId,
        }));
    };

    const handleAssignConfirm = async () => {
        if (!assignDialog.entry || !assignDialog.context || !selectedAnnouncement) return;
        if (!isDialogFreeMode && !selectedAnnouncement.eligible) {
            alert('این بار در فاز فعلی قابل انتخاب نیست.');
            return;
        }

        if (!activeQueueEntry?.driverId || !activeQueueEntry?.vehicleId) {
            alert('اطلاعات راننده یا خودرو برای این نوبت کامل نیست.');
            return;
        }

        const assignStage = assignDialog.context.assignStage;
        if (!assignStage) {
            alert('فاز تخصیص مشخص نیست.');
            return;
        }

        setAssignDialog(prev => ({
            ...prev,
            assigning: true,
        }));

        try {
            const res = await fetch(getApiUrl('dispatch/assignments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    stage: assignStage,
                    freightAnnouncementId: selectedAnnouncement.id,
                    destinationId: selectedAnnouncement.destination?.id || null,
                    driverId: activeQueueEntry.driverId,
                    vehicleId: activeQueueEntry.vehicleId,
                    queueEntryId: assignDialog.entry.id,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert('تخصیص با موفقیت انجام شد.');
            closeAssignDialog();
            fetchQueue();
            window.dispatchEvent(new CustomEvent('dispatch-board:update'));
        } catch (error: any) {
            console.error('Failed to assign freight', error);
            let message = 'ثبت تخصیص ناموفق بود.';
            if (typeof error?.message === 'string') {
                try {
                    const parsed = JSON.parse(error.message);
                    message = parsed.details || parsed.message || message;
                } catch {
                    if (error.message) {
                        message = error.message;
                    }
                }
            }
            alert(message);
            setAssignDialog(prev => ({
                ...prev,
                assigning: false,
            }));
        }
    };

    useEffect(() => {
        if (!activeCategoryKey && presetCategories.length > 0) {
            setActiveCategoryKey(presetCategories[0].key);
        }
    }, [activeCategoryKey]);

    useEffect(() => {
        if (!activeCategoryKey) return;
        const category = presetCategories.find(cat => cat.key === activeCategoryKey);
        if (!category) return;
        setRows(prev => {
            const hasFar = prev.some(row => row.categoryKey === activeCategoryKey && row.queueType === 'far');
            const hasNear = prev.some(row => row.categoryKey === activeCategoryKey && row.queueType === 'near');
            if (hasFar && hasNear) return prev;
            const additions: RowEditor[] = [];
            if (!hasFar) additions.push(createRow(category, 'far'));
            if (!hasNear) additions.push(createRow(category, 'near'));
            return additions.length ? [...prev, ...additions] : prev;
        });
    }, [activeCategoryKey]);

    const sortEntries = (entries?: DispatchQueueEntry[]) =>
        [...(entries || [])].sort(
            (a, b) =>
                (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
        );

    const presetLabels = presetCategories.map(cat => cat.label);

    const orderedCategoryLabels = useMemo(() => presetLabels, [presetLabels]);

    const activeCategoryLabel = useMemo(() => {
        const preset = presetCategories.find(cat => cat.key === activeCategoryKey);
        return preset?.label || '';
    }, [activeCategoryKey]);

    const activeFarRows = useMemo(
        () => rows.filter(row => row.categoryKey === activeCategoryKey && row.queueType === 'far'),
        [rows, activeCategoryKey]
    );

    const activeNearRows = useMemo(
        () => rows.filter(row => row.categoryKey === activeCategoryKey && row.queueType === 'near'),
        [rows, activeCategoryKey]
    );

    const activeFarEntries = useMemo(() => {
        if (!activeCategoryLabel) return [];
        const bucket = queueData[activeCategoryLabel];
        return sortEntries(bucket?.far);
    }, [queueData, activeCategoryLabel]);

    const activeNearEntries = useMemo(() => {
        if (!activeCategoryLabel) return [];
        const bucket = queueData[activeCategoryLabel];
        return sortEntries(bucket?.near);
    }, [queueData, activeCategoryLabel]);

    const getEntryRowStatus = (entry: DispatchQueueEntry, categoryLabel: string): QueueRowStatus => {
        const hint = assignHintsMap[categoryLabel]?.entries.find(h => h.queueEntryId === entry.id);
        return hint?.rowStatus ?? 'inactive';
    };

    const renderQueueRow = (entry: DispatchQueueEntry, categoryLabel: string) => {
        const vehicleCode = entry.vehicle?.vehicleCode || entry.vehicle?.model || '---';
        const driverName = entry.driver?.name || '---';
        const periodKm = entry.driver?.periodFinalizedKm ?? 0;
        const mobile = entry.driver?.mobile || '-';
        const originalPosition = entry.position ?? 0;
        const originalValue = originalPosition > 0 ? originalPosition.toString() : '';
        const editState = positionEdits[entry.id];
        const inputValue = editState ? editState.value : originalValue;
        const saving = editState?.saving ?? false;
        const numericValue = Number(inputValue);
        const hasChanged =
            !saving &&
            inputValue !== '' &&
            Number.isFinite(numericValue) &&
            numericValue >= 1 &&
            numericValue !== originalPosition;

        const rowStatus = getEntryRowStatus(entry, categoryLabel);
        const statusStyle = rowStatusClasses[rowStatus];
        const hint = assignHintsMap[categoryLabel]?.entries.find(h => h.queueEntryId === entry.id);
        const categoryKey = resolveCategoryKeyForLabel(categoryLabel);
        const isFreeMode = getAssignModeForCategory(categoryKey) === 'free';
        const assignDisabled = isFreeMode
            ? Boolean(hint?.isDeferred)
            : rowStatus === 'deferred' || rowStatus === 'inactive' || hint?.canAssign === false;

        const assignBtnClass = isFreeMode
            ? rowStatusClasses.ready.assignBtn
            : rowStatus === 'ready' || rowStatus === 'very_far_history'
              ? rowStatusClasses.ready.assignBtn
              : statusStyle.assignBtn;

        const loadCount =
            isFreeMode
                ? freeCategoryLoadCounts[categoryLabel] || hint?.eligibleLoadCount || 0
                : hint &&
                    hint.eligibleLoadCount > 0 &&
                    (rowStatus === 'ready' || rowStatus === 'very_far_history')
                  ? hint.eligibleLoadCount
                  : 0;
        const statusNote =
            rowStatus === 'deferred' || rowStatus === 'inactive'
                ? hint?.lockReason
                    ? lockReasonLabels[hint.lockReason] || hint.lockReason
                    : statusStyle.badgeLabel
                : rowStatus === 'very_far_history'
                  ? statusStyle.badgeLabel
                  : null;

        return (
            <tr
                key={entry.id}
                className={`border-b border-slate-100 last:border-0 text-[11px] leading-tight ${statusStyle.row}`}
                title={statusStyle.badgeLabel}
            >
                <td className="px-1 py-1.5 text-center align-middle">
                    <div className="inline-flex items-center justify-center gap-0.5">
                        <input
                            type="number"
                            min={1}
                            value={inputValue}
                            onChange={e => handlePositionInputChange(entry, e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && hasChanged && !saving) {
                                    e.preventDefault();
                                    handlePositionSubmit(entry);
                                }
                            }}
                            className="w-9 rounded border border-slate-200 bg-white px-0.5 py-0.5 text-center text-[11px] focus:border-sky-400 focus:ring-0"
                            title="ردیف نوبت"
                        />
                        {hasChanged && (
                            <button
                                onClick={() => handlePositionSubmit(entry)}
                                disabled={saving}
                                className="rounded bg-emerald-600 px-1 py-0.5 text-[9px] text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {saving ? '…' : '✓'}
                            </button>
                        )}
                    </div>
                </td>
                <td className="px-1 py-1.5 text-center align-middle font-mono text-[10px]">
                    {vehicleCode}
                </td>
                <td className="px-1 py-1.5 text-center align-middle text-[10px] text-violet-700 whitespace-nowrap">
                    {periodKm > 0 ? periodKm.toLocaleString('fa-IR') : '—'}
                </td>
                <td className="px-1.5 py-1.5 align-middle min-w-0">
                    <div className="min-w-0">
                        <div className="truncate font-medium" title={driverName}>
                            {driverName}
                        </div>
                        <div
                            className="truncate text-[10px] text-slate-500 font-mono dir-ltr text-right"
                            title={mobile}
                        >
                            {mobile}
                        </div>
                        {statusNote && (
                            <div className="truncate text-[9px] text-slate-500 mt-0.5" title={statusNote}>
                                {statusNote}
                            </div>
                        )}
                    </div>
                </td>
                <td className="px-1 py-1.5 align-middle">
                    <div className="flex flex-col items-stretch gap-0.5">
                        <button
                            onClick={() => openAssignDialog(entry, categoryLabel)}
                            disabled={assignDisabled}
                            className={`rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap ${assignBtnClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                            تخصیص{loadCount > 0 ? ` (${loadCount})` : ''}
                        </button>
                        <div className="flex items-center justify-center gap-1.5">
                            <button
                                onClick={() => openPreferencesForEntry(entry, categoryLabel)}
                                className="text-[9px] text-violet-600 hover:text-violet-800"
                                title="ترجیحات راننده"
                            >
                                ترجیح
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                                onClick={() => handleDeleteQueueEntry(entry.id)}
                                className="text-[9px] text-red-500 hover:text-red-700"
                            >
                                حذف
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    const renderQueueList = (
        title: string,
        entries: DispatchQueueEntry[],
        type: 'far' | 'near',
        categoryLabel: string
    ) => {
        const accent = queueAccent[type];
        return (
            <div className={`rounded-xl border ${accent.border} bg-white shadow-sm overflow-hidden`}>
                <div
                    className={`flex items-center justify-between px-3 py-2.5 border-b ${accent.headerBg} ${accent.headerText}`}
                >
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${accent.badge}`}></span>
                        <h3 className="text-sm font-semibold">{title}</h3>
                    </div>
                    <span className="text-xs">{entries.length} نوبت</span>
                </div>
                {entries.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-slate-400 border-t border-dashed border-slate-200">
                        نوبتی ثبت نشده است.
                    </div>
                ) : (
                    <table className="w-full table-fixed text-right">
                        <colgroup>
                            <col className="w-[2.4rem]" />
                            <col className="w-[2.5rem]" />
                            <col className="w-[3.2rem]" />
                            <col />
                            <col className="w-[4.8rem]" />
                        </colgroup>
                        <thead className="text-[10px] text-slate-500">
                            <tr className="border-b border-slate-200 bg-slate-50/80">
                                <th
                                    className="px-1 py-1.5 text-center font-medium"
                                    title="تغییر به شمارهٔ موجود = جابه‌جایی با آن ردیف"
                                >
                                    #
                                </th>
                                <th className="px-1 py-1.5 text-center font-medium">کد</th>
                                <th className="px-1 py-1.5 text-center font-medium">کیلومتر</th>
                                <th className="px-1.5 py-1.5 font-medium">راننده</th>
                                <th className="px-1 py-1.5 text-center font-medium">اقدام</th>
                            </tr>
                        </thead>
                        <tbody>{entries.map(entry => renderQueueRow(entry, categoryLabel))}</tbody>
                    </table>
                )}
            </div>
        );
    };

    const handlePositionInputChange = (entry: DispatchQueueEntry, value: string) => {
        if (!/^\d*$/.test(value)) return;
        setPositionEdits(prev => {
            const next = { ...prev };
            const original = entry.position ?? 0;
            if ((value === '' || Number(value) === original) && !(prev[entry.id]?.saving)) {
                delete next[entry.id];
                return next;
            }
            next[entry.id] = {
                value,
                saving: prev[entry.id]?.saving ?? false,
            };
            return next;
        });
    };

    const handlePositionSubmit = async (entry: DispatchQueueEntry) => {
        const editState = positionEdits[entry.id];
        if (!editState || editState.value === '') {
            return;
        }
        const targetPosition = Number(editState.value);
        if (!Number.isFinite(targetPosition) || targetPosition < 1) {
            alert('ردیف باید عددی بزرگتر از صفر باشد.');
            return;
        }

        setPositionEdits(prev => ({
            ...prev,
            [entry.id]: { value: editState.value, saving: true },
        }));

        try {
            const res = await fetch(getApiUrl(`dispatch/queue/${entry.id}/position`), {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ position: targetPosition }),
            });
            let payload: { message?: string; mode?: string } = {};
            const raw = await res.text();
            try {
                payload = raw ? JSON.parse(raw) : {};
            } catch {
                payload = { message: raw };
            }
            if (!res.ok) {
                throw new Error(payload.message || raw || 'بروزرسانی ردیف انجام نشد.');
            }

            setPositionEdits(prev => {
                const next = { ...prev };
                delete next[entry.id];
                return next;
            });
            await fetchQueue();
            window.dispatchEvent(new CustomEvent('dispatch-board:update'));
        } catch (error: any) {
            console.error('Failed to update position', error);
            const msg = error?.message || '';
            alert(
                msg.includes('Failed to fetch')
                    ? 'ارتباط با سرور برقرار نشد. بک‌اند را بررسی کنید و دوباره تلاش کنید.'
                    : msg || 'بروزرسانی ردیف انجام نشد.'
            );
            setPositionEdits(prev => ({
                ...prev,
                [entry.id]: { value: editState.value, saving: false },
            }));
        }
    };

    const renderCategoryColumn = (label: string) => {
        const bucket = queueData[label] || { far: [], near: [] };
        const farEntries = sortEntries(bucket.far);
        const nearEntries = sortEntries(bucket.near);
        const preset = presetCategories.find(cat => cat.label === label);
        const accentClass = preset ? categoryAccentClasses[preset.key] : 'bg-slate-600 text-white';
        const dotClass = preset ? categoryDotClasses[preset.key] : 'bg-slate-400';
        const assignMode = preset ? getAssignModeForCategory(preset.key) : 'rules';
        return (
            <div key={label} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className={`inline-flex h-3 w-3 rounded-full ${dotClass}`}></span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] ${accentClass}`}>
                            {label}
                        </span>
                    </div>
                    {preset && (
                        <button
                            onClick={() => {
                                setActiveCategoryKey(preset.key);
                                setIsDrawerOpen(true);
                            }}
                            className={`px-3 py-1 text-xs rounded-md text-white hover:opacity-90 ${categoryAccentClasses[preset.key] || 'bg-sky-600'}`}
                        >
                            ثبت نوبت
                        </button>
                    )}
                </div>
                {preset && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[10px] text-slate-600">
                        <div className="font-medium text-slate-700 mb-1.5">حالت تخصیص</div>
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`assign-mode-${preset.key}`}
                                    checked={assignMode === 'rules'}
                                    onChange={() => handleAssignModeChange(preset.key, 'rules')}
                                    className="text-sky-600"
                                />
                                <span>طبق قانون (فعال/غیرفعال + رنگ)</span>
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`assign-mode-${preset.key}`}
                                    checked={assignMode === 'free'}
                                    onChange={() => handleAssignModeChange(preset.key, 'free')}
                                    className="text-sky-600"
                                />
                                <span>آزاد (فقط رنگ راهنما)</span>
                            </label>
                        </div>
                    </div>
                )}
                {renderQueueList('نوبت مسیر دور', farEntries, 'far', label)}
                {renderQueueList('نوبت مسیر نزدیک', nearEntries, 'near', label)}
            </div>
        );
    };

    const renderFormSection = (queueType: 'far' | 'near', sectionRows: RowEditor[]) => (
        <div className="space-y-2">
            {sectionRows.length === 0 ? (
                <div className="text-[11px] text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                    ردیفی برای این بخش ایجاد نشده است.
                </div>
            ) : (
                sectionRows.map(row => renderRowEditor(row, sectionRows.length, queueTypeLabels[queueType]))
            )}
        </div>
    );

    const formatPlate = (plate?: DispatchVehicleSearchResult['plate']) => {
        if (!plate) return '';
        const parts = [plate.part1, plate.letter, plate.part2, plate.cityCode].filter(Boolean);
        return parts.join(' ');
    };

    const renderRowEditor = (row: RowEditor, siblingsCount: number, queueTypeLabel: string) => (
        <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{queueTypeLabel}</span>
                {siblingsCount > 1 && (
                    <button
                        onClick={() =>
                            setRows(prev => prev.filter(existing => existing.id !== row.id))
                        }
                        className="text-red-500 hover:text-red-600"
                    >
                        حذف
                    </button>
                )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="relative">
                    <label className="text-[10px] font-medium text-slate-600">خودرو</label>
                    <input
                        className="input-style mt-0.5 h-8 text-xs border-slate-200 focus:border-sky-400 focus:ring-sky-200/60"
                        value={row.selectedVehicle ? row.selectedVehicle.vehicleCode || row.selectedVehicle.model || row.vehicleQuery : row.vehicleQuery}
                        onChange={e => {
                            const value = e.target.value;
                            updateRow(row.id, {
                                vehicleQuery: value,
                                selectedVehicle: null,
                            });
                            scheduleSearch(row.id, 'vehicle', value, fetchVehicleSuggestions);
                        }}
                        placeholder="کد یا مدل خودرو"
                    />
                    {row.vehicleSearching && (
                        <div className="text-[11px] text-slate-400 mt-1">در حال جستجو...</div>
                    )}
                    {!row.vehicleSearching && row.vehicleResults.length > 0 && !row.selectedVehicle && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-sm max-h-32 overflow-auto text-xs">
                            {row.vehicleResults.map(result => (
                                <li
                                    key={result.id}
                                    className="px-3 py-2 hover:bg-slate-100 cursor-pointer"
                                    onClick={() =>
                                        updateRow(row.id, {
                                            selectedVehicle: result,
                                            vehicleQuery: '',
                                            vehicleResults: [],
                                        })
                                    }
                                >
                                    <div className="font-semibold text-slate-700 font-mono text-xs">
                                        {result.vehicleCode || '—'}
                                        {result.vehicleType || (result as { currentVehicleType?: string }).currentVehicleType
                                            ? ` — ${result.vehicleType || (result as { currentVehicleType?: string }).currentVehicleType}`
                                            : ''}
                                        {formatPlate(result.plate) ? ` — ${formatPlate(result.plate)}` : ''}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {row.selectedVehicle && (
                        <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
                            <span>
                                انتخاب شده: {row.selectedVehicle.vehicleCode || row.selectedVehicle.model}
                            </span>
                            <button
                                onClick={() =>
                                    updateRow(row.id, {
                                        selectedVehicle: null,
                                        vehicleQuery: '',
                                    })
                                }
                                className="text-red-500 hover:text-red-600"
                            >
                                لغو
                            </button>
                        </div>
                    )}
                </div>
                <div className="relative">
                    <label className="text-[10px] font-medium text-slate-600">راننده</label>
                    <input
                        className="input-style mt-0.5 h-8 text-xs border-slate-200 focus:border-emerald-400 focus:ring-emerald-200/60"
                        value={row.selectedDriver ? row.selectedDriver.name : row.driverQuery}
                        onChange={e => {
                            const value = e.target.value;
                            updateRow(row.id, {
                                driverQuery: value,
                                selectedDriver: null,
                            });
                            scheduleSearch(row.id, 'driver', value, fetchDriverSuggestions);
                        }}
                        placeholder="نام یا کد پرسنلی"
                    />
                    {row.driverSearching && (
                        <div className="text-[11px] text-slate-400 mt-1">در حال جستجو...</div>
                    )}
                    {!row.driverSearching && row.driverResults.length > 0 && !row.selectedDriver && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-sm max-h-32 overflow-auto text-xs">
                            {row.driverResults.map(result => (
                                <li
                                    key={result.id}
                                    className="px-3 py-2 hover:bg-slate-100 cursor-pointer"
                                    onClick={() =>
                                        updateRow(row.id, {
                                            selectedDriver: result,
                                            driverQuery: '',
                                            driverResults: [],
                                        })
                                    }
                                >
                                    <div className="font-semibold text-slate-700">
                                        {result.name || 'راننده'}
                                    </div>
                                    <div className="text-slate-500 flex justify-between gap-2">
                                        <span>{result.employeeId || 'بدون کد'}</span>
                                        <span>{result.mobile || ''}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {row.selectedDriver && (
                        <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
                            <span>انتخاب شده: {row.selectedDriver.name}</span>
                            <button
                                onClick={() =>
                                    updateRow(row.id, {
                                        selectedDriver: null,
                                        driverQuery: '',
                                    })
                                }
                                className="text-red-500 hover:text-red-600"
                            >
                                لغو
                            </button>
                        </div>
                    )}
                </div>
                <div className="sm:col-span-2">
                    <label className="text-[10px] font-medium text-slate-600">توضیحات</label>
                    <input
                        className="input-style mt-0.5 h-8 text-xs border-slate-200 focus:border-amber-400 focus:ring-amber-200/60"
                        value={row.notes}
                        onChange={e => updateRow(row.id, { notes: e.target.value })}
                        placeholder="توضیح کوتاه"
                    />
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 text-[10px]">
                <button
                    onClick={() => handleRowSubmit(row.id)}
                    disabled={row.submitting}
                    className="px-3 py-1 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                    {row.submitting ? '...' : 'ذخیره'}
                </button>
            </div>
        </div>
    );

    return (
        <div className="p-4 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">تابلوی نوبت ناوگان</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            نوبت‌های مسیر دور و نزدیک — رنگ ردیف وضعیت تخصیص را نشان می‌دهد.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">سبز: آماده</span>
                            <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5">قرمز: سابقه خیلی‌دور</span>
                            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">کهربایی: بمانم</span>
                            <span className="rounded-full bg-slate-200 text-slate-600 px-2 py-0.5">خاکستری: غیرفعال</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowRulesDialog(true)}
                            className="px-3 py-1.5 text-sm rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-2"
                            title="قوانین کارت‌بل"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            قوانین
                        </button>
                        <button
                            onClick={openPreferencesPanel}
                            className="px-3 py-1.5 text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                            بررسی ترجیحات راننده
                        </button>
                        <button
                            onClick={fetchQueue}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                        >
                            بروزرسانی
                        </button>
                    </div>
                </header>
                <div className="px-4 py-4">
                    {loadingQueue ? (
                        <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                    ) : orderedCategoryLabels.length === 0 ? (
                        <div className="py-10 text-center text-slate-400 text-sm">هنوز دسته‌ای برای نمایش وجود ندارد.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                            {orderedCategoryLabels.map(renderCategoryColumn)}
                        </div>
                    )}
                </div>
            </section>

            {preferencesPanelOpen && (
                <div
                    className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-12"
                    onClick={closePreferencesPanel}
                >
                    <div
                        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">بررسی ترجیحات راننده</h2>
                                <p className="text-xs text-slate-500 mt-1">
                                    با جستجوی نام یا کد پرسنلی راننده و انتخاب بازه زمانی، سوابق تخصیص و فرصت‌های استفاده‌نشده نمایش داده می‌شود.
                                </p>
                            </div>
                            <button
                                onClick={closePreferencesPanel}
                                className="text-slate-500 hover:text-slate-700 text-sm"
                            >
                                بستن
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-4 overflow-y-auto">
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col text-xs text-slate-500">
                                    <label className="mb-1 font-medium text-slate-600">جستجوی راننده (نام یا کد پرسنلی)</label>
                                    <input
                                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:ring-0"
                                        placeholder="مثلاً علی رضایی یا 12345"
                                        value={driverSearch.term}
                                        onChange={e => driverSearch.setTerm(e.target.value)}
                                    />
                                    {driverSearch.loading && (
                                        <span className="mt-1 text-[11px] text-slate-400">در حال جستجو...</span>
                                    )}
                                    {driverSearch.error && (
                                        <span className="mt-1 text-[11px] text-rose-500">{driverSearch.error}</span>
                                    )}
                                </div>
                                {driverSearch.results.length > 0 && (
                                    <div className="rounded-lg border border-slate-200">
                                        <ul className="max-h-48 overflow-auto text-sm divide-y divide-slate-100">
                                            {driverSearch.results.map(result => {
                                                const isSelected = selectedDriver?.id === result.id;
                                                return (
                                                    <li
                                                        key={result.id}
                                                        className={`px-3 py-2 cursor-pointer transition ${
                                                            isSelected
                                                                ? 'bg-sky-50 text-sky-700'
                                                                : 'hover:bg-slate-50'
                                                        }`}
                                                        onClick={() => handlePreferencesPanelSearchSelect(result)}
                                                    >
                                                        <div className="font-medium">
                                                            {result.name || 'راننده'}
                                                            {result.employeeId ? ` • ${result.employeeId}` : ''}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                                            {result.mobile || ''}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {driverSearch.term.length >= 2 && !driverSearch.loading && driverSearch.results.length === 0 && !driverSearch.error && (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                                        نتیجه‌ای برای جستجو یافت نشد.
                                    </div>
                                )}
                                {selectedDriver && (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                        راننده انتخاب شده: {selectedDriver.name || 'نامشخص'}
                                        {selectedDriver.employeeId ? ` • ${selectedDriver.employeeId}` : ''}
                                        {selectedDriver.mobile ? ` • ${selectedDriver.mobile}` : ''}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-end gap-3 text-xs text-slate-500">
                                <div className="flex flex-col">
                                    <label className="mb-1 font-medium text-slate-600">از تاریخ</label>
                                    <input
                                        type="text"
                                        value={preferencesRange.from}
                                        onChange={e => handlePreferencesRangeChange('from', e.target.value)}
                                        placeholder="مثلاً 1404-07-26"
                                        dir="ltr"
                                        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-sky-500 focus:ring-0"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="mb-1 font-medium text-slate-600">تا تاریخ</label>
                                    <input
                                        type="text"
                                        value={preferencesRange.to}
                                        onChange={e => handlePreferencesRangeChange('to', e.target.value)}
                                        placeholder="مثلاً 1404-08-25"
                                        dir="ltr"
                                        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-sky-500 focus:ring-0"
                                    />
                                </div>
                                <button
                                    onClick={handlePreferencesPanelLoad}
                                    className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
                                    disabled={!selectedDriver?.id}
                                >
                                    نمایش ترجیحات
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                بازه پیش‌فرض: ۲۶ ماه قبل تا ۲۵ ماه جاری (شمسی). فرمت تاریخ: YYYY-MM-DD.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {isDrawerOpen && (
                <div
                    className="fixed inset-0 z-50 flex justify-center items-start bg-slate-900/20 pt-16"
                    onClick={() => setIsDrawerOpen(false)}
                >
                    <div
                        className="w-full max-w-md bg-white shadow-2xl rounded-xl border border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-800">ثبت نوبت</h2>
                            <button
                                onClick={() => setIsDrawerOpen(false)}
                                className="text-slate-500 hover:text-slate-700 text-xs"
                            >
                                بستن
                            </button>
                        </div>
                        <div className="p-3 space-y-3">
                            <div className="flex flex-wrap gap-1.5">
                                {presetCategories.map(category => (
                                    <button
                                        key={category.key}
                                        onClick={() => setActiveCategoryKey(category.key)}
                                        className={`px-2.5 py-1 rounded-full text-xs transition ${
                                            activeCategoryKey === category.key
                                                ? categoryAccentClasses[category.key] || 'bg-slate-600 text-white'
                                                : categoryPillInactiveClasses[category.key] || 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {category.label}
                                    </button>
                                ))}
                            </div>
                            {!activeCategoryLabel ? (
                                <div className="py-6 text-center text-slate-500 text-xs">
                                    برای شروع یک نوع خودرو را انتخاب کنید.
                                </div>
                            ) : (
                                <>
                                    <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setRegisterQueueTab('far')}
                                            className={`flex-1 rounded-md py-1.5 transition ${
                                                registerQueueTab === 'far'
                                                    ? 'bg-sky-600 text-white'
                                                    : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {queueTypeLabels.far}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRegisterQueueTab('near')}
                                            className={`flex-1 rounded-md py-1.5 transition ${
                                                registerQueueTab === 'near'
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {queueTypeLabels.near}
                                        </button>
                                    </div>
                                    {registerQueueTab === 'far'
                                        ? renderFormSection('far', activeFarRows)
                                        : renderFormSection('near', activeNearRows)}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {assignDialog.isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-12"
                    onClick={closeAssignDialog}
                >
                    <div
                        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">تخصیص اعلام بار</h2>
                                <div className="text-xs text-slate-500 mt-1 space-y-1">
                                    <div>
                                        راننده:{' '}
                                        <span className="font-semibold text-slate-700">
                                            {activeQueueEntry?.driver?.name || 'نامشخص'}
                                        </span>
                                        {activeQueueEntry?.position ? ` • ردیف ${activeQueueEntry.position}` : ''}
                                    </div>
                                    <div>
                                        خودرو:{' '}
                                        {activeQueueEntry?.vehicle?.vehicleCode ||
                                            activeQueueEntry?.vehicle?.model ||
                                            'نامشخص'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={closeAssignDialog}
                                className="text-slate-500 hover:text-slate-700 text-sm"
                            >
                                بستن
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4 overflow-y-auto">
                            {!isDialogFreeMode &&
                                (assignDialog.context?.entryPhaseLabel ||
                                    assignDialog.context?.phaseLabel) && (
                                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                                        <div className="font-semibold">
                                            {assignDialog.context.entryPhaseLabel ||
                                                assignDialog.context.phaseLabel}
                                        </div>
                                        {assignDialog.context.entryPhaseLabel &&
                                            assignDialog.context.phaseLabel &&
                                            assignDialog.context.entryPhaseLabel !==
                                                assignDialog.context.phaseLabel && (
                                                <div className="text-xs text-sky-700 mt-1">
                                                    فاز کلی سیستم: {assignDialog.context.phaseLabel}
                                                </div>
                                            )}
                                        {assignDialog.context.cycleFromJalali &&
                                            assignDialog.context.cycleToJalali && (
                                                <div className="text-xs text-sky-700 mt-1">
                                                    دوره جاری: {assignDialog.context.cycleFromJalali}{' '}
                                                    تا {assignDialog.context.cycleToJalali}
                                                </div>
                                            )}
                                        {assignDialog.context.stageMeta?.autoPromoted && (
                                            <div className="text-xs text-amber-700 mt-1">
                                                فاز به‌صورت خودکار (طبق قوانین بله) انتخاب شده
                                                است.
                                            </div>
                                        )}
                                    </div>
                                )}

                            {isDialogFreeMode && (
                                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                                    <div className="font-semibold">حالت آزاد</div>
                                    <div className="text-xs text-violet-700 mt-1">
                                        همه اعلام بارهای معلق نمایش داده می‌شوند. رنگ ردیف راننده
                                        فقط راهنماست — تخصیص با تصمیم شما انجام می‌شود.
                                    </div>
                                </div>
                            )}

                            {!isDialogFreeMode && assignDialog.context?.isDeferredThisPhase && (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    این راننده برای مرحله بعد «بمانم» ثبت کرده — در این فاز تخصیص مجاز نیست.
                                </div>
                            )}

                            {!isDialogFreeMode &&
                                assignDialog.context?.driverRowStatus === 'very_far_history' && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                                        سابقه خیلی‌دور در دوره جاری — فقط بارهای مجاز این فاز قابل
                                        انتخاب هستند.
                                    </div>
                                )}

                        {assignDialog.loading ? (
                            <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                        ) : !assignDialog.context ? (
                            <div className="py-10 text-center text-slate-400 text-sm">
                                اعلام باری برای این نوبت پیدا نشد.
                            </div>
                        ) : assignDialog.context.message && sortedAnnouncements.length === 0 ? (
                            <div className="py-10 text-center text-slate-400 text-sm">
                                {assignDialog.context.message}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.9fr] gap-4">
                                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs text-slate-600 space-y-2">
                                        <div className="flex justify-between text-slate-700">
                                            <span className="font-semibold">
                                                {activeQueueEntry?.driver?.name || 'راننده'}
                                            </span>
                                            <span>
                                                ردیف {activeQueueEntry?.position ?? '-'} •{' '}
                                                {queueTypeLabels[activeQueueEntry?.queueType || 'near']}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>{activeQueueEntry?.driver?.employeeId || 'بدون کد'}</span>
                                            <span>{activeQueueEntry?.driver?.mobile || ''}</span>
                                        </div>
                                        <div>
                                            خودرو:{' '}
                                            {activeQueueEntry?.vehicle?.vehicleCode ||
                                                activeQueueEntry?.vehicle?.model ||
                                                'نامشخص'}
                                        </div>
                                        {activeQueueEntry?.notes && (
                                            <div className="text-slate-500 border-t border-slate-200 pt-2">
                                                توضیحات: {activeQueueEntry.notes}
                                            </div>
                                        )}
                                        {activeQueueEntry?.longRouteHistory &&
                                            activeQueueEntry.longRouteHistory.length > 0 && (
                                                <div className="border-t border-slate-200 pt-2 space-y-1">
                                                    <div className="font-semibold text-slate-700">
                                                        سوابق مسیر دور اخیر:
                                                    </div>
                                                    {activeQueueEntry.longRouteHistory.slice(0, 3).map(history => (
                                                        <div key={history.id}>
                                                            {history.city || 'نامشخص'} • {history.route_category || ''}{' '}
                                                            {history.created_at
                                                                ? `• ${new Date(history.created_at).toLocaleDateString('fa-IR')}`
                                                                : ''}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        {(assignDialog.preferenceBriefLoading || assignDialog.preferenceBrief) && (
                                            <PreferenceBriefPanel
                                                brief={assignDialog.preferenceBrief}
                                                loading={assignDialog.preferenceBriefLoading}
                                            />
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                            {isDialogFreeMode ? (
                                                <>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                                                        حالت آزاد — همه بارها قابل انتخاب
                                                    </span>
                                                    <span className="text-slate-500">
                                                        ستون وضعیت فقط راهنمای قانون است
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                                                        سبز = قابل انتخاب
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
                                                        خاکستری = غیرفعال
                                                    </span>
                                                    <span className="text-slate-500">
                                                        {assignDialog.context.eligibleCount} بار مجاز از{' '}
                                                        {sortedAnnouncements.length}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {sortedAnnouncements.length === 0 ? (
                                            <div className="text-[12px] text-slate-500 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                                                اعلام باری برای این فاز موجود نیست.
                                            </div>
                                        ) : (
                                            <div className="overflow-auto border border-slate-200 rounded-xl max-h-[420px]">
                                                <table className="min-w-full text-right text-[11px]">
                                                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide sticky top-0">
                                                        <tr className="border-b border-slate-200">
                                                            <th className="px-2 py-2 text-right font-medium">نوع خط</th>
                                                            <th className="px-2 py-2 text-right font-medium">مبدا ← مقصد</th>
                                                            <th className="px-2 py-2 text-right font-medium">مسیر / کیلومتر</th>
                                                            <th className="px-2 py-2 text-right font-medium">وضعیت</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                        {sortedAnnouncements.map((item, idx) => {
                                                            const isSelected = assignDialog.selectedAnnouncementId === item.id;
                                                            const selectable = isDialogFreeMode || item.eligible;
                                                            const rowClass = selectable
                                                                ? isSelected
                                                                    ? 'bg-emerald-50 border-r-4 border-emerald-500 cursor-pointer'
                                                                    : item.lockReason && isDialogFreeMode
                                                                      ? 'bg-amber-50/40 hover:bg-emerald-50/50 cursor-pointer'
                                                                      : 'bg-white hover:bg-emerald-50/50 cursor-pointer'
                                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-70';
                                                            const kmLabel = formatDistance(item.route?.round_trip_km);
                                                            const vfBadge = item.isVeryFar ? (
                                                                <span className="text-[10px] text-amber-700">خیلی‌دور</span>
                                                            ) : null;

                                                            return (
                                                                <tr
                                                                    key={item.id}
                                                                    onClick={() => handleSelectAnnouncement(item.id, selectable)}
                                                                    className={`transition text-[11px] ${rowClass}`}
                                                                    title={
                                                                        item.lockReason
                                                                            ? lockReasonLabels[item.lockReason] ||
                                                                              item.lockReason
                                                                            : undefined
                                                                    }
                                                                >
                                                                    <td className="px-2 py-1.5 align-top">
                                                                        <span className="font-semibold">{idx + 1}.</span>{' '}
                                                                        {item.lineType || '—'}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top">
                                                                        {item.destination?.city
                                                                            ? formatOriginToDestination(
                                                                                  item.originCity,
                                                                                  item.destination.city
                                                                              )
                                                                            : item.originCity || '—'}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top">
                                                                        {kmLabel}
                                                                        {vfBadge && <div>{vfBadge}</div>}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-[10px]">
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            {item.eligible ? (
                                                                                <span className="text-emerald-700">مجاز</span>
                                                                            ) : (
                                                                                <span className={isDialogFreeMode ? 'text-amber-700' : ''}>
                                                                                    {item.lockReason
                                                                                        ? lockReasonLabels[item.lockReason] ||
                                                                                          item.lockReason
                                                                                        : 'غیرفعال'}
                                                                                </span>
                                                                            )}
                                                                            <button
                                                                                type="button"
                                                                                title="مشاهده جزئیات بار"
                                                                                aria-label="مشاهده جزئیات بار"
                                                                                className="p-0.5 rounded text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setAssignPreviewAnnouncement(item);
                                                                                }}
                                                                            >
                                                                                <EyeIcon />
                                                                            </button>
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                        </div>

                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                                <button
                                    onClick={() =>
                                        assignDialog.entry &&
                                        loadAssignContext(
                                            assignDialog.entry,
                                            assignDialog.categoryLabel
                                        )
                                    }
                                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-sm"
                                    disabled={assignDialog.loading}
                                >
                                    بروزرسانی لیست
                                </button>
                                {assignDialog.context?.canDefer && (
                                    <button
                                        onClick={handleDeferTurn}
                                        disabled={assignDialog.deferring || assignDialog.loading}
                                        className="px-3 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-sm disabled:opacity-60"
                                    >
                                        {assignDialog.deferring ? 'در حال ثبت...' : '⏭ بمانم برای مرحله بعد'}
                                    </button>
                                )}
                                {selectedAnnouncement ? (
                                    <span className="text-emerald-600">
                                        انتخاب: {selectedAnnouncement.announcementCode || selectedAnnouncement.id}
                                    </span>
                                ) : (
                                    <span>
                                        {isDialogFreeMode
                                            ? 'یک بار انتخاب کنید.'
                                            : 'یک بار مجاز (سبز) انتخاب کنید.'}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={closeAssignDialog}
                                    className="px-3 py-1.5 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                                    disabled={assignDialog.assigning}
                                >
                                    انصراف
                                </button>
                                <button
                                    onClick={handleAssignConfirm}
                                    disabled={assignDialog.assigning || !canConfirmAssign}
                                    className="px-4 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {assignDialog.assigning ? 'در حال ثبت...' : 'تایید تخصیص'}
                                </button>
                            </div>
                        </div>
                    </div>
                    {assignPreviewAnnouncement && (
                        <DispatchAnnouncementDetailDialog
                            item={assignPreviewAnnouncement}
                            onClose={() => setAssignPreviewAnnouncement(null)}
                        />
                    )}
                </div>
            )}

            {preferencesDialog.isOpen && (
                <div
                    className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-12"
                    onClick={closePreferencesDialog}
                >
                    <div
                        className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">بررسی ترجیحات راننده</h2>
                                <div className="mt-1 text-xs text-slate-500 space-y-1">
                                    <div>
                                        راننده:{' '}
                                        <span className="font-semibold text-slate-700">
                                            {preferencesDialog.driver?.name || 'نامشخص'}
                                        </span>
                                        {preferencesDialog.driver?.employeeId
                                            ? ` • ${preferencesDialog.driver.employeeId}`
                                            : ''}
                                        {preferencesDialog.driver?.mobile ? ` • ${preferencesDialog.driver.mobile}` : ''}
                                        {preferencesDialog.categoryLabel ? (
                                            <span className="text-violet-700">
                                                {' '}
                                                • {preferencesDialog.categoryLabel}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div>
                                        دوره: {preferencesDialog.data?.fromJalali || preferencesDialog.dateFrom || '---'} تا{' '}
                                        {preferencesDialog.data?.toJalali || preferencesDialog.dateTo || '---'}
                                        <span className="text-slate-400 mr-2">(پیش‌فرض: دوره جاری)</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={closePreferencesDialog}
                                className="text-slate-500 hover:text-slate-700 text-sm"
                            >
                                بستن
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-4 overflow-y-auto">
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        closePreferencesDialog();
                                        openPreferencesPanel();
                                    }}
                                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    تغییر راننده یا بازه
                                </button>
                            </div>

                            {preferencesDialog.loading ? (
                                <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                            ) : preferencesDialog.error ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                    {preferencesDialog.error}
                                </div>
                            ) : preferencesDialog.data ? (
                                <DriverPreferencesView
                                    data={preferencesDialog.data}
                                    categoryLabel={
                                        preferencesDialog.categoryLabel ||
                                        preferencesDialog.data.category ||
                                        null
                                    }
                                    targetDriverId={preferencesDialog.driver?.id || preferencesDialog.data.driver.id}
                                    targetDriverName={preferencesDialog.driver?.name || 'راننده'}
                                />
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                                    داده‌ای برای نمایش وجود ندارد.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* دیالوگ قوانین کارت‌بل */}
            {showRulesDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setShowRulesDialog(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <span>📋</span>
                                <span>قوانین کارت‌بل</span>
                            </h2>
                            <button
                                onClick={() => setShowRulesDialog(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                        <WorkflowRules 
                            view={View.TransportDispatchBoard} 
                            userRole={currentUser?.role || UserRole.TransportationUser} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default DispatchQueueManager;


