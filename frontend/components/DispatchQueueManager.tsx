import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    DispatchQueueEntry,
    DispatchQueueType,
    DispatchVehicleSearchResult,
    DispatchDriverSearchResult,
    DispatchAnnouncementCandidate,
} from '../types';

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

type StageKey = 'stage1' | 'stage2';

type StageResponse = {
    stage: StageKey;
    cycleStart: string;
    queue: DispatchQueueEntry[];
    announcements: DispatchAnnouncementCandidate[];
    pendingStage1Count: number;
    globalPendingStage1Count?: number;
    stage2Locked: boolean;
    stage2Forced?: boolean;
};

type AssignDialogState = {
    isOpen: boolean;
    entry: DispatchQueueEntry | null;
    stage: StageKey;
    loading: boolean;
    data: StageResponse | null;
    selectedAnnouncementId: string;
    assigning: boolean;
};

const stageOptions: { value: StageKey; label: string; helper: string }[] = [
    {
        value: 'stage1',
        label: 'مرحله اول - مسیرهای خیلی دور',
        helper: 'رانندگانی که در ۲۶ روز اخیر مسیر دور داشته‌اند در این مرحله مسدود هستند.',
    },
    {
        value: 'stage2',
        label: 'مرحله دوم - سایر مسیرها',
        helper: 'پس از اتمام کامل مسیرهای دور، سایر اعلام بارها در این مرحله فعال می‌شوند.',
    },
];

