import React, { useMemo, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { getDefaultJalaliCycleRange } from '../utils/jalaliCycleRange';

type CalcBasis = 'assignment' | 'finance';
type VehicleCategoryFilter = '' | 'کشنده' | 'ده چرخ';

type DriverTrip = {
    announcementId: string;
    loadingDate?: string | null;
    originCity?: string | null;
    originLabel?: string | null;
    destinations?: string | null;
    assignedAtJalali?: string | null;
    km?: number | null;
    distanceBucket?: 'veryFar' | 'far' | 'near' | string | null;
    vehicleCategory?: string | null;
    basisDate?: string | null;
};

type DriverRow = {
    driverId: string;
    driverName: string;
    employeeId?: string | null;
    vehicleCategory?: string | null;
    periodKm: number;
    veryFarCount: number;
    farCount: number;
    nearCount: number;
    trips?: DriverTrip[];
};

type SortKey = 'driver' | 'periodKm' | 'veryFarCount' | 'farCount' | 'nearCount' | 'vehicleCategory';

const bucketLabel = (b?: string | null) => {
    if (b === 'veryFar') return 'خیلی‌دور';
    if (b === 'far') return 'دور';
    if (b === 'near') return 'نزدیک';
    return '—';
};

const parseJalaliDate = (dateStr: string) => {
    const parts = dateStr.replace(/-/g, '/').split('/');
    return {
        year: parseInt(parts[0], 10) || 1404,
        month: parseInt(parts[1], 10) || 1,
        day: parseInt(parts[2], 10) || 1,
    };
};

const CompanyDriverPerformanceTab: React.FC = () => {
    const defaults = useMemo(() => getDefaultJalaliCycleRange(), []);
    const [startDate, setStartDate] = useState(defaults.fromSlash);
    const [endDate, setEndDate] = useState(defaults.toSlash);
    const [basis, setBasis] = useState<CalcBasis>('assignment');
    const [vehicleCategory, setVehicleCategory] = useState<VehicleCategoryFilter>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<DriverRow[]>([]);
    const [detailDriver, setDetailDriver] = useState<DriverRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [sortKey, setSortKey] = useState<SortKey>('driver');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [filterDriver, setFilterDriver] = useState('');

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'driver' || key === 'vehicleCategory' ? 'asc' : 'desc');
        }
    };

    const sortMark = (key: SortKey) => {
        if (sortKey !== key) return ' ↕';
        return sortDir === 'asc' ? ' ↑' : ' ↓';
    };

    const buildParams = (extra?: Record<string, string>) => {
        const startParts = parseJalaliDate(startDate);
        const endParts = parseJalaliDate(endDate);
        const params = new URLSearchParams({
            startYear: String(startParts.year),
            startMonth: String(startParts.month),
            startDay: String(startParts.day),
            endYear: String(endParts.year),
            endMonth: String(endParts.month),
            endDay: String(endParts.day),
            basis,
            ...(vehicleCategory ? { vehicleCategory } : {}),
            ...extra,
        });
        return params;
    };

    const fetchList = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            const res = await fetch(
                getApiUrl(`freight-announcements/company-driver-performance?${buildParams()}`),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (!res.ok) throw new Error(await res.text());
            const json = await res.json();
            setDrivers(json.drivers || []);
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'خطا در دریافت گزارش');
            setDrivers([]);
        } finally {
            setLoading(false);
        }
    };

    const openDetail = async (row: DriverRow) => {
        setDetailLoading(true);
        setDetailDriver({ ...row, trips: row.trips || [] });
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                getApiUrl(
                    `freight-announcements/company-driver-performance?${buildParams({
                        driverId: row.driverId,
                        includeTrips: '1',
                    })}`
                ),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (!res.ok) throw new Error(await res.text());
            const json = await res.json();
            const full = (json.drivers || [])[0] as DriverRow | undefined;
            setDetailDriver(full || row);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const displayedDrivers = useMemo(() => {
        let list = [...drivers];
        const q = filterDriver.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (d) =>
                    (d.driverName || '').toLowerCase().includes(q) ||
                    String(d.employeeId || '').toLowerCase().includes(q)
            );
        }

        const dir = sortDir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            if (sortKey === 'driver') {
                const ea = String(a.employeeId || '');
                const eb = String(b.employeeId || '');
                if (ea !== eb) return ea.localeCompare(eb, 'fa', { numeric: true }) * dir;
                return String(a.driverName || '').localeCompare(String(b.driverName || ''), 'fa') * dir;
            }
            if (sortKey === 'vehicleCategory') {
                return String(a.vehicleCategory || '').localeCompare(String(b.vehicleCategory || ''), 'fa') * dir;
            }
            const ka = Number((a as any)[sortKey] || 0);
            const kb = Number((b as any)[sortKey] || 0);
            return (ka - kb) * dir;
        });
        return list;
    }, [drivers, filterDriver, sortKey, sortDir]);

    return (
        <div className="space-y-3 max-w-5xl mx-auto">
            <div className="bg-white rounded-lg shadow p-3 space-y-3">
                <div className="text-center">
                    <h3 className="text-base font-semibold text-slate-800">عملکرد رانندگان شرکتی</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        فقط مبادی ستاد · دسته خودرو مثل مالی (کشنده / ده چرخ)
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                    <button
                        type="button"
                        onClick={() => setBasis('assignment')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                            basis === 'assignment'
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        اتمام تخصیص ترابری
                    </button>
                    <button
                        type="button"
                        onClick={() => setBasis('finance')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                            basis === 'finance'
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        ثبت تور مالی ترابری
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 items-end justify-center">
                    <div className="w-[130px]">
                        <label className="block text-[10px] text-slate-500 mb-1 text-center">از تاریخ</label>
                        <input
                            type="text"
                            value={startDate}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) setStartDate(value);
                            }}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs text-center"
                            dir="ltr"
                        />
                    </div>
                    <div className="w-[130px]">
                        <label className="block text-[10px] text-slate-500 mb-1 text-center">تا تاریخ</label>
                        <input
                            type="text"
                            value={endDate}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) setEndDate(value);
                            }}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs text-center"
                            dir="ltr"
                        />
                    </div>
                    <div className="w-[120px]">
                        <label className="block text-[10px] text-slate-500 mb-1 text-center">دسته خودرو</label>
                        <select
                            value={vehicleCategory}
                            onChange={(e) => setVehicleCategory(e.target.value as VehicleCategoryFilter)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs text-center"
                        >
                            <option value="">همه</option>
                            <option value="کشنده">کشنده</option>
                            <option value="ده چرخ">ده چرخ</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const r = getDefaultJalaliCycleRange();
                            setStartDate(r.fromSlash);
                            setEndDate(r.toSlash);
                        }}
                        className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                        دوره جاری
                    </button>
                    <button
                        type="button"
                        onClick={fetchList}
                        disabled={loading}
                        className="px-4 py-1.5 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700 disabled:opacity-50"
                    >
                        {loading ? '...' : 'گزارش بگیر'}
                    </button>
                </div>

                <div className="flex justify-center border-t border-slate-100 pt-2">
                    <div className="w-[200px]">
                        <label className="block text-[10px] text-slate-500 mb-1 text-center">جستجوی راننده</label>
                        <input
                            type="text"
                            value={filterDriver}
                            onChange={(e) => setFilterDriver(e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center"
                            placeholder="نام یا کد پرسنلی"
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 text-center">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-auto max-h-[70vh]">
                <table className="w-full text-center text-[11px] table-fixed">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 z-10">
                        <tr>
                            <th
                                className="px-2 py-2 border font-semibold w-[28%] cursor-pointer select-none"
                                onClick={() => toggleSort('driver')}
                            >
                                راننده{sortMark('driver')}
                            </th>
                            <th
                                className="px-2 py-2 border font-semibold w-[12%] cursor-pointer select-none"
                                onClick={() => toggleSort('vehicleCategory')}
                            >
                                دسته{sortMark('vehicleCategory')}
                            </th>
                            <th
                                className="px-2 py-2 border font-semibold w-[14%] cursor-pointer select-none"
                                onClick={() => toggleSort('periodKm')}
                            >
                                پیمایش{sortMark('periodKm')}
                            </th>
                            <th
                                className="px-1 py-2 border font-semibold w-[12%] bg-amber-50 cursor-pointer select-none"
                                onClick={() => toggleSort('veryFarCount')}
                            >
                                خیلی‌دور{sortMark('veryFarCount')}
                            </th>
                            <th
                                className="px-1 py-2 border font-semibold w-[10%] bg-amber-50 cursor-pointer select-none"
                                onClick={() => toggleSort('farCount')}
                            >
                                دور{sortMark('farCount')}
                            </th>
                            <th
                                className="px-1 py-2 border font-semibold w-[10%] bg-amber-50 cursor-pointer select-none"
                                onClick={() => toggleSort('nearCount')}
                            >
                                نزدیک{sortMark('nearCount')}
                            </th>
                            <th className="px-1 py-2 border font-semibold w-[10%]">جزئیات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayedDrivers.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-slate-400">
                                    {loading
                                        ? 'در حال دریافت...'
                                        : 'دوره و دسته را انتخاب و «گزارش بگیر» را بزنید.'}
                                </td>
                            </tr>
                        ) : (
                            displayedDrivers.map((d) => (
                                <tr key={d.driverId} className="hover:bg-slate-50">
                                    <td className="px-2 py-1.5 border">
                                        <div className="font-medium text-slate-800 leading-tight">{d.driverName}</div>
                                        <div className="text-slate-500 font-mono text-[10px]" dir="ltr">
                                            {d.employeeId || '—'}
                                        </div>
                                    </td>
                                    <td className="px-1 py-1.5 border text-slate-700">
                                        {d.vehicleCategory || '—'}
                                    </td>
                                    <td className="px-2 py-1.5 border tabular-nums font-medium">
                                        {d.periodKm.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="px-1 py-1.5 border tabular-nums bg-amber-50/20">
                                        {d.veryFarCount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="px-1 py-1.5 border tabular-nums bg-amber-50/20">
                                        {d.farCount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="px-1 py-1.5 border tabular-nums bg-amber-50/20">
                                        {d.nearCount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="px-1 py-1.5 border">
                                        <button
                                            type="button"
                                            title="جزئیات بارها"
                                            onClick={() => openDetail(d)}
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-sky-100 text-slate-700"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                className="w-3.5 h-3.5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z"
                                                />
                                                <circle cx="12" cy="12" r="2.5" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {detailDriver && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
                    onClick={() => setDetailDriver(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b flex items-center justify-between">
                            <div className="text-center flex-1">
                                <div className="font-semibold text-slate-800">{detailDriver.driverName}</div>
                                <div className="text-xs text-slate-500" dir="ltr">
                                    {detailDriver.employeeId || '—'}
                                    {detailDriver.vehicleCategory ? ` · ${detailDriver.vehicleCategory}` : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailDriver(null)}
                                className="text-sm text-slate-500 hover:text-slate-800"
                            >
                                بستن
                            </button>
                        </div>
                        <div className="p-3 overflow-auto text-[11px]">
                            {detailLoading ? (
                                <div className="text-slate-400 text-center py-8">در حال بارگذاری...</div>
                            ) : !detailDriver.trips?.length ? (
                                <div className="text-slate-400 text-center py-8">توری یافت نشد.</div>
                            ) : (
                                <table className="w-full text-center">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-2 py-2">تاریخ اعلام</th>
                                            <th className="px-2 py-2">تاریخ تخصیص</th>
                                            <th className="px-2 py-2">مبدا</th>
                                            <th className="px-2 py-2">مقاصد</th>
                                            <th className="px-2 py-2">مسافت</th>
                                            <th className="px-2 py-2">km</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {detailDriver.trips.map((t) => (
                                            <tr key={`${t.announcementId}-${t.assignedAtJalali}-${t.loadingDate}`}>
                                                <td className="px-2 py-1.5 whitespace-nowrap">{t.loadingDate || '—'}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap">
                                                    {t.assignedAtJalali || t.basisDate || '—'}
                                                </td>
                                                <td className="px-2 py-1.5">{t.originLabel || t.originCity || '—'}</td>
                                                <td className="px-2 py-1.5">{t.destinations || '—'}</td>
                                                <td className="px-2 py-1.5">{bucketLabel(t.distanceBucket)}</td>
                                                <td className="px-2 py-1.5 tabular-nums">
                                                    {t.km != null ? Math.round(t.km).toLocaleString('fa-IR') : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyDriverPerformanceTab;
