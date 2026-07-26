import React, { useMemo, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { getDefaultJalaliCycleRange } from '../utils/jalaliCycleRange';
import CompanyDriverPerformanceTab from './CompanyDriverPerformanceTab';

type DispatchLineRow = {
    lineKey: string;
    lineLabel: string;
    totalAssignments: number;
    personalCount: number;
    companyCount: number;
    personalToCompanyPercent: number | null;
    personalFreightSum: number;
};

type DispatchLineStatsResponse = {
    fromJalali: string;
    toJalali: string;
    lines: DispatchLineRow[];
    totals: Omit<DispatchLineRow, 'lineKey' | 'lineLabel'> & {
        personalToCompanyPercent: number | null;
    };
};

const parseJalaliDate = (dateStr: string) => {
    const parts = dateStr.replace(/-/g, '/').split('/');
    return {
        year: parseInt(parts[0], 10) || 1404,
        month: parseInt(parts[1], 10) || 1,
        day: parseInt(parts[2], 10) || 1,
    };
};

const formatPercent = (value: number | null) => {
    if (value == null) return '—';
    return `${value.toLocaleString('fa-IR')}٪`;
};

const DispatchAssignmentStatsPanel: React.FC = () => {
    const defaults = useMemo(() => getDefaultJalaliCycleRange(), []);
    const [startDate, setStartDate] = useState(defaults.fromSlash);
    const [endDate, setEndDate] = useState(defaults.toSlash);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<DispatchLineRow[]>([]);
    const [totals, setTotals] = useState<DispatchLineStatsResponse['totals'] | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const startParts = parseJalaliDate(startDate);
            const endParts = parseJalaliDate(endDate);
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                startYear: String(startParts.year),
                startMonth: String(startParts.month),
                startDay: String(startParts.day),
                endYear: String(endParts.year),
                endMonth: String(endParts.month),
                endDay: String(endParts.day),
            });
            const res = await fetch(getApiUrl(`freight-announcements/dispatch-line-stats?${params}`), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!res.ok) throw new Error(await res.text());
            const json = (await res.json()) as DispatchLineStatsResponse;
            setRows(json.lines || []);
            setTotals(json.totals || null);
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'خطا در دریافت آمار اعزام');
            setRows([]);
            setTotals(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow p-3 space-y-3">
                <div className="text-center">
                    <h3 className="text-base font-semibold text-slate-800">آمار اعزام</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        تخصیص‌های نهایی‌شده به تفکیک لاین — شخصی و شرکتی در دوره انتخابی
                    </p>
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
                        onClick={fetchData}
                        disabled={loading}
                        className="px-4 py-1.5 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700 disabled:opacity-50"
                    >
                        {loading ? '...' : 'گزارش بگیر'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 text-center">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-auto">
                <table className="w-full text-center text-[11px]">
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="px-2 py-2 border">لاین</th>
                            <th className="px-2 py-2 border">مجموع تخصیص</th>
                            <th className="px-2 py-2 border">تعداد شخصی</th>
                            <th className="px-2 py-2 border">تعداد شرکتی</th>
                            <th className="px-2 py-2 border">درصد شخصی به شرکتی</th>
                            <th className="px-2 py-2 border">مجموع کرایه شخصی</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-slate-400">
                                    {loading
                                        ? 'در حال دریافت...'
                                        : 'دوره را انتخاب و «گزارش بگیر» را بزنید.'}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {rows.map((row) => (
                                    <tr key={row.lineKey} className="hover:bg-slate-50">
                                        <td className="px-2 py-2 border font-medium text-slate-800">
                                            {row.lineLabel}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums font-semibold">
                                            {row.totalAssignments.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {row.personalCount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {row.companyCount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {formatPercent(row.personalToCompanyPercent)}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {row.personalFreightSum.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                ))}
                                {totals && (
                                    <tr className="bg-sky-50 font-semibold">
                                        <td className="px-2 py-2 border">جمع کل</td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {totals.totalAssignments.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {totals.personalCount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {totals.companyCount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {formatPercent(totals.personalToCompanyPercent)}
                                        </td>
                                        <td className="px-2 py-2 border tabular-nums">
                                            {totals.personalFreightSum.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PerformanceIndexTab: React.FC = () => {
    const [activeSubTab, setActiveSubTab] = useState<'dispatchStats' | 'companyDrivers'>('dispatchStats');

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 justify-center">
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('dispatchStats')}
                        className={`px-4 py-2 font-medium transition ${
                            activeSubTab === 'dispatchStats'
                                ? 'border-b-2 border-sky-600 text-sky-600'
                                : 'text-slate-600 hover:text-slate-800'
                        }`}
                    >
                        آمار اعزام
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('companyDrivers')}
                        className={`px-4 py-2 font-medium transition ${
                            activeSubTab === 'companyDrivers'
                                ? 'border-b-2 border-sky-600 text-sky-600'
                                : 'text-slate-600 hover:text-slate-800'
                        }`}
                    >
                        عملکرد رانندگان شرکتی
                    </button>
                </div>
            </div>

            {activeSubTab === 'companyDrivers' ? (
                <CompanyDriverPerformanceTab />
            ) : (
                <DispatchAssignmentStatsPanel />
            )}
        </div>
    );
};

export default PerformanceIndexTab;
