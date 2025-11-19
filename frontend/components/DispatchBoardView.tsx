import React, { useEffect, useMemo, useState } from 'react';
import { DispatchBoardEntry } from '../types';

type BoardResponse = Record<string, DispatchBoardEntry[]>;

const DispatchBoardView: React.FC = () => {
    const [board, setBoard] = useState<BoardResponse>({});
    const [loading, setLoading] = useState(false);

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
            const res = await fetch('http://localhost:3000/api/v1/dispatch/board', { headers });
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

    return (
        <div className="p-4 space-y-4">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">تابلو اعلام بار</h2>
                        <p className="text-xs text-slate-500">
                            فهرست تخصیص‌های ثبت شده به تفکیک شهر مقصد نمایش داده می‌شود.
                        </p>
                    </div>
                    <button
                        onClick={loadBoard}
                        className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                        disabled={loading}
                    >
                        بروزرسانی
                    </button>
                </header>
                {loading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                ) : Object.keys(board).length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">هنوز تخصیصی ثبت نشده است.</div>
                ) : (
                    <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {Object.entries(board).map(([city, entries]) => (
                            <div key={city} className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                    <h3 className="text-sm font-semibold text-slate-700">{city}</h3>
                                    <span className="text-xs text-slate-500">{entries.length} مورد</span>
                                </div>
                                <div className="p-3 space-y-2 max-h-80 overflow-auto text-xs">
                                    {entries.map(entry => {
                                        const daysSince = entry.daysSinceAssignment ?? 0;
                                        const expectedDays = entry.route?.expectedDays;
                                        const isOverdue = expectedDays != null && daysSince > expectedDays;
                                        const isDue = expectedDays != null && daysSince === expectedDays;
                                        const bgColor = isOverdue ? 'bg-red-50 border-red-200' : isDue ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200';
                                        
                                        // تبدیل دسته خودرو به فارسی
                                        const category = entry.vehicle?.vehicleCategory;
                                        const categoryMap: Record<string, string> = {
                                            'trailer': 'تریلی',
                                            'mini-trailer': 'مینی تریلی',
                                            'ten-wheel': 'ده چرخ',
                                        };
                                        const categoryLabel = category ? (categoryMap[category] || category) : 'دسته خودرو';
                                        
                                        // Debug log
                                        console.log('📅 [DispatchBoardView] Entry:', {
                                            assignmentId: entry.assignmentId,
                                            daysSince,
                                            assignmentFinalizedAt: entry.assignmentFinalizedAt,
                                            createdAt: entry.createdAt,
                                            expectedDays
                                        });
                                        
                                        return (
                                            <div key={entry.assignmentId} className={`border rounded-lg p-3 space-y-1 ${bgColor}`}>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-slate-800">
                                                            {entry.driver?.name || 'راننده'}
                                                        </div>
                                                        <div className="text-sm text-slate-600 mt-1">
                                                            {categoryLabel} • {entry.vehicle?.vehicleCode || entry.vehicle?.model || 'کد خودرو'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`text-xs font-medium mt-1 ${
                                                    isOverdue ? 'text-red-700' : isDue ? 'text-yellow-700' : 'text-slate-600'
                                                }`}>
                                                    {daysSince > 0 ? `${daysSince} روز از تخصیص گذشته` : 'امروز تخصیص داده شده'}
                                                    {expectedDays != null && ` / مدت مصوب: ${expectedDays} روز`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default DispatchBoardView;



