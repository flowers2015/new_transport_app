// This is a new file: components/CentralFinanceDashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, FreightPaymentStatus, FreightTransaction, User, Destination } from '../types';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import { CreditCardIcon } from './icons/CreditCardIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { getApiUrl, getFileUrl } from '../utils/apiConfig';

// تابع برای نرمال‌سازی تاریخ شمسی (تبدیل - به / و اطمینان از فرمت YYYY/MM/DD)
const normalizeJalaliDateString = (dateStr: string): string => {
    if (!dateStr) return '';
    // تبدیل - به /
    let normalized = dateStr.replace(/-/g, '/');
    // اطمینان از فرمت صحیح
    const parts = normalized.split('/');
    if (parts.length === 3) {
        const year = parts[0];
        const month = String(parseInt(parts[1], 10)).padStart(2, '0');
        const day = String(parseInt(parts[2], 10)).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }
    return normalized;
};

// تابع برای محاسبه سه ماه قبل (شمسی)
const getThreeMonthsAgoJalali = (): string => {
    const today = new Date();
    const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    
    // سه ماه قبل
    let startYear = jy;
    let startMonth = jm - 3;
    if (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
    }
    
    return `${startYear}/${String(startMonth).padStart(2, '0')}/01`;
};

interface CentralFinanceDashboardProps {
    announcements: FreightAnnouncement[];
    transactions: FreightTransaction[];
    currentUser: User;
    onRefresh: () => void;
}

