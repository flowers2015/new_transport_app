import React, { useEffect, useMemo, useState } from 'react';
import { getApiUrl, getAuthHeaders } from '../utils/apiConfig';
import {
    DAIRY_ARRANGEMENT_VEHICLE_TYPES,
    DAIRY_VEHICLE_SOFT_CAPACITY_KG,
} from '../utils/dairyRouteArrangement';
import {
    DairyRouteSuggestion,
    DairySuggestionApiResponse,
    DairySuggestionStop,
} from '../utils/dairyRouteSuggestions';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    seedCities: string[];
    seedTonnageKg: number;
    seedStopCount: number;
    seedDestinationIds: string[];
    seedStops: DairySuggestionStop[];
    initialVehicleType: string;
    candidates: Array<{
        announcementId: string;
        announcementCode: string;
        destinationId: string;
        city: string;
        tonnage: number;
        representativeType?: string | null;
        representativeName?: string | null;
    }>;
    onConfirm: (suggestion: DairyRouteSuggestion, vehicleType: string) => void;
    isApplying?: boolean;
};

const scoreBadge = (score: number) => {
    if (score >= 90) return 'bg-black text-white';
    if (score >= 70) return 'bg-red-700 text-white';
    if (score >= 50) return 'bg-stone-700 text-white';
    return 'bg-stone-200 text-black';
};

const kindLabel = (kind?: string) => {
    if (kind === 'repair_remove') return 'اصلاح · ردیف جدید';
    if (kind === 'repair_replace') return 'اصلاح · جابجایی';
    return 'افزودن';
};

