import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Helper function for padding
const pad2 = (n: number): string => n < 10 ? `0${n}` : String(n);

interface TransportFinancePaymentListProps {
    currentUser: User;
}

interface PaymentRecord {
    driverId: string;
    employeeId: string;
    driverName: string;
    accountNumber: string;
    totalAmount: number; // هزینه کل پرداخت نشده
    mainDriverAmount: number; // هزینه راننده اصلی
    helperDriverAmount: number; // هزینه راننده کمکی
    calculationDate: string;
    lastPaymentDate?: string;
    lastPaymentAmount?: number;
}

const TransportFinancePaymentList: React.FC<TransportFinancePaymentListProps> = ({ currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
    
    // فیلتر تاریخ (تاریخ محاسبه)
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    
    // جستجو
    const [searchTerm, setSearchTerm] = useState<string>('');
    
    // صفحه‌بندی
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(30);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // دریافت رانندگان و محاسبات (فقط محاسبات ثبت شده)
            const [driversRes, calculationsRes] = await Promise.all([
                fetch(getApiUrl('drivers'), { headers }),
                fetch(getApiUrl('driver-calculations'), { headers }),
            ]);

            if (!driversRes.ok) throw new Error('خطا در دریافت رانندگان');
            if (!calculationsRes.ok) {
                const errorText = await calculationsRes.text();
                console.error('❌ [fetchData] Error response:', errorText);
                throw new Error('خطا در دریافت محاسبات');
            }

            const [driversData, calculationsData] = await Promise.all([
                driversRes.json(),
                calculationsRes.json(),
            ]);

            setDrivers(Array.isArray(driversData) ? driversData : []);
            
            // تبدیل محاسبات به رکوردهای پرداخت (فقط محاسبات ثبت شده)
            const recordsMap = new Map<string, PaymentRecord>();
            
            (Array.isArray(calculationsData) ? calculationsData : []).forEach((calc: any) => {
                // فقط محاسباتی که total_cost دارند (یعنی ثبت شده‌اند)
                const totalCost = parseFloat(calc.total_cost || calc.totalCost || 0);
                if (totalCost <= 0) return; // محاسبات ثبت نشده را نادیده بگیر
                
                const driverId = calc.driver_id || calc.driverId;
                const driver = driversData.find((d: Driver) => d.id === driverId);
                
                if (!driver) return;
                
                // محاسبه هزینه راننده اصلی
                const food = calc.food_cost || calc.foodCost || 0;
                const toll = calc.toll_cost || calc.tollCost || 0;
                const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
                const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
                const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
                const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
                const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
                const mainDriverCost = food + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance;
                
                // محاسبه هزینه راننده کمکی
                const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                const helperDriverCost = helperAllowance + helperFoodCost + helperExcessMissionCost;
                
                const existing = recordsMap.get(driverId);
                const calculationDate = calc.calculation_date || calc.calculationDate || '';
                
                if (existing) {
                    existing.totalAmount += totalCost;
                    existing.mainDriverAmount += mainDriverCost;
                    existing.helperDriverAmount += helperDriverCost;
                    // استفاده از جدیدترین تاریخ محاسبه
                    if (calculationDate && (!existing.calculationDate || calculationDate > existing.calculationDate)) {
                        existing.calculationDate = calculationDate;
                    }
                } else {
                    recordsMap.set(driverId, {
                        driverId,
                        employeeId: driver.employee_id || driver.employeeId || '',
                        driverName: driver.name || '',
                        accountNumber: (driver as any).account_number || (driver as any).accountNumber || '',
                        totalAmount: totalCost,
                        mainDriverAmount: mainDriverCost,
                        helperDriverAmount: helperDriverCost,
                        calculationDate,
                    });
                }
            });
            
            // دریافت آخرین پرداخت برای هر راننده
            const recordsArray = Array.from(recordsMap.values());
            const recordsWithPayments = await Promise.all(
                recordsArray.map(async (record) => {
                    try {
                        const paymentRes = await fetch(
                            getApiUrl(`payments/last/${record.driverId}`),
                            { headers }
                        );
                        if (paymentRes.ok) {
                            const paymentData = await paymentRes.json();
                            if (paymentData) {
                                record.lastPaymentDate = paymentData.payment_date || '';
                                record.lastPaymentAmount = parseFloat(paymentData.payment_amount || 0);
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ [fetchData] Failed to fetch last payment for driver ${record.driverId}:`, err);
                    }
                    return record;
                })
            );
            
            setPaymentRecords(recordsWithPayments);
        } catch (err: any) {
            console.error('❌ [TransportFinancePaymentList] Failed to fetch data:', err);
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            setLoading(false);
        }
    };

    // فیلتر و جستجو
    const filteredRecords = useMemo(() => {
        let filtered = [...paymentRecords];

        // فیلتر بر اساس جستجو
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(record => 
                record.employeeId?.toLowerCase().includes(searchLower) ||
                record.driverName?.toLowerCase().includes(searchLower)
            );
        }

        // فیلتر بر اساس تاریخ محاسبه
        if (startDate || endDate) {
            filtered = filtered.filter(record => {
                if (!record.calculationDate) return false;
                
                if (startDate && record.calculationDate < startDate) return false;
                if (endDate && record.calculationDate > endDate) return false;
                
                return true;
            });
        }

        return filtered;
    }, [paymentRecords, searchTerm, startDate, endDate]);

    // محاسبه صفحه‌بندی
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredRecords.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredRecords, currentPage, itemsPerPage]);

    // خروجی اکسل برای بانک
    const exportToExcelForBank = async () => {
        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        
        // دریافت محاسبات برای تفکیک هزینه راننده کمکی
        const calculationsMap = new Map<string, any[]>();
        await Promise.all(filteredRecords.map(async (record) => {
            try {
                const calculationsRes = await fetch(
                    getApiUrl(`driver-calculations?driverId=${record.driverId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`),
                    { headers }
                );
                if (calculationsRes.ok) {
                    const calculationsData = await calculationsRes.json();
                    calculationsMap.set(record.driverId, Array.isArray(calculationsData) ? calculationsData : []);
                }
            } catch (err) {
                console.warn(`⚠️ [exportToExcelForBank] خطا در دریافت محاسبات برای ${record.driverId}:`, err);
            }
        }));
        
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'شماره حساب مقصد', 'مبلغ هزینه راننده اصلی (ریال)', 'مبلغ هزینه راننده کمکی (ریال)', 'مبلغ کل (ریال)']
        ];

        filteredRecords.forEach((record, index) => {
            const calculations = calculationsMap.get(record.driverId) || [];
            
            // محاسبه هزینه راننده اصلی و راننده کمکی
            let mainDriverCost = 0;
            let helperDriverCost = 0;
            
            calculations.forEach((calc: any) => {
                const totalCost = calc.total_cost || calc.totalCost || 0;
                const helperId = calc.helper_driver_id || calc.helperDriverId;
                const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                const helperExcessDays = calc.helper_driver_excess_mission_days || calc.helperDriverExcessMissionDays || 0;
                const helperTotal = helperAllowance + helperFoodCost + (helperExcessDays * (calc.food_cost || calc.foodCost || 0));
                
                if (helperId && helperTotal > 0) {
                    helperDriverCost += helperTotal;
                    mainDriverCost += (totalCost - helperTotal);
                } else {
                    mainDriverCost += totalCost;
                }
            });
            
            wsData.push([
                index + 1,
                record.employeeId || '',
                record.driverName || '',
                record.accountNumber || '',
                mainDriverCost || 0,
                helperDriverCost || 0,
                record.totalAmount || 0
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // تنظیم راست‌چین و فرمت اعداد
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellAddress]) continue;
                
                if (!ws[cellAddress].s) ws[cellAddress].s = {};
                if (!ws[cellAddress].s.alignment) ws[cellAddress].s.alignment = {};
                ws[cellAddress].s.alignment.horizontal = 'right';
                ws[cellAddress].s.alignment.vertical = 'center';
                
                // فرمت اعداد برای ستون‌های مبلغ (ستون‌های 4، 5، 6)
                if (R > 0 && (C === 4 || C === 5 || C === 6)) {
                    if (typeof wsData[R][C] === 'number') {
                        ws[cellAddress].z = '#,##0';
                    }
                }
            }
        }
        
        // تنظیم عرض ستون‌ها
        ws['!cols'] = [
            { wch: 8 },  // ردیف
            { wch: 12 }, // کد پرسنلی
            { wch: 25 }, // نام
            { wch: 20 }, // شماره حساب
            { wch: 25 }, // مبلغ راننده اصلی
            { wch: 25 }, // مبلغ راننده کمکی
            { wch: 18 }  // مبلغ کل
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'لیست پرداخت بانک');
        XLSX.writeFile(wb, `لیست_پرداخت_بانک_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
    const [selectedInvoiceRecord, setSelectedInvoiceRecord] = useState<PaymentRecord | null>(null);
    const [invoiceCalculations, setInvoiceCalculations] = useState<any[]>([]);
    const [invoiceAnnouncements, setInvoiceAnnouncements] = useState<Map<string, any>>(new Map());
    const invoiceRef = useRef<HTMLDivElement>(null);
    const [invoiceZoom, setInvoiceZoom] = useState(100);

    // تولید تصویر صورتحساب
    const generateInvoiceImage = async (record: PaymentRecord) => {
        try {
            setSelectedInvoiceRecord(record);
            
            // دریافت جزئیات محاسبات برای این راننده
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const calculationsRes = await fetch(
                getApiUrl(`driver-calculations?driverId=${record.driverId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`),
                { headers }
            );

            if (calculationsRes.ok) {
                const calculationsData = await calculationsRes.json();
                const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
                // فقط محاسبات پرداخت نشده را نمایش بده
                const unpaidCalculations = calculationsArray.filter((calc: any) => 
                    !(calc.is_paid || calc.isPaid)
                );
                setInvoiceCalculations(unpaidCalculations);
                
                // دریافت اطلاعات اعلام بار برای هر محاسبه (برای نمایش مقاصد)
                const announcementsMap = new Map<string, any>();
                await Promise.all(calculationsArray.map(async (calc: any) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    if (announcementId && !announcementsMap.has(announcementId)) {
                        try {
                            const annRes = await fetch(getApiUrl(`freight-announcements/${announcementId}`), { headers });
                            if (annRes.ok) {
                                const annData = await annRes.json();
                                announcementsMap.set(announcementId, annData);
                            }
                        } catch (err) {
                            console.warn('⚠️ [generateInvoiceImage] خطا در دریافت اعلام بار:', err);
                        }
                    }
                }));
                setInvoiceAnnouncements(announcementsMap);
            } else {
                console.warn('⚠️ [generateInvoiceImage] خطا در دریافت محاسبات:', calculationsRes.status);
                setInvoiceCalculations([]);
                setInvoiceAnnouncements(new Map());
            }

            setInvoiceDialogOpen(true);
        } catch (err: any) {
            console.error('❌ [generateInvoiceImage] Error:', err);
            alert(`خطا در تولید صورتحساب: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // تبدیل صورتحساب به PDF
    const exportInvoiceToPDF = async () => {
        if (!invoiceRef.current || !selectedInvoiceRecord) return;

        try {
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/png');
            // استفاده از landscape orientation برای A4
            const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' برای landscape
            
            // A4 landscape dimensions: 297mm width x 210mm height
            const pageWidth = 297; // A4 landscape width in mm
            const pageHeight = 210; // A4 landscape height in mm
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;

            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage('l'); // اضافه کردن صفحه جدید با landscape orientation
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`صورتحساب_${selectedInvoiceRecord.driverName}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err: any) {
            console.error('❌ [exportInvoiceToPDF] Error:', err);
            alert(`خطا در تولید PDF: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // علامت‌گذاری پرداخت شد
    const markAsPaid = async (record: PaymentRecord) => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // تاریخ امروز
            const today = new Date();
            const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const paymentDate = `${jy}/${pad2(jm)}/${pad2(jd)}`;

            const userId = currentUser?.id || currentUser?.userId || '';

            const response = await fetch(getApiUrl('payments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    driverId: record.driverId,
                    paymentDate,
                    paymentAmount: record.totalAmount,
                    calculationDateFrom: startDate || null,
                    calculationDateTo: endDate || null,
                    paymentListDate: paymentDate,
                    userId,
                }),
            });

            if (!response.ok) {
                throw new Error('خطا در ثبت پرداخت');
            }

            alert(`پرداخت برای ${record.driverName} با موفقیت ثبت شد`);
            // بارگذاری مجدد داده‌ها
            fetchData();
        } catch (err: any) {
            console.error('❌ [markAsPaid] Error:', err);
            alert(`خطا در ثبت پرداخت: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
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
            <div className="flex items-center justify-center h-64">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h1 className="text-2xl font-bold text-slate-800 mb-6">
                    لیست پرداخت
                </h1>

                {/* فیلتر و جستجو */}
                <div className="mb-6 space-y-4">
                    <div className="flex gap-4 items-end flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                جستجو (کد پرسنلی / نام)
                            </label>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="جستجو بر اساس کد پرسنلی یا نام..."
                                className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                از تاریخ (محاسبه)
                            </label>
                            <input
                                type="text"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="1403/01/01"
                                className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                تا تاریخ (محاسبه)
                            </label>
                            <input
                                type="text"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="1403/12/29"
                                className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            />
                        </div>
                        <div className="flex gap-2 items-end">
                            <button
                                onClick={exportToExcelForBank}
                                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                            >
                                خروجی اکسل برای بانک
                            </button>
                        </div>
                    </div>
                </div>

                {/* صفحه‌بندی */}
                <div className="mb-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-700">تعداد ردیف در هر صفحه:</label>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="px-3 py-1 border border-slate-300 rounded-md text-sm"
                        >
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                    <div className="text-sm text-slate-600">
                        نمایش {((currentPage - 1) * itemsPerPage) + 1} تا {Math.min(currentPage * itemsPerPage, filteredRecords.length)} از {filteredRecords.length} ردیف
                    </div>
                </div>

                {/* جدول */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-700 text-white border-b">
                                <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                <th className="p-3 text-right border-l border-slate-600">کد پرسنلی</th>
                                <th className="p-3 text-right border-l border-slate-600">نام و نام خانوادگی</th>
                                <th className="p-3 text-right border-l border-slate-600">شماره حساب</th>
                                <th className="p-3 text-right border-l border-slate-600">هزینه راننده اصلی (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">هزینه راننده کمکی (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">هزینه کل (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">تاریخ محاسبه</th>
                                <th className="p-3 text-right border-l border-slate-600">آخرین پرداخت هزینه</th>
                                <th className="p-3 text-right">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRecords.map((record, index) => (
                                <tr key={record.driverId} className="border-b border-slate-300 bg-white hover:bg-slate-50">
                                    <td className="p-3 border-l border-slate-200 text-center font-medium">
                                        {((currentPage - 1) * itemsPerPage) + index + 1}
                                    </td>
                                    <td className="p-3 border-l border-slate-200 font-medium">{record.employeeId}</td>
                                    <td className="p-3 border-l border-slate-200 font-semibold text-slate-800">{record.driverName}</td>
                                    <td className="p-3 border-l border-slate-200">{record.accountNumber || '-'}</td>
                                    <td className="p-3 border-l border-slate-200 text-left font-semibold text-blue-700">
                                        {record.mainDriverAmount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="p-3 border-l border-slate-200 text-left font-semibold text-purple-700">
                                        {record.helperDriverAmount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                        {record.totalAmount.toLocaleString('fa-IR')}
                                    </td>
                                    <td className="p-3 border-l border-slate-200 text-xs">
                                        {record.calculationDate || '-'}
                                    </td>
                                    <td className="p-3 border-l border-slate-200 text-xs">
                                        {record.lastPaymentDate ? (
                                            <div>
                                                <div>{record.lastPaymentDate}</div>
                                                <div className="text-slate-500">{record.lastPaymentAmount?.toLocaleString('fa-IR')} ریال</div>
                                            </div>
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => generateInvoiceImage(record)}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                            >
                                                تصویر صورتحساب
                                            </button>
                                            <button
                                                onClick={() => markAsPaid(record)}
                                                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 transition-colors"
                                            >
                                                پرداخت شد
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* کنترل‌های صفحه‌بندی */}
                {totalPages > 1 && (
                    <div className="mt-4 flex justify-center items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            قبلی
                        </button>
                        <span className="text-sm text-slate-700">
                            صفحه {currentPage} از {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            بعدی
                        </button>
                    </div>
                )}
            </div>

            {/* دیالوگ صورتحساب */}
            {invoiceDialogOpen && selectedInvoiceRecord && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
                        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center z-10">
                            <h2 className="text-xl font-bold text-slate-800">
                                صورتحساب {selectedInvoiceRecord.driverName}
                            </h2>
                            <div className="flex gap-2 items-center">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-slate-700">بزرگنمایی:</label>
                                    <input
                                        type="range"
                                        min="50"
                                        max="200"
                                        step="10"
                                        value={invoiceZoom}
                                        onChange={(e) => setInvoiceZoom(Number(e.target.value))}
                                        className="w-24"
                                    />
                                    <span className="text-sm text-slate-600 w-12">{invoiceZoom}%</span>
                                </div>
                                <button
                                    onClick={exportInvoiceToPDF}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                                >
                                    دانلود PDF
                                </button>
                                <button
                                    onClick={() => {
                                        setInvoiceDialogOpen(false);
                                        setSelectedInvoiceRecord(null);
                                        setInvoiceCalculations([]);
                                        setInvoiceAnnouncements(new Map());
                                        setInvoiceZoom(100);
                                    }}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                                >
                                    بستن
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-auto p-4">
                            <div 
                                ref={invoiceRef} 
                                className="p-6 bg-white mx-auto" 
                                dir="rtl" 
                                style={{ 
                                    width: '297mm', 
                                    minHeight: '210mm',
                                    transform: `scale(${invoiceZoom / 100})`,
                                    transformOrigin: 'top center',
                                    transition: 'transform 0.2s'
                                }}
                            >
                            {/* هدر صورتحساب */}
                            <div className="mb-4 border-b-2 border-slate-800 pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h1 className="text-xl font-bold text-slate-900 mb-1">صورتحساب هزینه</h1>
                                        <p className="text-xs text-slate-600">کد پرسنلی: {selectedInvoiceRecord.employeeId}</p>
                                        <p className="text-xs text-slate-600">نام: {selectedInvoiceRecord.driverName}</p>
                                        <p className="text-xs text-slate-600">شماره حساب: {selectedInvoiceRecord.accountNumber || '-'}</p>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-slate-600 mb-1">تاریخ تهیه لیست: {formatJalali(new Date())}</p>
                                        {startDate && endDate && (
                                            <p className="text-xs text-slate-600">
                                                بازه زمانی: {startDate} تا {endDate}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* تفکیک محاسبات راننده اصلی و کمکی */}
                            {(() => {
                                // جدا کردن محاسبات با راننده کمکی و بدون راننده کمکی
                                const calculationsWithHelper = invoiceCalculations.filter((calc: any) => 
                                    (calc.helper_driver_id || calc.helperDriverId) && 
                                    ((calc.helper_driver_allowance || calc.helperDriverAllowance || 0) + 
                                     (calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0) + 
                                     (calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0) > 0)
                                );
                                const calculationsWithoutHelper = invoiceCalculations.filter((calc: any) => 
                                    !(calc.helper_driver_id || calc.helperDriverId) || 
                                    ((calc.helper_driver_allowance || calc.helperDriverAllowance || 0) + 
                                     (calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0) + 
                                     (calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0) === 0)
                                );

                                // تابع برای ساخت جدول
                                const renderTable = (calculations: any[], title: string, isHelper: boolean = false) => {
                                    if (calculations.length === 0) return null;

                                    // محاسبه هزینه‌های راننده اصلی (بدون هزینه‌های راننده کمکی)
                                    const calculateMainDriverCost = (calc: any) => {
                                        const food = calc.food_cost || calc.foodCost || 0;
                                        const toll = calc.toll_cost || calc.tollCost || 0;
                                        const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
                                        const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
                                        const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
                                        const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
                                        const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
                                        const totalLoading = returnCargo + multiUnload + excessMission;
                                        return food + toll + bill + totalLoading + fixedAllowance;
                                    };

                                    // محاسبه هزینه‌های راننده کمکی
                                    const calculateHelperDriverCost = (calc: any) => {
                                        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                        return helperAllowance + helperFoodCost + helperExcessMissionCost;
                                    };

                                    return (
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2">
                                                {title}
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs border-collapse border border-slate-800 mb-3" style={{ fontSize: '9px' }}>
                                                    <thead>
                                                        <tr className="bg-slate-800 text-white">
                                                            <th className="p-1 border border-slate-600 text-center" style={{ fontSize: '9px' }}>ردیف</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>شماره بارنامه</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>مقاصد</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>تاریخ صدور</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>تاریخ محاسبه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>پیمایش مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>پیمایش مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه غذا</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه عوارض</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه بارنامه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>بار برگشتی</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>چندجا تخلیه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>اجرت ثابت</th>
                                                            {isHelper && (
                                                                <>
                                                                    <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>اجرت راننده کمکی</th>
                                                                    <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>غذای راننده کمکی</th>
                                                                    <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد راننده کمکی</th>
                                                                </>
                                                            )}
                                                            <th className="p-1 border border-slate-600 text-left font-semibold" style={{ fontSize: '9px' }}>جمع کل</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {calculations.map((calc, idx) => {
                                                            const announcementId = calc.announcement_id || calc.announcementId;
                                                            const announcement = invoiceAnnouncements.get(announcementId);
                                                            const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                                            
                                                            const mainCost = calculateMainDriverCost(calc);
                                                            const helperCost = isHelper ? calculateHelperDriverCost(calc) : 0;
                                                            const totalCost = mainCost + helperCost;
                                                            
                                                            return (
                                                                <tr key={calc.id || idx} className="border-b border-slate-300">
                                                                    <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '9px' }}>{idx + 1}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>{destinations}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>
                                                                        {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                                            (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                                                ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                                                : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                                            : '-'}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>
                                                                        {calc.calculation_date || calc.calculationDate || '-'}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {calc.approved_mission_days || calc.approvedMissionDays || 0}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {calc.excess_mission_days || calc.excessMissionDays || 0}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.return_cargo_cost || calc.returnCargoCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.multi_unload_cost || calc.multiUnloadCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.excess_mission_cost || calc.excessMissionCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.fixed_allowance || calc.fixedAllowance || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    {isHelper && (
                                                                        <>
                                                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                                {(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}
                                                                            </td>
                                                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                                {(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}
                                                                            </td>
                                                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                                {(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}
                                                                            </td>
                                                                        </>
                                                                    )}
                                                                    <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '9px' }}>
                                                                        {totalCost.toLocaleString('fa-IR')}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-slate-100 font-bold">
                                                            <td colSpan={isHelper ? 18 : 15} className="p-1 border border-slate-300 text-right" style={{ fontSize: '9px' }}>
                                                                جمع کل:
                                                            </td>
                                                            <td className="p-1 border border-slate-300 text-left font-bold" style={{ fontSize: '9px' }}>
                                                                {(() => {
                                                                    const total = calculations.reduce((sum, calc) => {
                                                                        const mainCost = calculateMainDriverCost(calc);
                                                                        const helperCost = isHelper ? calculateHelperDriverCost(calc) : 0;
                                                                        return sum + mainCost + helperCost;
                                                                    }, 0);
                                                                    return total.toLocaleString('fa-IR');
                                                                })()} ریال
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {/* جدول راننده اصلی */}
                                        {renderTable(calculationsWithoutHelper, 'هزینه‌های راننده اصلی', false)}
                                        
                                        {/* جدول راننده کمکی */}
                                        {renderTable(calculationsWithHelper, 'هزینه‌های راننده کمکی', true)}
                                        
                                        {/* جمع کل نهایی */}
                                        {invoiceCalculations.length > 0 && (
                                            <div className="mt-4 p-4 bg-slate-200 rounded-lg border-2 border-slate-600">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-bold text-slate-900">جمع کل هزینه سفر:</span>
                                                    <span className="text-xl font-bold text-green-700">
                                                        {(() => {
                                                            const totalMain = calculationsWithoutHelper.reduce((sum, calc) => {
                                                                const food = calc.food_cost || calc.foodCost || 0;
                                                                const toll = calc.toll_cost || calc.tollCost || 0;
                                                                const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
                                                                const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
                                                                const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
                                                                const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
                                                                const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
                                                                return sum + food + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance;
                                                            }, 0);
                                                            const totalHelper = calculationsWithHelper.reduce((sum, calc) => {
                                                                const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                                                const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                                                const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                                                return sum + helperAllowance + helperFoodCost + helperExcessMissionCost;
                                                            }, 0);
                                                            return (totalMain + totalHelper).toLocaleString('fa-IR');
                                                        })()} ریال
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}

                            {/* پیام در صورت عدم وجود محاسبات پرداخت نشده */}
                            {invoiceCalculations.length === 0 && (
                                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg text-center">
                                    <p className="text-sm font-semibold text-yellow-800">
                                        تمام محاسبات این راننده پرداخت شده است.
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-1">
                                        برای مشاهده صورتحساب‌های پرداخت شده، به صفحه "صورتحساب‌های پرداخت شده" مراجعه کنید.
                                    </p>
                                </div>
                            )}

                            {/* خلاصه */}
                            {invoiceCalculations.length > 0 && (() => {
                                const calculationsWithHelper = invoiceCalculations.filter((calc: any) => 
                                    (calc.helper_driver_id || calc.helperDriverId) && 
                                    ((calc.helper_driver_allowance || calc.helperDriverAllowance || 0) + 
                                     (calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0) + 
                                     (calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0) > 0)
                                );
                                const totalMain = invoiceCalculations.reduce((sum, calc) => {
                                    const food = calc.food_cost || calc.foodCost || 0;
                                    const toll = calc.toll_cost || calc.tollCost || 0;
                                    const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
                                    const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
                                    const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
                                    const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
                                    const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
                                    return sum + food + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance;
                                }, 0);
                                const totalHelper = calculationsWithHelper.reduce((sum, calc) => {
                                    const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                    const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                    const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                    return sum + helperAllowance + helperFoodCost + helperExcessMissionCost;
                                }, 0);
                                
                                return (
                                    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-300">
                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                                <p className="font-semibold text-slate-700 mb-1">خلاصه:</p>
                                                <p className="text-xs">تعداد تورها: {invoiceCalculations.length}</p>
                                                <p className="text-xs">هزینه راننده اصلی: {totalMain.toLocaleString('fa-IR')} ریال</p>
                                                {totalHelper > 0 && (
                                                    <p className="text-xs">هزینه راننده کمکی: {totalHelper.toLocaleString('fa-IR')} ریال</p>
                                                )}
                                                <p className="text-xs font-bold">مبلغ کل: {(totalMain + totalHelper).toLocaleString('fa-IR')} ریال</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="font-semibold text-slate-700 mb-1">توضیحات:</p>
                                                <p className="text-xs text-slate-600">
                                                    این صورتحساب بر اساس محاسبات ثبت شده و پرداخت نشده در سیستم تهیه شده است.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransportFinancePaymentList;

