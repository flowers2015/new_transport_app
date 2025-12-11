// This is a new file: components/FreightFinanceDashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, Branch, FreightPaymentStatus, FreightTransaction, User, View, Destination, FreightAnnouncementStatus } from '../types';
import { formatJalaliDateTime, formatJalali, gregorianToJalali, jalaliToGregorian } from '../utils/jalali';
import { CreditCardIcon } from './icons/CreditCardIcon'; // Reusing icon
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { getApiUrl, getFileUrl } from '../utils/apiConfig';

interface FreightFinanceDashboardProps {
    announcements: FreightAnnouncement[];
    branches: Branch[];
    transactions: FreightTransaction[];
    onAddTransaction: (transaction: Omit<FreightTransaction, 'id'>) => void;
    currentUser: User;
    onRefresh?: () => void;
}

const isToday = (someDate: Date | string) => {
    if (!someDate) return false;
    
    // اگر رشته شمسی است (YYYY/MM/DD)
    if (typeof someDate === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(someDate)) {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        const todayStr = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
        return someDate === todayStr;
    }
    
    // اگر Date object است
    if (someDate instanceof Date) {
        const today = new Date();
        return someDate.getDate() === today.getDate() &&
            someDate.getMonth() === today.getMonth() &&
            someDate.getFullYear() === today.getFullYear();
    }
    
    return false;
}

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

// تابع برای تبدیل تاریخ شمسی به فرمت input type="date" (میلادی)
const jalaliToDateInput = (jalaliDate: string): string => {
    const parts = jalaliDate.split('/');
    if (parts.length !== 3) return '';
    const jy = parseInt(parts[0], 10);
    const jm = parseInt(parts[1], 10);
    const jd = parseInt(parts[2], 10);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};

// تابع برای تبدیل تاریخ میلادی (input type="date") به شمسی
const dateInputToJalali = (dateInput: string): string => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
};