const DairyRouteSuggestionDialog: React.FC<Props> = ({
    isOpen,
    onClose,
    seedCities,
    seedTonnageKg,
    seedStopCount,
    seedDestinationIds,
    seedStops,
    initialVehicleType,
    candidates,
    onConfirm,
    isApplying = false,
}) => {
    const [vehicleType, setVehicleType] = useState(initialVehicleType || 'ده چرخ');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<DairyRouteSuggestion[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [meta, setMeta] = useState<{
        divergent?: boolean;
        keepCities?: string[];
        outlierCities?: string[];
    }>({});

    const capacityKg = DAIRY_VEHICLE_SOFT_CAPACITY_KG[vehicleType] ?? 14000;

    useEffect(() => {
        if (!isOpen) return;
        setVehicleType(initialVehicleType || 'ده چرخ');
        setSelectedId(null);
        setError(null);
        setMeta({});
    }, [isOpen, initialVehicleType]);

    const candidatesKey = useMemo(
        () =>
            candidates
                .map((c) => c.destinationId)
                .sort()
                .join('|'),
        [candidates]
    );

    const seedStopsKey = useMemo(
        () => seedStops.map((s) => s.destinationId).join('|'),
        [seedStops]
    );

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(getApiUrl('freight-announcements/dairy-route-suggestions'), {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        vehicleType,
                        seedCities,
                        seedTonnageKg,
                        seedStopCount,
                        seedDestinationIds,
                        seedStops,
                        candidates,
                    }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'خطا در دریافت پیشنهادها');
                }
                const data = (await res.json()) as DairySuggestionApiResponse;
                if (cancelled) return;
                setSuggestions(data.suggestions || []);
                setSelectedId(data.suggestions?.[0]?.id ?? null);
                setMeta({
                    divergent: data.divergent,
                    keepCities: data.keepCities,
                    outlierCities: data.outlierCities,
                });
            } catch (e: any) {
                if (!cancelled) {
                    setSuggestions([]);
                    setSelectedId(null);
                    setError(e?.message || 'خطا در دریافت پیشنهادها');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isOpen,
        vehicleType,
        seedCities.join('|'),
        seedTonnageKg,
        seedStopCount,
        seedDestinationIds.join('|'),
        candidatesKey,
        seedStopsKey,
    ]);

    const selected = useMemo(
        () => suggestions.find((s) => s.id === selectedId) || null,
        [suggestions, selectedId]
    );

    if (!isOpen) return null;

    const emptyMessage = () => {
        if (meta.divergent && (meta.outlierCities?.length || 0) > 0) {
            return 'پیشنهاد اصلاحی ساخته نشد. شهرهای ناهم‌خوان را دستی جابجا کنید.';
        }
        if (seedStopCount >= 4) {
            return 'این ردیف پر است و از نظر محور هم‌خوان است؛ مقصدی برای افزودن نیست.';
        }
        return 'پیشنهادی با محور مشترک و ظرفیت این خودرو پیدا نشد.';
    };

    const footerSummary = (s: DairyRouteSuggestion) => {
        const removeCount = s.removeStops?.length || 0;
        const addCount = s.stops?.length || 0;
        const parts: string[] = [];
        if (removeCount) parts.push(`جدا به ردیف جدید ${removeCount.toLocaleString('fa-IR')}`);
        if (addCount) parts.push(`افزودن ${addCount.toLocaleString('fa-IR')}`);
        if (!parts.length) parts.push('بدون تغییر مقصد');
        return `${parts.join(' · ')} · جمع ${s.totalTonnageKg.toLocaleString('fa-IR')} kg`;
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3" dir="rtl">
            <div className="bg-stone-50 border-2 border-black rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <header className="px-4 py-3 border-b-2 border-black flex items-start gap-2 shrink-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-black text-black">پیشنهاد ترکیب مسیر</h3>
                        <p className="text-xs text-black font-semibold mt-0.5">
                            مبدأ ردیف: {seedCities.join('، ') || '—'} · تناژ فعلی:{' '}
                            {seedTonnageKg.toLocaleString('fa-IR')} kg
                        </p>
                        {meta.divergent && (meta.outlierCities?.length || 0) > 0 && (
                            <p className="text-[11px] font-bold text-red-700 mt-1">
                                چینش ناهم‌خوان: حذف پیشنهادی «{(meta.outlierCities || []).join('، ')}» · نگه داشتن «
                                {(meta.keepCities || []).join('، ')}»
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isApplying}
                        className="text-sm font-bold border-2 border-black px-2 py-0.5 rounded hover:bg-red-50"
                    >
                        بستن
                    </button>
                </header>

                <div className="px-4 py-3 border-b border-black/30 flex flex-wrap items-center gap-2 shrink-0">
                    <label className="text-xs font-black text-black">نوع خودرو</label>
                    <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        disabled={loading || isApplying}
                        className="text-sm border-2 border-black rounded px-2 py-1 font-bold bg-white"
                    >
                        {DAIRY_ARRANGEMENT_VEHICLE_TYPES.map((vt) => (
                            <option key={vt} value={vt}>
                                {vt} ({(DAIRY_VEHICLE_SOFT_CAPACITY_KG[vt] || 0).toLocaleString('fa-IR')} kg)
                            </option>
                        ))}
                    </select>
                    <span className="text-xs font-bold text-black mr-auto">
                        سقف: {capacityKg.toLocaleString('fa-IR')} kg · کاندید:{' '}
                        {candidates.length.toLocaleString('fa-IR')} مقصد
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {loading && (
                        <p className="text-sm font-bold text-black py-8 text-center">در حال ساخت پیشنهاد...</p>
                    )}
                    {!loading && error && (
                        <p className="text-sm font-bold text-red-700 py-4 text-center">{error}</p>
                    )}
                    {!loading && !error && suggestions.length === 0 && (
                        <p className="text-sm font-bold text-black py-8 text-center">{emptyMessage()}</p>
                    )}
                    {!loading &&
                        suggestions.map((s) => {
                            const over = s.totalTonnageKg > s.capacityKg;
                            const active = selectedId === s.id;
                            const removes = s.removeStops || [];
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSelectedId(s.id)}
                                    className={`w-full text-right rounded border-2 p-3 transition-colors ${
                                        active
                                            ? 'border-red-600 bg-white ring-2 ring-red-600'
                                            : 'border-black bg-stone-100 hover:border-red-700'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${scoreBadge(s.score)}`}>
                                            امتیاز {s.score}
                                        </span>
                                        <span className="text-[10px] font-black border border-black px-1.5 py-0.5 rounded bg-white">
                                            {kindLabel(s.kind)}
                                        </span>
                                        {s.axisCode && (
                                            <span className="text-[10px] font-bold border border-black px-1 rounded">
                                                {s.axisCode}
                                            </span>
                                        )}
                                        <span
                                            className={`text-xs font-black ${
                                                over ? 'text-red-700' : 'text-black'
                                            }`}
                                        >
                                            {s.totalTonnageKg.toLocaleString('fa-IR')} /{' '}
                                            {s.capacityKg.toLocaleString('fa-IR')} kg
                                            {over ? ' (بیش از سقف)' : ''}
                                        </span>
                                    </div>
                                    <p className="text-xs font-semibold text-black mb-1">{s.reason}</p>
                                    {removes.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-1">
                                            {removes.map((st) => (
                                                <span
                                                    key={`rm-${st.destinationId}`}
                                                    className="text-[10px] font-bold border border-red-700 text-red-800 rounded px-1.5 py-0.5 bg-red-50"
                                                >
                                                    حذف → ردیف جدید · {st.city} · {(st.tonnage || 0).toLocaleString('fa-IR')}kg
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {s.stops.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {s.stops.map((st) => (
                                                <span
                                                    key={st.destinationId}
                                                    className="text-[10px] font-bold border border-black/60 rounded px-1.5 py-0.5 bg-white"
                                                >
                                                    + {st.city} · {(st.tonnage || 0).toLocaleString('fa-IR')}kg
                                                    {st.announcementCode ? ` · #${st.announcementCode}` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                </div>

                <footer className="px-4 py-3 border-t-2 border-black flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        disabled={!selected || isApplying || loading}
                        onClick={() => selected && onConfirm(selected, vehicleType)}
                        className="text-sm px-4 py-1.5 rounded border-2 border-black bg-black text-white font-black hover:bg-red-700 disabled:opacity-40"
                    >
                        {isApplying ? 'در حال اعمال...' : 'تأیید و ست کردن روی ردیف'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isApplying}
                        className="text-sm px-3 py-1.5 rounded border-2 border-black font-bold hover:bg-stone-200"
                    >
                        انصراف
                    </button>
                    {selected && (
                        <span className="text-xs font-bold text-black mr-auto">{footerSummary(selected)}</span>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default DairyRouteSuggestionDialog;