const initialAssignDialogState: AssignDialogState = {
    isOpen: false,
    entry: null,
    stage: 'stage1',
    loading: false,
    data: null,
    selectedAnnouncementId: '',
    assigning: false,
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

const normalizeProducts = (items?: string[] | null): string[] => {
    if (!items) return [];
    if (Array.isArray(items)) return items.filter(Boolean);
    return [];
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

const DispatchQueueManager: React.FC = () => {
    const [rows, setRows] = useState<RowEditor[]>(() =>
        presetCategories.flatMap(category => [
            createRow(category, 'far'),
            createRow(category, 'near'),
        ])
    );
    const [queueData, setQueueData] = useState<QueueGroup>({});
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeCategoryKey, setActiveCategoryKey] = useState(presetCategories[0]?.key || '');
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [positionEdits, setPositionEdits] = useState<Record<string, PositionEditState>>({});
    const [assignDialog, setAssignDialog] = useState<AssignDialogState>(initialAssignDialogState);
    const searchTimers = useRef<Record<string, { vehicle?: ReturnType<typeof setTimeout>; driver?: ReturnType<typeof setTimeout> }>>({});

    const token = useMemo(() => localStorage.getItem('token') || '', []);

    const headers = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }),
        [token]
    );

    const updateRow = (rowId: string, patch: Partial<RowEditor> | ((row: RowEditor) => RowEditor)) => {
        setRows(prev =>
            prev.map(row => {
                if (row.id !== rowId) return row;
                return typeof patch === 'function' ? patch(row) : { ...row, ...patch };
            })
        );
    };

    const fetchQueue = async () => {
        try {
            setLoadingQueue(true);
            const res = await fetch('http://localhost:3000/api/v1/dispatch/queue', { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as QueueGroup;
            setQueueData(data || {});
        } catch (error) {
            console.error('Failed to load queue', error);
            setQueueData({});
        } finally {
            setLoadingQueue(false);
        }
    };

    useEffect(() => {
        fetchQueue();
        return () => {
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
                `http://localhost:3000/api/v1/dispatch/search/vehicles?q=${encodeURIComponent(query)}`,
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
                `http://localhost:3000/api/v1/dispatch/search/drivers?q=${encodeURIComponent(query)}`,
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
            const res = await fetch('http://localhost:3000/api/v1/dispatch/queue', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    vehicleId: row.selectedVehicle.id,
                    driverId: row.selectedDriver.id,
                    vehicleCategory: row.categoryLabel || row.selectedVehicle.vehicleCategory || '',
                    queueType: row.queueType,
                    notes: row.notes || undefined,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            updateRow(rowId, () => ({
                ...createRow({ key: row.categoryKey, label: row.categoryLabel }, row.queueType),
                id: rowId,
            }));
            fetchQueue();
        } catch (error: any) {
            alert(error?.message || 'ثبت نوبت ناموفق بود.');
            updateRow(rowId, { submitting: false });
        }
    };

    const handleDeleteQueueEntry = async (id: string) => {
        if (!window.confirm('آیا از حذف این نوبت مطمئن هستید؟')) return;
        try {
            const res = await fetch(`http://localhost:3000/api/v1/dispatch/queue/${id}`, {
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

    const loadAssignData = async (
        entry: DispatchQueueEntry,
        targetStage: StageKey,
        options?: { forceStage2?: boolean }
    ) => {
        setAssignDialog(prev => ({
            ...prev,
            stage: targetStage,
            loading: true,
            selectedAnnouncementId: '',
        }));
        try {
            const params = new URLSearchParams({ stage: targetStage });
            const categoryLabel =
                entry.vehicleCategory ||
                entry.vehicle?.vehicleCategory ||
                entry.vehicle?.model ||
                '';
            const categoryKey = resolveCategoryKey(categoryLabel);
            if (categoryKey) {
                params.append('category', categoryKey);
            } else if (categoryLabel && categoryLabel !== 'نامشخص') {
                params.append('category', categoryLabel);
            }
            if (options?.forceStage2) {
                params.append('forceStage2', 'true');
            }
            const res = await fetch(
                `http://localhost:3000/api/v1/dispatch/assignments/candidates?${params.toString()}`,
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const payload = (await res.json()) as StageResponse;
            setAssignDialog(prev => ({
                ...prev,
                loading: false,
                data: payload,
                selectedAnnouncementId: '',
            }));
        } catch (error) {
            console.error('Failed to load assignment data', error);
            setAssignDialog(prev => ({
                ...prev,
                loading: false,
                data: null,
            }));
        }
    };

    const openAssignDialog = (entry: DispatchQueueEntry) => {
        const preferredStage: StageKey = entry.queueType === 'far' ? 'stage1' : 'stage2';
        setAssignDialog({
            ...initialAssignDialogState,
            isOpen: true,
            entry,
            stage: preferredStage,
            loading: true,
        });
        loadAssignData(entry, preferredStage);
    };

    const closeAssignDialog = () => {
        setAssignDialog(initialAssignDialogState);
    };

    const handleStageChange = (stage: StageKey) => {
        if (!assignDialog.entry) return;
        if (assignDialog.stage === stage) return;
        loadAssignData(assignDialog.entry, stage);
    };

    const handleForceStage2 = () => {
        if (!assignDialog.entry) return;
        loadAssignData(assignDialog.entry, 'stage2', { forceStage2: true });
    };

    const activeQueueEntry = useMemo<DispatchQueueEntry | null>(() => {
        if (!assignDialog.entry) return null;
        if (!assignDialog.data) return assignDialog.entry;
        return assignDialog.data.queue.find(item => item.id === assignDialog.entry!.id) || assignDialog.entry;
    }, [assignDialog.entry, assignDialog.data]);

    const sortedAnnouncements = useMemo(() => {
        if (!assignDialog.data) return [];
        const categoryLabel =
            activeQueueEntry?.vehicleCategory ||
            assignDialog.entry?.vehicleCategory ||
            null;
        const filtered = assignDialog.data.announcements.filter(item =>
            vehicleMatchesCategory(item.vehicleType, categoryLabel)
        );
        return [...filtered].sort(
            (a, b) => (b.route?.round_trip_km ?? 0) - (a.route?.round_trip_km ?? 0)
        );
    }, [assignDialog.data, activeQueueEntry, assignDialog.entry]);

    const categoryPendingCount = assignDialog.data?.pendingStage1Count ?? 0;
    const globalPendingCount = assignDialog.data?.globalPendingStage1Count ?? 0;
    const otherCategoryPending = categoryPendingCount === 0 && globalPendingCount > 0;

    const handleSelectAnnouncement = (announcementId: string) => {
        setAssignDialog(prev => ({
            ...prev,
            selectedAnnouncementId: announcementId,
        }));
    };

    const handleAssignConfirm = async () => {
        if (!assignDialog.entry || !assignDialog.data) return;
        const announcement = assignDialog.data.announcements.find(
            item => item.id === assignDialog.selectedAnnouncementId
        );
        if (!announcement) {
            alert('لطفاً یک اعلام بار را انتخاب کنید.');
            return;
        }

        if (!activeQueueEntry?.driverId || !activeQueueEntry?.vehicleId) {
            alert('اطلاعات راننده یا خودرو برای این نوبت کامل نیست.');
            return;
        }

        if (assignDialog.stage === 'stage1') {
            const blockedEntry = assignDialog.data.queue.find(item => item.id === assignDialog.entry!.id);
            if (blockedEntry?.blockedStage1) {
                alert('این راننده در مرحله اول مسدود است.');
                return;
            }
        }

        setAssignDialog(prev => ({
            ...prev,
            assigning: true,
        }));

        try {
            const res = await fetch('http://localhost:3000/api/v1/dispatch/assignments', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    stage: assignDialog.stage,
                    freightAnnouncementId: announcement.id,
                    destinationId: announcement.destination?.id || null,
                    driverId: activeQueueEntry.driverId,
                    vehicleId: activeQueueEntry.vehicleId,
                    queueEntryId: assignDialog.entry.id,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert('تخصیص با موفقیت انجام شد.');
            closeAssignDialog();
            fetchQueue();
        } catch (error: any) {
            console.error('Failed to assign freight', error);
            alert(error?.message || 'ثبت تخصیص ناموفق بود.');
            setAssignDialog(prev => ({
                ...prev,
                assigning: false,
            }));
        }
    };

    const stageQueueEntry = React.useMemo(() => {
        if (!assignDialog.entry || !assignDialog.data) return assignDialog.entry;
        return assignDialog.data.queue.find(item => item.id === assignDialog.entry!.id) || assignDialog.entry;
    }, [assignDialog.entry, assignDialog.data]);

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

    const orderedCategoryLabels = useMemo(() => {
        const extras = Object.keys(queueData || {}).filter(label => !presetLabels.includes(label));
        return [...presetLabels, ...extras];
    }, [queueData]);

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

    const renderQueueRow = (entry: DispatchQueueEntry) => {
        const vehicleCode = entry.vehicle?.vehicleCode || entry.vehicle?.model || '---';
        const driverName = entry.driver?.name || '---';
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

        return (
            <tr key={entry.id} className="border-b border-slate-100 last:border-0 text-[12px] text-slate-600">
                <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
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
                            className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-sm focus:border-sky-400 focus:ring-0"
                        />
                        {hasChanged && (
                            <button
                                onClick={() => handlePositionSubmit(entry)}
                                disabled={saving}
                                className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {saving ? '...' : 'ثبت'}
                            </button>
                        )}
                    </div>
                </td>
                <td className="px-2 py-2">{driverName}</td>
                <td className="px-2 py-2">{vehicleCode}</td>
                <td className="px-2 py-2 text-center">{mobile}</td>
                <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <button
                            onClick={() => openAssignDialog(entry)}
                            className="rounded-full bg-sky-600 px-2 py-1 text-[11px] text-white hover:bg-sky-700"
                        >
                            تخصیص بار
                        </button>
                        <button
                            onClick={() => handleDeleteQueueEntry(entry.id)}
                            className="rounded-full px-2 py-1 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                            حذف
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    const renderQueueList = (title: string, entries: DispatchQueueEntry[], type: 'far' | 'near') => {
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
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-right">
                            <thead className="text-[11px] text-slate-500 uppercase tracking-wide">
                                <tr className="border-b border-slate-200 bg-slate-50/80">
                                    <th className="px-2 py-2 text-center font-medium">ردیف</th>
                                    <th className="px-2 py-2 font-medium">نام راننده</th>
                                    <th className="px-2 py-2 font-medium">کد خودرو</th>
                                    <th className="px-2 py-2 text-center font-medium">شماره تماس</th>
                                <th className="px-2 py-2 text-center font-medium">اقدام</th>
                                </tr>
                            </thead>
                            <tbody>{entries.map(renderQueueRow)}</tbody>
                        </table>
                    </div>
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
            const res = await fetch(`http://localhost:3000/api/v1/dispatch/queue/${entry.id}/position`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ position: targetPosition }),
            });
            if (!res.ok) throw new Error(await res.text());

            setPositionEdits(prev => {
                const next = { ...prev };
                delete next[entry.id];
                return next;
            });
            fetchQueue();
        } catch (error: any) {
            console.error('Failed to update position', error);
            alert(error?.message || 'بروزرسانی ردیف انجام نشد.');
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
        return (
            <div key={label} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className={`inline-flex h-3 w-3 rounded-full ${dotClass}`}></span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] ${accentClass}`}>
                        {label}
                    </span>
                </div>
                {renderQueueList('نوبت مسیر دور', farEntries, 'far')}
                {renderQueueList('نوبت مسیر نزدیک', nearEntries, 'near')}
            </div>
        );
    };

    const renderFormSection = (queueType: 'far' | 'near', sectionRows: RowEditor[]) => (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">ثبت نوبت {queueTypeLabels[queueType]}</h3>
            </div>
            <div className="p-3 space-y-3">
                {sectionRows.length === 0 ? (
                    <div className="text-[12px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                        ردیفی برای این بخش ایجاد نشده است.
                    </div>
                ) : (
                    sectionRows.map(row => renderRowEditor(row, sectionRows.length, queueTypeLabels[queueType]))
                )}
            </div>
        </div>
    );

    const formatPlate = (plate?: DispatchVehicleSearchResult['plate']) => {
        if (!plate) return '';
        const parts = [plate.part1, plate.letter, plate.part2, plate.cityCode].filter(Boolean);
        return parts.join(' ');
    };

    const renderRowEditor = (row: RowEditor, siblingsCount: number, queueTypeLabel: string) => (
        <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-end text-xs text-slate-400">
                {siblingsCount > 1 && (
                    <button
                        onClick={() =>
                            setRows(prev => prev.filter(existing => existing.id !== row.id))
                        }
                        className="rounded-full border border-red-200 px-2 py-1 text-[11px] text-red-500 hover:bg-red-50"
                    >
                        حذف فرم
                    </button>
                )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="relative">
                    <label className="text-[11px] font-medium text-slate-600 bg-slate-100 inline-flex items-center px-2 py-1 rounded-md border border-slate-200">
                        جستجوی خودرو
                    </label>
                    <input
                        className="input-style mt-1 h-9 text-sm border-slate-200 focus:border-sky-400 focus:ring-sky-200/60"
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
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-sm max-h-48 overflow-auto text-xs">
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
                                    <div className="font-semibold text-slate-700">
                                        {result.vehicleCode || result.model || 'خودرو'}
                                    </div>
                                    <div className="text-slate-500">
                                        {[result.brand, result.model].filter(Boolean).join(' • ')}
                                    </div>
                                    {formatPlate(result.plate) && (
                                        <div className="text-slate-400">{formatPlate(result.plate)}</div>
                                    )}
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
                    <label className="text-[11px] font-medium text-slate-600 bg-slate-100 inline-flex items-center px-2 py-1 rounded-md border border-slate-200">
                        جستجوی راننده
                    </label>
                    <input
                        className="input-style mt-1 h-9 text-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-200/60"
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
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-sm max-h-48 overflow-auto text-xs">
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
                    <label className="text-[11px] font-medium text-slate-600 bg-slate-100 inline-flex items-center px-2 py-1 rounded-md border border-slate-200">
                        توضیحات (اختیاری)
                    </label>
                    <input
                        className="input-style mt-1 h-9 text-sm border-slate-200 focus:border-amber-400 focus:ring-amber-200/60"
                        value={row.notes}
                        onChange={e => updateRow(row.id, { notes: e.target.value })}
                        placeholder="توضیح کوتاه"
                    />
                </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">پس از انتخاب خودرو و راننده روی ذخیره کلیک کنید.</span>
                <button
                    onClick={() => handleRowSubmit(row.id)}
                    disabled={row.submitting}
                    className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                    {row.submitting ? 'در حال ذخیره...' : 'ذخیره نوبت'}
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
                            نوبت‌های مسیر دور و نزدیک به تفکیک نوع خودرو نمایش داده می‌شوند.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchQueue}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                        >
                            بروزرسانی
                        </button>
                        <button
                            onClick={() => {
                                setIsDrawerOpen(true);
                                if (!activeCategoryKey && presetCategories.length > 0) {
                                    setActiveCategoryKey(presetCategories[0].key);
                                }
                            }}
                            className="px-4 py-1.5 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700"
                        >
                            ثبت نوبت جدید
                        </button>
                    </div>
                </header>
                <div className="px-4 py-4">
                    {loadingQueue ? (
                        <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                    ) : orderedCategoryLabels.length === 0 ? (
                        <div className="py-10 text-center text-slate-400 text-sm">هنوز دسته‌ای برای نمایش وجود ندارد.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {orderedCategoryLabels.map(renderCategoryColumn)}
                        </div>
                    )}
                </div>
            </section>

            {isDrawerOpen && (
                <div
                    className="fixed inset-0 z-50 flex justify-center items-start bg-transparent pt-10"
                    onClick={() => setIsDrawerOpen(false)}
                >
                    <div
                        className="w-full max-w-[420px] max-h-[90vh] bg-slate-50 shadow-2xl flex flex-col rounded-2xl border border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                            <h2 className="text-lg font-semibold text-slate-800">ثبت نوبت</h2>
                            <button
                                onClick={() => setIsDrawerOpen(false)}
                                className="text-slate-500 hover:text-slate-700 text-sm"
                            >
                                بستن
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {presetCategories.map(category => (
                                    <button
                                        key={category.key}
                                        onClick={() => setActiveCategoryKey(category.key)}
                                        className={`px-3 py-1.5 rounded-full text-sm transition shadow-sm ${
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
                                <div className="py-10 text-center text-slate-500 text-sm">
                                    برای شروع یک نوع خودرو را انتخاب کنید.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {renderFormSection('far', activeFarRows)}
                                    {renderFormSection('near', activeNearRows)}
                                </div>
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
                            <div className="flex flex-wrap gap-2">
                                {stageOptions.map(option => {
                                    const isActive = assignDialog.stage === option.value;
                                    const isStage2Locked =
                                        option.value === 'stage2' &&
                                        assignDialog.data?.stage2Locked;
                                    const disabled = assignDialog.loading;
                                    const buttonClass = isActive
                                        ? 'bg-sky-600 text-white'
                                        : isStage2Locked
                                            ? 'border border-amber-300 text-amber-600 hover:bg-amber-50'
                                            : 'border border-sky-200 text-sky-600 hover:bg-sky-50';
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => handleStageChange(option.value)}
                                            className={`px-3 py-1.5 rounded-full text-sm transition ${buttonClass}`}
                                            disabled={disabled}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-1 text-xs text-slate-500">
                                <div>
                                    {stageOptions.find(option => option.value === assignDialog.stage)?.helper}
                                </div>
                                {categoryPendingCount > 0 && (
                                    <div className="text-amber-600">
                                        {categoryPendingCount} اعلام‌بار مسیر دور هنوز برای این دسته باقی مانده است.
                                    </div>
                                )}
                                {assignDialog.data?.stage2Locked && (
                                    <div className="flex flex-wrap items-center gap-2 text-amber-600">
                                        <span>برای ادامه، ابتدا مسیرهای دور را تخصیص دهید یا از اجازۀ دستی استفاده کنید.</span>
                                        <button
                                            onClick={handleForceStage2}
                                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700 hover:bg-amber-100"
                                            disabled={assignDialog.loading}
                                        >
                                            اجازه نمایش مرحله دوم
                                        </button>
                                    </div>
                                )}
                                {assignDialog.data?.stage2Forced && !assignDialog.data?.stage2Locked && assignDialog.stage === 'stage2' && (
                                    <div className="text-emerald-600">
                                        مرحله دوم با تایید دستی باز شده است؛ لطفاً پس از تخصیص، وضعیت مسیرهای دور را بررسی کنید.
                                    </div>
                                )}
                            </div>

                        {assignDialog.loading ? (
                            <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                        ) : !assignDialog.data ? (
                            <div className="py-10 text-center text-slate-400 text-sm">
                                اعلام باری برای این مرحله پیدا نشد.
                            </div>
                        ) : (
                            <>
                                {assignDialog.stage === 'stage1' &&
                                    assignDialog.data.queue.find(item => item.id === assignDialog.entry?.id)
                                        ?.blockedStage1 && (
                                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                            این راننده در مرحله اول مسدود است. برای تخصیص، از مرحله دوم استفاده کنید یا
                                            راننده دیگری را انتخاب کنید.
                                        </div>
                                    )}

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
                                                    {activeQueueEntry.longRouteHistory.length > 3 && (
                                                        <div className="text-slate-400">...</div>
                                                    )}
                                                </div>
                                            )}
                                    </div>

                                    <div className="space-y-3">
                                        {sortedAnnouncements.length === 0 ? (
                                            <div className="text-[12px] text-slate-500 text-center py-6 border border-dashed border-slate-200 rounded-xl space-y-2">
                                                {assignDialog.stage === 'stage2' && assignDialog.data?.stage2Locked ? (
                                                    <div className="space-y-2">
                                                        <div>
                                                            تا زمانی که اعلام‌بارهای مرحله اول باقی مانده‌اند، مرحله دوم فعال
                                                            نمی‌شود.
                                                        </div>
                                                        <div className="text-[11px] text-slate-400">
                                                            {categoryPendingCount} اعلام‌بار مسیر دور در انتظار تخصیص است.
                                                        </div>
                                                        {otherCategoryPending && (
                                                            <div className="text-[10px] text-slate-400">
                                                                مسیر دور دسته‌های دیگر نیز باقی مانده است.
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={handleForceStage2}
                                                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700 hover:bg-amber-100"
                                                            disabled={assignDialog.loading}
                                                        >
                                                            با تایید مدیر، مرحله دوم را نمایش بده
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>اعلام باری برای این مرحله موجود نیست.</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="overflow-auto border border-slate-200 rounded-xl">
                                                <table className="min-w-full text-right text-[11px]">
                                                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide">
                                                        <tr className="border-b border-slate-200">
                                                            <th className="px-2 py-2 text-right font-medium">نوع خط</th>
                                                            <th className="px-2 py-2 text-right font-medium">کد / مبدا → مقصد</th>
                                                            <th className="px-2 py-2 text-right font-medium">مسیر و مسافت</th>
                                                            <th className="px-2 py-2 text-right font-medium">اطلاعات مالی</th>
                                                            <th className="px-2 py-2 text-right font-medium">برند / اولویت</th>
                                                            <th className="px-2 py-2 text-right font-medium">محصولات</th>
                                                            <th className="px-2 py-2 text-right font-medium">توضیحات</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-slate-100">
                                        {sortedAnnouncements.map(item => {
                                                            const isSelected = assignDialog.selectedAnnouncementId === item.id;
                                                            const lineTypeClass =
                                                                (item.lineType && lineTypeBadgeStyles[item.lineType]) ||
                                                                'bg-slate-100 text-slate-600';
                                                            const priorityKey = (item.priority || '').toLowerCase();
                                                            const priorityClass =
                                                                priorityBadgeStyles[
                                                                    priorityKey === 'high'
                                                                        ? 'high'
                                                                        : priorityKey === 'low'
                                                                            ? 'low'
                                                                            : 'normal'
                                                                ] || 'bg-slate-100 text-slate-600';
                                                            const products = normalizeProducts(item.products);
                                                            const routeLabel = item.route?.route_category || 'مسیر';
                                                            const kmLabel = formatDistance(item.route?.round_trip_km);
                                                            const productsPreview =
                                                                products.length > 0
                                                                    ? products.slice(0, 3).join('، ') +
                                                                      (products.length > 3 ? '، ...' : '')
                                                                    : 'ثبت نشده';
                                                            const createdLabel = item.createdAt
                                                                ? new Date(item.createdAt).toLocaleDateString('fa-IR')
                                                                : '';

                                                            return (
                                                                <tr
                                                                    key={item.id}
                                                                    onClick={() => handleSelectAnnouncement(item.id)}
                                                                    className={`cursor-pointer transition text-[11px] ${
                                                                        isSelected
                                                                            ? 'bg-emerald-50 border-l-4 border-emerald-400'
                                                                            : 'hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    <td className="px-2 py-1.5 align-top">
                                                                        <div className="flex items-center justify-between gap-2 text-slate-700">
                                                                            <span className="font-semibold text-[11px]">
                                                                                {item.announcementCode || 'اعلام بار'}
                                                                            </span>
                                                                            {item.lineType && (
                                                                                <span
                                                                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${lineTypeClass}`}
                                                                                >
                                                                                    {item.lineType}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                            <td className="px-2 py-1.5 align-top text-slate-600">
                                                                <div className="font-medium text-slate-700 truncate max-w-[180px]">
                                                                    {item.destination?.city
                                                                        ? `از ${item.originCity || 'مبدا'} به ${item.destination?.city}`
                                                                        : `از ${item.originCity || 'مبدا'} به مقصد نامشخص`}
                                                                </div>
                                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                                                                    {item.vehicleType && <span>{item.vehicleType}</span>}
                                                                    {createdLabel && <span>{createdLabel}</span>}
                                                                </div>
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-slate-600">
                                                                        <div className="text-slate-600">{routeLabel}</div>
                                                                        {kmLabel && (
                                                                            <div className="mt-0.5 text-[10px] text-slate-400">{kmLabel}</div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-slate-600">
                                                                        <div className="text-[11px]">
                                                                            ارزش:{' '}
                                                                            <span className="font-semibold text-slate-700">
                                                                                {formatCurrencyToman(item.cargoValue)}
                                                                            </span>
                                                                        </div>
                                                                        {item.totalFreightCost != null && (
                                                                            <div className="mt-0.5 text-[10px] text-slate-500">
                                                                                کرایه:{' '}
                                                                                <span className="font-semibold text-slate-600">
                                                                                    {formatCurrencyToman(item.totalFreightCost)}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-slate-600">
                                                                        <div className="text-[11px] text-slate-600">
                                                                            {item.brand || <span className="text-slate-400">—</span>}
                                                                        </div>
                                                                        {item.priority && (
                                                                            <span
                                                                                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${priorityClass}`}
                                                                            >
                                                                                {item.priority}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-slate-600 whitespace-normal">
                                                                        <div className="text-[10px] text-slate-500 leading-4">
                                                                            {products.length > 0 ? productsPreview : '—'}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-2 py-1.5 align-top text-slate-500 whitespace-normal">
                                                                        <div className="text-[10px] leading-4">
                                                                            {item.notes || '—'}
                                                                        </div>
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
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <button
                                    onClick={() =>
                                        assignDialog.entry && loadAssignData(assignDialog.entry, assignDialog.stage)
                                    }
                                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-sm"
                                    disabled={assignDialog.loading}
                                >
                                    بروزرسانی لیست
                                </button>
                                {assignDialog.selectedAnnouncementId ? (
                                    <span className="text-emerald-600">
                                        اعلام بار انتخاب شده: {assignDialog.selectedAnnouncementId}
                                    </span>
                                ) : (
                                    <span>یک اعلام بار انتخاب کنید.</span>
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
                                    disabled={
                                        assignDialog.assigning ||
                                        !assignDialog.selectedAnnouncementId ||
                                        assignDialog.loading ||
                                        (assignDialog.stage === 'stage1' &&
                                            assignDialog.data?.queue.find(item => item.id === assignDialog.entry?.id)
                                                ?.blockedStage1)
                                    }
                                    className="px-4 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {assignDialog.assigning ? 'در حال ثبت...' : 'تایید تخصیص'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DispatchQueueManager;


