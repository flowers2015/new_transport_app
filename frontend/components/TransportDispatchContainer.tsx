import React, { useEffect, useMemo, useState } from 'react';
import {
    DispatchAnnouncementCandidate,
    DispatchBoardEntry,
    DispatchQueueEntry,
    DispatchQueueType,
} from '../types';

type QueueGroup = Record<string, {
    near: DispatchQueueEntry[];
    far: DispatchQueueEntry[];
    workshop: DispatchQueueEntry[];
    external: DispatchQueueEntry[];
    leave: DispatchQueueEntry[];
    other: DispatchQueueEntry[];
}>;

type StageCandidatesResponse = {
    stage: 'stage1' | 'stage2';
    cycleStart: string;
    queue: DispatchQueueEntry[];
    announcements: DispatchAnnouncementCandidate[];
};

type BoardResponse = Record<string, DispatchBoardEntry[]>;

const queueTypeLabels: Record<DispatchQueueType, string> = {
    near: 'نوبت نزدیک',
    far: 'نوبت دور',
    workshop: 'خودروهای تعمیرگاه شرکت',
    external: 'خودروهای تعمیرگاه خارج از شرکت',
    leave: 'راننده در مرخصی',
    other: 'سایر',
};

const stageLabels: Record<'stage1' | 'stage2', string> = {
    stage1: 'مرحله اول (مسیرهای دور)',
    stage2: 'مرحله دوم (همه مسیرها)',
};

