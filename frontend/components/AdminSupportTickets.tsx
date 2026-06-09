import React, { useMemo, useState } from 'react';
import {
    SupportTicket,
    SupportTicketPriority,
    SupportTicketStatus,
    User,
} from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
import SupportTickets, { CreateTicketPayload } from './SupportTickets';
import { buildExcelFileName, downloadStyledExcel } from '../utils/excelExport';

interface Props {
    tickets: SupportTicket[];
    currentUser: User;
    loading?: boolean;
    error?: string | null;
    onRefresh: () => void;
    onAddTicket: (payload: CreateTicketPayload) => Promise<void>;
    onUpdateTicket: (
        ticketId: string,
        updates: { status?: string; priority?: string; adminResponse?: string }
    ) => Promise<void>;
}

const AdminSupportTickets: React.FC<Props> = ({
    tickets,
    currentUser,
    loading,
    error,
    onRefresh,
    onAddTicket,
    onUpdateTicket,
}) => {
    const [tab, setTab] = useState<'manage' | 'create'>('manage');
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftStatus, setDraftStatus] = useState('');
    const [draftPriority, setDraftPriority] = useState('');
    const [draftResponse, setDraftResponse] = useState('');
    const [busy, setBusy] = useState(false);

    const filtered = useMemo(() => {
        return tickets.filter(t => {
            if (statusFilter && t.status !== statusFilter) return false;
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                const hay = [
                    t.subject,
                    t.description,
                    t.createdByUserName,
                    t.employeeId,
                    String(t.ticketNumber || ''),
                ]
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [tickets, statusFilter, priorityFilter, search]);

    const stats = useMemo(() => {
        const map: Record<string, number> = {};
        tickets.forEach(t => {
            map[t.status] = (map[t.status] || 0) + 1;
        });
        return map;
    }, [tickets]);

    const openEdit = (ticket: SupportTicket) => {
        setEditingId(ticket.id);
        setDraftStatus(String(ticket.status));
        setDraftPriority(String(ticket.priority));
        setDraftResponse(ticket.adminResponse || '');
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setBusy(true);
        try {
            await onUpdateTicket(editingId, {
                status: draftStatus,
                priority: draftPriority,
                adminResponse: draftResponse,
            });
            setEditingId(null);
        } finally {
            setBusy(false);
        }
    };

    const exportExcel = async () => {
        const headers = [
            'شماره',
            'عنوان',
            'اولویت',
            'وضعیت',
            'ثبت‌کننده',
            'نقش',
            'کد پرسنلی',
            'داخلی',
            'موبایل',
            'تاریخ',
            'شرح',
            'پاسخ ادمین',
        ];
        const rows = filtered.map(t =>
            [
                t.ticketNumber ?? '',
                t.subject,
                t.priority,
                t.status,
                t.createdByUserName,
                t.createdByRole ?? '',
                t.employeeId ?? '',
                t.contactExtension,
                t.contactPhone ?? '',
                formatJalaliDateTime(
                    t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)
                ),
                t.description,
                t.adminResponse ?? '',
            ].map(String)
        );
        await downloadStyledExcel({
            sheetName: 'تیکت‌های پشتیبانی',
            fileName: buildExcelFileName('تیکت_پشتیبانی', 'همه'),
            headers,
            rows,
        });
    };

    if (tab === 'create') {
        return (
            <div>
                <div className="p-4 max-w-6xl mx-auto">
                    <button
                        type="button"
                        onClick={() => setTab('manage')}
                        className="text-sm text-sky-700 hover:underline"
                    >
                        ← بازگشت به مدیریت تیکت‌ها
                    </button>
                </div>
                <SupportTickets
                    tickets={tickets.filter(t => t.createdByUserId === currentUser.id)}
                    currentUser={currentUser}
                    loading={loading}
                    error={error}
                    onRefresh={onRefresh}
                    onAddTicket={onAddTicket}
                />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 space-y-6" dir="rtl">
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">مدیریت تیکت‌های پشتیبانی</h1>
                    <p className="text-sm text-slate-500 mt-1">پنل ادمین — پیگیری و پاسخ به درخواست‌ها</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setTab('create')}
                        className="px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
                    >
                        ثبت تیکت (ادمین)
                    </button>
                    <button
                        type="button"
                        onClick={exportExcel}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                        اکسل
                    </button>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
                    >
                        بروزرسانی
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.values(SupportTicketStatus).map(s => (
                    <div key={s} className="bg-white rounded-lg border p-3 text-center">
                        <div className="text-2xl font-bold text-slate-800">{stats[s] || 0}</div>
                        <div className="text-xs text-slate-500">{s}</div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
                <input
                    className="input-style flex-1 min-w-[160px]"
                    placeholder="جستجو..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select
                    className="input-style"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="">همه وضعیت‌ها</option>
                    {Object.values(SupportTicketStatus).map(s => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
                <select
                    className="input-style"
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value)}
                >
                    <option value="">همه اولویت‌ها</option>
                    {Object.values(SupportTicketPriority).map(p => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
            </div>

            <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="p-2 text-right">#</th>
                            <th className="p-2 text-right">عنوان</th>
                            <th className="p-2 text-right">ثبت‌کننده</th>
                            <th className="p-2 text-right">اولویت</th>
                            <th className="p-2 text-right">وضعیت</th>
                            <th className="p-2 text-right">تماس</th>
                            <th className="p-2 text-right">تاریخ</th>
                            <th className="p-2 w-24" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-slate-500">
                                    در حال بارگذاری...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-slate-500">
                                    تیکتی یافت نشد
                                </td>
                            </tr>
                        ) : (
                            filtered.map(ticket => (
                                <tr key={ticket.id} className="border-t border-slate-100">
                                    <td className="p-2 font-mono text-xs">
                                        {ticket.ticketNumber ?? '—'}
                                    </td>
                                    <td className="p-2 max-w-[200px]">
                                        <div className="font-medium truncate">{ticket.subject}</div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {ticket.description}
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <div>{ticket.createdByUserName}</div>
                                        <div className="text-xs text-slate-500">
                                            {ticket.createdByRole}
                                            {ticket.employeeId ? ` — ${ticket.employeeId}` : ''}
                                        </div>
                                    </td>
                                    <td className="p-2">{ticket.priority}</td>
                                    <td className="p-2">{ticket.status}</td>
                                    <td className="p-2 text-xs ltr text-left">
                                        {ticket.contactExtension}
                                        {ticket.contactPhone ? ` / ${ticket.contactPhone}` : ''}
                                    </td>
                                    <td className="p-2 text-xs whitespace-nowrap">
                                        {formatJalaliDateTime(
                                            ticket.createdAt instanceof Date
                                                ? ticket.createdAt
                                                : new Date(ticket.createdAt)
                                        )}
                                    </td>
                                    <td className="p-2">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(ticket)}
                                            className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                                        >
                                            مدیریت
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {editingId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-lg">مدیریت تیکت</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-500">وضعیت</label>
                                <select
                                    className="input-style w-full mt-1"
                                    value={draftStatus}
                                    onChange={e => setDraftStatus(e.target.value)}
                                >
                                    {Object.values(SupportTicketStatus).map(s => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">اولویت</label>
                                <select
                                    className="input-style w-full mt-1"
                                    value={draftPriority}
                                    onChange={e => setDraftPriority(e.target.value)}
                                >
                                    {Object.values(SupportTicketPriority).map(p => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">پاسخ / یادداشت پشتیبانی</label>
                            <textarea
                                className="input-style w-full mt-1"
                                rows={4}
                                value={draftResponse}
                                onChange={e => setDraftResponse(e.target.value)}
                                placeholder="پاسخ به کاربر..."
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-4 py-2 text-sm border rounded-md"
                                disabled={busy}
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md disabled:opacity-50"
                                disabled={busy}
                            >
                                {busy ? 'ذخیره...' : 'ذخیره'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.input-style { display: block; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; }`}</style>
        </div>
    );
};

export default AdminSupportTickets;
