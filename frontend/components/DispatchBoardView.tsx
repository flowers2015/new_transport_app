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
                                    {entries.map(entry => (
                                        <div key={entry.assignmentId} className="border border-slate-200 rounded-lg p-3 space-y-1">
                                            <div className="flex justify-between text-slate-700">
                                                <span className="font-semibold">
                                                    {entry.driver?.name || 'راننده'}
                                                </span>
                                                <span>{entry.stage === 'stage1' ? 'مرحله ۱' : 'مرحله ۲'}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-500">
                                                <span>{entry.driver?.mobile || ''}</span>
                                                <span>{entry.driver?.employeeId || '-'}</span>
                                            </div>
                                            <div className="text-slate-500">
                                                {entry.vehicle?.vehicleCode || entry.vehicle?.model || 'خودرو'}
                                            </div>
                                            <div className="text-slate-500">
                                                {entry.announcementCode || 'اعلام بار'} • {entry.lineType || ''}
                                            </div>
                                            <div className="flex justify-between text-slate-400 text-[11px]">
                                                <span>{entry.originCity || 'مبدا نامشخص'}</span>
                                                <span>
                                                    {entry.createdAt
                                                        ? new Date(entry.createdAt).toLocaleString('fa-IR')
                                                        : ''}
                                                </span>
                                            </div>
                                            {entry.route && (
                                                <div className="text-slate-400 text-[11px]">
                                                    {entry.route.routeCategory || ''}{' '}
                                                    {entry.route.roundTripKm ? `• ${entry.route.roundTripKm} کیلومتر` : ''}
                                                </div>
                                            )}
                                        </div>
                                    ))}
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



