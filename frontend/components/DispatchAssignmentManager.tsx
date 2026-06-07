import React, { useEffect, useMemo, useState } from 'react';
import {
    DispatchAnnouncementCandidate,
    DispatchQueueEntry,
} from '../types';
import { getApiUrl } from '../utils/apiConfig';

type StageKey = 'stage1' | 'stage2';

type StageResponse = {
    stage: StageKey;
    cycleStart: string;
    queue: DispatchQueueEntry[];
    announcements: DispatchAnnouncementCandidate[];
};

const stageOptions: { value: StageKey; label: string; helper: string }[] = [
    {
        value: 'stage1',
        label: 'مرحله اول — خیلی‌دور (نوبت دور)',
        helper:
            'فقط بارهای خیلی‌دور و فقط نوبت دور. رانندگان با سابقه خیلی‌دور در دوره جاری (۲۶–۲۵ شمسی) در این مرحله نیستند.',
    },
    {
        value: 'stage2',
        label: 'مرحله دوم — بارهای باقی‌مانده',
        helper: 'همان قوانین تابلو اعلام بار و بله — نوبت دور/نزدیک و فیلتر خیلی‌دور.',
    },
];

const DispatchAssignmentManager: React.FC = () => {
    const [stage, setStage] = useState<StageKey>('stage1');
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [data, setData] = useState<StageResponse | null>(null);
    const [selectedQueueId, setSelectedQueueId] = useState<string>('');
    const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string>('');

    const token = useMemo(() => localStorage.getItem('token') || '', []);
    const headers = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }),
        [token]
    );

    const loadStage = async (targetStage: StageKey) => {
        try {
            setLoading(true);
            const res = await fetch(
                getApiUrl(`dispatch/assignments/candidates?stage=${targetStage}`),
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const payload = (await res.json()) as StageResponse;
            setData(payload);
            setSelectedAnnouncementId('');
            setSelectedQueueId('');
        } catch (error) {
            console.error('Failed to load assignment data', error);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStage(stage);
    }, [stage]);

    const handleAssign = async () => {
        if (!data) return;
        const queueEntry = data.queue.find(item => item.id === selectedQueueId);
        const announcement = data.announcements.find(item => item.id === selectedAnnouncementId);

        if (!queueEntry || !announcement) {
            alert('لطفاً یک نوبت و یک اعلام بار انتخاب کنید.');
            return;
        }

        if (stage === 'stage1' && queueEntry.blockedStage1) {
            alert('این راننده در مرحله اول مسدود است.');
            return;
        }

        setAssigning(true);
        try {
            const res = await fetch(getApiUrl('dispatch/assignments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    stage,
                    freightAnnouncementId: announcement.id,
                    destinationId: announcement.destination?.id || null,
                    driverId: queueEntry.driverId,
                    vehicleId: queueEntry.vehicleId,
                    queueEntryId: queueEntry.id,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert('تخصیص با موفقیت انجام شد.');
            await loadStage(stage);
        } catch (error: any) {
            alert(error?.message || 'ثبت تخصیص ناموفق بود.');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div className="p-4 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">تخصیص اعلام بار</h2>
                        <p className="text-xs text-slate-500">
                            ابتدا مرحله مورد نظر را انتخاب کنید، سپس یک نوبت و یک اعلام بار را برای تخصیص انتخاب نمایید.
                        </p>
                    </div>
                    <select
                        className="input-style max-w-xs"
                        value={stage}
                        onChange={e => setStage(e.target.value as StageKey)}
                    >
                        {stageOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </header>
                <div className="px-4 py-3 text-xs text-slate-500">
                    {stageOptions.find(option => option.value === stage)?.helper}
                </div>
                {loading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                ) : !data ? (
                    <div className="py-10 text-center text-slate-400 text-sm">داده‌ای یافت نشد.</div>
                ) : (
                    <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="border border-slate-100 rounded-xl">
                            <div className="px-4 py-2 bg-slate-50 rounded-t-xl flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700">نوبت‌ها</h3>
                                <span className="text-xs text-slate-500">{data.queue.length} مورد</span>
                            </div>
                            <div className="p-3 space-y-2 max-h-[480px] overflow-auto">
                                {data.queue.length === 0 ? (
                                    <div className="text-[11px] text-slate-400 text-center py-6">نوبتی برای این مرحله وجود ندارد.</div>
                                ) : (
                                    data.queue.map(entry => {
                                        const blocked = stage === 'stage1' && entry.blockedStage1;
                                        return (
                                            <button
                                                key={entry.id}
                                                onClick={() => setSelectedQueueId(entry.id)}
                                                className={`w-full text-left border rounded-lg p-3 text-xs transition ${
                                                    selectedQueueId === entry.id
                                                        ? 'border-sky-400 bg-sky-50'
                                                        : 'border-slate-200 hover:bg-slate-50'
                                                } ${blocked ? 'opacity-70' : ''}`}
                                            >
                                                <div className="flex justify-between text-slate-700">
                                                    <span className="font-semibold">{entry.driver?.name || 'راننده'}</span>
                                                    <span>ردیف {entry.position}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-500 mt-1">
                                                    <span>{entry.driver?.employeeId || '-'}</span>
                                                    <span>{entry.driver?.mobile || ''}</span>
                                                </div>
                                                <div className="text-slate-500 mt-1">
                                                    {entry.vehicle?.vehicleCode || entry.vehicle?.model || 'خودرو'}
                                                </div>
                                                {entry.notes && (
                                                    <div className="text-slate-400 mt-1">توضیح: {entry.notes}</div>
                                                )}
                                                {blocked && (
                                                    <div className="text-[11px] text-red-500 mt-2">
                                                        این راننده در ۲۶ روز گذشته مسیر خیلی دور داشته است.
                                                    </div>
                                                )}
                                                {entry.longRouteHistory && entry.longRouteHistory.length > 0 && (
                                                    <div className="mt-2 border-t border-slate-100 pt-2 space-y-1 text-[11px] text-slate-500">
                                                        {entry.longRouteHistory.slice(0, 3).map(history => (
                                                            <div key={history.id}>
                                                                {history.city || 'نامشخص'} • {history.route_category || ''} •{' '}
                                                                {history.created_at ? new Date(history.created_at).toLocaleDateString('fa-IR') : ''}
                                                            </div>
                                                        ))}
                                                        {entry.longRouteHistory.length > 3 && (
                                                            <div className="text-slate-400">...</div>
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="border border-slate-100 rounded-xl">
                            <div className="px-4 py-2 bg-slate-50 rounded-t-xl flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700">اعلام بارها</h3>
                                <span className="text-xs text-slate-500">{data.announcements.length} مورد</span>
                            </div>
                            <div className="p-3 space-y-2 max-h-[480px] overflow-auto">
                                {data.announcements.length === 0 ? (
                                    <div className="text-[11px] text-slate-400 text-center py-6">اعلام باری برای این مرحله وجود ندارد.</div>
                                ) : (
                                    data.announcements.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedAnnouncementId(item.id)}
                                            className={`w-full text-left border rounded-lg p-3 text-xs transition ${
                                                selectedAnnouncementId === item.id
                                                    ? 'border-emerald-400 bg-emerald-50'
                                                    : 'border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex justify-between text-slate-700">
                                                <span className="font-semibold">
                                                    {item.announcementCode || 'اعلام بار'}
                                                </span>
                                                <span>{item.lineType || ''}</span>
                                            </div>
                                            <div className="text-slate-500 mt-1">
                                                {item.originCity || 'مبدا نامشخص'} → {item.destination?.city || 'مقصد نامشخص'}
                                            </div>
                                            {item.route && (
                                                <div className="text-slate-400 mt-1">
                                                    {item.route.route_category || ''}{' '}
                                                    {item.route.round_trip_km ? `• ${item.route.round_trip_km} کیلومتر` : ''}
                                                </div>
                                            )}
                                            <div className="flex justify-between text-slate-400 mt-1">
                                                <span>{item.vehicleType || ''}</span>
                                                <span>
                                                    {item.createdAt
                                                        ? new Date(item.createdAt).toLocaleDateString('fa-IR')
                                                        : ''}
                                                </span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <footer className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                        onClick={() => loadStage(stage)}
                        className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                        disabled={loading}
                    >
                        بروزرسانی
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={assigning || !selectedQueueId || !selectedAnnouncementId}
                        className="px-4 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {assigning ? 'در حال ثبت...' : 'ثبت تخصیص'}
                    </button>
                </footer>
            </section>
        </div>
    );
};

export default DispatchAssignmentManager;



