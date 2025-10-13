import React, { useState, useMemo } from 'react';
import { SupportTicket, SupportTicketStatus, User, UserRole } from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { TicketIcon } from './icons/TicketIcon';

interface SupportTicketsProps {
    tickets: SupportTicket[];
    currentUser: User;
    onAddTicket: (ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'status' | 'createdByUserId' | 'createdByUserName'>) => void;
    onUpdateTicket: (ticketId: string, status: SupportTicketStatus) => void;
}

const SupportTickets: React.FC<SupportTicketsProps> = ({ tickets, currentUser, onAddTicket, onUpdateTicket }) => {
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (subject.trim() && description.trim()) {
            onAddTicket({ subject, description });
            setSubject('');
            setDescription('');
        }
    };

    const statusStyles: { [key in SupportTicketStatus]: string } = {
        [SupportTicketStatus.Open]: 'bg-blue-100 text-blue-800',
        [SupportTicketStatus.InProgress]: 'bg-yellow-100 text-yellow-800',
        [SupportTicketStatus.Closed]: 'bg-green-100 text-green-800',
    };

    const isAdmin = currentUser.role === UserRole.Admin;

    const sortedTickets = useMemo(() => 
        [...tickets].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [tickets]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <PlusCircleIcon className="w-6 h-6 mr-2 text-sky-600" />
                    ایجاد تیکت پشتیبانی جدید
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-slate-700">موضوع</label>
                        <input type="text" id="subject" value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full input-style" required />
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700">شرح مشکل</label>
                        <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} className="mt-1 w-full input-style" required />
                    </div>
                    <div className="text-right">
                        <button type="submit" className="px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">
                            ثبت تیکت
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <TicketIcon className="w-6 h-6 mr-2 text-slate-600" />
                    لیست تیکت‌ها
                </h2>
                <div className="space-y-4">
                    {sortedTickets.length > 0 ? (
                        sortedTickets.map(ticket => (
                            <div key={ticket.id} className="p-4 border border-slate-200 bg-slate-50 rounded-lg">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-slate-800">{ticket.subject}</h3>
                                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatJalaliDateTime(ticket.createdAt)}</span>
                                </div>
                                <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{ticket.description}</p>
                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs text-slate-500">ایجاد شده توسط: <span className="font-semibold">{ticket.createdByUserName}</span></p>
                                    <div>
                                        {isAdmin ? (
                                            <select
                                                value={ticket.status}
                                                onChange={(e) => onUpdateTicket(ticket.id, e.target.value as SupportTicketStatus)}
                                                className={`px-2 py-1 rounded-full text-xs font-semibold border-none outline-none appearance-none cursor-pointer ${statusStyles[ticket.status]}`}
                                            >
                                                {Object.values(SupportTicketStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusStyles[ticket.status]}`}>
                                                {ticket.status}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-slate-500 py-8">هیچ تیکت پشتیبانی ثبت نشده است.</p>
                    )}
                </div>
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default SupportTickets;