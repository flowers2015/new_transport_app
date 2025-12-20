import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOMServer from 'react-dom/server';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// انواع ساختار صورتحساب
enum InvoiceLayoutType {
    STANDARD_ACCOUNTING = 'standard_accounting', // روش 1: استاندارد حسابداری با سرفصل‌ها
    COMPACT = 'compact', // روش 2: فشرده
    DETAILED = 'detailed', // روش 3: تفصیلی
}

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
    
    // انتخاب روش صورتحساب (دیفالت: روش 1)
    const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayoutType>(InvoiceLayoutType.STANDARD_ACCOUNTING);

    // توابع محاسبه هزینه‌ها (مشترک برای همه layoutها)
    const calculateMainDriverCostGlobal = (calc: any): number => {
        const food = parseFloat(calc.food_cost || calc.foodCost || 0);
        const fuel = parseFloat(calc.fuel_cost || calc.fuelCost || 0);
        const toll = parseFloat(calc.toll_cost || calc.tollCost || 0);
        const bill = parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0);
        const returnCargo = parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0);
        const multiUnload = parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0);
        const excessMission = parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0);
        const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
        // هزینه‌های دپو
        const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
        const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
        return food + fuel + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance + depotCargoHandling + depotMissionCost;
    };

    const calculateHelperDriverCostGlobal = (calc: any): number => {
        const helperAllowance = parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0);
        const helperFoodCost = parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0);
        const helperExcessMissionCost = parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0);
        return helperAllowance + helperFoodCost + helperExcessMissionCost;
    };

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
        console.log('📄 [PDF_BEFORE] ========== شروع تولید PDF ==========');
        console.log('📄 [PDF_BEFORE] filteredRecords.length:', filteredRecords.length);
        console.log('📄 [PDF_BEFORE] filteredRecords:', JSON.stringify(filteredRecords.map(r => ({
            driverId: r.driverId,
            driverName: r.driverName,
            employeeId: r.employeeId,
            calculationDateFrom: r.calculationDateFrom,
            calculationDateTo: r.calculationDateTo
        })), null, 2));
        
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
            console.log('📄 [PDF_BEFORE] PDF object created');

            // برای هر رکورد پرداخت شده
            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                
                console.log(`📄 [PDF_BEFORE] ========== پردازش رکورد ${i + 1}/${filteredRecords.length} ==========`);
                console.log(`📄 [PDF_BEFORE] driverId: ${record.driverId}`);
                console.log(`📄 [PDF_BEFORE] driverName: ${record.driverName}`);
                console.log(`📄 [PDF_BEFORE] employeeId: ${record.employeeId}`);

                // دریافت محاسبات پرداخت شده مربوط به این راننده
                const calcDateFrom = record.calculationDateFrom || '';
                const calcDateTo = record.calculationDateTo || '';
                let calculationsUrl = `driver-calculations/paid?driverId=${record.driverId}`;
                if (calcDateFrom) calculationsUrl += `&startDate=${calcDateFrom}`;
                if (calcDateTo) calculationsUrl += `&endDate=${calcDateTo}`;

                const calculationsRes = await fetch(getApiUrl(calculationsUrl), { headers });
                if (!calculationsRes.ok) {
                    console.warn(`⚠️ خطا در دریافت محاسبات پرداخت شده برای ${record.driverName}:`, calculationsRes.status);
                    continue;
                }

                const paidCalculations = await calculationsRes.json();
                const calculationsArray = Array.isArray(paidCalculations) ? paidCalculations : [];
                console.log(`📄 [PDF_BEFORE] paidCalculations.length: ${calculationsArray.length}`);
                console.log(`📄 [PDF_BEFORE] paidCalculations:`, JSON.stringify(calculationsArray.slice(0, 2), null, 2));

                if (calculationsArray.length === 0) {
                    console.warn(`⚠️ [PDF_BEFORE] هیچ محاسبه پرداخت شده‌ای برای ${record.driverName} یافت نشد`);
                    continue;
                }

                // دریافت اطلاعات اعلام بار
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
                            console.warn('⚠️ خطا در دریافت اعلام بار:', err);
                        }
                    }
                }));

                // ایجاد div موقت برای render کردن HTML صورتحساب
                // باید در viewport باشد تا html2canvas بتواند آن را render کند
                const tempDiv = document.createElement('div');
                tempDiv.id = `temp-invoice-${i}`;
                tempDiv.style.position = 'fixed';
                tempDiv.style.top = '0';
                tempDiv.style.left = '0';
                tempDiv.style.width = '1200px';
                tempDiv.style.height = 'auto';
                tempDiv.style.backgroundColor = '#ffffff';
                tempDiv.style.padding = '20px';
                tempDiv.style.boxSizing = 'border-box';
                tempDiv.style.overflow = 'visible';
                tempDiv.style.zIndex = '999999';
                tempDiv.style.visibility = 'visible';
                tempDiv.style.opacity = '0'; // مخفی اما در viewport
                tempDiv.style.pointerEvents = 'none'; // جلوگیری از تداخل با کاربر
                document.body.appendChild(tempDiv);

                // تولید HTML صورتحساب بر اساس روش انتخابی
                console.log(`📄 [PDF_BEFORE] تولید HTML برای ${record.driverName} با روش ${invoiceLayout}...`);
                const htmlContent = renderInvoiceHTML(record, calculationsArray, announcementsMap, calcDateFrom, calcDateTo, invoiceLayout);
                console.log(`📄 [PDF_BEFORE] HTML content length: ${htmlContent.length}`);
                console.log(`📄 [PDF_BEFORE] HTML preview (first 500 chars):`, htmlContent.substring(0, 500));
                
                // HTML را به div اضافه می‌کنیم
                tempDiv.innerHTML = htmlContent;

                // صبر برای render شدن محتوا
                await new Promise(resolve => setTimeout(resolve, 1500));

                // بررسی محتوا
                console.log(`📄 [PDF_BEFORE] بررسی محتوای tempDiv...`);
                console.log(`📄 [PDF_BEFORE] tempDiv.innerHTML.length: ${tempDiv.innerHTML.length}`);
                if (!tempDiv.innerHTML || tempDiv.innerHTML.length < 100) {
                    console.error(`❌ [PDF_BEFORE] HTML content is empty!`);
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // پیدا کردن div اصلی صورتحساب
                const invoiceDiv = tempDiv.querySelector('div[dir="rtl"]') || tempDiv.firstElementChild;
                console.log(`📄 [PDF_BEFORE] invoiceDiv found:`, invoiceDiv ? 'YES' : 'NO');
                console.log(`📄 [PDF_BEFORE] invoiceDiv === tempDiv:`, invoiceDiv === tempDiv);
                
                if (!invoiceDiv || invoiceDiv === tempDiv) {
                    console.error(`❌ [PDF_BEFORE] Cannot find invoice div!`);
                    document.body.removeChild(tempDiv);
                    continue;
                }
                
                console.log(`📄 [PDF_BEFORE] invoiceDiv.innerHTML.length: ${invoiceDiv.innerHTML.length}`);
                console.log(`📄 [PDF_BEFORE] invoiceDiv dimensions:`, {
                    scrollWidth: invoiceDiv.scrollWidth,
                    scrollHeight: invoiceDiv.scrollHeight,
                    offsetWidth: invoiceDiv.offsetWidth,
                    offsetHeight: invoiceDiv.offsetHeight
                });

                // تبدیل به canvas
                let canvas;
                try {
                    console.log(`📄 [PDF_BEFORE] شروع html2canvas...`);
                    
                    canvas = await html2canvas(invoiceDiv as HTMLElement, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff',
                        allowTaint: true,
                        onclone: (clonedDoc) => {
                            // اعمال استایل‌های نهایی در cloned document
                            const clonedTempDiv = clonedDoc.querySelector(`#temp-invoice-${i}`) as HTMLElement;
                            if (clonedTempDiv) {
                                clonedTempDiv.style.width = '100%';
                                clonedTempDiv.style.maxWidth = '100%';
                                clonedTempDiv.style.overflow = 'visible';
                            }
                            
                            const clonedDiv = clonedDoc.querySelector(`#temp-invoice-${i} div[dir="rtl"]`) as HTMLElement;
                            if (clonedDiv) {
                                clonedDiv.style.visibility = 'visible';
                                clonedDiv.style.opacity = '1';
                                clonedDiv.style.width = '100%';
                                clonedDiv.style.maxWidth = '100%';
                                clonedDiv.style.overflow = 'hidden';
                                
                                // اعمال استایل‌های جدول
                                const clonedTables = clonedDiv.querySelectorAll('table');
                                clonedTables.forEach((table) => {
                                    const tableEl = table as HTMLElement;
                                    tableEl.style.width = '100%';
                                    tableEl.style.minWidth = '100%';
                                    tableEl.style.tableLayout = 'fixed';
                                    tableEl.style.borderCollapse = 'collapse';
                                    tableEl.style.fontSize = '11px';
                                    tableEl.style.fontFamily = 'Vazirmatn, Arial, sans-serif';
                                    tableEl.style.boxSizing = 'border-box';
                                });
                                
                                // اعمال استایل‌های thead و tbody
                                const clonedTheads = clonedDiv.querySelectorAll('thead');
                                clonedTheads.forEach((thead) => {
                                    const theadEl = thead as HTMLElement;
                                    const headerRows = theadEl.querySelectorAll('tr');
                                    headerRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        rowEl.style.backgroundColor = '#1e293b';
                                        rowEl.style.color = '#ffffff';
                                    });
                                });
                                
                                const clonedTfoots = clonedDiv.querySelectorAll('tfoot');
                                clonedTfoots.forEach((tfoot) => {
                                    const tfootEl = tfoot as HTMLElement;
                                    const footerRows = tfootEl.querySelectorAll('tr');
                                    footerRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        rowEl.style.backgroundColor = '#f1f5f9';
                                        rowEl.style.fontWeight = 'bold';
                                    });
                                });
                                
                                // اعمال استایل‌های سلول‌ها (td و th)
                                const clonedCells = clonedDiv.querySelectorAll('td, th');
                                clonedCells.forEach((cell) => {
                                    const cellEl = cell as HTMLElement;
                                    
                                    // padding - داینامیک بر اساس نوع سلول
                                    const rowSpan = cellEl.getAttribute('rowspan');
                                    if (cellEl.tagName === 'TH' && rowSpan === '2') {
                                        // برای headerهای rowspan=2، padding بیشتر و height ثابت
                                        cellEl.style.padding = '0';
                                        cellEl.style.paddingTop = '15px';
                                        cellEl.style.paddingBottom = '5px';
                                        cellEl.style.paddingLeft = '6px';
                                        // برای ستون‌های آخر paddingRight بیشتر
                                        const cellText = cellEl.textContent || '';
                                        const isLastColumn = cellText.includes('پیمایش کل') || cellText.includes('اجرت کل تور') || cellText.includes('جمع کل هزینه') || cellText.includes('جمع کل') || cellText.includes('پیمایش مازاد');
                                        cellEl.style.paddingRight = isLastColumn ? '12px' : '6px';
                                        cellEl.style.height = '70px';
                                        cellEl.style.fontSize = '11px';
                                        cellEl.style.lineHeight = '1.8';
                                        cellEl.style.verticalAlign = 'top';
                                        cellEl.style.display = 'table-cell';
                                        cellEl.style.boxSizing = 'border-box';
                                    } else if (cellEl.tagName === 'TH') {
                                        // برای headerهای عادی
                                        cellEl.style.padding = '8px 4px';
                                        cellEl.style.fontSize = '10px';
                                        cellEl.style.verticalAlign = 'middle';
                                        cellEl.style.boxSizing = 'border-box';
                                    } else {
                                        // برای سلول‌های داده
                                        // برای ستون‌های آخر paddingRight بیشتر
                                        const cellIndex = Array.from(cellEl.parentElement?.children || []).indexOf(cellEl);
                                        const totalCells = cellEl.parentElement?.children.length || 0;
                                        const isLastColumn = cellIndex >= totalCells - 3; // 3 ستون آخر
                                        cellEl.style.padding = isLastColumn ? '10px 15px 10px 10px' : '10px 10px';
                                        cellEl.style.fontSize = '11px';
                                        cellEl.style.lineHeight = '1.6';
                                        cellEl.style.verticalAlign = 'middle';
                                        cellEl.style.boxSizing = 'border-box';
                                        cellEl.style.overflow = 'hidden';
                                        
                                        // برای اعداد: nowrap، برای متن: normal
                                        const cellText = cellEl.textContent || '';
                                        const isNumber = /^[\d،,\s]+$/.test(cellText.trim()) || /^[\d,.\s]+$/.test(cellText.trim()) || /^[\d\s،,.-]+$/.test(cellText.trim());
                                        if (isNumber) {
                                            cellEl.style.whiteSpace = 'nowrap';
                                            cellEl.style.textOverflow = 'ellipsis';
                                        } else {
                                            cellEl.style.whiteSpace = 'normal';
                                            cellEl.style.wordBreak = 'break-word';
                                            cellEl.style.overflowWrap = 'break-word';
                                        }
                                    }
                                    
                                    // text-align
                                    cellEl.style.textAlign = 'center';
                                    
                                    // box-sizing برای همه سلول‌ها
                                    cellEl.style.boxSizing = 'border-box';
                                    
                                    // border
                                    if (!cellEl.style.border || cellEl.style.border === 'none') {
                                        if (cellEl.tagName === 'TH') {
                                            cellEl.style.border = '1px solid #475569';
                                        } else {
                                            cellEl.style.border = '1px solid #cbd5e1';
                                        }
                                    }
                                    
                                    // برای headerها
                                    if (cellEl.tagName === 'TH') {
                                        cellEl.style.fontWeight = 'bold';
                                        cellEl.style.backgroundColor = '#1e293b';
                                        cellEl.style.color = '#ffffff';
                                    }
                                    
                                    // برای footer
                                    const parentRow = cellEl.parentElement;
                                    if (parentRow && parentRow.tagName === 'TR' && parentRow.parentElement?.tagName === 'TFOOT') {
                                        cellEl.style.backgroundColor = '#f1f5f9';
                                        cellEl.style.fontWeight = 'bold';
                                    }
                                });
                            }
                        },
                        removeContainer: false,
                        windowWidth: 1200,
                        windowHeight: invoiceDiv.scrollHeight || 2000,
                        onclone: (clonedDoc) => {
                            // در cloned document، opacity را 1 کن تا render شود
                            const clonedDiv = clonedDoc.querySelector(`#temp-invoice-${i}`);
                            if (clonedDiv) {
                                (clonedDiv as HTMLElement).style.opacity = '1';
                                (clonedDiv as HTMLElement).style.visibility = 'visible';
                            }
                        }
                    });
                    
                    console.log(`📄 [PDF_AFTER] Canvas created: ${canvas?.width}x${canvas?.height}`);
                    if (!canvas || canvas.width === 0 || canvas.height === 0) {
                        console.error(`❌ [PDF_AFTER] Canvas is empty! width: ${canvas?.width}, height: ${canvas?.height}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    console.log(`✅ [PDF_AFTER] Canvas OK: ${canvas.width}x${canvas.height}`);
                } catch (canvasError: any) {
                    console.error(`❌ [PDF ${i+1}/${filteredRecords.length}] Error:`, canvasError);
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
            console.log('📄 [PDF_AFTER] ========== آماده ذخیره PDF ==========');
            console.log('📄 [PDF_AFTER] تعداد صفحات PDF:', pdf.getNumberOfPages());
            const dateRange = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().split('T')[0];
            const filename = `صورتحساب_های_پرداخت_شده_${dateRange}.pdf`;
            console.log('📄 [PDF_AFTER] filename:', filename);
            
            // استفاده از pdf.save() مستقیم برای جلوگیری از هشدار blob URL
            pdf.save(filename);
            
            console.log('✅ [PDF_AFTER] ========== PDF با موفقیت تولید شد ==========');
            console.log('✅ [PDF_AFTER] تعداد رکوردها:', filteredRecords.length);
            console.log('✅ [PDF_AFTER] تعداد صفحات:', pdf.getNumberOfPages());
            alert(`✅ PDF با موفقیت تولید شد. تعداد ${filteredRecords.length} صورتحساب در فایل قرار گرفت.`);
        } catch (err: any) {
            console.error('❌ [exportAllInvoicesToPDF] Error:', err);
            alert(`خطا در تولید PDF: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // تابع helper برای render کردن HTML صورتحساب
    const renderInvoiceHTML = (
        record: PaidInvoiceRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string,
        layout: InvoiceLayoutType = InvoiceLayoutType.STANDARD_ACCOUNTING
    ): string => {
        // این تابع HTML صورتحساب را برمی‌گرداند (مشابه آنچه در TransportFinancePaymentList است)
        // بر اساس layout انتخابی، HTML مناسب را تولید می‌کند
        
        // بررسی layout انتخابی و تولید HTML مناسب
        if (layout === InvoiceLayoutType.STANDARD_ACCOUNTING) {
            return renderInvoiceHTMLLayout1(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
        } else if (layout === InvoiceLayoutType.COMPACT) {
            return renderInvoiceHTMLLayout2(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
        } else if (layout === InvoiceLayoutType.DETAILED) {
            return renderInvoiceHTMLLayout3(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
        }
        
        // به صورت دیفالت روش 1 را استفاده می‌کنیم
        return renderInvoiceHTMLLayout1(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
    };

    // تابع helper برای تولید HTML روش 1 (استاندارد حسابداری)
    const renderInvoiceHTMLLayout1 = (
        record: PaidInvoiceRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string
    ): string => {

        // محاسبه جمع کل
        const totalMainAll = calculations.reduce((sum, calc) => sum + calculateMainDriverCostGlobal(calc), 0);
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
                    <div style="overflow: hidden; width: 100%;">
                        <table style="width: 100%; font-size: 11px; border-collapse: collapse; border: 2px solid #1e293b; margin-bottom: 12px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: fixed; box-sizing: border-box;">
                            <thead>
                                <tr style="background-color: #1e293b; color: white;">
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 3%; height: 70px; display: table-cell; box-sizing: border-box;">ردیف</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 5%; height: 70px; display: table-cell; box-sizing: border-box;">شماره<br/>بارنامه</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 7%; height: 70px; display: table-cell; box-sizing: border-box;">مقاصد</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 5%; height: 70px; display: table-cell; box-sizing: border-box;">تاریخ<br/>صدور</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 5%; height: 70px; display: table-cell; box-sizing: border-box;">تاریخ<br/>محاسبه</th>
                                    <th colspan="2" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; box-sizing: border-box;">پیمایش<br/>(کیلومتر)</th>
                                    <th colspan="2" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; box-sizing: border-box;">ماموریت<br/>(روز)</th>
                                    <th colspan="7" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 24%; box-sizing: border-box;">هزینه‌های<br/>مستقیم<br/>(ریال)</th>
                                    <th colspan="5" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 22%; box-sizing: border-box;">هزینه‌های<br/>دپو</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 8px; padding-right: 12px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; height: 70px; display: table-cell; box-sizing: border-box;">پیمایش<br/>کل<br/>(کیلومتر)</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 8px; padding-right: 12px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 7%; height: 70px; display: table-cell; box-sizing: border-box;">اجرت<br/>کل تور<br/>(ریال)</th>
                                    <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 8px; padding-right: 12px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 8%; height: 70px; display: table-cell; box-sizing: border-box;">جمع کل<br/>هزینه<br/>(ریال)</th>
                                </tr>
                                <tr style="background-color: #1e293b; color: white;">
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مصوب</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مازاد</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مصوب</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مازاد</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">بارنامه</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">غذا</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">سوخت</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">عوارض</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">بار<br/>برگشتی</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">چندجا<br/>تخلیه</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">ماموریت<br/>مازاد</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">تعداد</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">ماموریت<br/>(روز)</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">پیمایش<br/>(کیلومتر)</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">جابجایی<br/>بار<br/>(ریال)</th>
                                    <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">حق<br/>ماموریت<br/>(ریال)</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            [...calculationsWithoutHelper, ...calculationsWithHelper].forEach((calc, idx) => {
                const announcementId = calc.announcement_id || calc.announcementId;
                const announcement = announcementsMap.get(announcementId);
                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                const mainCost = calculateMainDriverCostGlobal(calc);
                
                // بررسی نوع اجرت (پورسانت یا اجرت ثابت)
                const queueType = calc.queue_type || calc.queueType || 'porsant';
                const isFixedAllowance = queueType === 'fixed_allowance';
                const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
                
                // هزینه‌های دپو
                const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
                const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
                const depotTotalMileage = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
                const depotShipmentCount = parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0);
                const depotMissionDays = parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0);
                
                // محاسبه پیمایش کل (مصوب + مازاد + دپو)
                const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
                const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
                const totalMileage = approvedKm + excessKm + depotTotalMileage;
                
                html += `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(idx + 1).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${destinations}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.bill_of_lading_date || calc.billOfLadingDate || '-'}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.calculation_date || calc.calculationDate || '-'}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${approvedKm.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${excessKm.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.return_cargo_cost || calc.returnCargoCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.multi_unload_cost || calc.multiUnloadCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.excess_mission_cost || calc.excessMissionCost || 0).toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${depotShipmentCount.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${depotMissionDays.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${depotTotalMileage.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${depotCargoHandling.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${depotMissionCost.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${totalMileage.toLocaleString('fa-IR')}</td>
                        <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${isFixedAllowance ? fixedAllowance.toLocaleString('fa-IR') : '-'}</td>
                        <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${mainCost.toLocaleString('fa-IR')}</td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                            <tfoot>
                                <tr style="background-color: #f1f5f9; font-weight: bold;">
                                    <td colspan="5" style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; background-color: #f1f5f9; font-weight: bold; box-sizing: border-box; overflow: hidden;">جمع کل سراسری:</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_kilometers || calc.excessKilometers || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.approved_mission_days || calc.approvedMissionDays || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_mission_days || calc.excessMissionDays || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.food_cost || calc.foodCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.fuel_cost || calc.fuelCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.toll_cost || calc.tollCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0)), 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => {
                                        const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
                                        const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
                                        const depotKm = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
                                        return sum + approvedKm + excessKm + depotKm;
                                    }, 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${calculations.reduce((sum, calc) => {
                                        const queueType = calc.queue_type || calc.queueType || 'porsant';
                                        if (queueType === 'fixed_allowance') {
                                            return sum + (parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0));
                                        }
                                        return sum;
                                    }, 0).toLocaleString('fa-IR')}</td>
                                    <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${totalMainAll.toLocaleString('fa-IR')} ریال</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `;
        }

        // جدول راننده کمکی
        const helperDriversMap = new Map<string, { employeeId: string; name: string; calculations: any[] }>();
        calculations.forEach((calc: any) => {
            const helperId = calc.helper_driver_id || calc.helperDriverId;
            const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
            const helperName = calc.helper_driver_name || calc.helperDriverName || '';
            const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
            const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
            const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
            const helperTotal = helperAllowance + helperFoodCost + helperExcessMissionCost;
            
            if (helperId && helperEmployeeId && helperTotal > 0) {
                if (!helperDriversMap.has(helperEmployeeId)) {
                    helperDriversMap.set(helperEmployeeId, {
                        employeeId: helperEmployeeId,
                        name: helperName,
                        calculations: []
                    });
                }
                helperDriversMap.get(helperEmployeeId)!.calculations.push(calc);
            }
        });

        // نمایش جداول راننده کمکی
        helperDriversMap.forEach((helperData, helperEmployeeId) => {
            if (helperData.calculations.length > 0) {
                html += `
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #475569; padding-bottom: 8px;">
                            راننده کمکی - کد پرسنلی: ${helperEmployeeId} - ${helperData.name}
                        </h3>
                        <div style="overflow: hidden; width: 100%;">
                            <table style="width: 100%; font-size: 11px; border-collapse: collapse; border: 2px solid #1e293b; margin-bottom: 12px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: fixed; box-sizing: border-box;">
                                <thead>
                                    <tr style="background-color: #1e293b; color: white;">
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 3%; height: 70px; display: table-cell; box-sizing: border-box;">ردیف</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 5%; height: 70px; display: table-cell; box-sizing: border-box;">کد<br/>پرسنلی</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 8%; height: 70px; display: table-cell; box-sizing: border-box;">نام و نام<br/>خانوادگی</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; height: 70px; display: table-cell; box-sizing: border-box;">شماره<br/>بارنامه</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 8%; height: 70px; display: table-cell; box-sizing: border-box;">مقاصد</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; height: 70px; display: table-cell; box-sizing: border-box;">تاریخ<br/>صدور</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 6px; padding-right: 6px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; height: 70px; display: table-cell; box-sizing: border-box;">تاریخ<br/>محاسبه</th>
                                        <th colspan="2" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; box-sizing: border-box;">پیمایش<br/>(کیلومتر)</th>
                                        <th colspan="2" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 6%; box-sizing: border-box;">ماموریت<br/>(روز)</th>
                                        <th colspan="3" style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 20%; box-sizing: border-box;">هزینه‌های<br/>راننده کمکی<br/>(ریال)</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 8px; padding-right: 12px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 8%; height: 70px; display: table-cell; box-sizing: border-box;">پیمایش<br/>مازاد<br/>راننده کمکی</th>
                                        <th rowspan="2" style="padding: 0; padding-top: 15px; padding-bottom: 5px; padding-left: 8px; padding-right: 12px; border: 1px solid #475569; text-align: center; vertical-align: top; font-size: 11px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.8; width: 8%; height: 70px; display: table-cell; box-sizing: border-box;">جمع کل<br/>(ریال)</th>
                                    </tr>
                                    <tr style="background-color: #1e293b; color: white;">
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مصوب</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مازاد</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مصوب</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">مازاد</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">ماموریت<br/>مازاد</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">غذا</th>
                                        <th style="padding: 8px 4px; border: 1px solid #475569; text-align: center; vertical-align: middle; font-size: 10px; font-weight: bold; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box;">اجرت</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                helperData.calculations.forEach((calc, idx) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    const announcement = announcementsMap.get(announcementId);
                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                    const helperCost = calculateHelperDriverCostGlobal(calc);
                    const helperExcessKm = parseFloat(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0);
                    
                    html += `
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(idx + 1).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${helperEmployeeId}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${helperData.name}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${destinations}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.bill_of_lading_date || calc.billOfLadingDate || '-'}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${calc.calculation_date || calc.calculationDate || '-'}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${helperExcessKm.toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.helper_driver_excess_mission_days || calc.helperDriverExcessMissionDays || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${helperExcessKm.toLocaleString('fa-IR')}</td>
                            <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; box-sizing: border-box; overflow: hidden;">${helperCost.toLocaleString('fa-IR')}</td>
                        </tr>
                    `;
                });

                const helperTotal = helperData.calculations.reduce((sum, calc) => sum + calculateHelperDriverCostGlobal(calc), 0);
                const helperTotalExcessKm = helperData.calculations.reduce((sum, calc) => sum + (parseFloat(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0)), 0);

                html += `
                                </tbody>
                                <tfoot>
                                    <tr style="background-color: #f1f5f9; font-weight: bold;">
                                        <td colspan="14" style="padding: 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.6; background-color: #f1f5f9; font-weight: bold; box-sizing: border-box; overflow: hidden;">جمع کل:</td>
                                        <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${helperTotalExcessKm.toLocaleString('fa-IR')}</td>
                                        <td style="padding: 10px 15px 10px 10px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-size: 11px; font-weight: bold; white-space: nowrap; line-height: 1.6; background-color: #f1f5f9; box-sizing: border-box; overflow: hidden;">${helperTotal.toLocaleString('fa-IR')} ریال</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                `;
            }
        });

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

    // تابع helper برای تولید HTML روش 2 (فشرده) - فعلاً همان روش 1
    const renderInvoiceHTMLLayout2 = (
        record: PaidInvoiceRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string
    ): string => {
        // TODO: پیاده‌سازی روش 2 (فشرده)
        // فعلاً همان روش 1 را برمی‌گردانیم
        return renderInvoiceHTMLLayout1(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
    };

    // تابع helper برای تولید HTML روش 3 (تفصیلی) - فعلاً همان روش 1
    const renderInvoiceHTMLLayout3 = (
        record: PaidInvoiceRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string
    ): string => {
        // TODO: پیاده‌سازی روش 3 (تفصیلی)
        // فعلاً همان روش 1 را برمی‌گردانیم
        return renderInvoiceHTMLLayout1(record, calculations, announcementsMap, calcDateFrom, calcDateTo);
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
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    نوع صورتحساب
                                </label>
                                <select
                                    value={invoiceLayout}
                                    onChange={(e) => setInvoiceLayout(e.target.value as InvoiceLayoutType)}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-sm"
                                >
                                    <option value={InvoiceLayoutType.STANDARD_ACCOUNTING}>روش 1: استاندارد حسابداری</option>
                                    <option value={InvoiceLayoutType.COMPACT}>روش 2: فشرده</option>
                                    <option value={InvoiceLayoutType.DETAILED}>روش 3: تفصیلی</option>
                                </select>
                            </div>
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

