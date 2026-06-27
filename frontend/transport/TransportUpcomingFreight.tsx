import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FreightAnnouncement, FreightLineType } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalaliDateTime } from '../utils/jalali';
import {
    formatRepresentativeType,
    getDestinationCitiesLabel,
    getRepresentativeNameLabel,
} from '../utils/freightDisplay';
import {
    LINE_TABS,
    PRIORITY_LABELS,
    isPendingManagerApproval,
    matchesLineTab,
    normalizeUpcomingAnnouncement,
    summarizeVehicleTypes,
    totalTonnage,
    getCreatorDisplayName,
} from './upcomingFreightUtils';

const DestinationsList: React.FC<{ ann: FreightAnnouncement }> = ({ ann }) => (
    <div className="flex flex-col text-xs space-y-1 min-w-[280px]">
        {(ann.destinations || []).map((d, i) => (
            <div key={d.id || i} className="flex flex-wrap items-center gap-2">
                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                    {i + 1}
                </span>
                <span className="font-semibold text-slate-800">{d.city}</span>
                {d.tonnage != null && (
                    <span className="text-slate-500">
                        ({Number(d.tonnage).toLocaleString('fa-IR')} kg)
                    </span>
                )}
                {d.deliveryDate && <span className="text-green-700">{d.deliveryDate}</span>}
                {d.unloadTime && <span className="text-blue-700">{d.unloadTime}</span>}
                {d.representativeType && (
                    <span className="text-purple-700">
                        {formatRepresentativeType(d.representativeType)}
                    </span>
                )}
            </div>
        ))}
    </div>
);

