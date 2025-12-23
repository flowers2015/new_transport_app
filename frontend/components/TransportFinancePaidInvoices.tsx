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

            // ایجاد PDF - ابتدا portrait، بعداً اگر نیاز بود به landscape تغییر می‌دهیم
            const pdf = new jsPDF('p', 'mm', 'a4'); // portrait orientation
            const pageWidth = 210; // A4 portrait width in mm
            const pageHeight = 297; // A4 portrait height in mm
            const margin = 10; // 1cm = 10mm margins
            const contentWidth = pageWidth - (2 * margin);
            const contentHeight = pageHeight - (2 * margin);
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
                tempDiv.style.width = '210mm'; // A4 width
                tempDiv.style.maxWidth = '210mm';
                tempDiv.style.height = 'auto';
                tempDiv.style.backgroundColor = '#ffffff';
                tempDiv.style.padding = '10mm';
                tempDiv.style.boxSizing = 'border-box';
                tempDiv.style.overflow = 'hidden';
                tempDiv.style.zIndex = '999999';
                tempDiv.style.visibility = 'visible';
                tempDiv.style.opacity = '0'; // مخفی اما در viewport
                tempDiv.style.pointerEvents = 'none'; // جلوگیری از تداخل با کاربر
                tempDiv.style.margin = '0 auto';
                tempDiv.style.display = 'flex';
                tempDiv.style.flexDirection = 'column';
                tempDiv.style.alignItems = 'center';
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
                            // اضافه کردن style tag برای اطمینان از رنگ مشکی ستون دسته‌بندی - دقیقاً مثل exportInvoiceToImage
                            const styleTag = clonedDoc.createElement('style');
                            styleTag.textContent = `
                                tbody tr td:first-child {
                                    color: #000000 !important;
                                }
                                tbody tr td:first-child * {
                                    color: #000000 !important;
                                }
                                tbody tr[style*="background-color: rgb(59, 130, 246)"] td:first-child,
                                tbody tr[style*="background-color: #3b82f6"] td:first-child {
                                    color: #ffffff !important;
                                }
                            `;
                            clonedDoc.head.appendChild(styleTag);
                            
                            // اعمال استایل‌های نهایی در cloned document - دقیقاً مثل exportInvoiceToImage
                            const clonedTempDiv = clonedDoc.querySelector(`#temp-invoice-${i}`) as HTMLElement;
                            if (clonedTempDiv) {
                                clonedTempDiv.style.width = '210mm';
                                clonedTempDiv.style.maxWidth = '210mm';
                                clonedTempDiv.style.overflow = 'hidden';
                                clonedTempDiv.style.margin = '0 auto';
                                clonedTempDiv.style.display = 'flex';
                                clonedTempDiv.style.flexDirection = 'column';
                                clonedTempDiv.style.alignItems = 'center';
                            }
                            
                            const clonedInvoice = clonedDoc.querySelector(`#temp-invoice-${i} [data-invoice-ref="true"]`) as HTMLElement || 
                                                 clonedDoc.querySelector(`#temp-invoice-${i} div[dir="rtl"]`) as HTMLElement;
                            if (clonedInvoice) {
                                clonedInvoice.style.width = '100%';
                                clonedInvoice.style.maxWidth = '100%';
                                clonedInvoice.style.margin = '0 auto';
                                clonedInvoice.style.overflow = 'hidden';
                                clonedInvoice.style.visibility = 'visible';
                                clonedInvoice.style.opacity = '1';
                                clonedInvoice.style.boxSizing = 'border-box';
                                
                                // اعمال استایل‌های جدول - حفظ استایل‌های inline
                                const clonedTables = clonedInvoice.querySelectorAll('table');
                                clonedTables.forEach((table) => {
                                    const tableEl = table as HTMLElement;
                                    // حفظ استایل‌های inline موجود - override نکن
                                    if (!tableEl.style.width || tableEl.style.width === '100%') {
                                        tableEl.style.width = 'auto';
                                    }
                                    if (!tableEl.style.maxWidth) {
                                        tableEl.style.maxWidth = '90%';
                                    }
                                    tableEl.style.margin = '0 auto';
                                    tableEl.style.tableLayout = 'auto';
                                    tableEl.style.borderCollapse = 'collapse';
                                    // حفظ fontSize و fontFamily از JSX
                                    if (!tableEl.style.fontSize) {
                                        tableEl.style.fontSize = '18px';
                                    }
                                    if (!tableEl.style.fontFamily) {
                                        tableEl.style.fontFamily = 'Vazirmatn, Arial, sans-serif';
                                    }
                                    
                                    // اطمینان از اینکه هدر جدول (thead th) رنگ سفید دارد
                                    const theadRows = tableEl.querySelectorAll('thead tr');
                                    theadRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        const rowBg = rowEl.style.backgroundColor || window.getComputedStyle(rowEl).backgroundColor;
                                        // اگر پس‌زمینه آبی دارد (هدر صورتحساب)
                                        if (rowBg.includes('rgb(30, 64, 175)') || rowBg.includes('#1e40af')) {
                                            const headerCells = rowEl.querySelectorAll('th');
                                            headerCells.forEach((th) => {
                                                const thEl = th as HTMLElement;
                                                thEl.style.color = '#ffffff';
                                                thEl.style.setProperty('color', '#ffffff', 'important');
                                                // حذف backgroundColor روشن اگر وجود دارد
                                                if (thEl.style.backgroundColor === '#f1f5f9' || thEl.style.backgroundColor === 'rgb(241, 245, 249)') {
                                                    thEl.style.backgroundColor = '';
                                                }
                                                const currentStyle = thEl.getAttribute('style') || '';
                                                if (!currentStyle.includes('color: #ffffff') && !currentStyle.includes('color:#ffffff')) {
                                                    thEl.setAttribute('style', currentStyle.replace(/backgroundColor:\s*[^;]+;?/gi, '') + '; color: #ffffff !important;');
                                                }
                                            });
                                        }
                                    });
                                    
                                    // اطمینان از اینکه سلول‌های ستون دسته‌بندی رنگ مشکی دارند و قابل مشاهده هستند
                                    const tbodyRows = tableEl.querySelectorAll('tbody tr');
                                    tbodyRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        const firstCell = rowEl.querySelector('td:first-child') as HTMLElement;
                                        if (firstCell) {
                                            // بررسی اینکه آیا این سلول دسته‌بندی است (نه ردیف جمع کل)
                                            const cellText = (firstCell.textContent || '').trim();
                                            const rowBg = rowEl.style.backgroundColor || window.getComputedStyle(rowEl).backgroundColor;
                                            const isTotalRow = cellText.includes('جمع کل') || rowBg.includes('rgb(59, 130, 246)') || rowBg.includes('#3b82f6');
                                            if (!isTotalRow && cellText.length > 0) {
                                                // تنظیم رنگ مشکی برای ستون دسته‌بندی با !important
                                                firstCell.style.color = '#000000';
                                                firstCell.style.setProperty('color', '#000000', 'important');
                                                firstCell.style.setProperty('background-color', firstCell.style.backgroundColor || '#ffffff', 'important');
                                                
                                                // حذف هر رنگ دیگری و اضافه کردن رنگ مشکی
                                                const currentStyle = firstCell.getAttribute('style') || '';
                                                let newStyle = currentStyle
                                                    .replace(/color:\s*[^;!]+;?/gi, '')
                                                    .replace(/color\s*:\s*[^;!]+;?/gi, '')
                                                    .replace(/color:\s*#[^;!]+;?/gi, '')
                                                    .replace(/color:\s*rgb\([^)]+\);?/gi, '');
                                                if (!newStyle.includes('color: #000000') && !newStyle.includes('color:#000000')) {
                                                    newStyle += '; color: #000000 !important;';
                                                }
                                                firstCell.setAttribute('style', newStyle);
                                            }
                                        }
                                    });
                                    
                                    // اطمینان از وسط چین بودن جدول
                                    tableEl.style.margin = '0 auto';
                                    tableEl.style.display = 'table';
                                    tableEl.style.maxWidth = '100%';
                                    tableEl.style.boxSizing = 'border-box';
                                });
                                
                                // محدود کردن footer (کسورات) - مطمئن شو که از کادر خارج نمی‌شود
                                const footerDivs = clonedInvoice.querySelectorAll('div[style*="background-color: #e2e8f0"]');
                                footerDivs.forEach((footerDiv) => {
                                    const footerEl = footerDiv as HTMLElement;
                                    footerEl.style.width = '100%';
                                    footerEl.style.maxWidth = '100%';
                                    footerEl.style.boxSizing = 'border-box';
                                    footerEl.style.overflow = 'hidden';
                                    footerEl.style.margin = '0 auto';
                                    
                                    // محدود کردن div های داخلی footer
                                    const innerDivs = footerEl.querySelectorAll('div');
                                    innerDivs.forEach((innerDiv) => {
                                        const innerEl = innerDiv as HTMLElement;
                                        innerEl.style.width = '100%';
                                        innerEl.style.maxWidth = '100%';
                                        innerEl.style.boxSizing = 'border-box';
                                        innerEl.style.overflow = 'hidden';
                                    });
                                    
                                    // محدود کردن span های داخل footer
                                    const footerSpans = footerEl.querySelectorAll('span');
                                    footerSpans.forEach((span) => {
                                        const spanEl = span as HTMLElement;
                                        spanEl.style.overflow = 'hidden';
                                        spanEl.style.textOverflow = 'ellipsis';
                                        spanEl.style.whiteSpace = 'nowrap';
                                        spanEl.style.maxWidth = '50%';
                                        spanEl.style.boxSizing = 'border-box';
                                    });
                                });
                                
                                // اول از همه، برای همه سلول‌های "مبلغ کل" رنگ مناسب تنظیم کن
                                const totalAmountCells = clonedInvoice.querySelectorAll('td[data-total-amount="true"]');
                                totalAmountCells.forEach((cell) => {
                                    const cellEl = cell as HTMLElement;
                                    const cellBg = cellEl.style.backgroundColor || window.getComputedStyle(cellEl).backgroundColor;
                                    const isTotalRow = cellBg.includes('rgb(59, 130, 246)') || cellBg.includes('#3b82f6') || 
                                                     cellEl.closest('tr')?.getAttribute('style')?.includes('#3b82f6');
                                    
                                    if (isTotalRow) {
                                        // برای ردیف جمع کل: رنگ سفید
                                        cellEl.style.color = '#ffffff';
                                        cellEl.style.setProperty('color', '#ffffff', 'important');
                                    } else {
                                        // برای ردیف‌های عادی: رنگ مشکی
                                        cellEl.style.color = '#1e293b';
                                        cellEl.style.setProperty('color', '#1e293b', 'important');
                                    }
                                });
                                
                                // اعمال استایل‌های thead و tbody
                                const clonedTheads = clonedInvoice.querySelectorAll('thead');
                                clonedTheads.forEach((thead) => {
                                    const theadEl = thead as HTMLElement;
                                    const headerRows = theadEl.querySelectorAll('tr');
                                    headerRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        rowEl.style.backgroundColor = '#1e40af';
                                        rowEl.style.color = '#ffffff';
                                    });
                                });
                                
                                const clonedTfoots = clonedInvoice.querySelectorAll('tfoot');
                                clonedTfoots.forEach((tfoot) => {
                                    const tfootEl = tfoot as HTMLElement;
                                    const footerRows = tfootEl.querySelectorAll('tr');
                                    footerRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        rowEl.style.backgroundColor = '#f1f5f9';
                                        rowEl.style.fontWeight = 'bold';
                                    });
                                });
                                
                                // اعمال استایل‌های سلول‌ها (td و th) - حفظ استایل‌های inline موجود
                                const clonedCells = clonedInvoice.querySelectorAll('td, th');
                                clonedCells.forEach((cell) => {
                                    const cellEl = cell as HTMLElement;
                                    
                                    // حفظ rowSpan - مهم برای merge کردن دسته‌بندی‌ها
                                    const rowSpan = cellEl.getAttribute('rowspan') || cellEl.getAttribute('rowSpan');
                                    if (rowSpan && parseInt(rowSpan) > 1) {
                                        cellEl.style.display = 'table-cell';
                                        cellEl.style.verticalAlign = 'middle';
                                    }
                                    
                                    // حفظ استایل‌های inline موجود - override نکن
                                    const originalStyle = cellEl.getAttribute('style') || '';
                                    
                                    // فقط اگر استایل‌های ضروری وجود ندارند، اضافه کن
                                    if (cellEl.tagName === 'TH') {
                                        // برای headerها
                                        if (!cellEl.style.backgroundColor || cellEl.style.backgroundColor === 'transparent') {
                                            cellEl.style.backgroundColor = '#1e40af';
                                        }
                                        if (!cellEl.style.color) {
                                            cellEl.style.color = '#ffffff';
                                        }
                                        if (!cellEl.style.fontWeight) {
                                            cellEl.style.fontWeight = 'bold';
                                        }
                                    } else {
                                        // برای سلول‌های داده (td)
                                        // حفظ استایل‌های inline موجود - override نکن
                                        if (!cellEl.style.fontSize) {
                                            const computedStyle = window.getComputedStyle(cellEl);
                                            if (computedStyle.fontSize && computedStyle.fontSize !== '0px') {
                                                cellEl.style.fontSize = computedStyle.fontSize;
                                            } else {
                                                cellEl.style.fontSize = '18px';
                                            }
                                        }
                                    }
                                    
                                    // border - فقط اگر تعریف نشده باشد
                                    if (!cellEl.style.border || cellEl.style.border === 'none' || cellEl.style.border === '') {
                                        if (cellEl.tagName === 'TH') {
                                            cellEl.style.border = '1px solid #475569';
                                        } else {
                                            cellEl.style.border = '1px solid #cbd5e1';
                                        }
                                    }
                                    
                                    // box-sizing
                                    cellEl.style.boxSizing = 'border-box';
                                    
                                    // vertical-align - حفظ استایل موجود
                                    if (!cellEl.style.verticalAlign) {
                                        cellEl.style.verticalAlign = 'middle';
                                    }
                                });
                                
                                // محدود کردن همه div های اصلی - مطمئن شو که از کادر خارج نمی‌شوند
                                const allDivs = clonedInvoice.querySelectorAll('div');
                                allDivs.forEach((div) => {
                                    const divEl = div as HTMLElement;
                                    // فقط برای div هایی که مستقیماً داخل clonedInvoice هستند
                                    if (divEl.parentElement === clonedInvoice || divEl.closest('[data-invoice-ref="true"]') === clonedInvoice) {
                                        divEl.style.maxWidth = '100%';
                                        divEl.style.boxSizing = 'border-box';
                                        divEl.style.overflow = 'hidden';
                                    }
                                });
                            }
                        },
                        removeContainer: false,
                        windowWidth: 794, // 210mm in pixels (210mm * 3.7795 pixels/mm ≈ 794px)
                        windowHeight: invoiceDiv.scrollHeight || 1123 // 297mm in pixels (297mm * 3.7795 pixels/mm ≈ 1123px)
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
                
                // بررسی اینکه آیا جدول عریض است (عرض بیشتر از ارتفاع)
                const isWide = canvas.width > canvas.height;
                const currentOrientation = isWide ? 'l' : 'p';
                const currentPageWidth = isWide ? 297 : 210; // A4 landscape vs portrait
                const currentPageHeight = isWide ? 210 : 297;
                
                // اگر جهت صفحه تغییر کرده، صفحه جدید با جهت جدید اضافه کن
                if (i > 0 || (i === 0 && currentOrientation === 'l')) {
                    pdf.addPage(currentOrientation);
                }
                
                // محاسبه ابعاد تصویر با در نظر گیری حاشیه‌ها
                const imgWidth = currentPageWidth - (2 * margin);
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let currentY = margin;

                // اضافه کردن تصویر به PDF با حاشیه‌ها
                pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
                heightLeft -= (currentPageHeight - (2 * margin));

                // اگر محتوا بیشتر از یک صفحه است، صفحات اضافی اضافه کن
                while (heightLeft > 0) {
                    currentY = margin - (imgHeight - heightLeft);
                    pdf.addPage(currentOrientation);
                    pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
                    heightLeft -= (currentPageHeight - (2 * margin));
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
        let html = `<div dir="rtl" data-invoice-ref="true" style="width: 100%; max-width: 100%; min-height: 100%; font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif; padding: 24px; background-color: #ffffff; box-sizing: border-box; direction: rtl; text-align: right; overflow: hidden;">
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

        // تعریف ردیف‌های هزینه برای راننده اصلی (مثل renderMainDriverTableLayoutVertical)
        const mainDriverCostRows = [
            { key: 'bill_of_lading', category: 'هزینه‌های مستقیم', label: 'بارنامه', getValue: (calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0) },
            { key: 'food', category: 'هزینه‌های مستقیم', label: 'غذا', getValue: (calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0) },
            { key: 'fuel', category: 'هزینه‌های مستقیم', label: 'سوخت', getValue: (calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0) },
            { key: 'toll', category: 'هزینه‌های مستقیم', label: 'عوارض', getValue: (calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0) },
            { key: 'return_cargo', category: 'هزینه‌های مستقیم', label: 'بار برگشتی', getValue: (calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0) },
            { key: 'multi_unload', category: 'هزینه‌های مستقیم', label: 'چندجا تخلیه', getValue: (calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0) },
            { key: 'excess_mission', category: 'هزینه‌های مستقیم', label: 'ماموریت مازاد', getValue: (calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0) },
            { key: 'depot_shipment_count', category: 'هزینه‌های دپو', label: 'تعداد بار دپو', getValue: (calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0) },
            { key: 'depot_mission_days', category: 'هزینه‌های دپو', label: 'ماموریت دپو (روز)', getValue: (calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0) },
            { key: 'depot_total_mileage', category: 'هزینه‌های دپو', label: 'پیمایش دپو (کیلومتر)', getValue: (calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0) },
            { key: 'depot_cargo_handling', category: 'هزینه‌های دپو', label: 'جابجایی بار دپو', getValue: (calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0) },
            { key: 'depot_mission', category: 'هزینه‌های دپو', label: 'حق ماموریت دپو', getValue: (calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0) },
            { key: 'depot_allowance', category: 'هزینه‌های دپو', label: 'اجرت دپو', getValue: (calc: any) => parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0), getUnitPrice: (calc: any) => parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0) },
            { key: 'fixed_allowance', category: 'اجرت ثابت', label: 'اجرت ثابت', getValue: (calc: any) => { const queueType = calc.queue_type || calc.queueType || 'porsant'; return queueType === 'fixed_allowance' ? parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0) : 0; }, getUnitPrice: (calc: any) => { const queueType = calc.queue_type || calc.queueType || 'porsant'; return queueType === 'fixed_allowance' ? parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0) : 0; } }
        ];

        // جدول راننده اصلی با فرمت عمودی - دقیقاً مثل renderMainDriverTableLayoutVertical
        if (calculationsWithoutHelper.length > 0 || calculationsWithHelper.length > 0) {
            html += `
                <div style="margin-bottom: 24px; width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                    <h3 style="font-size: 20px; font-weight: bold; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-family: 'Vazirmatn', Arial, sans-serif; width: 100%; box-sizing: border-box;">
                        هزینه‌های راننده اصلی
                    </h3>
                    <div style="max-width: 90%; margin: 0 auto; display: flex; justify-content: center; width: 100%; box-sizing: border-box; overflow: hidden;">
                        <table style="font-size: 18px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: auto; width: auto; max-width: 100%; margin: 0 auto; border-collapse: collapse; border: 2px solid #1e40af; background-color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); box-sizing: border-box;">
                            <thead>
                                <tr style="background-color: #1e40af; color: #ffffff;">
                                    <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 25%; color: #ffffff;">دسته‌بندی</th>
                                    <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: right; vertical-align: middle; width: 30%; color: #ffffff;">شرح هزینه / (ریال)</th>
                                    <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 22%; color: #ffffff;">مبلغ واحد / (ریال)</th>
                                    <th style="font-size: 20px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 23%; color: #ffffff;">مبلغ کل / (ریال)</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            [...calculationsWithoutHelper, ...calculationsWithHelper].forEach((calc, calcIdx) => {
                const announcementId = calc.announcement_id || calc.announcementId;
                const announcement = announcementsMap.get(announcementId);
                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                const billOfLadingNumber = calc.bill_of_lading_number || calc.billOfLadingNumber || '-';
                const billOfLadingDate = calc.bill_of_lading_date || calc.billOfLadingDate ? 
                    (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                        ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                        : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate)) : '-';
                const calculationDate = calc.calculation_date || calc.calculationDate ? 
                    (typeof (calc.calculation_date || calc.calculationDate) === 'string' 
                        ? (calc.calculation_date || calc.calculationDate)
                        : formatJalali(calc.calculation_date || calc.calculationDate)) : '-';
                
                const origin = announcement?.origin?.city || announcement?.origin || calc.origin || '-';
                const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                const approvedKm = (calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR');
                const excessKm = (calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR');
                const approvedMissionDays = (calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR');
                const excessMissionDays = (calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR');
                const totalKm = ((calc.approved_kilometers || calc.approvedKilometers || 0) + (calc.excess_kilometers || calc.excessKilometers || 0)).toLocaleString('fa-IR');
                
                const initialInfoRows = [
                    { key: 'bill_number', label: 'شماره بارنامه', value: billOfLadingNumber },
                    { key: 'origin', label: 'مبدأ', value: origin },
                    { key: 'destinations', label: 'مقاصد', value: destinations },
                    { key: 'vehicle_plate', label: 'پلاک خودرو', value: vehiclePlate },
                    { key: 'bill_date', label: 'تاریخ صدور بارنامه', value: billOfLadingDate },
                    { key: 'calc_date', label: 'تاریخ محاسبه', value: calculationDate },
                    { key: 'approved_km', label: 'پیمایش مصوب (کیلومتر)', value: approvedKm },
                    { key: 'excess_km', label: 'پیمایش مازاد (کیلومتر)', value: excessKm },
                    { key: 'total_km', label: 'پیمایش کل (کیلومتر)', value: totalKm },
                    { key: 'approved_mission', label: 'ماموریت مصوب (روز)', value: approvedMissionDays },
                    { key: 'excess_mission', label: 'ماموریت مازاد (روز)', value: excessMissionDays }
                ];

                const relevantCostRows = mainDriverCostRows.filter(row => row.getValue(calc) > 0);

                // ردیف‌های اطلاعات اولیه - دقیقاً مثل renderMainDriverTableLayoutVertical
                initialInfoRows.forEach((infoRow, infoIdx) => {
                    const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                    const isFirstInCategory = infoIdx === 0;
                    
                    html += `
                        <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'}; height: 50px;">
                            ${isFirstInCategory ? `<td rowspan="${initialInfoRows.length}" style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'};" class="category-cell">اطلاعات اولیه</td>` : ''}
                            <td style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${infoRow.label}</td>
                            <td style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${infoRow.value}</td>
                            <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155;">-</td>
                        </tr>
                    `;
                });

                // ردیف‌های هزینه - دقیقاً مثل renderMainDriverTableLayoutVertical
                relevantCostRows.forEach((row, rowIdx) => {
                    const value = row.getValue(calc);
                    const unitPrice = row.getUnitPrice(calc);
                    const isEven = (calcIdx + rowIdx) % 2 === 0;
                    const isFirstInCategory = rowIdx === 0 || relevantCostRows[rowIdx - 1].category !== row.category;
                    
                    let categoryRowSpan = 1;
                    if (isFirstInCategory) {
                        for (let i = rowIdx + 1; i < relevantCostRows.length; i++) {
                            if (relevantCostRows[i].category === row.category) {
                                categoryRowSpan++;
                            } else {
                                break;
                            }
                        }
                    }
                    
                    html += `
                        <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'}; height: 50px;">
                            ${isFirstInCategory ? `<td rowspan="${categoryRowSpan}" style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'};" class="category-cell">${row.category}</td>` : ''}
                            <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${row.label}</td>
                            <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155;">${unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}</td>
                            <td data-total-amount="true" style="font-size: 20px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: bold; background-color: #f1f5f9; color: #1e293b;">${value > 0 ? value.toLocaleString('fa-IR') : '-'}</td>
                        </tr>
                    `;
                });
            });

            // ردیف جمع کل - دقیقاً مثل renderMainDriverTableLayoutVertical
            html += `
                                <tr style="background-color: #3b82f6; height: 50px;">
                                    <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">جمع کل</td>
                                    <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">-</td>
                                    <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">-</td>
                                    <td data-total-amount="true" style="font-size: 24px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">${totalMainAll.toLocaleString('fa-IR')}</td>
                                </tr>
                            </tbody>
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

        // تعریف ردیف‌های هزینه برای راننده کمکی
        const helperDriverCostRows = [
            { key: 'helper_allowance', category: 'هزینه‌های مستقیم', label: 'اجرت راننده کمکی', getValue: (calc: any) => parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0), getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0) },
            { key: 'helper_food', category: 'هزینه‌های مستقیم', label: 'غذای راننده کمکی', getValue: (calc: any) => parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0) },
            { key: 'helper_excess_mission', category: 'هزینه‌های مستقیم', label: 'ماموریت مازاد راننده کمکی', getValue: (calc: any) => parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0), getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0) }
        ];

        // نمایش جداول راننده کمکی با فرمت عمودی - دقیقاً مثل renderHelperDriverTableLayoutVertical
        helperDriversMap.forEach((helperData, helperEmployeeId) => {
            if (helperData.calculations.length > 0) {
                const helperTotal = helperData.calculations.reduce((sum, calc) => sum + calculateHelperDriverCostGlobal(calc), 0);
                
                html += `
                    <div style="margin-bottom: 24px; width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                        <h3 style="font-size: 20px; font-weight: bold; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-family: 'Vazirmatn', Arial, sans-serif; width: 100%; box-sizing: border-box;">
                            راننده کمکی - کد پرسنلی: ${helperEmployeeId} - ${helperData.name}
                        </h3>
                        <div style="max-width: 90%; margin: 0 auto; display: flex; justify-content: center; width: 100%; box-sizing: border-box; overflow: hidden;">
                            <table style="font-size: 18px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: auto; width: auto; max-width: 100%; margin: 0 auto; border-collapse: collapse; border: 2px solid #1e40af; background-color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); box-sizing: border-box;">
                                <thead>
                                    <tr style="background-color: #1e40af; color: #ffffff;">
                                        <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 25%; color: #ffffff;">دسته‌بندی</th>
                                        <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: right; vertical-align: middle; width: 30%; color: #ffffff;">شرح هزینه / (ریال)</th>
                                        <th style="font-size: 18px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 22%; color: #ffffff;">مبلغ واحد / (ریال)</th>
                                        <th style="font-size: 20px; font-weight: bold; padding: 12px 10px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 23%; color: #ffffff;">مبلغ کل / (ریال)</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                helperData.calculations.forEach((calc, calcIdx) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    const announcement = announcementsMap.get(announcementId);
                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                    const billOfLadingNumber = calc.bill_of_lading_number || calc.billOfLadingNumber || '-';
                    const billOfLadingDate = calc.bill_of_lading_date || calc.billOfLadingDate ? 
                        (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                            ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                            : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate)) : '-';
                    const calculationDate = calc.calculation_date || calc.calculationDate ? 
                        (typeof (calc.calculation_date || calc.calculationDate) === 'string' 
                            ? (calc.calculation_date || calc.calculationDate)
                            : formatJalali(calc.calculation_date || calc.calculationDate)) : '-';
                    
                    const origin = announcement?.origin?.city || announcement?.origin || calc.origin || '-';
                    const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                    const approvedKm = (calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR');
                    const excessKm = (calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR');
                    const approvedMissionDays = (calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR');
                    const excessMissionDays = (calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR');
                    const totalKm = ((calc.approved_kilometers || calc.approvedKilometers || 0) + (calc.excess_kilometers || calc.excessKilometers || 0)).toLocaleString('fa-IR');
                    
                    const initialInfoRows = [
                        { key: 'employee_id', label: 'کد پرسنلی', value: helperEmployeeId },
                        { key: 'name', label: 'نام', value: helperData.name },
                        { key: 'bill_number', label: 'شماره بارنامه', value: billOfLadingNumber },
                        { key: 'origin', label: 'مبدأ', value: origin },
                        { key: 'destinations', label: 'مقاصد', value: destinations },
                        { key: 'vehicle_plate', label: 'پلاک خودرو', value: vehiclePlate },
                        { key: 'bill_date', label: 'تاریخ صدور بارنامه', value: billOfLadingDate },
                        { key: 'calc_date', label: 'تاریخ محاسبه', value: calculationDate },
                        { key: 'approved_km', label: 'پیمایش مصوب (کیلومتر)', value: approvedKm },
                        { key: 'excess_km', label: 'پیمایش مازاد (کیلومتر)', value: excessKm },
                        { key: 'total_km', label: 'پیمایش کل (کیلومتر)', value: totalKm },
                        { key: 'approved_mission', label: 'ماموریت مصوب (روز)', value: approvedMissionDays },
                        { key: 'excess_mission', label: 'ماموریت مازاد (روز)', value: excessMissionDays }
                    ];

                    const relevantCostRows = helperDriverCostRows.filter(row => row.getValue(calc) > 0);

                    // ردیف‌های اطلاعات اولیه - دقیقاً مثل renderHelperDriverTableLayoutVertical
                    initialInfoRows.forEach((infoRow, infoIdx) => {
                        const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                        const isFirstInCategory = infoIdx === 0;
                        
                        html += `
                            <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'}; height: 50px;">
                                ${isFirstInCategory ? `<td rowspan="${initialInfoRows.length}" style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'};" class="category-cell">اطلاعات اولیه</td>` : ''}
                                <td style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${infoRow.label}</td>
                                <td style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${infoRow.value}</td>
                                <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155;">-</td>
                            </tr>
                        `;
                    });

                    // ردیف‌های هزینه - دقیقاً مثل renderHelperDriverTableLayoutVertical
                    relevantCostRows.forEach((row, rowIdx) => {
                        const value = row.getValue(calc);
                        const unitPrice = row.getUnitPrice(calc);
                        const isEven = (calcIdx + rowIdx) % 2 === 0;
                        const isFirstInCategory = rowIdx === 0 || relevantCostRows[rowIdx - 1].category !== row.category;
                        
                        let categoryRowSpan = 1;
                        if (isFirstInCategory) {
                            for (let i = rowIdx + 1; i < relevantCostRows.length; i++) {
                                if (relevantCostRows[i].category === row.category) {
                                    categoryRowSpan++;
                                } else {
                                    break;
                                }
                            }
                        }
                        
                        html += `
                            <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'}; height: 50px;">
                                ${isFirstInCategory ? `<td rowspan="${categoryRowSpan}" style="font-size: 16px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'};" class="category-cell">${row.category}</td>` : ''}
                                <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent;">${row.label}</td>
                                <td style="font-size: 18px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155;">${unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}</td>
                                <td data-total-amount="true" style="font-size: 20px; padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: bold; background-color: #f1f5f9; color: #1e293b;">${value > 0 ? value.toLocaleString('fa-IR') : '-'}</td>
                            </tr>
                        `;
                    });
                });

                // ردیف جمع کل - دقیقاً مثل renderHelperDriverTableLayoutVertical
                html += `
                                    <tr style="background-color: #3b82f6; height: 50px;">
                                        <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">جمع کل</td>
                                        <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">-</td>
                                        <td style="font-size: 20px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">-</td>
                                        <td data-total-amount="true" style="font-size: 24px; padding: 10px 12px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff;">${helperTotal.toLocaleString('fa-IR')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        });

        // جمع کل نهایی (فقط یک بار در footer) - محدود شده و وسط چین
        html += `
                <div style="margin-top: 16px; padding: 16px; background-color: #e2e8f0; border-radius: 8px; border: 2px solid #475569; width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
                            <span style="font-size: 16px; font-weight: bold; color: #1e293b; flex-shrink: 0;">جمع کل هزینه سفر:</span>
                            <span style="font-size: 18px; font-weight: bold; color: #059669; flex-shrink: 0; direction: rtl; text-align: right;">${grandTotal.toLocaleString('fa-IR')} ریال</span>
                        </div>
                        ${totalAdvancePayment > 0 ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #94a3b8; padding-top: 8px; margin-top: 8px; width: 100%; box-sizing: border-box;">
                                <span style="font-size: 14px; font-weight: 600; color: #1e293b; flex-shrink: 0;">کسور (پیش پرداخت):</span>
                                <span style="font-size: 16px; font-weight: bold; color: #ea580c; flex-shrink: 0; direction: rtl; text-align: right;">${totalAdvancePayment.toLocaleString('fa-IR')} ریال</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #475569; padding-top: 8px; margin-top: 8px; width: 100%; box-sizing: border-box;">
                                <span style="font-size: 16px; font-weight: bold; color: #1e293b; flex-shrink: 0;">مبلغ قابل پرداخت:</span>
                                <span style="font-size: 18px; font-weight: bold; color: #0284c7; flex-shrink: 0; direction: rtl; text-align: right;">${payableAmount.toLocaleString('fa-IR')} ریال</span>
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

