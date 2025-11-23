import React, { useState, useEffect } from 'react';
import { FreightAnnouncement, FreightTransaction, User } from '../types';
import CentralFinanceDashboard from './CentralFinanceDashboard';
import { gregorianToJalali } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';

interface CentralFinanceContainerProps {
    currentUser: User;
}

const CentralFinanceContainer: React.FC<CentralFinanceContainerProps> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [transactions, setTransactions] = useState<FreightTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            // دریافت همه اعلام‌بارها (مالی ستاد باید همه را ببیند)
            // شامل finalized و InTransit برای نمایش همه بارنامه‌ها
            const [announcementsRes, transactionsRes] = await Promise.all([
                fetch(getApiUrl('freight-announcements?includeLeftover=false&includeFinalized=true'), { headers }),
                fetch(getApiUrl('freight-transactions'), { headers }),
            ]);

            if (!announcementsRes.ok) throw new Error('Failed to fetch announcements');
            if (!transactionsRes.ok) throw new Error('Failed to fetch transactions');

            const announcementsData = await announcementsRes.json();
            const transactionsData = await transactionsRes.json();

            // Normalize announcements
            const normalizedAnnouncements = announcementsData.map((ann: any) => {
                // ساخت شماره پلاک
                let vehiclePlate = '-';
                if (ann.plate_part1 && ann.plate_letter && ann.plate_part2) {
                    vehiclePlate = `${ann.plate_part1}${ann.plate_letter}${ann.plate_part2}`;
                    if (ann.plate_city_code) {
                        vehiclePlate += `-${ann.plate_city_code}`;
                    }
                }

                // Normalize destinations
                const normalizedDestinations = (ann.destinations || []).map((d: any) => ({
                    ...d,
                    representativeName: d.representative_name || d.representativeName || null,
                    freightCost: d.freight_cost || d.freightCost || 0
                }));

                return {
                    ...ann,
                    announcementCode: ann.announcement_code || ann.announcementCode || ann.id, // اضافه کردن normalize برای announcementCode
                    loadingDate: ann.loading_date || ann.loadingDate,
                    destinations: normalizedDestinations,
                    assignedDriverName: ann.assigned_driver_name || ann.assignedDriverName || '-',
                    assignedVehiclePlate: vehiclePlate,
                    billOfLadingNumber: ann.bill_of_lading_number || ann.billOfLadingNumber || null,
                    vehicleType: ann.vehicle_type || ann.vehicleType || '-',
                    lineType: ann.line_type || ann.lineType || '-',
                    assignmentType: ann.assignment_type || ann.assignmentType || null,
                };
            });

            // Normalize transactions - تبدیل فیلدهای image path و referral
            const normalizedTransactions = transactionsData.map((t: any) => ({
                ...t,
                invoiceImagePath: t.invoice_image_path || t.invoiceImagePath || t.invoiceImage || null,
                receiptImagePath: t.receipt_image_path || t.receiptImagePath || t.receiptImage || null,
                extraDocumentImagePath: t.extra_document_image_path || t.extraDocumentImagePath || t.extraDocumentImage || null,
                referralNotes: t.referral_notes || t.referralNotes || null,
                referralStatus: t.referral_status || t.referralStatus || null,
                centralFinanceRejectionNotes: t.central_finance_rejection_notes || t.centralFinanceRejectionNotes || null,
                destinationId: t.destination_id || t.destinationId || null,
            }));

            setAnnouncements(normalizedAnnouncements);
            setTransactions(normalizedTransactions);
        } catch (err: any) {
            console.error('❌ [CentralFinance] Failed to fetch data:', err);
            setError(err.message || 'خطا در بارگذاری اطلاعات');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

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
        <CentralFinanceDashboard
            announcements={announcements}
            transactions={transactions}
            currentUser={currentUser}
            onRefresh={fetchData}
        />
    );
};

export default CentralFinanceContainer;