const TransportUpcomingFreight: React.FC = () => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    const [filter, setFilter] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl('freight-announcements'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('خطا در دریافت اعلام بارها');
            const raw = await res.json();
            const list = Array.isArray(raw) ? raw : raw?.data || [];
            const pending = list
                .map((item: Record<string, unknown>) => normalizeUpcomingAnnouncement(item))
                .filter(isPendingManagerApproval);
            setAnnouncements(pending);
            setLastUpdated(new Date());
        } catch (e) {
            if (!silent) {
                setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
        const timer = setInterval(() => load(true), 60000);
        return () => clearInterval(timer);
    }, [load]);

    const tabAnnouncements = useMemo(
        () => announcements.filter(a => matchesLineTab(a, activeLine)),
        [announcements, activeLine]
    );

    const rows = useMemo(() => {
        let data = tabAnnouncements;
        if (filter.trim()) {
            const q = filter.trim().toLowerCase();
            data = data.filter(
                a =>
                    getCreatorDisplayName(a).toLowerCase().includes(q) ||
                    (a.vehicleType || '').toLowerCase().includes(q) ||
                    (a.destinations || []).some(d =>
                        String(d.city || '')
                            .toLowerCase()
                            .includes(q)
                    )
            );
        }
        return [...data].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [tabAnnouncements, filter]);

    const vehicleSummary = useMemo(() => summarizeVehicleTypes(rows), [rows]);

    const tabCounts = useMemo(
        () =>
            LINE_TABS.reduce(
                (acc, tab) => {
                    acc[tab.key] = announcements.filter(a => matchesLineTab(a, tab.key)).length;
                    return acc;
                },
                {} as Record<FreightLineType, number>
            ),
        [announcements]
    );

    if (loading) {
        return <div className="text-center p-8 text-slate-500">در حال بارگذاری...</div>;
    }
    if (error) {
        return <div className="text-center p-8 text-red-600">{error}</div>;
    }

    const isIceCream = activeLine === FreightLineType.IceCream;

    return (
        <div className="max-w-[1600px] mx-auto space-y-4" dir="rtl">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">اعلام بار بعدی</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        بارهایی که کارشناس برنامه‌ریزی ثبت کرده و در انتظار تایید مدیر هستند —
                        <span className="text-amber-700 font-medium mr-1">فقط مشاهده</span>
                        برای برنامه‌ریزی تهیه خودرو
                        {lastUpdated && (
                            <span className="mr-2 text-xs">
                                · بروزرسانی: {lastUpdated.toLocaleTimeString('fa-IR')}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => load(false)}
                    className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
                >
                    بروزرسانی
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {LINE_TABS.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveLine(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeLine === tab.key
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {tab.label}
                        <span className="mr-2 text-xs opacity-90">
                            ({tabCounts[tab.key] || 0})
                        </span>
                    </button>
                ))}
            </div>

            {Object.keys(vehicleSummary).length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                    <span className="font-medium text-emerald-900">خلاصه نوع خودرو (این تب): </span>
                    {Object.entries(vehicleSummary)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                            <span
                                key={type}
                                className="inline-flex items-center gap-1 ml-3 mt-1 bg-white border border-emerald-200 rounded-full px-2.5 py-0.5 text-emerald-800"
                            >
                                {type}
                                <strong className="text-emerald-900">{count}</strong>
                            </span>
                        ))}
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-center">
                <input
                    className="border rounded-md px-3 py-2 text-sm w-full max-w-md"
                    placeholder="جستجو: اعلام‌کننده، نوع خودرو، مقصد..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <span className="text-xs text-slate-500">
                    {rows.length.toLocaleString('fa-IR')} مورد در این تب
                </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                        <tr>
                            <th className="p-2 text-right font-medium w-12">ردیف</th>
                            <th className="p-2 text-right font-medium">کارمند اعلام‌کننده</th>
                            <th className="p-2 text-right font-medium">نوع خودرو</th>
                            {isIceCream ? (
                                <>
                                    <th className="p-2 text-right font-medium">نوع نماینده</th>
                                    <th className="p-2 text-right font-medium">مقصد</th>
                                    <th className="p-2 text-right font-medium">نام نماینده</th>
                                    <th className="p-2 text-right font-medium">مبدا</th>
                                    <th className="p-2 text-right font-medium">برند</th>
                                    <th className="p-2 text-right font-medium">محصولات</th>
                                    <th className="p-2 text-right font-medium">کارتن</th>
                                    <th className="p-2 text-right font-medium">پالت</th>
                                    <th className="p-2 text-right font-medium">اولویت</th>
                                    <th className="p-2 text-right font-medium">تاریخ تحویل</th>
                                </>
                            ) : (
                                <>
                                    <th className="p-2 text-right font-medium">مبدا بارگیری</th>
                                    <th className="p-2 text-right font-medium">برند</th>
                                    <th className="p-2 text-right font-medium">کل تناژ</th>
                                    <th className="p-2 text-right font-medium">مقاصد</th>
                                    <th className="p-2 text-right font-medium">ساعت حضور</th>
                                </>
                            )}
                            <th className="p-2 text-right font-medium">ارزش بار</th>
                            <th className="p-2 text-right font-medium">تاریخ اعلام</th>
                            <th className="p-2 text-right font-medium">توضیحات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={isIceCream ? 16 : 12}
                                    className="p-8 text-center text-slate-500"
                                >
                                    اعلام باری در انتظار تایید مدیر برای این خط نیست
                                </td>
                            </tr>
                        ) : (
                            rows.map((ann, idx) => (
                                <tr
                                    key={ann.id}
                                    className="border-t border-slate-100 hover:bg-amber-50/40 align-top"
                                >
                                    <td className="p-2 text-slate-500">{idx + 1}</td>
                                    <td className="p-2 text-slate-800 whitespace-nowrap">
                                        {getCreatorDisplayName(ann)}
                                    </td>
                                    <td className="p-2 font-medium text-slate-800 whitespace-nowrap">
                                        {ann.vehicleType || '—'}
                                    </td>
                                    {isIceCream ? (
                                        <>
                                            <td className="p-2">
                                                {formatRepresentativeType(ann.representativeType)}
                                            </td>
                                            <td className="p-2 text-blue-700 font-semibold">
                                                {getDestinationCitiesLabel(ann)}
                                            </td>
                                            <td className="p-2">{getRepresentativeNameLabel(ann)}</td>
                                            <td className="p-2">{ann.originCity || '—'}</td>
                                            <td className="p-2">{ann.brand || '—'}</td>
                                            <td className="p-2 max-w-[160px]">
                                                {ann.products?.join('، ') || '—'}
                                            </td>
                                            <td className="p-2">{ann.cartonCount ?? '—'}</td>
                                            <td className="p-2">{ann.palletCount ?? '—'}</td>
                                            <td className="p-2">
                                                {PRIORITY_LABELS[ann.priority || 'normal'] ||
                                                    ann.priority ||
                                                    '—'}
                                            </td>
                                            <td className="p-2">{ann.deliveryDate || '—'}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-2">{ann.originCity || '—'}</td>
                                            <td className="p-2">{ann.brand || '—'}</td>
                                            <td className="p-2">
                                                {totalTonnage(ann).toLocaleString('fa-IR')} kg
                                            </td>
                                            <td className="p-2">
                                                <DestinationsList ann={ann} />
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                {ann.platformArrivalTime || '—'}
                                            </td>
                                        </>
                                    )}
                                    <td className="p-2 whitespace-nowrap">
                                        {(ann.cargoValue ?? 0).toLocaleString('fa-IR')}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-xs">
                                        {formatJalaliDateTime(ann.createdAt)}
                                    </td>
                                    <td className="p-2 max-w-[200px] text-xs text-slate-600">
                                        {ann.notes || '—'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TransportUpcomingFreight;
