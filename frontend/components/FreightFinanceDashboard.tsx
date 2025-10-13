// This is a new file: components/FreightFinanceDashboard.tsx
import React, { useState, useMemo } from 'react';
import { FreightAnnouncement, Branch, FreightPaymentStatus, FreightTransaction, User, View } from '../types';
import { formatJalaliDateTime, formatJalali } from '../utils/jalali';
import { CreditCardIcon } from './icons/CreditCardIcon'; // Reusing icon
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface FreightFinanceDashboardProps {
    announcements: FreightAnnouncement[];
    branches: Branch[];
    transactions: FreightTransaction[];
    onAddTransaction: (transaction: Omit<FreightTransaction, 'id'>) => void;
    currentUser: User;
}

const isToday = (someDate: Date) => {
    const today = new Date();
    return someDate.getDate() === today.getDate() &&
        someDate.getMonth() === today.getMonth() &&
        someDate.getFullYear() === today.getFullYear();
}

const FreightFinanceDashboard: React.FC<FreightFinanceDashboardProps> = (props) => {
    const { announcements, currentUser, onAddTransaction, transactions } = props;
    const [filters, setFilters] = useState({ city: '', paymentStatus: '', startDate: '', endDate: '' });
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedAnn, setSelectedAnn] = useState<FreightAnnouncement | null>(null);
    const [dateView, setDateView] = useState<'today' | 'all'>('today');
    const [isRulesOpen, setIsRulesOpen] = useState(false);

    const enforcedCity = currentUser.branchCity;
    
    const filteredAnnouncements = useMemo(() => {
        return announcements.filter(ann => {
            if (dateView === 'today' && !isToday(ann.loadingDate)) return false;

            if (enforcedCity && !ann.destinations.some(d => d.city === enforcedCity)) return false;
            if (filters.city && !ann.destinations.some(d => d.city.includes(filters.city))) return false;
            if (filters.paymentStatus && ann.paymentStatus !== filters.paymentStatus) return false;
            
            const loadingDateTime = ann.loadingDate.getTime();
            if (filters.startDate && loadingDateTime < new Date(filters.startDate).getTime()) return false;
            if (filters.endDate && loadingDateTime > new Date(filters.endDate).getTime()) return false;
            
            return true;
        });
    }, [filters, announcements, enforcedCity, dateView]);

     const filteredTransactions = useMemo(() => {
        const announcementMap = new Map(announcements.map(ann => [ann.id, ann]));
        return transactions
            .map(t => ({
                ...t,
                announcement: announcementMap.get(t.announcementId)
            }))
            .filter(t => {
                if (!t.announcement) return false; // Don't show orphaned transactions
                if (!enforcedCity) return true; // Admins/Central see all
                // Branch users only see transactions for their city
                return t.announcement.destinations.some(d => d.city === enforcedCity);
            })
            .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
    }, [transactions, announcements, enforcedCity]);

    const handleOpenDialog = (ann: FreightAnnouncement) => {
        setSelectedAnn(ann);
        setIsDialogOpen(true);
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center"><CreditCardIcon className="w-6 h-6 mr-2 text-sky-600" />جستجوی مالی حمل</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                            <button onClick={() => setDateView('today')} className={`px-3 py-1 text-xs rounded-md ${dateView === 'today' ? 'bg-white shadow' : ''}`}>بارگیری امروز</button>
                            <button onClick={() => setDateView('all')} className={`px-3 py-1 text-xs rounded-md ${dateView === 'all' ? 'bg-white shadow' : ''}`}>مشاهده همه</button>
                        </div>
                        <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 border rounded-lg bg-slate-50">
                    <input placeholder="شهر..." value={enforcedCity || filters.city} onChange={e => setFilters(s => ({...s, city: e.target.value}))} className="input-style" disabled={!!enforcedCity} title={enforcedCity ? `فیلتر شده برای شعبه ${enforcedCity}` : ''}/>
                    <select value={filters.paymentStatus} onChange={e => setFilters(s => ({...s, paymentStatus: e.target.value}))} className="input-style">
                        <option value="">همه وضعیت‌ها</option>
                        <option value={FreightPaymentStatus.Paid}>پرداخت شده</option>
                        <option value={FreightPaymentStatus.Unpaid}>پرداخت نشده</option>
                    </select>
                    <div><label className="text-xs">از تاریخ بارگیری</label><input type="date" value={filters.startDate} onChange={e => setFilters(s => ({...s, startDate: e.target.value}))} className="input-style" /></div>
                    <div><label className="text-xs">تا تاریخ بارگیری</label><input type="date" value={filters.endDate} onChange={e => setFilters(s => ({...s, endDate: e.target.value}))} className="input-style" /></div>
                </div>
            </div>

             <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-bold">نتایج جستجو</h3>
                 <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm text-right">
                         <thead className="text-xs uppercase bg-gray-50"><tr><th className="p-2">کد</th><th className="p-2">تاریخ بارگیری</th><th className="p-2">شهر</th><th className="p-2">مبلغ</th><th className="p-2">وضعیت پرداخت</th><th className="p-2">عملیات</th></tr></thead>
                        <tbody>
                            {filteredAnnouncements.map(ann => (
                                <tr key={ann.id} className="border-b">
                                    <td className="p-2 font-mono">#{ann.announcementCode}</td>
                                    <td className="p-2">{formatJalali(ann.loadingDate)}</td>
                                    <td className="p-2">{ann.destinations.map(d=>d.city).join(', ')}</td>
                                    <td className="p-2 font-mono">{(ann.totalFreightCost || 0).toLocaleString('fa-IR')}</td>
                                    <td className="p-2 text-xs"><span className={`px-2 py-1 rounded-full ${ann.paymentStatus === FreightPaymentStatus.Paid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{ann.paymentStatus}</span></td>
                                    <td className="p-2"><button onClick={() => handleOpenDialog(ann)} className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600">ثبت تراکنش</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-bold">آخرین تراکنش‌ها</h3>
                <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm text-right">
                        <thead className="text-xs uppercase bg-gray-50">
                            <tr>
                                <th className="p-2">تاریخ تراکنش</th>
                                <th className="p-2">کد اعلام بار</th>
                                <th className="p-2">مقصد</th>
                                <th className="p-2">مبلغ</th>
                                <th className="p-2">وضعیت پرداخت</th>
                                <th className="p-2">یادداشت</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.slice(0, 10).map(t => (
                                <tr key={t.id} className="border-b">
                                    <td className="p-2 whitespace-nowrap">{formatJalali(new Date(t.transactionDate))}</td>
                                    <td className="p-2 font-mono">#{t.announcement?.announcementCode}</td>
                                    <td className="p-2">{t.announcement?.destinations.map(d => d.city).join(', ')}</td>
                                    <td className="p-2 font-mono">{t.amount.toLocaleString('fa-IR')}</td>
                                    <td className="p-2 text-xs">
                                        <span className={`px-2 py-1 rounded-full ${t.isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {t.isPaid ? 'پرداخت شده' : 'پرداخت نشده'}
                                        </span>
                                    </td>
                                    <td className="p-2 text-xs">{t.notes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

             {isDialogOpen && selectedAnn && <TransactionDialog announcement={selectedAnn} onClose={() => setIsDialogOpen(false)} onSave={onAddTransaction} />}
             {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.FreightFinance} userRole={currentUser.role} />
                         <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
             )}
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; }`}</style>
        </div>
    );
};

const TransactionDialog: React.FC<{announcement: FreightAnnouncement, onClose: ()=>void, onSave: (t: Omit<FreightTransaction, 'id'>)=>void}> = ({ announcement, onClose, onSave }) => {
    const [state, setState] = useState({
        amount: announcement.totalFreightCost || 0,
        transactionDate: new Date().toISOString().split('T')[0],
        notes: '',
        isPaid: false,
        invoiceImage: '',
        receiptImage: '',
        extraDocumentImage: '',
    });
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type, checked } = e.target as HTMLInputElement;
        setState(s => ({...s, [name]: type === 'checkbox' ? checked : value }));
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.files?.[0]) {
            setState(s => ({...s, [e.target.name]: e.target.files![0].name}));
        }
    }
    
    const handleSave = () => {
        onSave({
            announcementId: announcement.id,
            amount: Number(state.amount),
            transactionDate: new Date(state.transactionDate),
            notes: state.notes,
            isPaid: state.isPaid,
            invoiceImage: state.invoiceImage,
            receiptImage: state.receiptImage,
            extraDocumentImage: state.extraDocumentImage,
        });
        onClose();
    }
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b"><h3>تراکنش برای بار #{announcement.announcementCode}</h3></div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label>مبلغ تراکنش (ریال)</label><input name="amount" type="number" value={state.amount} onChange={handleChange} className="input-style mt-1"/></div>
                        <div><label>تاریخ تراکنش</label><input name="transactionDate" type="date" value={state.transactionDate} onChange={handleChange} className="input-style mt-1"/></div>
                    </div>
                    <textarea name="notes" placeholder="یادداشت..." value={state.notes} onChange={handleChange} className="input-style w-full" rows={3}/>
                    <div className="grid grid-cols-3 gap-4">
                        <FileInput label="فاکتور" name="invoiceImage" fileName={state.invoiceImage} onChange={handleFileChange} />
                        <FileInput label="رسید" name="receiptImage" fileName={state.receiptImage} onChange={handleFileChange} />
                        <FileInput label="سند اضافی" name="extraDocumentImage" fileName={state.extraDocumentImage} onChange={handleFileChange} />
                    </div>
                    <label className="flex items-center gap-2 font-semibold"><input name="isPaid" type="checkbox" checked={state.isPaid} onChange={handleChange}/> پرداخت شده</label>
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={onClose}>انصراف</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">ثبت</button>
                </div>
            </div>
        </div>
    );
};

const FileInput: React.FC<{label: string, name: string, fileName: string, onChange: (e: React.ChangeEvent<HTMLInputElement>)=>void}> = ({label, name, fileName, onChange}) => (
    <div>
        <label className="text-sm">{label}</label>
        <label className={`mt-1 flex items-center justify-center p-2 border-2 border-dashed rounded cursor-pointer ${fileName ? 'border-green-400' : 'border-slate-300 hover:border-sky-400'}`}>
            <span className={`text-xs ${fileName ? 'text-green-600' : 'text-slate-500'}`}>{fileName || 'انتخاب فایل'}</span>
            <input type="file" name={name} onChange={onChange} className="sr-only" />
        </label>
    </div>
)


export default FreightFinanceDashboard;