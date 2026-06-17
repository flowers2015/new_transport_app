import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FreightAnnouncement, FreightLineType } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import {
    LINE_TABS,
    filterLiveAnnouncements,
    formatDestinations,
    formatLineType,
    formatLoadingDate,
    formatStatus,
    matchesLineTab,
    normalizeAnnouncement,
} from './viewerUtils';

const ViewerFreightLive: React.FC = () => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
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
            if (!res.ok) throw new Error('خطا در دریافت اعلام بارهای زنده');
            const raw = await res.json();
            const list = Array.isArray(raw) ? raw : raw?.data || [];
            const normalized = list.map((item: Record<string, unknown>) =>
                normalizeAnnouncement(item)
            );
            setAnnouncements(filterLiveAnnouncements(normalized));
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
        const timer = setInterval(() => load(true), 30000);
        return () => clearInterval(timer);
    }, [load]);

    const rows = useMemo(
        () => announcements.filter(a => matchesLineTab(a, activeLine)),
        [announcements, activeLine]
    );

    if (loading) {
        return <div className="text-center p-8 text-slate-500">در حال بارگذاری...</div>;
    }
    if (error) {
        return <div className="text-center p-8 text-red-600">{error}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">پیگیری اعلام بار زنده</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        فقط مشاهده — بدون امکان تخصیص یا ویرایش
                        {lastUpdated && (
                            <span className="mr-2">
                                · آخرین بروزرسانی: {lastUpdated.toLocaleTimeString('fa-IR')}
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
                                ? 'bg-sky-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {tab.label}
                        <span className="mr-2 text-xs opacity-80">
                            ({announcements.filter(a => matchesLineTab(a, tab.key)).length})
                        </span>
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                    <thead className="bg-slate-50 text-slate-600">
                        <tr>
                            <th className="p-2 text-right font-medium">کد</th>
                            <th className="p-2 text-right font-medium">تاریخ بارگیری</th>
                            <th className="p-2 text-right font-medium">وضعیت</th>
                            <th className="p-2 text-right font-medium">نوع خودرو</th>
                            <th className="p-2 text-right font-medium">مقاصد</th>
                            <th className="p-2 text-right font-medium">راننده</th>
                            <th className="p-2 text-right font-medium">پلاک</th>
                            <th className="p-2 text-right font-medium">بارنامه</th>
                            <th className="p-2 text-right font-medium">خط</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-6 text-center text-slate-500">
                                    موردی برای نمایش نیست
                                </td>
                            </tr>
                        ) : (
                            rows.map(ann => (
                                <tr key={ann.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                                    <td className="p-2 font-mono text-xs">{ann.announcementCode || '—'}</td>
                                    <td className="p-2">{formatLoadingDate(ann.loadingDate)}</td>
                                    <td className="p-2">{formatStatus(ann.status)}</td>
                                    <td className="p-2">{ann.vehicleType || '—'}</td>
                                    <td className="p-2 max-w-[200px]">{formatDestinations(ann)}</td>
                                    <td className="p-2">{ann.assignedDriverName || '—'}</td>
                                    <td className="p-2 font-mono text-xs ltr text-left">
                                        {ann.assignedVehiclePlate || '—'}
                                    </td>
                                    <td className="p-2 font-mono text-xs">{ann.billOfLadingNumber || '—'}</td>
                                    <td className="p-2">{formatLineType(ann.lineType)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ViewerFreightLive;