const CentralFinanceDashboard: React.FC<CentralFinanceDashboardProps> = (props) => {
    const { announcements, transactions, currentUser, onRefresh } = props;
    
    console.log('🚀 [CentralFinance] Component rendered', {
        announcementsCount: announcements?.length || 0,
        transactionsCount: transactions?.length || 0,
        currentUser: currentUser?.username || 'N/A'
    });
    
    // بازه پیش‌فرض: سه ماه گذشته تا امروز
    const defaultStartDate = getThreeMonthsAgoJalali();
    const today = new Date();
    const [jyToday, jmToday, jdToday] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const defaultEndDate = `${jyToday}/${String(jmToday).padStart(2, '0')}/${String(jdToday).padStart(2, '0')}`;
    
    const [filters, setFilters] = useState({ 
        city: '', 
        paymentStatus: '',
        representativeName: '', // نام نماینده
        representativeType: '', // نماینده یا پخش
        startDate: defaultStartDate, // حالا مستقیماً شمسی است
        endDate: defaultEndDate // حالا مستقیماً شمسی است
    });
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [selectedTransactionForView, setSelectedTransactionForView] = useState<FreightTransaction | null>(null);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [selectedTransactionForReject, setSelectedTransactionForReject] = useState<FreightTransaction | null>(null);
    const [selectedDestinationIdForReject, setSelectedDestinationIdForReject] = useState<string | null>(null);
    const [rejectNotes, setRejectNotes] = useState('');
    
    // صفحه‌بندی
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(30); // پیش‌فرض 30 ردیف در هر صفحه

    // به‌روزرسانی خودکار تاریخ‌ها با تغییر ماه شمسی
    useEffect(() => {
        const updateDates = () => {
            const newStartDate = getThreeMonthsAgoJalali();
            const today = new Date();
            const [jyToday, jmToday, jdToday] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const newEndDate = `${jyToday}/${String(jmToday).padStart(2, '0')}/${String(jdToday).padStart(2, '0')}`;
            
            setFilters(prev => ({
                ...prev,
                startDate: prev.startDate === defaultStartDate ? newStartDate : prev.startDate,
                endDate: prev.endDate === defaultEndDate ? newEndDate : prev.endDate
            }));
        };

        // بررسی هر دقیقه برای تغییر ماه شمسی
        const interval = setInterval(updateDates, 60000); // هر 1 دقیقه
        
        // بررسی اولیه
        updateDates();
        
        return () => clearInterval(interval);
    }, [defaultStartDate, defaultEndDate]);

    // تبدیل announcements به ردیف‌های جداگانه برای هر مقصد
    // مالی ستاد باید همه بارنامه‌های پرداخت شده و نشده را ببیند (همه شعب)
    const destinationRows = useMemo(() => {
        console.log('🔍 [CentralFinance] useMemo triggered - Filtering announcements:', {
            totalAnnouncements: announcements?.length || 0,
            currentFilter: filters.representativeType || '(همه)',
            filters: filters
        });
        
        const rows: Array<{
            announcement: FreightAnnouncement;
            destination: Destination;
            destinationFreightCost: number;
            paymentStatus: FreightPaymentStatus;
        }> = [];

        announcements.forEach(ann => {
            // فقط خودروهای شخصی
            if (ann.assignmentType !== 'personal') {
                return;
            }
            
            // بررسی اینکه driver تخصیص داده شده
            const driverName = ann.assignedDriverName || (ann as any).assigned_driver_name || '';
            const driverId = ann.assignedDriverId || (ann as any).assigned_driver_id;
            const hasDriverAssigned = (driverId && driverId !== '-') || (driverName && driverName !== '-');
            
            const isAssigned = 
                hasDriverAssigned ||
                ann.status === 'Assigned' ||
                ann.status === 'InTransit' ||
                ann.status === 'Finalized';
            
            if (!isAssigned) {
                return;
            }

            // فیلتر تاریخ بارگیری (شمسی)
            if (filters.startDate || filters.endDate) {
                let annJalaliDate: string;
                // تبدیل loadingDate به فرمت استاندارد YYYY/MM/DD
                if (typeof ann.loadingDate === 'string') {
                    annJalaliDate = normalizeJalaliDateString(ann.loadingDate);
                    // بررسی فرمت صحیح
                    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(annJalaliDate)) {
                        return; // تاریخ نامعتبر
                    }
                } else if (ann.loadingDate instanceof Date) {
                    const [jy, jm, jd] = gregorianToJalali(ann.loadingDate.getFullYear(), ann.loadingDate.getMonth() + 1, ann.loadingDate.getDate());
                    annJalaliDate = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
                } else {
                    return; // تاریخ نامعتبر
                }
                
                // نرمال‌سازی فیلترهای تاریخ
                if (filters.startDate) {
                    const startJalali = normalizeJalaliDateString(filters.startDate);
                    if (annJalaliDate < startJalali) {
                        return;
                    }
                }
                if (filters.endDate) {
                    const endJalali = normalizeJalaliDateString(filters.endDate);
                    if (annJalaliDate > endJalali) {
                        return;
                    }
                }
            }

            // فیلتر مقاصد
            ann.destinations.forEach(dest => {
                // فیلتر شهر
                if (filters.city && !dest.city.includes(filters.city)) {
                    return;
                }

                // فیلتر نوع (نماینده یا پخش)
                // اگر representative_name خالی یا null یا "پخش" باشد، پخش است
                // در غیر این صورت نماینده است
                const destRepresentativeName = dest.representativeName || dest.representative_name || '';
                const normalizedRepName = destRepresentativeName === 'NULL' || destRepresentativeName === null || destRepresentativeName === '' ? '' : destRepresentativeName.trim();
                const isPakhsh = normalizedRepName === 'پخش' || normalizedRepName === '';
                const isNamayande = !isPakhsh && normalizedRepName !== '';
                
                // لاگ برای دیباگ
                if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                    console.log('🔍 [CentralFinance] Processing namayande destination:', {
                        annCode: ann.announcementCode,
                        city: dest.city,
                        repName: normalizedRepName,
                        originalRepName: destRepresentativeName,
                        isPakhsh,
                        isNamayande,
                        currentFilter: filters.representativeType || '(همه)',
                        willPassFilter: filters.representativeType === '' || (filters.representativeType === 'نماینده' && isNamayande)
                    });
                }
                
                // فیلتر نام نماینده (اگر پخش باشد، "پخش" را هم در نظر بگیر)
                if (filters.representativeName) {
                    const searchTerm = filters.representativeName.trim();
                    const displayName = isPakhsh ? 'پخش' : destRepresentativeName;
                    if (!displayName.includes(searchTerm)) {
                        return;
                    }
                }
                
                if (filters.representativeType) {
                    if (filters.representativeType === 'پخش' && !isPakhsh) {
                        if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                            console.log('🚫 [CentralFinance] Namayande filtered: filter is "پخش" but this is namayande');
                        }
                        return;
                    }
                    if (filters.representativeType === 'نماینده' && !isNamayande) {
                        if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                            console.log('🚫 [CentralFinance] Namayande filtered: filter is "نماینده" but isNamayande =', isNamayande, {
                                repName: destRepresentativeName,
                                normalizedRepName,
                                isPakhsh
                            });
                        }
                        return;
                    }
                }

                // محاسبه paymentStatus برای این مقصد خاص - فقط تراکنش‌هایی که destination_id مطابقت دارد
                const annTransactions = transactions.filter(t => {
                    if (t.announcementId !== ann.id) return false;
                    // اگر destination_id وجود دارد، فقط آن را در نظر بگیر
                    if (t.destinationId) {
                        return t.destinationId === dest.id;
                    }
                    // اگر destination_id وجود ندارد (برای backward compatibility)، همه را در نظر بگیر
                    return true;
                });
                let destPaymentStatus = FreightPaymentStatus.Unpaid;
                if (annTransactions.length > 0) {
                    const hasPaid = annTransactions.some(t => t.isPaid);
                    destPaymentStatus = hasPaid ? FreightPaymentStatus.Paid : FreightPaymentStatus.Unpaid;
                }

                // فیلتر وضعیت پرداخت
                if (filters.paymentStatus && destPaymentStatus !== filters.paymentStatus) {
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log('🚫 [CentralFinance] Namayande filtered: paymentStatus mismatch', {
                            destPaymentStatus,
                            filterPaymentStatus: filters.paymentStatus
                        });
                    }
                    return;
                }

                // لاگ برای اضافه شدن نماینده به rows
                if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                    console.log('✅ [CentralFinance] Namayande destination ADDED to rows:', {
                        annCode: ann.announcementCode,
                        city: dest.city,
                        repName: normalizedRepName,
                        paymentStatus: destPaymentStatus,
                        currentFilter: filters.representativeType || '(همه)'
                    });
                }

                rows.push({
                    announcement: ann,
                    destination: dest,
                    destinationFreightCost: dest.freightCost || 0,
                    paymentStatus: destPaymentStatus,
                });
            });
        });

        // آمار نهایی
        const finalPakhshCount = rows.filter(r => {
            const repName = r.destination.representativeName || r.destination.representative_name || '';
            const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
            return normalizedRepName === 'پخش' || normalizedRepName === '';
        }).length;
        const finalNamayandeCount = rows.filter(r => {
            const repName = r.destination.representativeName || r.destination.representative_name || '';
            const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
            return normalizedRepName !== 'پخش' && normalizedRepName !== '';
        }).length;
        
        console.log('📊 [CentralFinance] Final filtering results:', {
            totalRows: rows.length,
            finalPakhshCount: finalPakhshCount,
            finalNamayandeCount: finalNamayandeCount,
            currentFilter: filters.representativeType || '(همه)',
            sampleNamayandeRows: rows
                .filter(r => {
                    const repName = r.destination.representativeName || r.destination.representative_name || '';
                    const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
                    return normalizedRepName !== 'پخش' && normalizedRepName !== '';
                })
                .slice(0, 5)
                .map(r => ({
                    annCode: r.announcement.announcementCode,
                    city: r.destination.city,
                    repName: r.destination.representativeName || r.destination.representative_name || '(خالی)'
                }))
        });

        return rows;
    }, [announcements, transactions, filters]);

    // محاسبه صفحه‌بندی
    const totalPages = Math.ceil(destinationRows.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRows = destinationRows.slice(startIndex, endIndex);
    
    // لاگ برای بررسی pagination
    const namayandeInPaginated = paginatedRows.filter(r => {
        const repName = r.destination.representativeName || r.destination.representative_name || '';
        const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
        return normalizedRepName !== 'پخش' && normalizedRepName !== '';
    }).length;
    
    console.log('📄 [CentralFinance] Pagination info:', {
        totalRows: destinationRows.length,
        currentPage: currentPage,
        itemsPerPage: itemsPerPage,
        startIndex: startIndex,
        endIndex: endIndex,
        paginatedRowsCount: paginatedRows.length,
        namayandeInPaginated: namayandeInPaginated,
        totalNamayandeInRows: destinationRows.filter(r => {
            const repName = r.destination.representativeName || r.destination.representative_name || '';
            const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
            return normalizedRepName !== 'پخش' && normalizedRepName !== '';
        }).length
    });

    // وقتی فیلترها تغییر می‌کنند، به صفحه اول برگرد
    useEffect(() => {
        setCurrentPage(1);
    }, [filters.city, filters.paymentStatus, filters.representativeName, filters.representativeType, filters.startDate, filters.endDate]);

    const handleReject = async () => {
        if (!selectedTransactionForReject) return;
        
        if (!rejectNotes.trim()) {
            alert('لطفاً توضیحات رد را وارد کنید');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const destinationId = selectedDestinationIdForReject || selectedTransactionForReject.destinationId || null;
            const response = await fetch(getApiUrl(`freight-transactions/${selectedTransactionForReject.announcementId}/reject`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    destinationId: destinationId,
                    notes: rejectNotes.trim()
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'خطا در رد تراکنش' }));
                throw new Error(errorData.message || 'خطا در رد تراکنش');
            }

            alert('تراکنش با موفقیت رد شد و به شعبه ارجاع داده شد');
            setRejectDialogOpen(false);
            setRejectNotes('');
            setSelectedTransactionForReject(null);
            setSelectedDestinationIdForReject(null);
            onRefresh();
        } catch (error: any) {
            console.error('❌ [CentralFinance] Error rejecting:', error);
            alert(`خطا: ${error.message || 'خطا در رد تراکنش'}`);
        }
    };

    const handleApprove = async (transaction: FreightTransaction, destinationId?: string) => {
        if (!confirm('آیا مطمئن هستید که می‌خواهید این تراکنش را تأیید کنید؟')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`freight-transactions/${transaction.announcementId}/approve`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    destinationId: destinationId || transaction.destinationId || null
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'خطا در تأیید تراکنش' }));
                throw new Error(errorData.message || 'خطا در تأیید تراکنش');
            }

            alert('تراکنش با موفقیت تأیید شد');
            onRefresh();
        } catch (error: any) {
            console.error('❌ [CentralFinance] Error approving:', error);
            alert(`خطا: ${error.message || 'خطا در تأیید تراکنش'}`);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                        <CreditCardIcon className="w-6 h-6 mr-2 text-sky-600" />
                        کارتابل مالی ستاد
                    </h2>
                    <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100">
                        <BookOpenIcon className="w-5 h-5 text-slate-600"/>
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 p-4 border rounded-lg bg-slate-50">
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">از تاریخ بارگیری (شمسی)</label>
                        <input 
                            type="text" 
                            value={filters.startDate} 
                            onChange={e => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setFilters(s => ({...s, startDate: value}));
                                }
                            }}
                            placeholder="1404/05/01"
                            className="input-style"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">تا تاریخ بارگیری (شمسی)</label>
                        <input 
                            type="text" 
                            value={filters.endDate} 
                            onChange={e => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setFilters(s => ({...s, endDate: value}));
                                }
                            }}
                            placeholder="1404/08/28"
                            className="input-style"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">شهر</label>
                        <input 
                            placeholder="شهر..." 
                            value={filters.city} 
                            onChange={e => setFilters(s => ({...s, city: e.target.value}))} 
                            className="input-style"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">نام نماینده</label>
                        <input 
                            placeholder="نام نماینده..." 
                            value={filters.representativeName} 
                            onChange={e => setFilters(s => ({...s, representativeName: e.target.value}))} 
                            className="input-style"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">نوع (نماینده/پخش)</label>
                        <select 
                            value={filters.representativeType} 
                            onChange={e => setFilters(s => ({...s, representativeType: e.target.value}))} 
                            className="input-style"
                        >
                            <option value="">همه</option>
                            <option value="نماینده">نماینده</option>
                            <option value="پخش">پخش</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">وضعیت پرداخت</label>
                        <select 
                            value={filters.paymentStatus} 
                            onChange={e => setFilters(s => ({...s, paymentStatus: e.target.value}))} 
                            className="input-style"
                        >
                            <option value="">همه وضعیت‌ها</option>
                            <option value={FreightPaymentStatus.Paid}>پرداخت شده</option>
                            <option value={FreightPaymentStatus.Unpaid}>پرداخت نشده</option>
                        </select>
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                            <tr>
                                <th className="p-2">کد اعلام بار</th>
                                <th className="p-2">تاریخ بارگیری</th>
                                <th className="p-2">لاین</th>
                                <th className="p-2">نوع خودرو</th>
                                <th className="p-2">مقصد</th>
                                <th className="p-2">نام نماینده</th>
                                <th className="p-2">نوع (نماینده/پخش)</th>
                                <th className="p-2">شماره بارنامه</th>
                                <th className="p-2">مبلغ کرایه (ریال)</th>
                                <th className="p-2">نام راننده</th>
                                <th className="p-2">شماره پلاک</th>
                                <th className="p-2">وضعیت پرداخت</th>
                                <th className="p-2">توضیحات ارجاع شعبه</th>
                                <th className="p-2">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((row, idx) => {
                                const ann = row.announcement;
                                const dest = row.destination;
                                // پیدا کردن تراکنش برای این مقصد خاص
                                const existingTransaction = transactions.find(t => {
                                    if (t.announcementId !== ann.id) return false;
                                    // اگر destination_id وجود دارد، فقط آن را در نظر بگیر
                                    if (t.destinationId) {
                                        return t.destinationId === dest.id;
                                    }
                                    // اگر destination_id وجود ندارد (برای backward compatibility)، همه را در نظر بگیر
                                    return true;
                                });
                                const isReferred = existingTransaction && existingTransaction.referralStatus === 'referred';
                                const isApproved = existingTransaction && existingTransaction.referralStatus === 'approved';
                                const isRejected = existingTransaction && existingTransaction.referralStatus === 'rejected';
                                
                                // لاگ برای نماینده و تعیین نوع نماینده/پخش
                                const destRepresentativeName = dest.representativeName || dest.representative_name || '';
                                const normalizedRepName = destRepresentativeName === 'NULL' || destRepresentativeName === null || destRepresentativeName === '' ? '' : destRepresentativeName.trim();
                                const isNamayande = normalizedRepName !== 'پخش' && normalizedRepName !== '';
                                const isPakhsh = normalizedRepName === 'پخش' || normalizedRepName === '';
                                const representativeTypeDisplay = isPakhsh ? 'پخش' : 'نماینده';
                                const representativeNameDisplay = isPakhsh ? 'پخش' : (destRepresentativeName || '-');
                                
                                // نمایش همه rows (چه تراکنش داشته باشند چه نداشته باشند)
                                // اگر تراکنش دارند، فقط آن‌هایی که status مناسب دارند را نمایش بده
                                // اگر تراکنش ندارند، هم نمایش بده (برای نماینده‌هایی که هنوز تراکنش ثبت نشده)
                                if (existingTransaction && (!isReferred && !isApproved && !isRejected)) {
                                    if (isNamayande) {
                                        console.log('🚫 [CentralFinance] Namayande row filtered in table render (has transaction but wrong status):', {
                                            annCode: ann.announcementCode,
                                            city: dest.city,
                                            repName: normalizedRepName,
                                            referralStatus: existingTransaction?.referralStatus || 'none'
                                        });
                                    }
                                    return null;
                                }
                                
                                // اگر تراکنش ندارند، نمایش بده (برای نماینده‌هایی که هنوز تراکنش ثبت نشده)
                                if (!existingTransaction) {
                                    if (isNamayande) {
                                        console.log('✅ [CentralFinance] Namayande row without transaction will be displayed:', {
                                            annCode: ann.announcementCode,
                                            city: dest.city,
                                            repName: normalizedRepName
                                        });
                                    }
                                    // ادامه می‌دهد تا row را نمایش بدهد
                                }

                                const lineType = ann.lineType || ann.line_type || '-';
                                const vehicleType = ann.vehicleType || ann.vehicle_type || '-';
                                const driverName = ann.assignedDriverName || (ann as any).assigned_driver_name || '-';
                                const vehiclePlate = ann.assignedVehiclePlate || (ann as any).assigned_vehicle_plate || '-';

                                return (
                                    <tr key={`${ann.id}-${dest.id}-${idx}`} className="border-b">
                                        <td className="p-2 font-mono">#{ann.announcementCode}</td>
                                        <td className="p-2">{formatJalali(ann.loadingDate)}</td>
                                        <td className="p-2">{lineType}</td>
                                        <td className="p-2">{vehicleType}</td>
                                        <td className="p-2 font-semibold text-blue-700">{dest.city}</td>
                                        <td className="p-2">{representativeNameDisplay}</td>
                                        <td className="p-2">
                                            <span className={`px-2 py-1 rounded-full text-xs ${isPakhsh ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                                {representativeTypeDisplay}
                                            </span>
                                        </td>
                                        <td className="p-2 font-mono">{ann.billOfLadingNumber || '-'}</td>
                                        <td className="p-2 font-mono">{Math.round(Number(row.destinationFreightCost)).toLocaleString('fa-IR')}</td>
                                        <td className="p-2">{driverName}</td>
                                        <td className="p-2 font-mono">{vehiclePlate}</td>
                                        <td className="p-2 text-xs">
                                            <span className={`px-2 py-1 rounded-full ${row.paymentStatus === FreightPaymentStatus.Paid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {row.paymentStatus === FreightPaymentStatus.Paid ? 'پرداخت شده' : 'پرداخت نشده'}
                                            </span>
                                        </td>
                                        <td className="p-2 text-xs">{existingTransaction?.referralNotes || '-'}</td>
                                        <td className="p-2">
                                            <div className="flex gap-2">
                                                {existingTransaction && (
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedTransactionForView(existingTransaction);
                                                            setIsViewDialogOpen(true);
                                                        }}
                                                        className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600"
                                                    >
                                                        مشاهده
                                                    </button>
                                                )}
                                                {isReferred && (
                                                    <>
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedTransactionForReject(existingTransaction!);
                                                                setSelectedDestinationIdForReject(dest.id);
                                                                setRejectNotes('');
                                                                setRejectDialogOpen(true);
                                                            }}
                                                            className="px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600"
                                                        >
                                                            رد
                                                        </button>
                                                        <button 
                                                            onClick={() => handleApprove(existingTransaction!, dest.id)}
                                                            className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600"
                                                        >
                                                            بررسی شد
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    {/* کنترل‌های صفحه‌بندی */}
                    {destinationRows.length > 0 && (
                        <div className="flex justify-between items-center mt-4 pt-4 border-t">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-slate-600">نمایش:</label>
                                <select
                                    value={itemsPerPage}
                                    onChange={e => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1); // Reset to first page when items per page changes
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-slate-300 bg-white"
                                >
                                    <option value={25}>25</option>
                                    <option value={30}>30</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                                <span className="text-xs text-slate-600">ردیف در هر صفحه</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    قبلی
                                </button>
                                <span className="text-sm text-slate-600">
                                    صفحه {currentPage.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')} ({destinationRows.length.toLocaleString('fa-IR')} ردیف)
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    بعدی
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {destinationRows.length === 0 && (
                        <div className="text-center py-8 text-slate-500">
                            هیچ تراکنش ارجاع شده‌ای یافت نشد.
                        </div>
                    )}
                </div>
            </div>

            {/* Dialog برای رد تراکنش */}
            {rejectDialogOpen && selectedTransactionForReject && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setRejectDialogOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">رد تراکنش</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">توضیحات رد:</label>
                            <textarea
                                value={rejectNotes}
                                onChange={e => setRejectNotes(e.target.value)}
                                placeholder="لطفاً دلیل رد را توضیح دهید..."
                                className="w-full p-2 border rounded-md"
                                rows={4}
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button 
                                onClick={() => {
                                    setRejectDialogOpen(false);
                                    setRejectNotes('');
                                    setSelectedTransactionForReject(null);
                                    setSelectedDestinationIdForReject(null);
                                }}
                                className="px-4 py-2 bg-gray-200 rounded-md"
                            >
                                انصراف
                            </button>
                            <button 
                                onClick={handleReject}
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                            >
                                رد و ارجاع به شعبه
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog برای مشاهده اسناد */}
            {isViewDialogOpen && selectedTransactionForView && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsViewDialogOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">مشاهده اسناد</h3>
                        <div className="space-y-4">
                            {selectedTransactionForView.invoiceImagePath && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">فاکتور:</label>
                                    <a 
                                        href={getFileUrl(selectedTransactionForView.invoiceImagePath)} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                    >
                                        مشاهده فاکتور
                                    </a>
                                </div>
                            )}
                            {selectedTransactionForView.receiptImagePath && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">رسید:</label>
                                    <a 
                                        href={getFileUrl(selectedTransactionForView.receiptImagePath)} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                    >
                                        مشاهده رسید
                                    </a>
                                </div>
                            )}
                            {selectedTransactionForView.extraDocumentImagePath && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">سند اضافی:</label>
                                    <a 
                                        href={getFileUrl(selectedTransactionForView.extraDocumentImagePath)} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                    >
                                        مشاهده سند
                                    </a>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => setIsViewDialogOpen(false)}
                            className="mt-4 px-4 py-2 bg-gray-200 rounded-md"
                        >
                            بستن
                        </button>
                    </div>
                </div>
            )}

            {/* Dialog برای قوانین */}
            {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={undefined as any} userRole={currentUser.role} />
                        <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CentralFinanceDashboard;

