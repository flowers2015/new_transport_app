import React, { useState, useEffect, useMemo } from 'react';
import { FreightAnnouncement, Branch, FreightTransaction, User, FreightPaymentStatus } from '../types';
import FreightFinanceDashboard from './FreightFinanceDashboard';
import { gregorianToJalali, jalaliToGregorian } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';

interface FreightFinanceContainerProps {
    currentUser: User;
}

const FreightFinanceContainer: React.FC<FreightFinanceContainerProps> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [transactions, setTransactions] = useState<FreightTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // محاسبه بازه پیش‌فرض: سه ماه گذشته تا امروز (شمسی)
    const getDefaultDateRange = () => {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        
        // سه ماه قبل
        let startYear = jy;
        let startMonth = jm - 3;
        if (startMonth <= 0) {
            startMonth += 12;
            startYear -= 1;
        }
        
        // تبدیل به میلادی برای input type="date"
        const [gyStart, gmStart, gdStart] = jalaliToGregorian(startYear, startMonth, 1);
        const [gyEnd, gmEnd, gdEnd] = jalaliToGregorian(jy, jm, jd);
        
        const startDate = `${gyStart}-${String(gmStart).padStart(2, '0')}-${String(gdStart).padStart(2, '0')}`;
        const endDate = `${gyEnd}-${String(gmEnd).padStart(2, '0')}-${String(gdEnd).padStart(2, '0')}`;
        
        return { startDate, endDate };
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            // برای Freight Finance، باید announcement‌های finalized را هم شامل کنیم
            // Fetch announcements - شامل finalized و InTransit برای Freight Finance
            const annRes = await fetch(getApiUrl('freight-announcements?includeLeftover=false&includeFinalized=true'), { headers });
            if (!annRes.ok) throw new Error('Failed to fetch freight announcements');
            const annData = await annRes.json();

            // Fetch branches
            const branchesRes = await fetch(getApiUrl('branches'), { headers });
            if (!branchesRes.ok) throw new Error('Failed to fetch branches');
            const branchesData = await branchesRes.json();

            // Fetch transactions
            const transactionsRes = await fetch(getApiUrl('freight-transactions'), { headers });
            let transactionsData: FreightTransaction[] = [];
            if (transactionsRes.ok) {
                const rawTransactions = await transactionsRes.json();
                // Normalize transactions - تبدیل فیلدهای image path
                transactionsData = rawTransactions.map((t: any) => ({
                    ...t,
                    invoiceImagePath: t.invoice_image_path || t.invoiceImagePath || t.invoiceImage || null,
                    receiptImagePath: t.receipt_image_path || t.receiptImagePath || t.receiptImage || null,
                    extraDocumentImagePath: t.extra_document_image_path || t.extraDocumentImagePath || t.extraDocumentImage || null,
                    centralFinanceRejectionNotes: t.central_finance_rejection_notes || t.centralFinanceRejectionNotes || null,
                }));
            }

            console.log('📦 [FreightFinance] Raw announcements:', annData.length);
            if (annData.length > 0) {
                console.log('📦 [FreightFinance] Sample announcement:', {
                    id: annData[0].id,
                    announcementCode: annData[0].announcement_code,
                    assignmentType: annData[0].assignment_type,
                    loadingDate: annData[0].loading_date,
                    destinationsCount: annData[0].destinations?.length || 0
                });
            }

            // Normalize announcements
            const normalizedAnnouncements: FreightAnnouncement[] = annData.map((ann: any) => {
                // محاسبه paymentStatus از transactions
                let paymentStatus = FreightPaymentStatus.Unpaid;
                const annTransactions = transactionsData.filter((t: FreightTransaction) => t.announcementId === ann.id);
                if (annTransactions.length > 0) {
                    const hasPaid = annTransactions.some((t: FreightTransaction) => t.isPaid);
                    paymentStatus = hasPaid ? FreightPaymentStatus.Paid : FreightPaymentStatus.Unpaid;
                }

                // ساخت plate number از plate_part1, plate_letter, plate_part2, plate_city_code
                let vehiclePlate = '-';
                // اول از فیلدهای جداگانه پلاک استفاده کن
                if (ann.plate_part1 && ann.plate_letter && ann.plate_part2) {
                    vehiclePlate = `${ann.plate_part1}${ann.plate_letter}${ann.plate_part2}`;
                    if (ann.plate_city_code) {
                        vehiclePlate += `-${ann.plate_city_code}`;
                    }
                } 
                // اگر فیلدهای جداگانه نبود، از assigned_vehicle_plate استفاده کن
                else if (ann.assigned_vehicle_plate) {
                    vehiclePlate = ann.assigned_vehicle_plate;
                }
                // اگر هیچکدام نبود، سعی کن از vehicle object استفاده کنی
                else if (ann.vehicle && typeof ann.vehicle === 'object') {
                    const v = ann.vehicle;
                    if (v.plate_part1 && v.plate_letter && v.plate_part2) {
                        vehiclePlate = `${v.plate_part1}${v.plate_letter}${v.plate_part2}`;
                        if (v.plate_city_code) {
                            vehiclePlate += `-${v.plate_city_code}`;
                        }
                    } else if (v.plate_number) {
                        vehiclePlate = typeof v.plate_number === 'string' ? v.plate_number : JSON.stringify(v.plate_number);
                    }
                }

                // Normalize destinations
                const normalizedDestinations = (ann.destinations || []).map((d: any) => ({
                    ...d,
                    representativeName: d.representative_name || d.representativeName || null,
                    freightCost: d.freight_cost || d.freightCost || 0
                }));

                // تشخیص assignmentType: اگر null است اما driver از personal_drivers است، personal است
                let assignmentType = ann.assignment_type || ann.assignmentType;
                if (!assignmentType && ann.assigned_driver_id) {
                    // اگر driver_id در personal_drivers است، personal است
                    // این را از backend می‌گیریم (detected_assignment_type)
                    assignmentType = ann.detected_assignment_type || null;
                }

                const normalized = {
                    ...ann,
                    loadingDate: ann.loading_date || ann.loadingDate,
                    paymentStatus,
                    destinations: normalizedDestinations,
                    assignedDriverName: ann.assigned_driver_name || ann.assignedDriverName || '-',
                    assignedVehiclePlate: vehiclePlate,
                    // اضافه کردن فیلدهای پلاک برای استفاده در جاهای دیگر
                    plate_part1: ann.plate_part1,
                    plate_letter: ann.plate_letter,
                    plate_part2: ann.plate_part2,
                    plate_city_code: ann.plate_city_code,
                    assignmentType: assignmentType || ann.assignment_type || ann.assignmentType,
                    assignmentFinalizedAt: ann.assignment_finalized_at || ann.assignmentFinalizedAt,
                    vehicleType: ann.vehicle_type || ann.vehicleType,
                    lineType: ann.line_type || ann.lineType,
                    billOfLadingNumber: ann.bill_of_lading_number || ann.billOfLadingNumber || '',
                };

                const normInfo = {
                    id: normalized.id,
                    announcementCode: normalized.announcementCode,
                    assignmentType: normalized.assignmentType,
                    loadingDate: normalized.loadingDate,
                    destinationsCount: normalized.destinations.length,
                    destinations: normalized.destinations.map((d: any) => ({
                        id: d.id,
                        city: d.city,
                        representativeName: d.representative_name || d.representativeName || 'NULL',
                        freightCost: d.freight_cost || d.freightCost || 0
                    }))
                };
                console.log('📋 [FreightFinance] Normalized announcement:', JSON.stringify(normInfo, null, 2));

                return normalized;
            });

            console.log('✅ [FreightFinance] Normalized announcements count:', normalizedAnnouncements.length);

            setAnnouncements(normalizedAnnouncements);
            setBranches(branchesData);
            setTransactions(transactionsData);
        } catch (err: any) {
            console.error('❌ [FreightFinance] Failed to fetch data:', err);
            setError(err.message || 'خطا در دریافت اطلاعات');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddTransaction = async (transaction: Omit<FreightTransaction, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const res = await fetch(getApiUrl('freight-transactions'), {
                method: 'POST',
                headers,
                body: JSON.stringify(transaction),
            });

            if (!res.ok) throw new Error('Failed to add transaction');

            const newTransaction = await res.json();
            
            // بررسی اینکه آیا transaction از قبل وجود دارد یا نه
            setTransactions(prev => {
                const existingIndex = prev.findIndex(t => t.announcementId === transaction.announcementId);
                if (existingIndex >= 0) {
                    // به‌روزرسانی transaction موجود
                    const updated = [...prev];
                    updated[existingIndex] = newTransaction;
                    return updated;
                } else {
                    // اضافه کردن transaction جدید
                    return [...prev, newTransaction];
                }
            });

            // Update announcement payment status - استفاده از isPaid از transaction جدید
            const transactionIsPaid = newTransaction.isPaid === true || newTransaction.isPaid === 'true' || newTransaction.isPaid === 1;
            setAnnouncements(prev => prev.map(ann => {
                if (ann.id === transaction.announcementId) {
                    return {
                        ...ann,
                        paymentStatus: transactionIsPaid ? FreightPaymentStatus.Paid : FreightPaymentStatus.Unpaid,
                    };
                }
                return ann;
            }));
        } catch (err: any) {
            console.error('❌ [FreightFinance] Failed to add transaction:', err);
            alert('خطا در ثبت تراکنش');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">در حال بارگذاری...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
            </div>
        );
    }

    return (
        <FreightFinanceDashboard
            announcements={announcements}
            branches={branches}
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            currentUser={currentUser}
            onRefresh={fetchData}
        />
    );
};

export default FreightFinanceContainer;

