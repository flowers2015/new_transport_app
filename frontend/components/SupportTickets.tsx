import React, { useMemo, useState } from 'react';
import {
    SupportTicket,
    SupportTicketPriority,
    SupportTicketStatus,
    User,
} from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { TicketIcon } from './icons/TicketIcon';

export type CreateTicketPayload = {
    subject: string;
    description: string;
    priority: string;
    contactPhone?: string;
    contactExtension: string;
    employeeId?: string;
};

interface SupportTicketsProps {
    tickets: SupportTicket[];
    currentUser: User;
    loading?: boolean;
    error?: string | null;
    onRefresh?: () => void;
    onAddTicket: (payload: CreateTicketPayload) => Promise<void>;
}

const PRIORITY_OPTIONS = Object.values(SupportTicketPriority);

const statusStyles: Record<string, string> = {
    [SupportTicketStatus.Open]: 'bg-blue-100 text-blue-800',
    [SupportTicketStatus.InProgress]: 'bg-yellow-100 text-yellow-800',
    [SupportTicketStatus.Answered]: 'bg-emerald-100 text-emerald-800',
    [SupportTicketStatus.Closed]: 'bg-slate-200 text-slate-700',
};

const priorityStyles: Record<string, string> = {
    [SupportTicketPriority.Low]: 'bg-slate-100 text-slate-700',
    [SupportTicketPriority.Normal]: 'bg-sky-100 text-sky-800',
    [SupportTicketPriority.High]: 'bg-orange-100 text-orange-800',
    [SupportTicketPriority.Urgent]: 'bg-red-100 text-red-800',
};