const TransportDispatchContainer: React.FC = () => {
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [queueData, setQueueData] = useState<QueueGroup>({});
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);

    const [creating, setCreating] = useState(false);
    const [newEntry, setNewEntry] = useState({
        vehicleId: '',
        driverId: '',
        vehicleCategory: '',
        queueType: 'near' as DispatchQueueType,
        notes: '',
    });

    const [stage, setStage] = useState<'stage1' | 'stage2'>('stage1');
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [stageCandidates, setStageCandidates] = useState<StageCandidatesResponse | null>(null);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<string>('');
    const [selectedQueueEntry, setSelectedQueueEntry] = useState<string>('');

    const [boardLoading, setBoardLoading] = useState(false);
    const [boardData, setBoardData] = useState<BoardResponse>({});

    const token = useMemo(() => localStorage.getItem('token') || '', []);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    }), [token]);

    const fetchQueue = async () => {
        try {
            setLoadingQueue(true);
            const res = await fetch('http://localhost:3000/api/v1/dispatch/queue', { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setQueueData(data || {});
        } catch (error) {
            console.error('Failed to fetch queue', error);
            setQueueData({});
        } finally {
            setLoadingQueue(false);
        }
    };

    const fetchVehicles = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/v1/vehicles', { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setVehicles(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch vehicles', error);
            setVehicles([]);
        }
    };

    const fetchDrivers = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/v1/drivers', { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setDrivers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch drivers', error);
            setDrivers([]);
        }
    };

    const fetchStageCandidates = async (currentStage: 'stage1' | 'stage2') => {
        try {
            setLoadingCandidates(true);
            const res = await fetch(`http://localhost:3000/api/v1/dispatch/assignments/candidates?stage=${currentStage}`, { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setStageCandidates(data);
            setSelectedAnnouncement('');
            setSelectedQueueEntry('');
        } catch (error) {
            console.error('Failed to fetch candidates', error);
            setStageCandidates(null);
        } finally {
            setLoadingCandidates(false);
        }
    };

    const fetchBoard = async () => {
        try {
            setBoardLoading(true);
            const res = await fetch('http://localhost:3000/api/v1/dispatch/board', { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setBoardData(data || {});
        } catch (error) {
            console.error('Failed to fetch board', error);
            setBoardData({});
        } finally {
            setBoardLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
        fetchVehicles();
        fetchDrivers();
        fetchStageCandidates(stage);
        fetchBoard();
    }, []);

    useEffect(() => {
        fetchStageCandidates(stage);
    }, [stage]);

    const handleCreateQueueEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.vehicleId || !newEntry.driverId) {
            alert('انتخاب خودرو و راننده الزامی است.');
            return;
        }
        try {
            setCreating(true);
            const res = await fetch('http://localhost:3000/api/v1/dispatch/queue', {
                method: 'POST',
                headers,
                body: JSON.stringify(newEntry),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }
            setNewEntry({
                vehicleId: '',
                driverId: '',
                vehicleCategory: '',
                queueType: 'near',
                notes: '',
            });
            await fetchQueue();
        } catch (error: any) {
            alert(error?.message || 'ثبت نوبت ناموفق بود.');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteQueueEntry = async (id: string) => {
        if (!window.confirm('آیا از حذف این نوبت مطمئن هستید؟')) return;
        try {
            const res = await fetch(`http://localhost:3000/api/v1/dispatch/queue/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchQueue();
        } catch (error) {
            alert('حذف نوبت ناموفق بود.');
        }
    };

    const handleAssign = async () => {
        if (!selectedAnnouncement || !selectedQueueEntry || !stageCandidates) {
            alert('لطفاً یک نوبت و یک اعلام بار را انتخاب کنید.');
            return;
        }
        const queueEntry = stageCandidates.queue.find(entry => entry.id === selectedQueueEntry);
        if (!queueEntry) {
            alert('نوبت انتخاب شده معتبر نیست.');
            return;
        }

        const announcement = stageCandidates.announcements.find(ann => ann.id === selectedAnnouncement);
        if (!announcement) {
            alert('اعلام بار انتخاب شده معتبر نیست.');
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/api/v1/dispatch/assignments', {
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
            await fetchQueue();
            await fetchStageCandidates(stage);
            await fetchBoard();
            alert('تخصیص ثبت شد.');
        } catch (error: any) {
            alert(error?.message || 'ثبت تخصیص ناموفق بود.');
        }
    };

    const groupedQueueEntries = useMemo(() => queueData || {}, [queueData]);

    const renderQueueColumn = (entries: DispatchQueueEntry[], type: DispatchQueueType) => (
        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{queueTypeLabels[type]}</h4>
            <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                {entries.length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-4">نوبتی ثبت نشده است</div>
                )}
                {entries.map(entry => (
                    <div key={entry.id} className="border border-slate-200 rounded-lg p-2 text-xs space-y-1 bg-slate-50">
                        <div className="flex justify-between">
                            <span className="font-semibold text-sky-700">{entry.driver?.name || 'راننده نامشخص'}</span>
                            <span className="text-slate-500">ردیف: {entry.position}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span># {entry.driver?.employeeId || '---'}</span>
                            <span>{entry.driver?.mobile || ''}</span>
                        </div>
                        <div className="text-slate-600">
                            {entry.vehicle?.vehicleCode
                                ? `کد خودرو: ${entry.vehicle.vehicleCode}`
                                : entry.vehicle?.model || 'خودرو نامشخص'}
                        </div>
                        {entry.notes && <div className="text-slate-500 text-xs">توضیح: {entry.notes}</div>}
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-[11px] text-slate-400">{new Date(entry.createdAt).toLocaleString('fa-IR')}</span>
                            <button
                                className="text-red-500 text-[11px] hover:text-red-700"
                                onClick={() => handleDeleteQueueEntry(entry.id)}
                            >
                                حذف
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderQueueSection = () => (
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">مدیریت نوبت</h3>
                    <p className="text-sm text-slate-500">ثبت و مشاهده نوبت برای دسته‌های مختلف خودرو و راننده</p>
                </div>
                <button
                    onClick={fetchQueue}
                    className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                    بروزرسانی
                </button>
            </div>
            <form onSubmit={handleCreateQueueEntry} className="bg-slate-50 rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                    <label className="text-xs text-slate-600">دسته خودرو</label>
                    <input
                        className="input-style mt-1"
                        placeholder="مثلاً تریلی"
                        value={newEntry.vehicleCategory}
                        onChange={e => setNewEntry(prev => ({ ...prev, vehicleCategory: e.target.value }))}
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-600">نوع نوبت</label>
                    <select
                        className="input-style mt-1"
                        value={newEntry.queueType}
                        onChange={e => setNewEntry(prev => ({ ...prev, queueType: e.target.value as DispatchQueueType }))}
                    >
                        {Object.entries(queueTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-600">خودرو</label>
                    <select
                        className="input-style mt-1"
                        value={newEntry.vehicleId}
                        onChange={e => setNewEntry(prev => ({ ...prev, vehicleId: e.target.value }))}
                        required
                    >
                        <option value="">انتخاب خودرو</option>
                        {vehicles.map(vehicle => (
                            <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.vehicleCode ? `${vehicle.vehicleCode} - ${vehicle.model}` : vehicle.model || vehicle.id}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-600">راننده</label>
                    <select
                        className="input-style mt-1"
                        value={newEntry.driverId}
                        onChange={e => setNewEntry(prev => ({ ...prev, driverId: e.target.value }))}
                        required
                    >
                        <option value="">انتخاب راننده</option>
                        {drivers.map(driver => (
                            <option key={driver.id} value={driver.id}>
                                {driver.employeeId ? `${driver.employeeId} - ${driver.name}` : driver.name || driver.id}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-600">توضیحات</label>
                    <input
                        className="input-style mt-1"
                        value={newEntry.notes}
                        onChange={e => setNewEntry(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="اختیاری"
                    />
                </div>
                <div className="md:col-span-5 flex justify-end">
                    <button
                        type="submit"
                        className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                        disabled={creating}
                    >
                        {creating ? 'در حال ثبت...' : 'ثبت نوبت'}
                    </button>
                </div>
            </form>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {loadingQueue ? (
                    <div className="col-span-full text-center text-slate-500 py-8">در حال بارگذاری...</div>
                ) : (
                    Object.entries(groupedQueueEntries).map(([category, buckets]) => (
                        <div key={category} className="border border-slate-200 rounded-2xl bg-slate-100">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
                                <h4 className="text-sm font-semibold text-slate-700">{category}</h4>
                                <span className="text-[11px] text-slate-500">
                                    مجموع نوبت‌ها: {(['near','far','workshop','external','leave','other'] as DispatchQueueType[])
                                        .reduce((sum, type) => sum + (buckets as any)[type].length, 0)}
                                </span>
                            </div>
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {renderQueueColumn(buckets.far, 'far')}
                                {renderQueueColumn(buckets.near, 'near')}
                                {renderQueueColumn(buckets.workshop, 'workshop')}
                                {renderQueueColumn(buckets.external, 'external')}
                                {renderQueueColumn(buckets.leave, 'leave')}
                                {renderQueueColumn(buckets.other, 'other')}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-6 bg-white rounded-2xl shadow-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">مدیریت اعلام بار</h3>
                        <p className="text-sm text-slate-500">مدیریت اعلام بارهای فروش و حمل و نقل</p>
                    </div>
                    <button
                        onClick={fetchStageCandidates}
                        className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                        بروزرسانی اعلام بارها
                    </button>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">اعلام بارهای موجود</h4>
                    {loadingCandidates ? (
                        <div className="text-center text-slate-500 py-8">در حال بارگذاری اعلام بارها...</div>
                    ) : (
                        <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                            {stageCandidates?.announcements.length === 0 && (
                                <div className="text-xs text-slate-400 text-center py-4">اعلام باری ثبت نشده است</div>
                            )}
                            {stageCandidates?.announcements.map(announcement => (
                                <div key={announcement.id} className="border border-slate-200 rounded-lg p-2 text-xs space-y-1 bg-slate-50">
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-sky-700">{announcement.title}</span>
                                        <span className="text-slate-500">تاریخ: {new Date(announcement.createdAt).toLocaleDateString('fa-IR')}</span>
                                    </div>
                                    <div className="text-slate-600">
                                        <span>مقصد: {announcement.destination?.name || 'مشخص نشده'}</span>
                                        <span className="mx-1">|</span>
                                        <span>تاریخ: {new Date(announcement.date).toLocaleDateString('fa-IR')}</span>
                                    </div>
                                    <div className="text-slate-600">
                                        <span>توضیحات: {announcement.description || 'توضیحی ندارد'}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-[11px] text-slate-400">تاریخ ایجاد: {new Date(announcement.createdAt).toLocaleString('fa-IR')}</span>
                                        <button
                                            className="text-blue-500 text-[11px] hover:text-blue-700"
                                            onClick={() => setSelectedAnnouncement(announcement.id)}
                                        >
                                            انتخاب
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">اعلام بار انتخاب شده</h4>
                    {selectedAnnouncement ? (
                        <div className="border border-slate-200 rounded-lg p-2 text-xs space-y-1 bg-slate-50">
                            <div className="flex justify-between">
                                <span className="font-semibold text-sky-700">{stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.title}</span>
                                <span className="text-slate-500">تاریخ: {new Date(stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.date || '').toLocaleDateString('fa-IR')}</span>
                            </div>
                            <div className="text-slate-600">
                                <span>مقصد: {stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.destination?.name || 'مشخص نشده'}</span>
                                <span className="mx-1">|</span>
                                <span>تاریخ: {new Date(stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.date || '').toLocaleDateString('fa-IR')}</span>
                            </div>
                            <div className="text-slate-600">
                                <span>توضیحات: {stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.description || 'توضیحی ندارد'}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <span className="text-[11px] text-slate-400">تاریخ ایجاد: {new Date(stageCandidates?.announcements.find(ann => ann.id === selectedAnnouncement)?.createdAt || '').toLocaleString('fa-IR')}</span>
                                <button
                                    className="text-green-500 text-[11px] hover:text-green-700"
                                    onClick={handleAssign}
                                >
                                    تخصیص
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 text-center py-4">اعلام باری انتخاب نشده است.</div>
                    )}
                </div>
            </div>

            <div className="mt-6 bg-white rounded-2xl shadow-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">پیش‌نوبت‌های تخصیص داده شده</h3>
                        <p className="text-sm text-slate-500">لیست پیش‌نوبت‌های که به راننده‌ها تخصیص داده شده‌اند</p>
                    </div>
                    <button
                        onClick={fetchBoard}
                        className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                        بروزرسانی پیش‌نوبت‌ها
                    </button>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    {boardLoading ? (
                        <div className="text-center text-slate-500 py-8">در حال بارگذاری پیش‌نوبت‌ها...</div>
                    ) : (
                        <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                            {Object.entries(boardData).length === 0 && (
                                <div className="text-xs text-slate-400 text-center py-4">پیش‌نوبتی ثبت نشده است</div>
                            )}
                            {Object.entries(boardData).map(([date, entries]) => (
                                <div key={date} className="border border-slate-200 rounded-lg p-2 text-xs space-y-1 bg-slate-50">
                                    <h5 className="text-sm font-semibold text-slate-700 mb-1">{new Date(date).toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })}</h5>
                                    {entries.length === 0 && (
                                        <div className="text-xs text-slate-400 text-center py-2">پیش‌نوبتی در این روز ثبت نشده است</div>
                                    )}
                                    {entries.map(entry => (
                                        <div key={entry.id} className="border border-slate-200 rounded-lg p-2 text-xs space-y-1 bg-slate-50">
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-sky-700">{entry.driver?.name || 'راننده نامشخص'}</span>
                                                <span className="text-slate-500">ردیف: {entry.position}</span>
                                            </div>
                                            <div className="text-slate-600">
                                                <span>مسیر: {entry.destination?.name || 'مشخص نشده'}</span>
                                                <span className="mx-1">|</span>
                                                <span>تاریخ: {new Date(entry.date).toLocaleDateString('fa-IR', { hour: 'numeric', minute: 'numeric' })}</span>
                                            </div>
                                            <div className="text-slate-600">
                                                <span>توضیحات: {entry.notes || 'توضیحی ندارد'}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-1">
                                                <span className="text-[11px] text-slate-400">تاریخ ایجاد: {new Date(entry.createdAt).toLocaleString('fa-IR')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const selectedQueueEntryDetail = useMemo(() => {
        if (!stageCandidates || !selectedQueueEntry) return null;
        return stageCandidates.queue.find(entry => entry.id === selectedQueueEntry) || null;
    }, [stageCandidates, selectedQueueEntry]);

    const selectedAnnouncementDetail = useMemo(() => {
        if (!stageCandidates || !selectedAnnouncement) return null;
        return stageCandidates.announcements.find(ann => ann.id === selectedAnnouncement) || null;
    }, [stageCandidates, selectedAnnouncement]);

    const renderStageSection = () => (
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">تخصیص مرحله‌ای</h3>
                    <p className="text-sm text-slate-500">انتخاب راننده/خودرو برای اعلام بارهای ارجاع‌شده</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600">مرحله:</label>
                    <select
                        value={stage}
                        className="input-style"
                        onChange={e => setStage(e.target.value as 'stage1' | 'stage2')}
                    >
                        <option value="stage1">{stageLabels.stage1}</option>
                        <option value="stage2">{stageLabels.stage2}</option>
                    </select>
                    <button
                        onClick={() => fetchStageCandidates(stage)}
                        className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                        بروزرسانی
                    </button>
                </div>
            </div>

            {loadingCandidates ? (
                <div className="text-center text-slate-500 py-8">در حال بارگذاری...</div>
            ) : stageCandidates ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-700">نوبت‌های در دسترس</h4>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {stageCandidates.queue.length === 0 && (
                                <div className="text-xs text-slate-400 text-center py-4">نوبتی برای این مرحله ثبت نشده است.</div>
                            )}
                            {stageCandidates.queue.map(entry => (
                                <label
                                    key={entry.id}
                                    className={`block border rounded-lg p-2 text-xs space-y-1 cursor-pointer transition ${
                                        selectedQueueEntry === entry.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        className="hidden"
                                        checked={selectedQueueEntry === entry.id}
                                        onChange={() => setSelectedQueueEntry(entry.id)}
                                    />
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-slate-700">{entry.driver?.name || 'نامشخص'}</span>
                                        <span className="text-slate-500">ردیف: {entry.position}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span># {entry.driver?.employeeId || '---'}</span>
                                        <span>{entry.driver?.mobile || ''}</span>
                                    </div>
                                    <div className="text-slate-600">
                                        {entry.vehicle?.vehicleCode ? `کد خودرو: ${entry.vehicle.vehicleCode}` : entry.vehicle?.model || 'خودرو نامشخص'}
                                    </div>
                                    {entry.longRouteHistory && entry.longRouteHistory.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-700">
                                            <div className="font-semibold">سوابق مسیر دور در چرخه جاری:</div>
                                            <ul className="list-disc pr-4 mt-1 space-y-1">
                                                {entry.longRouteHistory.map(history => (
                                                    <li key={history.id}>
                                                        {history.city || 'نامشخص'} - {history.round_trip_km ? `${history.round_trip_km} کیلومتر` : '---'} - {new Date(history.created_at).toLocaleDateString('fa-IR')}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-700">اعلام بارهای در انتظار</h4>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {stageCandidates.announcements.length === 0 && (
                                <div className="text-xs text-slate-400 text-center py-4">اعلام باری در این مرحله وجود ندارد.</div>
                            )}
                            {stageCandidates.announcements.map(ann => {
                                const isStage1 = stage === 'stage1';
                                const isFar = ann.route && ann.route.route_category === 'دور';
                                const disabled = isStage1 && !isFar;
                                return (
                                    <label
                                        key={ann.id}
                                        className={`block border rounded-lg p-2 text-xs space-y-1 cursor-pointer transition ${
                                            selectedAnnouncement === ann.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            className="hidden"
                                            disabled={disabled}
                                            checked={selectedAnnouncement === ann.id}
                                            onChange={() => setSelectedAnnouncement(ann.id)}
                                        />
                                        <div className="flex justify-between">
                                            <span className="font-semibold text-slate-700">{ann.destination?.city || 'شهر نامشخص'}</span>
                                            <span className="text-slate-500">{ann.route?.round_trip_km ? `${ann.route.round_trip_km} کیلومتر` : '---'}</span>
                                        </div>
                                        <div className="text-slate-600">
                                            {ann.route?.route_category || '---'} {ann.route?.province ? `| استان ${ann.route.province}` : ''}
                                        </div>
                                        <div className="text-slate-500 text-[11px]">
                                            کد اعلام بار: {ann.announcementCode || '---'} | نوع لاین: {ann.lineType || '---'}
                                        </div>
                                        {disabled && <div className="text-amber-600 text-[11px]">این مسیر در مرحله اول قابل انتخاب نیست.</div>}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-3">
                        <h4 className="text-sm font-semibold text-slate-700 mb-2">خلاصه انتخاب</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-semibold text-slate-700">نوبت انتخاب شده</div>
                                {selectedQueueEntryDetail ? (
                                    <div className="mt-2 space-y-1">
                                        <div>راننده: {selectedQueueEntryDetail.driver?.name || '---'}</div>
                                        <div>کد پرسنلی: {selectedQueueEntryDetail.driver?.employeeId || '---'}</div>
                                        <div>خودرو: {selectedQueueEntryDetail.vehicle?.vehicleCode || selectedQueueEntryDetail.vehicle?.model || '---'}</div>
                                        <div>نوع نوبت: {queueTypeLabels[selectedQueueEntryDetail.queueType]}</div>
                                    </div>
                                ) : (
                                    <div className="mt-2 text-slate-400">نوبتی انتخاب نشده است.</div>
                                )}
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="font-semibold text-slate-700">اعلام بار انتخاب شده</div>
                                {selectedAnnouncementDetail ? (
                                    <div className="mt-2 space-y-1">
                                        <div>شهر مقصد: {selectedAnnouncementDetail.destination?.city || '---'}</div>
                                        <div>دسته مسیر: {selectedAnnouncementDetail.route?.route_category || '---'}</div>
                                        <div>مسافت: {selectedAnnouncementDetail.route?.round_trip_km ? `${selectedAnnouncementDetail.route.round_trip_km} کیلومتر` : '---'}</div>
                                        <div>کد اعلام بار: {selectedAnnouncementDetail.announcementCode || '---'}</div>
                                    </div>
                                ) : (
                                    <div className="mt-2 text-slate-400">اعلام باری انتخاب نشده است.</div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end mt-3">
                            <button
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 disabled:opacity-50"
                                onClick={handleAssign}
                                disabled={!selectedQueueEntry || !selectedAnnouncement}
                            >
                                ثبت تخصیص
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center text-slate-400 py-8">داده‌ای برای این مرحله یافت نشد.</div>
            )}
        </div>
    );

    const renderBoardSection = () => (
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">تابلو اعلام بار</h3>
                    <p className="text-sm text-slate-500">نمایش خودروها و رانندگان تخصیص داده شده به تفکیک شهر</p>
                </div>
                <button
                    onClick={fetchBoard}
                    className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                    بروزرسانی تابلو
                </button>
            </div>
            {boardLoading ? (
                <div className="text-center text-slate-500 py-8">در حال بارگذاری...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Object.entries(boardData).length === 0 && (
                        <div className="col-span-full text-center text-slate-400 py-6">موردی ثبت نشده است.</div>
                    )}
                    {Object.entries(boardData).map(([city, entries]) => (
                        <div key={city} className="border border-slate-200 rounded-2xl bg-slate-50">
                            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-slate-700">{city}</h4>
                                <span className="text-[11px] text-slate-500">تعداد: {entries.length}</span>
                            </div>
                            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                                {entries.map(entry => (
                                    <div key={entry.assignmentId} className="bg-white border border-slate-200 rounded-lg p-2 text-xs space-y-1">
                                        <div className="flex justify-between">
                                            <span className="font-semibold text-slate-700">راننده: {entry.driver?.name || 'نامشخص'}</span>
                                            <span className="text-slate-500">مرحله: {entry.stage === 'stage1' ? 'اول' : 'دوم'}</span>
                                        </div>
                                        <div className="text-slate-600">
                                            خودرو: {entry.vehicle?.vehicleCode || entry.vehicle?.model || 'نامشخص'}
                                        </div>
                                        <div className="text-slate-600">
                                            کد اعلام بار: {entry.announcementCode || '---'}
                                        </div>
                                        <div className="text-slate-600">
                                            دسته مسیر: {entry.route?.routeCategory || '---'} | مسافت: {entry.route?.roundTripKm ? `${entry.route.roundTripKm} کیلومتر` : '---'}
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            زمان تخصیص: {new Date(entry.createdAt).toLocaleString('fa-IR')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            {renderQueueSection()}
            {renderStageSection()}
            {renderBoardSection()}
        </div>
    );
};

export default TransportDispatchContainer;

