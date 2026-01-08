import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DispatchBoardEntry } from '../types';
import { getApiUrl } from '../utils/apiConfig';

type BoardResponse = Record<string, DispatchBoardEntry[]>;

type TableRow = {
    city: string;
    driverName: string;
    vehicleCode: string;
    assignmentDate: string;
    entry: DispatchBoardEntry;
};

const DispatchBoardView: React.FC = () => {
    const [board, setBoard] = useState<BoardResponse>({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const token = useMemo(() => localStorage.getItem('token') || '', []);
    const headers = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }),
        [token]
    );

    const loadBoard = async () => {
        try {
            setLoading(true);
            const res = await fetch(getApiUrl('dispatch/board'), { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as BoardResponse;
            setBoard(data || {});
        } catch (error) {
            console.error('Failed to load dispatch board', error);
            setBoard({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBoard();
    }, []);

    useEffect(() => {
        const handler = () => loadBoard();
        window.addEventListener('dispatch-board:update', handler);
        return () => {
            window.removeEventListener('dispatch-board:update', handler);
        };
    }, []);

    // تبدیل داده‌ها به فرمت جدول
    const tableRows = useMemo(() => {
        const rows: TableRow[] = [];
        Object.entries(board).forEach(([city, entries]) => {
            entries.forEach(entry => {
                const assignmentDate = entry.createdAt 
                    ? new Date(entry.createdAt).toLocaleDateString('fa-IR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    })
                    : '---';
                
                rows.push({
                    city,
                    driverName: entry.driver?.name || 'نامشخص',
                    vehicleCode: entry.vehicle?.vehicleCode || entry.vehicle?.model || '---',
                    assignmentDate,
                    entry
                });
            });
        });
        return rows;
    }, [board]);

    // فیلتر کردن ردیف‌ها بر اساس جستجو
    const filteredRows = useMemo(() => {
        if (!searchTerm.trim()) return tableRows;
        const term = searchTerm.toLowerCase().trim();
        return tableRows.filter(row => 
            row.city.toLowerCase().includes(term) ||
            row.driverName.toLowerCase().includes(term) ||
            row.vehicleCode.toLowerCase().includes(term)
        );
    }, [tableRows, searchTerm]);

    return (
        <div className="p-4 space-y-4">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">تابلو اعلام بار</h2>
                        <p className="text-xs text-slate-500">
                            فهرست تخصیص‌های ثبت شده به تفکیک شهر مقصد نمایش داده می‌شود.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="جستجوی شهر یا راننده..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                        />
                        <button
                            onClick={loadBoard}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
                            disabled={loading}
                        >
                            بروزرسانی
                        </button>
                    </div>
                </header>
                {loading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                ) : filteredRows.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        {searchTerm ? 'نتیجه‌ای یافت نشد.' : 'هنوز تخصیصی ثبت نشده است.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        شهر مقصد
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        نام راننده
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        کد خودرو
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        تاریخ تخصیص
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {filteredRows.map((row, index) => (
                                    <tr key={`${row.entry.assignmentId}-${index}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm font-medium text-slate-900">{row.city}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-900">{row.driverName}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-900">{row.vehicleCode}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-600">{row.assignmentDate}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default DispatchBoardView;