const SupportTickets: React.FC<SupportTicketsProps> = ({
    tickets,
    currentUser,
    loading,
    error,
    onRefresh,
    onAddTicket,
}) => {
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<string>(SupportTicketPriority.Normal);
    const [contactExtension, setContactExtension] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [employeeId, setEmployeeId] = useState(currentUser.employeeId || '');
    const [showConfirm, setShowConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const sortedTickets = useMemo(
        () =>
            [...tickets].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        [tickets]
    );

    const resetForm = () => {
        setSubject('');
        setDescription('');
        setPriority(SupportTicketPriority.Normal);
        setContactPhone('');
        setShowConfirm(false);
        setFormError(null);
    };

    const validate = (): string | null => {
        if (!subject.trim()) return 'عنوان تیکت را وارد کنید';
        if (!description.trim()) return 'متن تیکت را وارد کنید';
        if (!contactExtension.trim()) return 'شماره داخلی الزامی است';
        return null;
    };

    const handlePrepareSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) {
            setFormError(err);
            return;
        }
        setFormError(null);
        setShowConfirm(true);
    };

    const handleConfirmSubmit = async () => {
        const err = validate();
        if (err) {
            setFormError(err);
            setShowConfirm(false);
            return;
        }
        setBusy(true);
        try {
            await onAddTicket({
                subject: subject.trim(),
                description: description.trim(),
                priority,
                contactExtension: contactExtension.trim(),
                contactPhone: contactPhone.trim() || undefined,
                employeeId: employeeId.trim() || undefined,
            });
            resetForm();
            setContactExtension(contactExtension.trim());
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'خطا در ثبت');
            setShowConfirm(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 p-4" dir="rtl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">تیکت پشتیبانی</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        ثبت درخواست پشتیبانی سیستم — پاسخ از طریق همین صفحه
                    </p>
                </div>
                {onRefresh && (
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="text-sm px-3 py-1.5 border rounded-md hover:bg-slate-50"
                    >
                        بروزرسانی
                    </button>
                )}
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
                    {error}
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-4">اطلاعات درخواست‌دهنده</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-slate-500 text-xs">نام</div>
                        <div className="font-medium">{currentUser.name || currentUser.username}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-slate-500 text-xs">نام کاربری</div>
                        <div className="font-medium">{currentUser.username}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-slate-500 text-xs">نقش</div>
                        <div className="font-medium">{currentUser.role}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-slate-500 text-xs">کد پرسنلی</div>
                        <input
                            className="mt-1 w-full input-style text-sm"
                            value={employeeId}
                            onChange={e => setEmployeeId(e.target.value)}
                            placeholder="در صورت نبود در سیستم"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <PlusCircleIcon className="w-6 h-6 mr-2 text-sky-600" />
                    ثبت تیکت جدید
                </h2>
                <form onSubmit={handlePrepareSubmit} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                عنوان تیکت <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="mt-1 w-full input-style"
                                placeholder="مثلاً: خطا در ثبت نوبت"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                اولویت <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={priority}
                                onChange={e => setPriority(e.target.value)}
                                className="mt-1 w-full input-style"
                            >
                                {PRIORITY_OPTIONS.map(p => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                شماره داخلی <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={contactExtension}
                                onChange={e => setContactExtension(e.target.value)}
                                className="mt-1 w-full input-style ltr text-left"
                                placeholder="مثلاً 1234"
                                required
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                برای تماس پشتیبانی — الزامی
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                موبایل (اختیاری)
                            </label>
                            <input
                                type="text"
                                value={contactPhone}
                                onChange={e => setContactPhone(e.target.value)}
                                className="mt-1 w-full input-style ltr text-left"
                                placeholder="09xxxxxxxxx"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700">
                            شرح مشکل <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={5}
                            className="mt-1 w-full input-style"
                            placeholder="مراحل تکرار مشکل، صفحه، پیام خطا و ..."
                            required
                        />
                    </div>

                    {formError && (
                        <div className="text-sm text-red-600">{formError}</div>
                    )}

                    <div className="flex flex-wrap gap-2 justify-end">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-50"
                            disabled={busy}
                        >
                            انصراف / پاک کردن
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                            disabled={busy}
                        >
                            بررسی و تأیید
                        </button>
                    </div>
                </form>
            </div>

            {showConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <h3 className="font-bold text-lg">تأیید ثبت تیکت</h3>
                        <div className="text-sm space-y-1 text-slate-600">
                            <p>
                                <span className="font-medium text-slate-800">عنوان:</span>{' '}
                                {subject}
                            </p>
                            <p>
                                <span className="font-medium text-slate-800">اولویت:</span>{' '}
                                {priority}
                            </p>
                            <p>
                                <span className="font-medium text-slate-800">داخلی:</span>{' '}
                                {contactExtension}
                            </p>
                            {contactPhone && (
                                <p>
                                    <span className="font-medium text-slate-800">موبایل:</span>{' '}
                                    {contactPhone}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowConfirm(false)}
                                className="px-4 py-2 text-sm border rounded-md"
                                disabled={busy}
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSubmit}
                                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md disabled:opacity-50"
                                disabled={busy}
                            >
                                {busy ? 'در حال ثبت...' : 'تأیید و ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <TicketIcon className="w-6 h-6 mr-2 text-slate-600" />
                    تیکت‌های من
                    {loading && (
                        <span className="text-xs font-normal text-slate-400 mr-2">
                            در حال بارگذاری...
                        </span>
                    )}
                </h2>
                <div className="space-y-4">
                    {sortedTickets.length > 0 ? (
                        sortedTickets.map(ticket => (
                            <div
                                key={ticket.id}
                                className="p-4 border border-slate-200 bg-slate-50 rounded-lg"
                            >
                                <div className="flex flex-wrap justify-between items-start gap-2">
                                    <div>
                                        <h3 className="font-bold text-slate-800">
                                            {ticket.ticketNumber
                                                ? `#${ticket.ticketNumber} — `
                                                : ''}
                                            {ticket.subject}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${priorityStyles[ticket.priority] || priorityStyles[SupportTicketPriority.Normal]}`}
                                            >
                                                {ticket.priority}
                                            </span>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[ticket.status] || statusStyles[SupportTicketStatus.Open]}`}
                                            >
                                                {ticket.status}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-500 whitespace-nowrap">
                                        {formatJalaliDateTime(
                                            ticket.createdAt instanceof Date
                                                ? ticket.createdAt
                                                : new Date(ticket.createdAt)
                                        )}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
                                    {ticket.description}
                                </p>
                                {ticket.adminResponse && (
                                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-md text-sm">
                                        <div className="font-medium text-emerald-800 mb-1">
                                            پاسخ پشتیبانی:
                                        </div>
                                        <p className="text-emerald-900 whitespace-pre-wrap">
                                            {ticket.adminResponse}
                                        </p>
                                    </div>
                                )}
                                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                                    داخلی: {ticket.contactExtension}
                                    {ticket.contactPhone ? ` — موبایل: ${ticket.contactPhone}` : ''}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-slate-500 py-8">
                            هنوز تیکتی ثبت نکرده‌اید.
                        </p>
                    )}
                </div>
            </div>

            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default SupportTickets;
