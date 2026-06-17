import React, { useCallback, useEffect, useState } from 'react';
import { FreightAnnouncement, FreightLineType } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import {
    LINE_TABS,
    formatDestinations,
    formatLineType,
    formatLoadingDate,
    formatStatus,
    normalizeAnnouncement,
} from './viewerUtils';

const ViewerFreightArchive: React.FC = () => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    const [filterDate, setFilterDate] = useState('');
    const [filterDestination, setFilterDestination] = useState('');
    const [filterBillOfLading, setFilterBillOfLading] = useState('');
    const [filterDriverName, setFilterDriverName] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const fetchHistory = useCallback(
        async (
            page = 1,
            filters?: {
                date?: string;
                destination?: string;
                billOfLading?: string;
                driverName?: string;
            }
        ) => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const date = filters?.date ?? filterDate;
                const destination = filters?.destination ?? filterDestination;
                const billOfLading = filters?.billOfLading ?? filterBillOfLading;
                const driverName = filters?.driverName ?? filterDriverName;

                const params = new URLSearchParams();
                if (date.trim()) params.append('date', date.trim());
                if (destination.trim()) params.append('destination', destination.trim());
                if (billOfLading.trim()) params.append('billOfLading', billOfLading.trim());
                if (driverName.trim()) params.append('driverName', driverName.trim());
                params.append('lineType', activeLine);
                params.append('page', String(page));
                params.append('limit', String(itemsPerPage));

                const url = getApiUrl(`freight-announcements/history?${params.toString()}`);
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('خطا در دریافت آرشیو اعلام بار');

                const body = await res.json();
                let historyRaw: Record<string, unknown>[] = [];
                if (body && typeof body === 'object' && 'data' in body) {
                    historyRaw = body.data || [];
                    setTotalCount(body.pagination?.total || historyRaw.length);
                    setTotalPages(body.pagination?.totalPages || 1);
                } else if (Array.isArray(body)) {
                    historyRaw = body;
                    setTotalCount(body.length);
                    setTotalPages(1);
                }

                setAnnouncements(historyRaw.map(item => normalizeAnnouncement(item)));
                setCurrentPage(page);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
            } finally {
                setLoading(false);
            }
        },
        [activeLine, filterDate, filterDestination, filterBillOfLading, filterDriverName, itemsPerPage]
    );

    useEffect(() => {
        setCurrentPage(1);
        fetchHistory(1);
    }, [activeLine]);

    const handleSearch = () => {
        setCurrentPage(1);
        fetchHistory(1);
    };

    const handleClear = () => {
        setFilterDate('');
        setFilterDestination('');
        setFilterBillOfLading('');
        setFilterDriverName('');
        setCurrentPage(1);
        fetchHistory(1, { date: '', destination: '', billOfLading: '', driverName: '' });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-slate-800">آرشیو اعلام بار</h2>
                <p className="text-xs text-slate-500 mt-1">فقط مشاهده — جستجو و مرور سوابق</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {LINE_TABS.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveLine(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeLine === tab.key
                                ? 'bg-violet-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="text-sm block">
                    تاریخ بارگیری (شمسی)
                    <input
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="1403/10/15"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                    />
                </label>
                <label className="text-sm block">
                    مقصد
                    <input
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={filterDestination}
                        onChange={e => setFilterDestination(e.target.value)}
                    />
                </label>
                <label className="text-sm block">
                    شماره بارنامه
                    <input
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={filterBillOfLading}
                        onChange={e => setFilterBillOfLading(e.target.value)}
                    />
                </label>
                <label className="text-sm block">
                    نام راننده
                    <input
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={filterDriverName}
                        onChange={e => setFilterDriverName(e.target.value)}
                    />
                </label>
                <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleSearch}
                        className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm"
                    >
                        جستجو
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="px-4 py-2 rounded-md border border-slate-300 text-sm"
                    >
                        پاک کردن فیلترها
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center p-8 text-slate-500">در حال بارگذاری...</div>
            ) : error ? (
                <div className="text-center p-8 text-red-600">{error}</div>
            ) : (
                <>
                    <div className="text-xs text-slate-500">
                        {totalCount.toLocaleString('fa-IR')} رکورد · صفحه {currentPage} از{' '}
                        {totalPages || 1}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                        <table className="w-full text-sm min-w-[1000px]">
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
                                {announcements.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="p-6 text-center text-slate-500">
                                            موردی یافت نشد
                                        </td>
                                    </tr>
                                ) : (
                                    announcements.map(ann => (
                                        <tr
                                            key={ann.id}
                                            className="border-t border-slate-100 hover:bg-slate-50/80"
                                        >
                                            <td className="p-2 font-mono text-xs">
                                                {ann.announcementCode || '—'}
                                            </td>
                                            <td className="p-2">{formatLoadingDate(ann.loadingDate)}</td>
                                            <td className="p-2">{formatStatus(ann.status)}</td>
                                            <td className="p-2">{ann.vehicleType || '—'}</td>
                                            <td className="p-2 max-w-[220px]">
                                                {formatDestinations(ann)}
                                            </td>
                                            <td className="p-2">{ann.assignedDriverName || '—'}</td>
                                            <td className="p-2 font-mono text-xs ltr text-left">
                                                {ann.assignedVehiclePlate || '—'}
                                            </td>
                                            <td className="p-2 font-mono text-xs">
                                                {ann.billOfLadingNumber || '—'}
                                            </td>
                                            <td className="p-2">{formatLineType(ann.lineType)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm">
                                <span>تعداد در صفحه:</span>
                                <select
                                    className="border rounded-md px-2 py-1"
                                    value={itemsPerPage}
                                    onChange={e => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                        setTimeout(() => fetchHistory(1), 0);
                                    }}
                                >
                                    {[25, 50, 100].map(n => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() => fetchHistory(currentPage - 1)}
                                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                                >
                                    قبلی
                                </button>
                                <button
                                    type="button"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => fetchHistory(currentPage + 1)}
                                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                                >
                                    بعدی
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ViewerFreightArchive;
