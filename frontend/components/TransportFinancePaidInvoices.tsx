import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface TransportFinancePaidInvoicesProps {
    currentUser: User;
}

interface PaidInvoiceRecord {
    id: string;
    driverId: string;
    employeeId: string;
    driverName: string;
    accountNumber: string;
    paymentDate: string;
    paymentAmount: number;
    calculationDateFrom?: string;
    calculationDateTo?: string;
    paymentListDate?: string;
    createdBy?: string;
    createdByName?: string;
    createdAt?: string;
    notes?: string;
}

const TransportFinancePaidInvoices: React.FC<TransportFinancePaidInvoicesProps> = ({ currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paidInvoices, setPaidInvoices] = useState<PaidInvoiceRecord[]>([]);
    
    // فیلتر تاریخ (تاریخ پرداخت)
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

            const paymentsRes = await fetch(getApiUrl('payments'), { headers });

            if (!paymentsRes.ok) {
                throw new Error('خطا در دریافت لیست پرداخت‌ها');
            }

            const paymentsData = await paymentsRes.json();
            const paymentsArray = Array.isArray(paymentsData) ? paymentsData : [];
            
            // دریافت اطلاعات رانندگان
            const driversRes = await fetch(getApiUrl('drivers'), { headers });
            const driversData = await driversRes.json();
            const driversArray = Array.isArray(driversData) ? driversData : [];
            const driversMap = new Map(driversArray.map((d: Driver) => [d.id, d]));
            
            // تبدیل به PaidInvoiceRecord
            const invoices: PaidInvoiceRecord[] = paymentsArray.map((payment: any) => {
                const driver = driversMap.get(payment.driver_id || payment.driverId);
                return {
                    id: payment.id,
                    driverId: payment.driver_id || payment.driverId,
                    employeeId: driver?.employee_id || driver?.employeeId || '',
                    driverName: driver?.name || '',
                    accountNumber: (driver as any)?.account_number || (driver as any)?.accountNumber || '',
                    paymentDate: payment.payment_date || payment.paymentDate || '',
                    paymentAmount: parseFloat(payment.payment_amount || payment.paymentAmount || 0),
                    calculationDateFrom: payment.calculation_date_from || payment.calculationDateFrom,
                    calculationDateTo: payment.calculation_date_to || payment.calculationDateTo,
                    paymentListDate: payment.payment_list_date || payment.paymentListDate,
                    createdBy: payment.created_by || payment.createdBy,
                    createdByName: payment.created_by_name || payment.createdByName,
                    createdAt: payment.created_at || payment.createdAt,
                    notes: payment.notes || '',
                };
            });
            
            // مرتب‌سازی بر اساس تاریخ پرداخت (جدیدترین اول)
            invoices.sort((a, b) => {
                if (a.paymentDate > b.paymentDate) return -1;
                if (a.paymentDate < b.paymentDate) return 1;
                return 0;
            });
            
            setPaidInvoices(invoices);
        } catch (err: any) {
            console.error('❌ [TransportFinancePaidInvoices] Failed to fetch data:', err);
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            setLoading(false);
        }
    };

    // فیلتر و جستجو
    const filteredRecords = useMemo(() => {
        let filtered = [...paidInvoices];

        // فیلتر بر اساس جستجو
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(record => 
                record.employeeId?.toLowerCase().includes(searchLower) ||
                record.driverName?.toLowerCase().includes(searchLower)
            );
        }

        // فیلتر بر اساس تاریخ پرداخت
        if (startDate) {
            filtered = filtered.filter(record => record.paymentDate >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(record => record.paymentDate <= endDate);
        }

        return filtered;
    }, [paidInvoices, searchTerm, startDate, endDate]);

    // محاسبه صفحه‌بندی
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredRecords.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredRecords, currentPage, itemsPerPage]);

    // تولید PDF یکجا از تصاویر صورتحساب‌های پرداخت شده
    const exportAllInvoicesToPDF = async () => {
        if (filteredRecords.length === 0) {
            alert('هیچ صورتحساب پرداخت شده‌ای برای تولید PDF وجود ندارد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // ایجاد PDF
            const pdf = new jsPDF('l', 'mm', 'a4'); // landscape orientation
            const pageWidth = 297; // A4 landscape width in mm
            const pageHeight = 210; // A4 landscape height in mm

            // برای هر رکورد پرداخت شده
            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                
                // نمایش پیشرفت
                console.log(`📄 در حال تولید صورتحساب ${i + 1} از ${filteredRecords.length}: ${record.driverName}`);

                // دریافت محاسبات مربوط به این راننده
                const calcDateFrom = record.calculationDateFrom || '';
                const calcDateTo = record.calculationDateTo || '';
                let calculationsUrl = `driver-calculations?driverId=${record.driverId}`;
                if (calcDateFrom) calculationsUrl += `&startDate=${calcDateFrom}`;
                if (calcDateTo) calculationsUrl += `&endDate=${calcDateTo}`;

                const calculationsRes = await fetch(getApiUrl(calculationsUrl), { headers });
                if (!calculationsRes.ok) {
                    console.warn(`⚠️ خطا در دریافت محاسبات برای ${record.driverName}`);
                    continue;
                }

                const calculationsData = await calculationsRes.json();
                const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
                
                // فقط محاسبات پرداخت شده را نمایش بده
                const paidCalculations = calculationsArray.filter((calc: any) => 
                    calc.is_paid || calc.isPaid
                );

                if (paidCalculations.length === 0) {
                    console.warn(`⚠️ هیچ محاسبه پرداخت شده‌ای برای ${record.driverName} یافت نشد`);
                    continue;
                }

                // دریافت اطلاعات اعلام بار
                const announcementsMap = new Map<string, any>();
                await Promise.all(paidCalculations.map(async (calc: any) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    if (announcementId && !announcementsMap.has(announcementId)) {
                        try {
                            const annRes = await fetch(getApiUrl(`freight-announcements/${announcementId}`), { headers });
                            if (annRes.ok) {
                                const annData = await annRes.json();
                                announcementsMap.set(announcementId, annData);
                            }
                        } catch (err) {
                            console.warn('⚠️ خطا در دریافت اعلام بار:', err);
                        }
                    }
                }));

                // ایجاد یک div موقت برای render کردن HTML صورتحساب
                // استفاده از offset برای قرار دادن div خارج از صفحه (نه visibility: hidden)
                const tempDiv = document.createElement('div');
                tempDiv.id = `temp-invoice-${i}`;
                tempDiv.style.position = 'absolute';
                tempDiv.style.top = '-10000px';
                tempDiv.style.left = '0';
                tempDiv.style.width = '1200px';
                tempDiv.style.backgroundColor = '#ffffff';
                tempDiv.style.padding = '0';
                tempDiv.style.boxSizing = 'border-box';
                tempDiv.style.overflow = 'visible';
                tempDiv.style.zIndex = '-1000';
                document.body.appendChild(tempDiv);

                // Render کردن HTML صورتحساب
                const htmlContent = await renderInvoiceHTML(record, paidCalculations, announcementsMap, calcDateFrom, calcDateTo);
                console.log(`📄 [PDF ${i+1}/${filteredRecords.length}] HTML content length:`, htmlContent.length);
                console.log(`📄 [PDF ${i+1}/${filteredRecords.length}] HTML preview:`, htmlContent.substring(0, 500));
                
                // HTML را مستقیماً به div اضافه می‌کنیم (بدون استخراج body)
                tempDiv.innerHTML = htmlContent;

                // صبر کردن تا محتوا render شود
                await new Promise(resolve => setTimeout(resolve, 2000));

                // بررسی اینکه آیا محتوا در DOM موجود است
                const innerContent = tempDiv.innerHTML;
                if (!innerContent || innerContent.length < 100) {
                    console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] HTML content is empty or too short!`);
                    document.body.removeChild(tempDiv);
                    continue;
                }

                console.log(`✅ [PDF ${i+1}/${filteredRecords.length}] Content ready, length:`, innerContent.length);

                // پیدا کردن div اصلی صورتحساب
                const invoiceDiv = tempDiv.querySelector('div[dir="rtl"]') || tempDiv.firstElementChild || tempDiv;
                
                if (!invoiceDiv || invoiceDiv === tempDiv) {
                    console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] Cannot find invoice div!`);
                    document.body.removeChild(tempDiv);
                    continue;
                }
                
                // بررسی محتوای invoiceDiv
                const divContent = invoiceDiv.innerHTML;
                console.log(`✅ [PDF ${i+1}/${filteredRecords.length}] Invoice div found, content length:`, divContent.length);

                // تبدیل به canvas - استفاده از invoiceDiv
                let canvas;
                try {
                    console.log(`🔄 [PDF ${i+1}/${filteredRecords.length}] Starting html2canvas...`);
                    console.log(`📏 [PDF ${i+1}/${filteredRecords.length}] Element dimensions:`, {
                        width: invoiceDiv.scrollWidth,
                        height: invoiceDiv.scrollHeight,
                        offsetWidth: invoiceDiv.offsetWidth,
                        offsetHeight: invoiceDiv.offsetHeight
                    });
                    
                    canvas = await html2canvas(invoiceDiv as HTMLElement, {
                        scale: 1.5,
                        useCORS: true,
                        logging: true,
                        backgroundColor: '#ffffff',
                        allowTaint: true,
                        removeContainer: false,
                        onclone: (clonedDoc) => {
                            const clonedDiv = clonedDoc.querySelector(`#temp-invoice-${i} div[dir="rtl"]`);
                            if (clonedDiv) {
                                // اطمینان از اینکه cloned div قابل مشاهده است
                                (clonedDiv as HTMLElement).style.visibility = 'visible';
                                (clonedDiv as HTMLElement).style.opacity = '1';
                                console.log(`✅ [PDF ${i+1}/${filteredRecords.length}] Cloned div found in onclone, content length:`, clonedDiv.innerHTML.length);
                            } else {
                                console.warn(`⚠️ [PDF ${i+1}/${filteredRecords.length}] Cloned div not found in onclone!`);
                            }
                        }
                    });
                    
                    if (!canvas || canvas.width === 0 || canvas.height === 0) {
                        console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] Canvas is empty! width: ${canvas?.width}, height: ${canvas?.height}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    console.log(`✅ [PDF ${i+1}/${filteredRecords.length}] Canvas created successfully: ${canvas.width}x${canvas.height}`);
                } catch (canvasError: any) {
                    console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] Error creating canvas:`, canvasError);
                    console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] Error stack:`, canvasError?.stack);
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // حذف div موقت
                document.body.removeChild(tempDiv);

                // تبدیل به JPEG با کیفیت 0.85 برای کاهش حجم (به جای PNG)
                const imgData = canvas.toDataURL('image/jpeg', 0.85);
                const imgWidth = pageWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;

                // اضافه کردن به PDF
                if (i > 0) {
                    pdf.addPage('l'); // اضافه کردن صفحه جدید برای هر صورتحساب
                }

                let position = 0;
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                // اگر محتوا بیشتر از یک صفحه است، صفحات اضافی اضافه کن
                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage('l');
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
            }

            // ذخیره PDF با استفاده از blob برای جلوگیری از هشدار HTTP
            const dateRange = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().split('T')[0];
            const filename = `صورتحساب_های_پرداخت_شده_${dateRange}.pdf`;
            
            // استفاده از output('blob') برای ایجاد blob و سپس دانلود
            const blob = pdf.output('blob');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // پاک کردن blob URL بعد از استفاده
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            alert(`✅ PDF با موفقیت تولید شد. تعداد ${filteredRecords.length} صورتحساب در فایل قرار گرفت.`);
        } catch (err: any) {
            console.error('❌ [exportAllInvoicesToPDF] Error:', err);
            alert(`خطا در تولید PDF: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // تابع helper برای render کردن HTML صورتحساب
    const renderInvoiceHTML = async (
        record: PaidInvoiceRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string
    ): Promise<string> => {
        // این تابع HTML صورتحساب را برمی‌گرداند (مشابه آنچه در TransportFinancePaymentList است)
        // برای سادگی، از همان ساختار استفاده می‌کنیم
        
        const calculateMainDriverCost = (calc: any) => {
            const food = calc.food_cost || calc.foodCost || 0;
            const fuel = calc.fuel_cost || calc.fuelCost || 0;
            const toll = calc.toll_cost || calc.tollCost || 0;
            const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
            const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
            const returnBill = calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0;
            const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
            const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
            const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
            return food + fuel + toll + bill + returnCargo + returnBill + multiUnload + excessMission + fixedAllowance;
        };

        const calculateHelperDriverCost = (calc: any) => {
            const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
            const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
            const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
            return helperAllowance + helperFoodCost + helperExcessMissionCost;
        };

        // محاسبه جمع کل
        const totalMainAll = calculations.reduce((sum, calc) => sum + calculateMainDriverCost(calc), 0);
        const helperCostsByEmployee = new Map<string, number>();
        calculations.forEach((calc: any) => {
            const helperId = calc.helper_driver_id || calc.helperDriverId;
            const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
            const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
            const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
            const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
            const helperTotal = helperAllowance + helperFoodCost + helperExcessMissionCost;
            
            if (helperId && helperEmployeeId && helperTotal > 0) {
                if (!helperCostsByEmployee.has(helperEmployeeId)) {
                    helperCostsByEmployee.set(helperEmployeeId, 0);
                }
                const existing = helperCostsByEmployee.get(helperEmployeeId)!;
                helperCostsByEmployee.set(helperEmployeeId, existing + helperTotal);
            }
        });
        const totalHelper = Array.from(helperCostsByEmployee.values()).reduce((sum, h) => sum + h, 0);
        const grandTotal = totalMainAll + totalHelper;
        const totalAdvancePayment = calculations.reduce((sum, calc) => {
            return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
        }, 0);
        // پیش پرداخت فقط از هزینه راننده اصلی کم می‌شود
        const mainDriverPayable = totalMainAll - totalAdvancePayment;
        const payableAmount = mainDriverPayable + totalHelper;

        // ساخت HTML - فقط محتوای div (بدون DOCTYPE و head برای استفاده در innerHTML)
        let html = `<div dir="rtl" style="width: 100%; min-height: 100%; font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif; padding: 24px; background-color: #ffffff; box-sizing: border-box; direction: rtl; text-align: right;">
                <div style="margin-bottom: 16px; border-bottom: 2px solid #1e293b; padding-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <h1 style="font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 8px;">صورتحساب هزینه</h1>
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">کد پرسنلی: ${record.employeeId}</p>
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">نام: ${record.driverName}</p>
                            <p style="font-size: 14px; color: #475569;">شماره حساب: ${record.accountNumber || '-'}</p>
                        </div>
                        <div style="text-align: left;">
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">تاریخ تهیه لیست: ${formatJalali(new Date())}</p>
                            ${calcDateFrom && calcDateTo ? `<p style="font-size: 14px; color: #475569; margin-bottom: 4px;">بازه زمانی: ${calcDateFrom} تا ${calcDateTo}</p>` : ''}
                            <p style="font-size: 14px; color: #475569;">تاریخ پرداخت: ${record.paymentDate}</p>
                        </div>
                    </div>
                </div>
        `;

        // جدا کردن محاسبات با و بدون راننده کمکی
        const calculationsWithoutHelper = calculations.filter((calc: any) => {
            const helperId = calc.helper_driver_id || calc.helperDriverId;
            const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
            const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
            const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
            return !helperId || (helperAllowance + helperFoodCost + helperExcessMissionCost === 0);
        });

        const calculationsWithHelper = calculations.filter((calc: any) => {
            const helperId = calc.helper_driver_id || calc.helperDriverId;
            const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
            const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
            const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
            return helperId && (helperAllowance + helperFoodCost + helperExcessMissionCost > 0);
        });

        // جدول راننده اصلی
        if (calculationsWithoutHelper.length > 0 || calculationsWithHelper.length > 0) {
            html += `
                <div style="margin-bottom: 24px;">
                    <h3 style="font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #475569; padding-bottom: 8px;">
                        هزینه‌های راننده اصلی
                    </h3>
                    <table style="width: 100%; font-size: 12px; border-collapse: collapse; border: 1px solid #1e293b; margin-bottom: 12px; font-family: 'Vazirmatn', Arial, sans-serif;">
                        <thead>
                            <tr style="background-color: #1e293b; color: white;">
                                <th style="padding: 6px; border: 1px solid #475569; text-align: center; font-size: 12px; font-weight: bold;">ردیف</th>
                                <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">شماره بارنامه</th>
                                <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">مقاصد</th>
                                <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">تاریخ صدور</th>
                                <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">تاریخ محاسبه</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">پیمایش مصوب</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">پیمایش مازاد</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">ماموریت مصوب</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">ماموریت مازاد</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه بارنامه</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه غذا</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه سوخت</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه عوارض</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه بار برگشتی</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه بارنامه برگشتی</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه چندجا تخلیه</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">هزینه ماموریت مازاد</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">اجرت ثابت</th>
                                <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-weight: bold; font-size: 12px;">جمع کل</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            [...calculationsWithoutHelper, ...calculationsWithHelper].forEach((calc, idx) => {
                const announcementId = calc.announcement_id || calc.announcementId;
                const announcement = announcementsMap.get(announcementId);
                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                const mainCost = calculateMainDriverCost(calc);
                
                html += `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px;">${(idx + 1).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${destinations}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${calc.bill_of_lading_date || calc.billOfLadingDate || '-'}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${calc.calculation_date || calc.calculationDate || '-'}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.return_cargo_cost || calc.returnCargoCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.multi_unload_cost || calc.multiUnloadCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.excess_mission_cost || calc.excessMissionCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${(calc.fixed_allowance || calc.fixedAllowance || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; font-size: 12px;">${mainCost.toLocaleString('fa-IR')}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                        <tfoot>
                            <tr style="background-color: #f1f5f9; font-weight: bold;">
                                <td colspan="18" style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-size: 12px;">جمع کل:</td>
                                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; font-size: 12px;">${totalMainAll.toLocaleString('fa-IR')} ریال</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
        }

        // جمع کل نهایی
        html += `
                <div style="margin-top: 16px; padding: 16px; background-color: #e2e8f0; border-radius: 8px; border: 2px solid #475569;">
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 16px; font-weight: bold; color: #1e293b;">جمع کل هزینه سفر:</span>
                            <span style="font-size: 18px; font-weight: bold; color: #059669;">${grandTotal.toLocaleString('fa-IR')} ریال</span>
                        </div>
                        ${totalAdvancePayment > 0 ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #94a3b8; padding-top: 8px; margin-top: 8px;">
                                <span style="font-size: 14px; font-weight: 600; color: #1e293b;">کسور (پیش پرداخت):</span>
                                <span style="font-size: 16px; font-weight: bold; color: #ea580c;">${totalAdvancePayment.toLocaleString('fa-IR')} ریال</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #475569; padding-top: 8px; margin-top: 8px;">
                                <span style="font-size: 16px; font-weight: bold; color: #1e293b;">مبلغ قابل پرداخت:</span>
                                <span style="font-size: 18px; font-weight: bold; color: #0284c7;">${payableAmount.toLocaleString('fa-IR')} ریال</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>`;

        return html;
    };

    // خروجی اکسل
    const exportToExcel = () => {
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'شماره حساب', 'مبلغ پرداخت (ریال)', 'تاریخ پرداخت', 'بازه تاریخ محاسبه', 'تاریخ تهیه لیست', 'ثبت کننده', 'تاریخ ثبت']
        ];

        filteredRecords.forEach((record, index) => {
            const dateRange = record.calculationDateFrom && record.calculationDateTo
                ? `${record.calculationDateFrom} تا ${record.calculationDateTo}`
                : '-';
            
            wsData.push([
                index + 1,
                record.employeeId || '',
                record.driverName || '',
                record.accountNumber || '',
                record.paymentAmount || 0,
                record.paymentDate || '',
                dateRange,
                record.paymentListDate || '-',
                record.createdByName || record.createdBy || '-',
                record.createdAt ? formatJalali(new Date(record.createdAt)) : '-',
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
                
                // فرمت اعداد برای ستون مبلغ (ستون 4)
                if (R > 0 && C === 4) {
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
            { wch: 20 }, // مبلغ پرداخت
            { wch: 15 }, // تاریخ پرداخت
            { wch: 30 }, // بازه تاریخ محاسبه
            { wch: 18 }, // تاریخ تهیه لیست
            { wch: 20 }, // ثبت کننده
            { wch: 18 }  // تاریخ ثبت
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'صورتحساب‌های پرداخت شده');
        XLSX.writeFile(wb, `صورتحساب_های_پرداخت_شده_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                    لیست صورتحساب‌های پرداخت شده
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
                                از تاریخ (پرداخت)
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
                                تا تاریخ (پرداخت)
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
                                onClick={exportAllInvoicesToPDF}
                                disabled={filteredRecords.length === 0}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                تولید PDF یکجا
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                            >
                                خروجی اکسل
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
                                <th className="p-3 text-right border-l border-slate-600">مبلغ پرداخت (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">تاریخ پرداخت</th>
                                <th className="p-3 text-right border-l border-slate-600">بازه تاریخ محاسبه</th>
                                <th className="p-3 text-right border-l border-slate-600">تاریخ تهیه لیست</th>
                                <th className="p-3 text-right border-l border-slate-600">ثبت کننده</th>
                                <th className="p-3 text-right border-l border-slate-600">تاریخ ثبت</th>
                                <th className="p-3 text-right">توضیحات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRecords.map((record, index) => {
                                const dateRange = record.calculationDateFrom && record.calculationDateTo
                                    ? `${record.calculationDateFrom} تا ${record.calculationDateTo}`
                                    : '-';
                                
                                return (
                                    <tr key={record.id} className="border-b border-slate-300 bg-white hover:bg-slate-50">
                                        <td className="p-3 border-l border-slate-200 text-center font-medium">
                                            {((currentPage - 1) * itemsPerPage) + index + 1}
                                        </td>
                                        <td className="p-3 border-l border-slate-200 font-medium">{record.employeeId}</td>
                                        <td className="p-3 border-l border-slate-200 font-semibold text-slate-800">{record.driverName}</td>
                                        <td className="p-3 border-l border-slate-200">{record.accountNumber || '-'}</td>
                                        <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                            {record.paymentAmount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-3 border-l border-slate-200 text-xs">{record.paymentDate || '-'}</td>
                                        <td className="p-3 border-l border-slate-200 text-xs">{dateRange}</td>
                                        <td className="p-3 border-l border-slate-200 text-xs">{record.paymentListDate || '-'}</td>
                                        <td className="p-3 border-l border-slate-200 text-xs">{record.createdByName || record.createdBy || '-'}</td>
                                        <td className="p-3 border-l border-slate-200 text-xs">
                                            {record.createdAt ? formatJalali(new Date(record.createdAt)) : '-'}
                                        </td>
                                        <td className="p-3 text-xs text-slate-600">{record.notes || '-'}</td>
                                    </tr>
                                );
                            })}
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
        </div>
    );
};

export default TransportFinancePaidInvoices;