const FreightFinanceDashboard: React.FC<FreightFinanceDashboardProps> = (props) => {
    const { announcements, currentUser, onAddTransaction, transactions, onRefresh } = props;
    
    console.log('🚀 [FreightFinance] Component rendered', {
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
        representativeType: '', // '' = همه, 'پخش' = فقط پخش, 'نماینده' = فقط نماینده
        startDate: defaultStartDate, // حالا مستقیماً شمسی است
        endDate: defaultEndDate // حالا مستقیماً شمسی است
    });
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedAnn, setSelectedAnn] = useState<FreightAnnouncement | null>(null);
    const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
    const [dateView, setDateView] = useState<'today' | 'all'>('all'); // تغییر به 'all' برای نمایش بازه پیش‌فرض
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [selectedTransactionForView, setSelectedTransactionForView] = useState<FreightTransaction | null>(null);

    // اگر branchCity یک UUID است، آن را null می‌کنیم (نمایش داده نمی‌شود)
    // در غیر این صورت، نام شهر را استفاده می‌کنیم
    const enforcedCity = currentUser.branchCity && !currentUser.branchCity.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) 
        ? currentUser.branchCity 
        : null;
    
    // لاگ برای بررسی enforcedCity
    console.log('🏢 [FreightFinance] User branch info:', {
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        branchCity: currentUser.branchCity,
        enforcedCity: enforcedCity
    });
    
    // تبدیل announcements به ردیف‌های جداگانه برای هر مقصد (فقط پخش)
    const destinationRows = useMemo(() => {
        console.log('🔍 [FreightFinance] useMemo triggered - Filtering announcements:', {
            totalAnnouncements: announcements?.length || 0,
            announcements: announcements ? announcements.map(a => ({
                id: a.id,
                code: a.announcementCode,
                assignmentType: a.assignmentType,
                status: a.status,
                destinationsCount: (a.destinations || []).length
            })) : [],
            dateView,
            filters: {
                city: filters.city,
                paymentStatus: filters.paymentStatus,
                representativeType: filters.representativeType,
                startDate: filters.startDate,
                endDate: filters.endDate
            },
            enforcedCity,
            transactionsCount: transactions?.length || 0
        });
        
        // آمار نماینده‌ها و پخش‌ها قبل از فیلتر
        const allDestinations: Array<{repName: string, city: string, annCode: string, annId: string, assignmentType: string}> = [];
        const namayandeAnnouncements: Array<any> = [];
        
        announcements.forEach(ann => {
            const hasNamayande = (ann.destinations || []).some((d: any) => {
                const repName = d.representative_name || d.representativeName || '';
                const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
                return normalizedRepName !== 'پخش' && normalizedRepName !== '';
            });
            
            if (hasNamayande) {
                const driverName = ann.assignedDriverName || (ann as any).assigned_driver_name || '';
                const driverId = ann.assignedDriverId || (ann as any).assigned_driver_id;
                const hasDriverAssigned = (driverId && driverId !== '-') || (driverName && driverName !== '-');
                const isAssigned = 
                    hasDriverAssigned ||
                    ann.status === FreightAnnouncementStatus.Assigned ||
                    ann.status === FreightAnnouncementStatus.InTransit ||
                    ann.status === FreightAnnouncementStatus.Finalized ||
                    ann.assignmentFinalizedAt ||
                    (ann as any).assignment_finalized_at;
                
                namayandeAnnouncements.push({
                    annCode: ann.announcementCode,
                    annId: ann.id,
                    assignmentType: ann.assignmentType,
                    isPersonal: ann.assignmentType === 'personal',
                    isAssigned: isAssigned,
                    hasDriverAssigned: hasDriverAssigned,
                    status: ann.status,
                    loadingDate: ann.loadingDate,
                    destinations: (ann.destinations || []).map((d: any) => ({
                        city: d.city,
                        repName: d.representative_name || d.representativeName || '',
                        normalizedRepName: (d.representative_name || d.representativeName || '') === 'NULL' || (d.representative_name || d.representativeName || '') === null || (d.representative_name || d.representativeName || '') === '' ? '' : (d.representative_name || d.representativeName || '')
                    }))
                });
            }
            
            if (ann.assignmentType === 'personal') {
                (ann.destinations || []).forEach((d: any) => {
                    const repName = d.representative_name || d.representativeName || '';
                    const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
                    allDestinations.push({
                        repName: normalizedRepName || '(خالی - پخش)',
                        city: d.city || '',
                        annCode: ann.announcementCode || '',
                        annId: ann.id || '',
                        assignmentType: ann.assignmentType || ''
                    });
                });
            }
        });
        
        const pakhshCount = allDestinations.filter(d => d.repName === 'پخش' || d.repName === '(خالی - پخش)').length;
        const namayandeCount = allDestinations.filter(d => d.repName !== 'پخش' && d.repName !== '(خالی - پخش)' && d.repName !== '').length;
        const uniqueNamayandeNames = [...new Set(allDestinations.filter(d => d.repName !== 'پخش' && d.repName !== '(خالی - پخش)' && d.repName !== '').map(d => d.repName))];
        
        console.log('📊 [FreightFinance] آمار نماینده‌ها و پخش‌ها:', {
            totalDestinations: allDestinations.length,
            pakhshCount: pakhshCount,
            namayandeCount: namayandeCount,
            uniqueNamayandeNames: uniqueNamayandeNames,
            allNamayandeDestinations: allDestinations.filter(d => d.repName !== 'پخش' && d.repName !== '(خالی - پخش)' && d.repName !== '').map(d => ({
                repName: d.repName,
                city: d.city,
                annCode: d.annCode,
                annId: d.annId,
                assignmentType: d.assignmentType
            })),
            namayandeAnnouncements: namayandeAnnouncements
        });
        
        // لاگ جزئیات هر announcement
        announcements.forEach((ann, idx) => {
            const dests = ann.destinations || [];
            const annInfo = {
                id: ann.id,
                announcementCode: ann.announcementCode,
                assignmentType: ann.assignmentType,
                loadingDate: ann.loadingDate,
                loadingDateType: typeof ann.loadingDate,
                destinationsCount: dests.length,
                destinations: dests.map((d: any) => ({
                    city: d.city,
                    representativeName: d.representative_name || d.representativeName || 'NULL',
                    freightCost: d.freight_cost || d.freightCost || 0
                }))
            };
            console.log(`📋 [FreightFinance] Announcement ${idx + 1}:`, JSON.stringify(annInfo, null, 2));
        });

        const rows: Array<{
            announcement: FreightAnnouncement;
            destination: Destination;
            destinationFreightCost: number;
            paymentStatus: FreightPaymentStatus;
        }> = [];

        let filteredByAssignmentType = 0;
        let filteredByDate = 0;
        let filteredByRepresentative = 0;
        let filteredByCity = 0;
        let filteredByPaymentStatus = 0;

        announcements.forEach(ann => {
            // فقط خودروهای شخصی
            if (ann.assignmentType !== 'personal') {
                filteredByAssignmentType++;
                // لاگ برای announcement نماینده
                if (ann.announcementCode === 'ANN-1762947572815' || (ann.destinations || []).some((d: any) => {
                    const repName = d.representative_name || d.representativeName || '';
                    return repName !== 'پخش' && repName !== '' && repName !== 'NULL' && repName !== null;
                })) {
                    console.log(`🚫 [FreightFinance] Announcement ${ann.announcementCode} filtered: assignmentType = ${ann.assignmentType} (not personal)`);
                }
                return;
            }
            
            // برای personal assignments: چک می‌کنیم که driver تخصیص داده شده یا status مناسب است
            // برای company assignments: چک می‌کردیم که assignmentFinalizedAt وجود دارد
            // اما برای personal، assignmentFinalizedAt ممکن است نباشد چون از dispatch_assignments نمی‌آید
            const driverName = ann.assignedDriverName || (ann as any).assigned_driver_name || '';
            const driverId = ann.assignedDriverId || (ann as any).assigned_driver_id;
            const hasDriverAssigned = (driverId && driverId !== '-') || (driverName && driverName !== '-');
            
            const isAssigned = 
                hasDriverAssigned ||
                ann.status === FreightAnnouncementStatus.Assigned ||
                ann.status === FreightAnnouncementStatus.InTransit ||
                ann.status === FreightAnnouncementStatus.Finalized ||
                ann.assignmentFinalizedAt ||
                (ann as any).assignment_finalized_at;
            
            if (!isAssigned) {
                filteredByAssignmentType++;
                // لاگ برای announcement نماینده
                if (ann.announcementCode === 'ANN-1762947572815' || (ann.destinations || []).some((d: any) => {
                    const repName = d.representative_name || d.representativeName || '';
                    return repName !== 'پخش' && repName !== '' && repName !== 'NULL' && repName !== null;
                })) {
                    console.log(`🚫 [FreightFinance] Announcement ${ann.announcementCode} filtered: not assigned`, {
                        hasDriverAssigned,
                        driverId,
                        driverName,
                        status: ann.status,
                        assignmentFinalizedAt: ann.assignmentFinalizedAt || (ann as any).assignment_finalized_at
                    });
                }
                return;
            }

            // فیلتر تاریخ
            if (dateView === 'today' && !isToday(ann.loadingDate)) {
                filteredByDate++;
                return;
            }
            
            // فیلتر بازه تاریخ (شمسی)
            if (dateView === 'all' && (filters.startDate || filters.endDate)) {
                let annJalaliDate: string;
                // تبدیل loadingDate به فرمت استاندارد YYYY/MM/DD
                if (typeof ann.loadingDate === 'string') {
                    annJalaliDate = normalizeJalaliDateString(ann.loadingDate);
                    // بررسی فرمت صحیح
                    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(annJalaliDate)) {
                        console.warn(`⚠️ [FreightFinance] Invalid date format for announcement ${ann.id}:`, ann.loadingDate);
                        filteredByDate++;
                        return; // تاریخ نامعتبر
                    }
                } else if (ann.loadingDate instanceof Date) {
                    const [jy, jm, jd] = gregorianToJalali(ann.loadingDate.getFullYear(), ann.loadingDate.getMonth() + 1, ann.loadingDate.getDate());
                    annJalaliDate = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
                } else {
                    console.warn(`⚠️ [FreightFinance] Invalid date type for announcement ${ann.id}:`, typeof ann.loadingDate);
                    filteredByDate++;
                    return; // تاریخ نامعتبر
                }
                
                // نرمال‌سازی فیلترهای تاریخ
                if (filters.startDate) {
                    const startJalali = normalizeJalaliDateString(filters.startDate);
                    if (annJalaliDate < startJalali) {
                        console.log(`📅 [FreightFinance] Date filter: ${annJalaliDate} < ${startJalali} (startDate)`);
                        filteredByDate++;
                        return;
                    }
                }
                if (filters.endDate) {
                    const endJalali = normalizeJalaliDateString(filters.endDate);
                    if (annJalaliDate > endJalali) {
                        console.log(`📅 [FreightFinance] Date filter: ${annJalaliDate} > ${endJalali} (endDate)`);
                        filteredByDate++;
                        return;
                    }
                }
            }

            // فیلتر مقاصد بر اساس نماینده/پخش
            ann.destinations.forEach(dest => {
                const repName = dest.representativeName || dest.representative_name || '';
                // "NULL" (رشته) یا null یا خالی را به عنوان پخش در نظر می‌گیریم
                const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
                const isPakhsh = normalizedRepName === 'پخش' || normalizedRepName === '';
                const isNamayande = !isPakhsh && normalizedRepName !== '';
                
                // لاگ برای مقصد نماینده
                if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                    console.log(`🔍 [FreightFinance] Processing namayande destination:`, {
                        annCode: ann.announcementCode,
                        city: dest.city,
                        repName: normalizedRepName,
                        isPakhsh,
                        isNamayande,
                        currentFilter: filters.representativeType || '(همه)',
                        willPassFilter: filters.representativeType === '' || (filters.representativeType === 'نماینده' && isNamayande)
                    });
                }
                
                // اعمال فیلتر نماینده/پخش
                if (filters.representativeType === 'پخش' && !isPakhsh) {
                    filteredByRepresentative++;
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log(`🚫 [FreightFinance] Namayande destination filtered: filter is 'پخش' but this is namayande`);
                    }
                    return; // فقط پخش می‌خواهیم
                }
                if (filters.representativeType === 'نماینده' && !isNamayande) {
                    filteredByRepresentative++;
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log(`🚫 [FreightFinance] Namayande destination filtered: filter is 'نماینده' but isNamayande = ${isNamayande}`, {
                            repName,
                            normalizedRepName,
                            isPakhsh
                        });
                    }
                    return; // فقط نماینده می‌خواهیم
                }
                // اگر filters.representativeType خالی است، همه را نشان می‌دهیم

                // فیلتر شهر
                if (enforcedCity && dest.city !== enforcedCity) {
                    console.log(`🚫 [FreightFinance] City filter: ${dest.city} !== ${enforcedCity} (enforcedCity)`);
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log(`🚫 [FreightFinance] Namayande destination filtered by city:`, {
                            destCity: dest.city,
                            enforcedCity,
                            annCode: ann.announcementCode
                        });
                    }
                    filteredByCity++;
                    return;
                }
                if (filters.city && !dest.city.includes(filters.city)) {
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log(`🚫 [FreightFinance] Namayande destination filtered by city filter:`, {
                            destCity: dest.city,
                            filterCity: filters.city,
                            annCode: ann.announcementCode
                        });
                    }
                    filteredByCity++;
                    return;
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
                    filteredByPaymentStatus++;
                    if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                        console.log(`🚫 [FreightFinance] Namayande destination filtered: paymentStatus mismatch`, {
                            destPaymentStatus,
                            filterPaymentStatus: filters.paymentStatus
                        });
                    }
                    return;
                }

                // لاگ برای اضافه شدن نماینده به rows
                if (normalizedRepName !== 'پخش' && normalizedRepName !== '' && (ann.announcementCode === 'ANN-1762947572815' || normalizedRepName === 'نماینده')) {
                    console.log(`✅ [FreightFinance] Namayande destination ADDED to rows:`, {
                        annCode: ann.announcementCode,
                        city: dest.city,
                        repName: normalizedRepName,
                        paymentStatus: destPaymentStatus
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

        // حذف sort کردن - ردیف‌ها باید ثابت بمانند تا تمرکز کاربر از دست نرود
        // rows.sort((a, b) => {
        //     if (a.paymentStatus === FreightPaymentStatus.Unpaid && b.paymentStatus === FreightPaymentStatus.Paid) return -1;
        //     if (a.paymentStatus === FreightPaymentStatus.Paid && b.paymentStatus === FreightPaymentStatus.Unpaid) return 1;
        //     return 0;
        // });

        // آمار نماینده‌ها و پخش‌ها بعد از فیلتر
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
        const finalNamayandeNames = [...new Set(rows
            .filter(r => {
                const repName = r.destination.representativeName || r.destination.representative_name || '';
                const normalizedRepName = repName === 'NULL' || repName === null || repName === '' ? '' : repName;
                return normalizedRepName !== 'پخش' && normalizedRepName !== '';
            })
            .map(r => {
                const repName = r.destination.representativeName || r.destination.representative_name || '';
                return repName === 'NULL' || repName === null || repName === '' ? '' : repName;
            })
        )];
        
        console.log('📊 [FreightFinance] آمار بعد از فیلتر:', {
            totalRows: rows.length,
            finalPakhshCount: finalPakhshCount,
            finalNamayandeCount: finalNamayandeCount,
            finalNamayandeNames: finalNamayandeNames,
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
        
        const resultsInfo = {
            totalRows: rows.length,
            filteredByAssignmentType: `${filteredByAssignmentType} announcements filtered (not personal)`,
            filteredByDate: `${filteredByDate} announcements filtered (date range)`,
            filteredByRepresentative: `${filteredByRepresentative} destinations filtered (representative type filter)`,
            filteredByCity: `${filteredByCity} destinations filtered (city mismatch)`,
            filteredByPaymentStatus: `${filteredByPaymentStatus} destinations filtered (payment status)`
        };
        console.log('📊 [FreightFinance] Filtering results:', JSON.stringify(resultsInfo, null, 2));
        
        if (rows.length > 0) {
            console.log('✅ [FreightFinance] Sample rows:', rows.slice(0, 3).map(r => ({
                announcementCode: r.announcement.announcementCode,
                city: r.destination.city,
                freightCost: r.destinationFreightCost,
                paymentStatus: r.paymentStatus
            })));
        } else {
            const allAssignmentTypes = [...new Set(announcements.map(a => a.assignmentType))];
            const allRepNames = announcements.flatMap(a => 
                (a.destinations || []).map((d: any) => d.representative_name || d.representativeName || 'NULL')
            );
            const uniqueRepNames = [...new Set(allRepNames)];
            
            const warningInfo = {
                totalAnnouncements: announcements.length,
                assignmentTypes: allAssignmentTypes,
                hasDestinations: announcements.some(a => a.destinations && a.destinations.length > 0),
                representativeNames: uniqueRepNames,
                enforcedCity: enforcedCity,
                dateView: dateView,
                filters: {
                    city: filters.city,
                    paymentStatus: filters.paymentStatus,
                    startDate: filters.startDate,
                    endDate: filters.endDate
                }
            };
            console.warn('⚠️ [FreightFinance] No rows found! Check filters:', JSON.stringify(warningInfo, null, 2));
            
            // لاگ جزئیات برای دیباگ
            announcements.forEach((ann, idx) => {
                if (ann.destinations && ann.destinations.length > 0) {
                    const debugInfo = {
                        announcementCode: ann.announcementCode,
                        assignmentType: ann.assignmentType,
                        isPersonal: ann.assignmentType === 'personal',
                        loadingDate: ann.loadingDate,
                        destinations: ann.destinations.map((d: any) => ({
                            city: d.city,
                            repName: d.representative_name || d.representativeName || 'NULL',
                            isPakhsh: (d.representative_name || d.representativeName || '') === 'پخش' || (!d.representative_name && !d.representativeName),
                            matchesCity: enforcedCity ? d.city === enforcedCity : true,
                            freightCost: d.freight_cost || d.freightCost || 0
                        }))
                    };
                    console.log(`🔍 [FreightFinance] Debug Announcement ${idx + 1}:`, JSON.stringify(debugInfo, null, 2));
                } else {
                    console.log(`🔍 [FreightFinance] Debug Announcement ${idx + 1}: NO DESTINATIONS`, {
                        announcementCode: ann.announcementCode,
                        assignmentType: ann.assignmentType,
                        destinations: ann.destinations
                    });
                }
            });
        }

        return rows;
    }, [filters, announcements, enforcedCity, dateView, transactions]);

     const filteredTransactions = useMemo(() => {
        const announcementMap = new Map(announcements.map(ann => [ann.id, ann]));
        return transactions
            .map(t => ({
                ...t,
                announcement: announcementMap.get(t.announcementId)
            }))
            .filter(t => {
                if (!t.announcement) return false; // Don't show orphaned transactions
                // فقط تراکنش‌های ارجاع شده به ستاد مالی
                if (t.referralStatus !== 'referred' && t.referralStatus !== 'approved' && t.referralStatus !== 'rejected') {
                    return false;
                }
                if (!enforcedCity) return true; // Admins/Central see all
                // Branch users only see transactions for their city
                return t.announcement.destinations.some(d => d.city === enforcedCity);
            })
            .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
    }, [transactions, announcements, enforcedCity]);

    const handleOpenDialog = (ann: FreightAnnouncement, dest: Destination) => {
        setSelectedAnn(ann);
        setSelectedDestination(dest);
        setIsDialogOpen(true);
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center"><CreditCardIcon className="w-6 h-6 mr-2 text-sky-600" />جستجوی مالی حمل</h2>
                    <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100" title="قوانین کارتابل"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border rounded-lg bg-slate-50">
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">شهر</label>
                        <input 
                            placeholder="شهر..." 
                            value={enforcedCity || filters.city || ''} 
                            onChange={e => setFilters(s => ({...s, city: e.target.value}))} 
                            className="input-style" 
                            disabled={!!enforcedCity} 
                            title={enforcedCity ? `فیلتر شده برای شعبه ${enforcedCity}` : ''}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">نوع</label>
                        <select value={filters.representativeType} onChange={e => setFilters(s => ({...s, representativeType: e.target.value}))} className="input-style">
                            <option value="">همه (پخش و نماینده)</option>
                            <option value="پخش">پخش</option>
                            <option value="نماینده">نماینده</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-600 mb-1 block">وضعیت پرداخت</label>
                        <select value={filters.paymentStatus} onChange={e => setFilters(s => ({...s, paymentStatus: e.target.value}))} className="input-style">
                            <option value="">همه وضعیت‌ها</option>
                            <option value={FreightPaymentStatus.Paid}>پرداخت شده</option>
                            <option value={FreightPaymentStatus.Unpaid}>پرداخت نشده</option>
                        </select>
                    </div>
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
                            dir="ltr"
                        />
                        <span className="text-xs text-slate-500 mt-1 block">فرمت: YYYY/MM/DD</span>
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
                            dir="ltr"
                        />
                        <span className="text-xs text-slate-500 mt-1 block">فرمت: YYYY/MM/DD</span>
                    </div>
                </div>
            </div>

             <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-bold">نتایج جستجو</h3>
                 <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm text-right">
                         <thead className="text-xs uppercase bg-gray-50">
                             <tr>
                                 <th className="p-2">کد اعلام بار</th>
                                 <th className="p-2">تاریخ بارگیری</th>
                                 <th className="p-2">لاین</th>
                                 <th className="p-2">نوع خودرو</th>
                                 <th className="p-2">شهر مقصد</th>
                                 <th className="p-2">شماره بارنامه</th>
                                 <th className="p-2">مبلغ کرایه (ریال)</th>
                                 <th className="p-2">راننده</th>
                                 <th className="p-2">شماره پلاک</th>
                                 <th className="p-2">وضعیت پرداخت</th>
                                 <th className="p-2">توضیحات ارجاع ستاد</th>
                                 <th className="p-2">عملیات</th>
                             </tr>
                         </thead>
                        <tbody>
                            {destinationRows.map((row, idx) => {
                                const ann = row.announcement;
                                const dest = row.destination;
                                const driverName = ann.assignedDriverName || '-';
                                
                                // ساخت شماره پلاک از فیلدهای مختلف
                                // اول از assignedVehiclePlate استفاده کن (که از normalized object می‌آید)
                                let vehiclePlate = ann.assignedVehiclePlate;
                                
                                // اگر assignedVehiclePlate خالی است یا '-' است، از فیلدهای جداگانه استفاده کن
                                if (!vehiclePlate || vehiclePlate === '-' || vehiclePlate === null || vehiclePlate === undefined) {
                                    // اول از فیلدهای مستقیم در ann استفاده کن
                                    const platePart1 = ann.plate_part1 || (ann as any).plate_part1;
                                    const plateLetter = ann.plate_letter || (ann as any).plate_letter;
                                    const platePart2 = ann.plate_part2 || (ann as any).plate_part2;
                                    const plateCityCode = ann.plate_city_code || (ann as any).plate_city_code;
                                    
                                    if (platePart1 && plateLetter && platePart2) {
                                        vehiclePlate = `${platePart1}${plateLetter}${platePart2}`;
                                        if (plateCityCode) {
                                            vehiclePlate += `-${plateCityCode}`;
                                        }
                                    } else {
                                        vehiclePlate = '-';
                                    }
                                }
                                
                                const vehicleType = ann.vehicleType || ann.vehicle_type || '-';
                                const lineType = ann.lineType || ann.line_type || '-';
                                
                                return (
                                    <tr key={`${ann.id}-${dest.id}-${idx}`} className="border-b">
                                    <td className="p-2 font-mono">#{ann.announcementCode}</td>
                                    <td className="p-2">{formatJalali(ann.loadingDate)}</td>
                                        <td className="p-2">{lineType}</td>
                                        <td className="p-2">{vehicleType}</td>
                                        <td className="p-2 font-semibold text-blue-700">{dest.city}</td>
                                        <td className="p-2 font-mono">{ann.billOfLadingNumber || '-'}</td>
                                        <td className="p-2 font-mono">{Math.round(Number(row.destinationFreightCost)).toLocaleString('fa-IR')}</td>
                                        <td className="p-2">{driverName}</td>
                                        <td className="p-2 font-mono">{vehiclePlate}</td>
                                        <td className="p-2 text-xs">
                                            <span className={`px-2 py-1 rounded-full ${row.paymentStatus === FreightPaymentStatus.Paid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {row.paymentStatus === FreightPaymentStatus.Paid ? 'پرداخت شده' : 'پرداخت نشده'}
                                            </span>
                                        </td>
                                        <td className="p-2 text-xs">
                                            {(() => {
                                                const existingTransaction = transactions.find(t => t.announcementId === ann.id);
                                                // نمایش توضیحات رد ستاد مالی
                                                const rejectionNotes = existingTransaction?.centralFinanceRejectionNotes || existingTransaction?.referralNotes || '-';
                                                return rejectionNotes !== '-' && existingTransaction?.referralStatus === 'rejected' ? rejectionNotes : '-';
                                            })()}
                                        </td>
                                        <td className="p-2">
                                            {(() => {
                                                // بررسی وضعیت تراکنش
                                                const existingTransaction = transactions.find(t => t.announcementId === ann.id);
                                                // اگر rejected است، دکمه‌ها باید فعال شوند (برای اصلاح)
                                                const isReferred = existingTransaction && existingTransaction.referralStatus === 'referred';
                                                const isApproved = existingTransaction && existingTransaction.referralStatus === 'approved';
                                                const isRejected = existingTransaction && existingTransaction.referralStatus === 'rejected';
                                                // اگر rejected است، دکمه‌ها فعال می‌شوند
                                                const shouldDisableButtons = isReferred || isApproved;
                                                const hasTransaction = !!existingTransaction;
                                                
                                                return (
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => handleOpenDialog(ann, dest)} 
                                                            disabled={shouldDisableButtons}
                                                            className={`px-3 py-1 rounded-md text-xs ${
                                                                shouldDisableButtons 
                                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                                                    : 'bg-green-500 text-white hover:bg-green-600'
                                                            }`}
                                                        >
                                                            ثبت تراکنش
                                                        </button>
                                                        <button 
                                                            onClick={async () => {
                                                                if (!hasTransaction) {
                                                                    alert('ابتدا باید تراکنش را ثبت کنید');
                                                                    return;
                                                                }
                                                                
                                                                if (shouldDisableButtons) {
                                                                    alert('این تراکنش قبلاً ارجاع شده است');
                                                                    return;
                                                                }
                                                                
                                                                if (!confirm('آیا مطمئن هستید که می‌خواهید این تراکنش را به مالی ستاد ارجاع دهید؟')) {
                                                                    return;
                                                                }
                                                                
                                                                try {
                                                                    const token = localStorage.getItem('token');
                                                                    const response = await fetch(getApiUrl(`freight-transactions/${ann.id}/refer`), {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            'Authorization': `Bearer ${token}`
                                                                        },
                                                                        body: JSON.stringify({
                                                                            destinationId: dest.id, // ارسال destination_id برای ارجاع جداگانه
                                                                            notes: 'ارجاع به مالی ستاد'
                                                                        })
                                                                    });
                                                                    
                                                                    if (!response.ok) {
                                                                        const errorData = await response.json().catch(() => ({ message: 'خطا در ارجاع به مالی ستاد' }));
                                                                        throw new Error(errorData.message || 'خطا در ارجاع به مالی ستاد');
                                                                    }
                                                                    
                                                                    alert('تراکنش با موفقیت به مالی ستاد ارجاع شد');
                                                                    // Refresh transactions
                                                                    if (onRefresh) {
                                                                        onRefresh();
                                                                    } else {
                                                                        window.location.reload();
                                                                    }
                                                                } catch (error: any) {
                                                                    console.error('❌ [FreightFinance] Error referring:', error);
                                                                    alert(`خطا: ${error.message || 'خطا در ارجاع به مالی ستاد'}`);
                                                                }
                                                            }}
                                                            disabled={!hasTransaction || shouldDisableButtons}
                                                            className={`px-3 py-1 rounded-md text-xs ${
                                                                !hasTransaction || shouldDisableButtons
                                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                                            }`}
                                                        >
                                                            ارجاع به مالی ستاد
                                                        </button>
                                                        {hasTransaction && (
                                                            <button 
                                                                onClick={() => {
                                                                    setSelectedTransactionForView(existingTransaction!);
                                                                    setIsViewDialogOpen(true);
                                                                }}
                                                                className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600"
                                                            >
                                                                مشاهده
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                </tr>
                                );
                            })}
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
                                <th className="p-2">شماره بارنامه</th>
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
                                    <td className="p-2 font-mono">{t.billOfLadingNumber || '-'}</td>
                                    <td className="p-2">{t.announcement?.destinations.map(d => d.city).join(', ')}</td>
                                    <td className="p-2 font-mono">{Math.round(t.amount).toLocaleString('fa-IR')}</td>
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

             {isDialogOpen && selectedAnn && selectedDestination && (
                 <TransactionDialog 
                     announcement={selectedAnn} 
                     destination={selectedDestination}
                     currentUser={currentUser}
                     transactions={transactions}
                     onClose={() => {
                         setIsDialogOpen(false);
                         setSelectedDestination(null);
                     }} 
                     onSave={onAddTransaction} 
                 />
             )}
             {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.FreightFinance} userRole={currentUser.role} />
                         <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
             )}
             {isViewDialogOpen && selectedTransactionForView && (
                <ViewDocumentsDialog 
                    transaction={selectedTransactionForView}
                    onClose={() => {
                        setIsViewDialogOpen(false);
                        setSelectedTransactionForView(null);
                    }}
                />
             )}
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; }`}</style>
        </div>
    );
};

const TransactionDialog: React.FC<{
    announcement: FreightAnnouncement;
    destination: Destination;
    onClose: ()=>void;
    onSave: (t: Omit<FreightTransaction, 'id'>)=>void;
    currentUser: User;
    transactions: FreightTransaction[];
}> = ({ announcement, destination, onClose, onSave, currentUser, transactions }) => {
    // تاریخ امروز به صورت شمسی
    const today = new Date();
    const [jyToday, jmToday, jdToday] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const todayJalali = `${jyToday}/${String(jmToday).padStart(2, '0')}/${String(jdToday).padStart(2, '0')}`;

    // پیدا کردن transaction موجود برای این مقصد خاص
    const existingTransaction = transactions.find(t => {
        if (t.announcementId !== announcement.id) return false;
        // اگر destination_id وجود دارد، فقط آن را در نظر بگیر
        if (t.destinationId) {
            return t.destinationId === destination.id;
        }
        // اگر destination_id وجود ندارد (برای backward compatibility)، همه را در نظر بگیر
        return true;
    });
    
    // تبدیل تاریخ تراکنش موجود به شمسی
    const getTransactionDateJalali = () => {
        if (existingTransaction && existingTransaction.transactionDate) {
            const transDate = new Date(existingTransaction.transactionDate);
            const [jy, jm, jd] = gregorianToJalali(transDate.getFullYear(), transDate.getMonth() + 1, transDate.getDate());
            return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
        }
        return todayJalali;
    };

    const initialAmount = existingTransaction?.amount || destination.freightCost || 0;
    
    const [state, setState] = useState({
        amount: initialAmount, // اول از transaction موجود، سپس از destination
        transactionDateJalali: getTransactionDateJalali(), // تاریخ شمسی
        billOfLadingNumber: existingTransaction?.billOfLadingNumber || announcement.billOfLadingNumber || '', // اول از transaction موجود
        notes: existingTransaction?.notes || '',
        isPaid: existingTransaction?.isPaid || false,
        invoiceImage: null as File | null,
        receiptImage: null as File | null,
        extraDocumentImage1: null as File | null,
        extraDocumentImage2: null as File | null,
        // مسیر فایل‌های موجود
        existingInvoicePath: existingTransaction?.invoiceImagePath || existingTransaction?.invoiceImage || null,
        existingReceiptPath: existingTransaction?.receiptImagePath || existingTransaction?.receiptImage || null,
        existingExtraDoc1Path: existingTransaction?.extraDocumentImagePath || existingTransaction?.extraDocumentImage || null,
        existingExtraDoc2Path: null, // این فیلد در schema نیست
    });
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [errors, setErrors] = useState<{[key: string]: string}>({});
    const [amountDisplay, setAmountDisplay] = useState<string>(() => {
        // مقدار اولیه برای نمایش
        if (initialAmount > 0) {
            return Math.round(initialAmount).toLocaleString('fa-IR');
        }
        return '';
    });

    // به‌روزرسانی state وقتی existingTransaction تغییر می‌کند (مثلاً بعد از refresh)
    useEffect(() => {
        const currentTransaction = transactions.find(t => t.announcementId === announcement.id);
        if (currentTransaction) {
            // split کردن extraDocumentImagePath اگر چند فایل با کاما جدا شده باشد
            const extraDocPathStr = currentTransaction.extraDocumentImagePath || currentTransaction.extraDocumentImage || '';
            const extraDocPaths = extraDocPathStr ? extraDocPathStr.split(',').map(p => p.trim()).filter(p => p) : [];
            
            // تبدیل isPaid به boolean
            const transactionIsPaid = currentTransaction.isPaid === true || currentTransaction.isPaid === 'true' || currentTransaction.isPaid === 1;
            
            // به‌روزرسانی مسیر فایل‌های موجود و وضعیت پرداخت
            setState(s => ({
                ...s,
                isPaid: transactionIsPaid,
                existingInvoicePath: currentTransaction.invoiceImagePath || currentTransaction.invoiceImage || s.existingInvoicePath,
                existingReceiptPath: currentTransaction.receiptImagePath || currentTransaction.receiptImage || s.existingReceiptPath,
                existingExtraDoc1Path: extraDocPaths[0] || s.existingExtraDoc1Path,
                existingExtraDoc2Path: extraDocPaths[1] || s.existingExtraDoc2Path,
            }));
        }
    }, [transactions, announcement.id]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type, checked } = e.target as HTMLInputElement;
        setState(s => ({...s, [name]: type === 'checkbox' ? checked : value }));
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        // حذف کاراکترهای غیر عددی و /
        value = value.replace(/[^\d\/]/g, '');
        // محدود کردن به فرمت YYYY/MM/DD
        if (value.length <= 10) {
            setState(s => ({...s, transactionDateJalali: value }));
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.files?.[0]) {
            setState(s => ({...s, [e.target.name]: e.target.files![0]}));
        }
    }

    // تابع برای آپلود فایل
    const uploadFile = async (file: File, fileType: 'invoice' | 'receipt' | 'extra'): Promise<string | null> => {
        if (!file) return null;
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('announcementId', announcement.id);
        formData.append('transactionDateJalali', state.transactionDateJalali);
        formData.append('billOfLadingNumber', state.billOfLadingNumber || '');
        formData.append('fileType', fileType);
        formData.append('branchCity', currentUser.branchCity || 'default');
        // ارسال lineType از announcement برای نام‌گذاری بهتر فایل
        const lineType = announcement.lineType || announcement.line_type || '';
        console.log('📤 [uploadFile] Uploading file:', {
            fileName: file.name,
            fileType,
            announcementId: announcement.id,
            transactionDateJalali: state.transactionDateJalali,
            billOfLadingNumber: state.billOfLadingNumber,
            lineType,
            announcementLineType: announcement.lineType,
            announcementLine_type: announcement.line_type
        });
        if (lineType) {
            formData.append('lineType', lineType);
        }
        
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(getApiUrl('freight-transactions/upload'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'خطا در آپلود فایل' }));
                console.error('❌ [uploadFile] Upload failed:', errorData);
                throw new Error(errorData.message || 'خطا در آپلود فایل');
            }
            
            const data = await response.json();
            console.log('✅ [uploadFile] Upload successful:', data);
            return data.filePath;
        } catch (error: any) {
            console.error('❌ [uploadFile] Upload error:', error);
            throw error;
        }
    }
    
    const handleSave = async () => {
        // Validation فیلدهای اجباری
        const newErrors: {[key: string]: string} = {};
        
        if (!state.amount || state.amount <= 0) {
            newErrors.amount = 'مبلغ کرایه الزامی است';
        }
        
        if (!state.transactionDateJalali || !/^\d{4}\/\d{2}\/\d{2}$/.test(state.transactionDateJalali)) {
            newErrors.transactionDateJalali = 'تاریخ پرداخت الزامی است و باید به فرمت YYYY/MM/DD باشد';
        }
        
        if (!state.billOfLadingNumber || state.billOfLadingNumber.trim() === '') {
            newErrors.billOfLadingNumber = 'شماره بارنامه الزامی است';
        }
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        
        setErrors({});
        setUploading(true);
        setUploadProgress('در حال آپلود فایل‌ها...');
        
        try {
            // آپلود فایل‌ها با نوع مشخص
            const [invoicePath, receiptPath, extraDoc1Path, extraDoc2Path] = await Promise.all([
                state.invoiceImage ? uploadFile(state.invoiceImage, 'invoice') : Promise.resolve(null),
                state.receiptImage ? uploadFile(state.receiptImage, 'receipt') : Promise.resolve(null),
                state.extraDocumentImage1 ? uploadFile(state.extraDocumentImage1, 'extra') : Promise.resolve(null),
                state.extraDocumentImage2 ? uploadFile(state.extraDocumentImage2, 'extra') : Promise.resolve(null),
            ]);

            // تبدیل تاریخ شمسی به میلادی
            let transactionDate: Date;
            if (state.transactionDateJalali && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(state.transactionDateJalali)) {
                const parts = state.transactionDateJalali.split('/');
                const jy = parseInt(parts[0], 10);
                const jm = parseInt(parts[1], 10);
                const jd = parseInt(parts[2], 10);
                const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
                transactionDate = new Date(gy, gm - 1, gd);
            } else {
                transactionDate = new Date(); // اگر تاریخ نامعتبر بود، از امروز استفاده کن
            }

            setUploadProgress('در حال ثبت تراکنش...');
            
            // نگه داشتن array برای استفاده در state
            const extraDocPathsArray = [extraDoc1Path, extraDoc2Path].filter(p => p);
            // ترکیب مسیرهای سند اضافی برای ارسال به backend
            const extraDocPathsString = extraDocPathsArray.length > 0 ? extraDocPathsArray.join(',') : undefined;

            // ترکیب فایل‌های جدید با فایل‌های موجود
            // اگر فایل جدید آپلود شد، از آن استفاده کن، وگرنه از فایل موجود استفاده کن
            // اگر فایل موجود حذف شده باشد (null)، null ارسال کن
            const finalInvoicePath = invoicePath || (state.existingInvoicePath === null ? null : state.existingInvoicePath);
            const finalReceiptPath = receiptPath || (state.existingReceiptPath === null ? null : state.existingReceiptPath);
            
            // برای سند اضافی، فایل‌های جدید و موجود را ترکیب کن
            const existingExtraPaths = [
                state.existingExtraDoc1Path,
                state.existingExtraDoc2Path
            ].filter(p => p && p !== null);
            const allExtraPaths = [...extraDocPathsArray, ...existingExtraPaths].filter(p => p);
            const finalExtraDocPaths = allExtraPaths.length > 0 ? allExtraPaths.join(',') : undefined;
            
            onSave({
                announcementId: announcement.id,
                destinationId: destination.id, // اضافه کردن destination_id
                amount: Number(state.amount),
                transactionDate: transactionDate,
                billOfLadingNumber: state.billOfLadingNumber.trim(),
                notes: state.notes,
                isPaid: state.isPaid,
                invoiceImage: finalInvoicePath || undefined,
                receiptImage: finalReceiptPath || undefined,
                extraDocumentImage: finalExtraDocPaths,
                referralStatus: 'pending' as const, // بعد از ثبت، وضعیت pending است
            });
            
            // به‌روزرسانی state با فایل‌های جدید آپلود شده
            // اگر فایل جدید آپلود شد، از آن استفاده کن، وگرنه از فایل موجود استفاده کن
            setState(s => {
                const newState = { ...s };
                // اگر فایل جدید آپلود شد، از آن استفاده کن
                if (invoicePath) newState.existingInvoicePath = invoicePath;
                if (receiptPath) newState.existingReceiptPath = receiptPath;
                if (extraDocPathsArray[0]) newState.existingExtraDoc1Path = extraDocPathsArray[0];
                if (extraDocPathsArray[1]) newState.existingExtraDoc2Path = extraDocPathsArray[1];
                // پاک کردن فایل‌های جدید انتخاب شده (چون آپلود شدند)
                newState.invoiceImage = null;
                newState.receiptImage = null;
                newState.extraDocumentImage1 = null;
                newState.extraDocumentImage2 = null;
                return newState;
            });
            
            // بستن دیالوگ را به تأخیر بینداز تا state به‌روز شود
            setTimeout(() => {
                onClose();
            }, 100);
        } catch (error: any) {
            console.error('❌ [TransactionDialog] Error saving transaction:', error);
            alert(`خطا: ${error.message || 'خطا در ثبت تراکنش'}`);
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    }
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b"><h3>تراکنش برای بار #{announcement.announcementCode}</h3></div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label>مبلغ تراکنش (ریال) <span className="text-red-500">*</span></label>
                            <input 
                                name="amount" 
                                type="text" 
                                value={amountDisplay}
                                onChange={(e) => {
                                    // حذف همه کاراکترهای غیر عددی
                                    const value = e.target.value.replace(/[^\d]/g, '');
                                    // ذخیره مقدار عددی در state
                                    const numValue = value ? parseInt(value, 10) : 0;
                                    setState(s => ({...s, amount: numValue}));
                                    // نمایش مقدار بدون جداکننده در حین تایپ
                                    setAmountDisplay(value);
                                }}
                                onFocus={(e) => {
                                    // وقتی focus می‌شود، فقط اعداد را نمایش بده (بدون جداکننده)
                                    const value = e.target.value.replace(/[^\d]/g, '');
                                    setAmountDisplay(value);
                                }}
                                onBlur={(e) => {
                                    // بعد از blur، مقدار را با جداکننده نمایش بده
                                    const value = e.target.value.replace(/[^\d]/g, '');
                                    if (value) {
                                        const numValue = parseInt(value, 10);
                                        setState(s => ({...s, amount: numValue}));
                                        setAmountDisplay(numValue.toLocaleString('fa-IR'));
                                    } else {
                                        setAmountDisplay('');
                                    }
                                }}
                                className={`input-style mt-1 ${errors.amount ? 'border-red-500' : ''}`}
                                required
                                dir="ltr"
                            />
                            {errors.amount && <span className="text-xs text-red-500 mt-1 block">{errors.amount}</span>}
                        </div>
                        <div>
                            <label>تاریخ تراکنش (شمسی) <span className="text-red-500">*</span></label>
                            <input 
                                name="transactionDateJalali" 
                                type="text" 
                                value={state.transactionDateJalali} 
                                onChange={handleDateChange}
                                placeholder="1404/08/15"
                                className={`input-style mt-1 ${errors.transactionDateJalali ? 'border-red-500' : ''}`}
                                dir="ltr"
                                required
                            />
                            <span className="text-xs text-slate-500 mt-1 block">فرمت: YYYY/MM/DD</span>
                            {errors.transactionDateJalali && <span className="text-xs text-red-500 mt-1 block">{errors.transactionDateJalali}</span>}
                        </div>
                    </div>
                    <div>
                        <label>شماره بارنامه <span className="text-red-500">*</span></label>
                        <input 
                            name="billOfLadingNumber" 
                            type="text" 
                            value={state.billOfLadingNumber} 
                            onChange={handleChange}
                            placeholder="شماره بارنامه"
                            className={`input-style mt-1 ${errors.billOfLadingNumber ? 'border-red-500' : ''}`}
                            required
                        />
                        {errors.billOfLadingNumber && <span className="text-xs text-red-500 mt-1 block">{errors.billOfLadingNumber}</span>}
                    </div>
                    <div>
                        <label>توضیحات</label>
                        <textarea 
                            name="notes" 
                            placeholder="مثلا شماره اتوماسیون یا نامه ارسالی به ستاد" 
                            value={state.notes} 
                            onChange={handleChange} 
                            className="input-style w-full" 
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FileInput 
                            label="تصویر بارنامه" 
                            name="invoiceImage" 
                            fileName={state.invoiceImage} 
                            existingFilePath={state.existingInvoicePath}
                            onChange={handleFileChange}
                            onRemove={() => setState(s => ({...s, invoiceImage: null}))}
                            onRemoveExisting={() => setState(s => ({...s, existingInvoicePath: null}))}
                        />
                        <FileInput 
                            label="رسید" 
                            name="receiptImage" 
                            fileName={state.receiptImage} 
                            existingFilePath={state.existingReceiptPath}
                            onChange={handleFileChange}
                            onRemove={() => setState(s => ({...s, receiptImage: null}))}
                            onRemoveExisting={() => setState(s => ({...s, existingReceiptPath: null}))}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FileInput 
                            label="سند اضافی 1" 
                            name="extraDocumentImage1" 
                            fileName={state.extraDocumentImage1} 
                            existingFilePath={state.existingExtraDoc1Path}
                            onChange={handleFileChange}
                            onRemove={() => setState(s => ({...s, extraDocumentImage1: null}))}
                            onRemoveExisting={() => setState(s => ({...s, existingExtraDoc1Path: null}))}
                        />
                        <FileInput 
                            label="سند اضافی 2" 
                            name="extraDocumentImage2" 
                            fileName={state.extraDocumentImage2} 
                            existingFilePath={state.existingExtraDoc2Path}
                            onChange={handleFileChange}
                            onRemove={() => setState(s => ({...s, extraDocumentImage2: null}))}
                            onRemoveExisting={() => setState(s => ({...s, existingExtraDoc2Path: null}))}
                        />
                    </div>
                    <label className="flex items-center gap-2 font-semibold"><input name="isPaid" type="checkbox" checked={state.isPaid} onChange={handleChange}/> پرداخت شده</label>
                    {uploadProgress && (
                        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                            {uploadProgress}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={onClose} disabled={uploading} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm disabled:opacity-50">انصراف</button>
                    <button onClick={handleSave} disabled={uploading} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm disabled:opacity-50">
                        {uploading ? 'در حال ثبت...' : 'ثبت'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const FileInput: React.FC<{
    label: string, 
    name: string, 
    fileName: File | null, 
    existingFilePath?: string | null,
    onChange: (e: React.ChangeEvent<HTMLInputElement>)=>void,
    onRemove?: ()=>void,
    onRemoveExisting?: ()=>void
}> = ({label, name, fileName, existingFilePath, onChange, onRemove, onRemoveExisting}) => (
    <div>
        <label className="text-sm">{label}</label>
        {existingFilePath && !fileName ? (
            <div className="mt-1 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-green-700">فایل موجود: </span>
                    <a href={getFileUrl(existingFilePath)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        مشاهده
                    </a>
                </div>
                {onRemoveExisting && (
                    <button 
                        type="button"
                        onClick={onRemoveExisting}
                        className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                        title="حذف فایل موجود"
                    >
                        حذف
                    </button>
                )}
            </div>
        ) : null}
        {fileName ? (
            <div className="mt-1 flex items-center justify-between p-2 border-2 border-green-400 rounded bg-green-50">
                <span className="text-xs text-green-700 flex-1 truncate">{fileName.name}</span>
                {onRemove && (
                    <button 
                        type="button"
                        onClick={onRemove}
                        className="ml-2 text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded"
                    >
                        حذف
                    </button>
                )}
            </div>
        ) : (
            <label className={`mt-1 flex items-center justify-center p-2 border-2 border-dashed rounded cursor-pointer border-slate-300 hover:border-sky-400`}>
                <span className="text-xs text-slate-500">انتخاب فایل</span>
                <input type="file" name={name} onChange={onChange} accept="image/*,.pdf" className="sr-only" />
            </label>
        )}
    </div>
)


const ViewDocumentsDialog: React.FC<{
    transaction: FreightTransaction;
    onClose: () => void;
}> = ({ transaction, onClose }) => {
    const getFileUrlLocal = (filePath: string | null | undefined) => {
        if (!filePath) return null;
        // اگر مسیر کامل است، همان را برگردان، وگرنه از تابع getFileUrl استفاده کن
        if (filePath.startsWith('http')) return filePath;
        return getFileUrl(filePath);
    };

    const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const invoiceUrl = getFileUrlLocal(transaction.invoiceImagePath || transaction.invoiceImage);
    const receiptUrl = getFileUrlLocal(transaction.receiptImagePath || transaction.receiptImage);
    const extraDocUrl = getFileUrlLocal(transaction.extraDocumentImagePath || transaction.extraDocumentImage);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-lg font-bold">اسناد ارسالی به ستاد - بار #{transaction.announcement?.announcementCode || transaction.announcementId}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <h4 className="font-semibold mb-2">تصویر بارنامه</h4>
                        {invoiceUrl ? (
                            <div className="flex gap-2 items-center">
                                <a 
                                    href={invoiceUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                >
                                    مشاهده تصویر بارنامه
                                </a>
                                <button
                                    onClick={() => downloadFile(invoiceUrl, `invoice-${transaction.announcementId}.pdf`)}
                                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                                >
                                    دانلود
                                </button>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">تصویر بارنامه ثبت نشده است</p>
                        )}
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">رسید</h4>
                        {receiptUrl ? (
                            <div className="flex gap-2 items-center">
                                <a 
                                    href={receiptUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                >
                                    مشاهده رسید
                                </a>
                                <button
                                    onClick={() => downloadFile(receiptUrl, `receipt-${transaction.announcementId}.pdf`)}
                                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                                >
                                    دانلود
                                </button>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">رسیدی ثبت نشده است</p>
                        )}
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">سند اضافی</h4>
                        {extraDocUrl ? (
                            <div className="flex gap-2 items-center">
                                <a 
                                    href={extraDocUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                >
                                    مشاهده سند اضافی
                                </a>
                                <button
                                    onClick={() => downloadFile(extraDocUrl, `extra-doc-${transaction.announcementId}.pdf`)}
                                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                                >
                                    دانلود
                                </button>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">سند اضافی ثبت نشده است</p>
                        )}
                    </div>
                    {transaction.notes && (
                        <div>
                            <h4 className="font-semibold mb-2">توضیحات</h4>
                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{transaction.notes}</p>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm">بستن</button>
                </div>
            </div>
        </div>
    );
};

export default FreightFinanceDashboard;