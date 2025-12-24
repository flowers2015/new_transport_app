import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOMServer from 'react-dom/server';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

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
                // استفاده از پیکسل برای دقت بیشتر (A4: 210mm × 297mm = 794px × 1123px در 96 DPI)
                const A4_WIDTH_PX = 794; // 210mm در 96 DPI
                const A4_HEIGHT_PX = 1123; // 297mm در 96 DPI
                const MARGIN_PX = 38; // 10mm در 96 DPI
                const CONTENT_WIDTH = A4_WIDTH_PX - (2 * MARGIN_PX); // 718px
                
                const tempDiv = document.createElement('div');
                tempDiv.id = `temp-invoice-${i}`;
                tempDiv.style.position = 'fixed';
                tempDiv.style.top = '0';
                tempDiv.style.left = '0';
                tempDiv.style.width = `${A4_WIDTH_PX}px`;
                tempDiv.style.maxWidth = `${A4_WIDTH_PX}px`;
                tempDiv.style.height = 'auto';
                tempDiv.style.minHeight = `${A4_HEIGHT_PX}px`;
                tempDiv.style.backgroundColor = '#ffffff';
                tempDiv.style.padding = `${MARGIN_PX}px`;
                tempDiv.style.boxSizing = 'border-box';
                tempDiv.style.overflow = 'hidden';
                tempDiv.style.zIndex = '999999';
                tempDiv.style.visibility = 'visible';
                tempDiv.style.opacity = '0'; // مخفی اما در viewport
                tempDiv.style.pointerEvents = 'none'; // جلوگیری از تداخل با کاربر
                tempDiv.style.margin = '0';
                tempDiv.style.display = 'block';
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
                            
                            // اعمال استایل‌های نهایی در cloned document - محدود شده برای A4
                            const A4_WIDTH_PX = 794;
                            const CONTENT_WIDTH_PX = 718;
                            
                            const clonedTempDiv = clonedDoc.querySelector(`#temp-invoice-${i}`) as HTMLElement;
                            if (clonedTempDiv) {
                                clonedTempDiv.style.width = `${A4_WIDTH_PX}px`;
                                clonedTempDiv.style.maxWidth = `${A4_WIDTH_PX}px`;
                                clonedTempDiv.style.overflow = 'hidden';
                                clonedTempDiv.style.margin = '0';
                                clonedTempDiv.style.display = 'block';
                            }
                            
                            const clonedInvoice = clonedDoc.querySelector(`#temp-invoice-${i} [data-invoice-ref="true"]`) as HTMLElement || 
                                                 clonedDoc.querySelector(`#temp-invoice-${i} div[dir="rtl"]`) as HTMLElement;
                            if (clonedInvoice) {
                                clonedInvoice.style.width = `${CONTENT_WIDTH_PX}px`;
                                clonedInvoice.style.maxWidth = `${CONTENT_WIDTH_PX}px`;
                                clonedInvoice.style.margin = '0 auto';
                                clonedInvoice.style.overflow = 'hidden';
                                clonedInvoice.style.visibility = 'visible';
                                clonedInvoice.style.opacity = '1';
                                clonedInvoice.style.boxSizing = 'border-box';
                                
                                // اعمال استایل‌های جدول - محدود شده برای A4
                                const clonedTables = clonedInvoice.querySelectorAll('table');
                                clonedTables.forEach((table) => {
                                    const tableEl = table as HTMLElement;
                                    tableEl.style.width = '100%';
                                    tableEl.style.maxWidth = `${CONTENT_WIDTH_PX}px`;
                                    tableEl.style.margin = '0 auto';
                                    tableEl.style.tableLayout = 'fixed';
                                    tableEl.style.borderCollapse = 'collapse';
                                    tableEl.style.boxSizing = 'border-box';
                                    tableEl.style.overflow = 'hidden';
                                    // حفظ fontSize و fontFamily از JSX
                                    if (!tableEl.style.fontSize) {
                                        tableEl.style.fontSize = '14px';
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
                                    footerEl.style.width = `${CONTENT_WIDTH_PX}px`;
                                    footerEl.style.maxWidth = `${CONTENT_WIDTH_PX}px`;
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
                                        spanEl.style.maxWidth = '48%';
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
                                        if (!divEl.style.maxWidth || divEl.style.maxWidth === '100%') {
                                            divEl.style.maxWidth = `${CONTENT_WIDTH_PX}px`;
                                        }
                                        divEl.style.boxSizing = 'border-box';
                                        divEl.style.overflow = 'hidden';
                                    }
                                });
                                
                                // محدود کردن همه سلول‌های جدول
                                const allCells = clonedInvoice.querySelectorAll('td, th');
                                allCells.forEach((cell) => {
                                    const cellEl = cell as HTMLElement;
                                    cellEl.style.boxSizing = 'border-box';
                                    cellEl.style.overflow = 'hidden';
                                    if (!cellEl.style.wordWrap) {
                                        cellEl.style.wordWrap = 'break-word';
                                    }
                                });
                            }
                        },
                        removeContainer: false,
                        windowWidth: 794, // A4 width in pixels (210mm * 3.7795 pixels/mm ≈ 794px)
                        windowHeight: Math.max(invoiceDiv.scrollHeight || 1123, 1123) // A4 height in pixels (297mm * 3.7795 pixels/mm ≈ 1123px)
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

    // تولید ZIP از تصاویر صورتحساب‌های پرداخت شده (تک به تک)
    const exportAllInvoicesToImagesZip = async () => {
        console.log('🖼️ [ZIP_IMAGES] ========== شروع تولید ZIP تصاویر ==========');
        console.log('🖼️ [ZIP_IMAGES] filteredRecords.length:', filteredRecords.length);
        
        if (filteredRecords.length === 0) {
            alert('هیچ صورتحساب پرداخت شده‌ای برای تولید تصاویر وجود ندارد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // ایجاد ZIP
            const zip = new JSZip();
            let successCount = 0;
            let failCount = 0;
            
            // برای هر رکورد پرداخت شده
            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                
                console.log(`🖼️ [ZIP_IMAGES] ========== پردازش رکورد ${i + 1}/${filteredRecords.length} ==========`);
                console.log(`🖼️ [ZIP_IMAGES] Driver: ${record.driverName}, Employee ID: ${record.employeeId}`);
                
                try {
                    // دریافت محاسبات پرداخت شده مربوط به این راننده با retry logic
                    const calcDateFrom = record.calculationDateFrom || '';
                    const calcDateTo = record.calculationDateTo || '';
                    let calculationsUrl = `driver-calculations/paid?driverId=${record.driverId}`;
                    if (calcDateFrom) calculationsUrl += `&startDate=${calcDateFrom}`;
                    if (calcDateTo) calculationsUrl += `&endDate=${calcDateTo}`;
                    
                    // Retry logic برای خطاهای شبکه
                    let calculationsResponse;
                    let retries = 3;
                    let lastError: any = null;
                    while (retries > 0) {
                        try {
                            calculationsResponse = await fetch(getApiUrl(calculationsUrl), { 
                                headers,
                                signal: AbortSignal.timeout(30000) // 30 second timeout
                            });
                            if (calculationsResponse && calculationsResponse.ok) {
                                lastError = null;
                                break;
                            }
                            lastError = new Error(`HTTP ${calculationsResponse?.status || 'unknown'}`);
                        } catch (err: any) {
                            lastError = err;
                            console.warn(`⚠️ [ZIP_IMAGES] Retry ${4 - retries}/3 for ${record.driverName}:`, err.message);
                        }
                        retries--;
                        if (retries > 0 && lastError) {
                            await new Promise(resolve => setTimeout(resolve, 2000)); // صبر 2 ثانیه
                        }
                    }
                    
                    if (!calculationsResponse || !calculationsResponse.ok) {
                        console.error(`❌ [ZIP_IMAGES] Failed to fetch calculations for ${record.driverName} after retries`);
                        failCount++;
                        continue;
                    }
                    
                    const paidCalculations = await calculationsResponse.json();
                    const calculationsArray = Array.isArray(paidCalculations) ? paidCalculations : [];
                    
                    if (calculationsArray.length === 0) {
                        console.warn(`⚠️ [ZIP_IMAGES] هیچ محاسبه پرداخت شده‌ای برای ${record.driverName} یافت نشد`);
                        continue;
                    }
                    
                    // دریافت اطلاعات اعلام بار با timeout و retry
                    const announcementsMap = new Map<string, any>();
                    await Promise.all(calculationsArray.map(async (calc: any) => {
                        const announcementId = calc.announcement_id || calc.announcementId;
                        if (announcementId && !announcementsMap.has(announcementId)) {
                            let retries = 2;
                            while (retries > 0) {
                                try {
                                    const annRes = await fetch(getApiUrl(`freight-announcements/${announcementId}`), { 
                                        headers,
                                        signal: AbortSignal.timeout(15000) // 15 second timeout
                                    });
                                    if (annRes.ok) {
                                        const annData = await annRes.json();
                                        announcementsMap.set(announcementId, annData);
                                        break;
                                    }
                                } catch (err) {
                                    console.warn(`⚠️ [ZIP_IMAGES] خطا در دریافت اعلام بار ${announcementId}:`, err);
                                    retries--;
                                    if (retries > 0) {
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                    }
                                }
                                retries--;
                            }
                        }
                    }));

                    // تولید HTML صورتحساب
                    const invoiceLayout = InvoiceLayoutType.STANDARD_ACCOUNTING;
                    const htmlContent = renderInvoiceHTML(record, calculationsArray, announcementsMap, calcDateFrom, calcDateTo, invoiceLayout);
                    
                    // ایجاد div موقت برای render کردن HTML - با margin و padding ثابت برای همه
                    const tempDiv = document.createElement('div');
                    tempDiv.id = `temp-invoice-image-${i}`;
                    tempDiv.style.position = 'fixed';
                    tempDiv.style.top = '0';
                    tempDiv.style.left = '0';
                    tempDiv.style.width = '1200px'; // عرض ثابت برای همه
                    tempDiv.style.maxWidth = '1200px';
                    tempDiv.style.height = 'auto';
                    tempDiv.style.minHeight = '800px';
                    tempDiv.style.backgroundColor = '#ffffff';
                    tempDiv.style.padding = '40px'; // padding ثابت برای همه
                    tempDiv.style.margin = '0'; // margin ثابت
                    tempDiv.style.boxSizing = 'border-box';
                    tempDiv.style.overflow = 'visible';
                    tempDiv.style.zIndex = '999999';
                    tempDiv.style.visibility = 'visible';
                    tempDiv.style.opacity = '1'; // باید 1 باشد تا html2canvas بتواند ببیند
                    tempDiv.style.pointerEvents = 'none';
                    tempDiv.style.display = 'flex';
                    tempDiv.style.flexDirection = 'column';
                    tempDiv.style.alignItems = 'center';
                    tempDiv.style.justifyContent = 'flex-start';
                    // قرار دادن خارج از viewport اما قابل مشاهده برای html2canvas
                    tempDiv.style.left = '-9999px';
                    tempDiv.style.top = '0';
                    document.body.appendChild(tempDiv);
                    
                    tempDiv.innerHTML = htmlContent;
                    
                    // بررسی اینکه محتوا اضافه شده است
                    if (!tempDiv.innerHTML || tempDiv.innerHTML.length < 100) {
                        console.error(`❌ [ZIP_IMAGES] HTML content is empty for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    // صبر برای render شدن محتوا و لود شدن فونت‌ها
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    // پیدا کردن div اصلی صورتحساب
                    const invoiceDiv = tempDiv.querySelector('div[dir="rtl"]') || tempDiv.querySelector('[data-invoice-ref="true"]') || tempDiv.firstElementChild;
                    
                    if (!invoiceDiv || invoiceDiv === tempDiv) {
                        console.error(`❌ [ZIP_IMAGES] Cannot find invoice div for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    // بررسی اینکه محتوا واقعاً render شده است
                    const hasContent = invoiceDiv.textContent && invoiceDiv.textContent.trim().length > 0;
                    const tables = tempDiv.querySelectorAll('table');
                    const hasTables = tables.length > 0;
                    
                    if (!hasContent || !hasTables) {
                        console.error(`❌ [ZIP_IMAGES] Content not rendered properly for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    // بررسی اینکه همه جداول کامل هستند
                    let allTablesComplete = true;
                    tables.forEach((table, idx) => {
                        const tableEl = table as HTMLElement;
                        const tableHeight = tableEl.scrollHeight || tableEl.offsetHeight;
                        const hasRows = tableEl.querySelectorAll('tr').length > 0;
                        if (!hasRows || tableHeight === 0) {
                            console.warn(`⚠️ [ZIP_IMAGES] Table ${idx + 1} may be incomplete`);
                            allTablesComplete = false;
                        }
                    });
                    
                    console.log(`✅ [ZIP_IMAGES] Content rendered: ${hasContent}, Tables: ${hasTables}, All complete: ${allTablesComplete}`);
                    
                    // اعمال استایل‌های ثابت برای همه تصاویر
                    const invoiceElement = invoiceDiv as HTMLElement;
                    const originalMaxWidth = invoiceElement.style.maxWidth;
                    const originalWidth = invoiceElement.style.width;
                    invoiceElement.style.width = '100%';
                    invoiceElement.style.maxWidth = '1120px'; // 1200px - 80px padding
                    invoiceElement.style.margin = '0 auto';
                    invoiceElement.style.padding = '0';
                    invoiceElement.style.boxSizing = 'border-box';
                    
                    // صبر برای اعمال استایل‌ها
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // بررسی ابعاد واقعی عنصر - برای اطمینان از render کامل
                    // Force reflow برای اطمینان از محاسبه صحیح ابعاد
                    tempDiv.offsetHeight;
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    const actualWidth = tempDiv.scrollWidth || tempDiv.offsetWidth || 1200;
                    let actualHeight = tempDiv.scrollHeight || tempDiv.offsetHeight || 1000;
                    
                    // بررسی ارتفاع همه جداول
                    tables.forEach((table) => {
                        const tableEl = table as HTMLElement;
                        const tableHeight = tableEl.scrollHeight || tableEl.offsetHeight;
                        if (tableHeight > 0) {
                            actualHeight = Math.max(actualHeight, tableHeight + 100);
                        }
                    });
                    
                    // اضافه کردن margin برای اطمینان از render کامل
                    const elementWidth = Math.max(actualWidth, 1200);
                    const elementHeight = Math.max(actualHeight + 200, 1200); // اضافه کردن 200px برای اطمینان از render کامل
                    
                    console.log(`🖼️ [ZIP_IMAGES] Element dimensions: ${elementWidth}x${elementHeight} (actual: ${actualWidth}x${actualHeight})`);
                    
                    if (elementHeight === 0 || actualHeight === 0) {
                        console.error(`❌ [ZIP_IMAGES] Element has zero height for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    // تبدیل به canvas با تنظیمات برای render کامل
                    const canvas = await html2canvas(tempDiv as HTMLElement, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff',
                        width: elementWidth,
                        height: elementHeight,
                        windowWidth: elementWidth,
                        windowHeight: elementHeight,
                        allowTaint: true,
                        removeContainer: false,
                        onclone: (clonedDoc) => {
                            // اضافه کردن style tag برای اطمینان از فرمت یکسان و منظم
                            const styleTag = clonedDoc.createElement('style');
                            styleTag.textContent = `
                                * {
                                    box-sizing: border-box;
                                }
                                body {
                                    margin: 0;
                                    padding: 0;
                                    font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif;
                                }
                                tbody tr td:first-child {
                                    color: #000000 !important;
                                    text-align: right !important;
                                    font-weight: bold !important;
                                }
                                tbody tr td:first-child * {
                                    color: #000000 !important;
                                }
                                tbody tr[style*="background-color: rgb(59, 130, 246)"] td:first-child,
                                tbody tr[style*="background-color: #3b82f6"] td:first-child {
                                    color: #ffffff !important;
                                }
                                table {
                                    font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif !important;
                                    border-collapse: collapse !important;
                                    table-layout: fixed !important;
                                    font-size: 20px !important;
                                    display: table !important;
                                }
                                th {
                                    text-align: center !important;
                                    font-weight: bold !important;
                                    padding: 16px 18px !important;
                                    font-size: 20px !important;
                                }
                                td {
                                    padding: 14px 16px !important;
                                    vertical-align: middle !important;
                                    word-wrap: break-word !important;
                                    line-height: 1.6 !important;
                                    font-size: 18px !important;
                                }
                            `;
                            clonedDoc.head.appendChild(styleTag);
                            
                            // اعمال استایل‌های نهایی در cloned document - فرمت یکسان برای همه
                            const clonedTempDiv = clonedDoc.querySelector(`#temp-invoice-image-${i}`) as HTMLElement;
                            if (clonedTempDiv) {
                                clonedTempDiv.style.width = '1200px';
                                clonedTempDiv.style.maxWidth = '1200px';
                                clonedTempDiv.style.padding = '40px';
                                clonedTempDiv.style.margin = '0';
                                clonedTempDiv.style.display = 'flex';
                                clonedTempDiv.style.flexDirection = 'column';
                                clonedTempDiv.style.alignItems = 'center';
                                clonedTempDiv.style.justifyContent = 'flex-start';
                                clonedTempDiv.style.visibility = 'visible';
                                clonedTempDiv.style.opacity = '1';
                                clonedTempDiv.style.position = 'relative';
                                clonedTempDiv.style.left = '0';
                                clonedTempDiv.style.top = '0';
                            }
                            
                            const clonedInvoice = clonedDoc.querySelector(`#temp-invoice-image-${i} [data-invoice-ref="true"]`) as HTMLElement || 
                                                 clonedDoc.querySelector(`#temp-invoice-image-${i} div[dir="rtl"]`) as HTMLElement;
                            if (clonedInvoice) {
                                clonedInvoice.style.width = '100%';
                                clonedInvoice.style.maxWidth = '1120px';
                                clonedInvoice.style.margin = '0 auto';
                                clonedInvoice.style.padding = '0';
                                clonedInvoice.style.overflow = 'visible';
                                clonedInvoice.style.visibility = 'visible';
                                clonedInvoice.style.opacity = '1';
                                clonedInvoice.style.setProperty('opacity', '1', 'important');
                                clonedInvoice.style.boxSizing = 'border-box';
                                
                                // اطمینان از اینکه همه عناصر داخل قابل مشاهده هستند
                                const allElements = clonedInvoice.querySelectorAll('*');
                                allElements.forEach((el) => {
                                    const elEl = el as HTMLElement;
                                    if (elEl.style.opacity === '0') {
                                        elEl.style.opacity = '1';
                                    }
                                    if (elEl.style.visibility === 'hidden') {
                                        elEl.style.visibility = 'visible';
                                    }
                                });
                                
                                // اعمال استایل‌های جدول - فرمت یکسان و منظم
                                const clonedTables = clonedInvoice.querySelectorAll('table');
                                clonedTables.forEach((table) => {
                                    const tableEl = table as HTMLElement;
                                    tableEl.style.width = '100%';
                                    tableEl.style.maxWidth = '100%';
                                    tableEl.style.margin = '0 auto 20px auto';
                                    tableEl.style.tableLayout = 'fixed';
                                    tableEl.style.borderCollapse = 'collapse';
                                    tableEl.style.fontSize = '20px'; // فونت بزرگتر
                                    tableEl.style.setProperty('font-size', '20px', 'important');
                                    tableEl.style.fontFamily = 'Vazirmatn, Tahoma, Arial, sans-serif';
                                    tableEl.style.boxSizing = 'border-box';
                                    tableEl.style.display = 'table'; // اطمینان از نمایش کامل
                                    
                                    // اعمال استایل‌های سلول‌ها برای منظم بودن - padding بیشتر
                                    const allCells = tableEl.querySelectorAll('td, th');
                                    allCells.forEach((cell) => {
                                        const cellEl = cell as HTMLElement;
                                        cellEl.style.boxSizing = 'border-box';
                                        cellEl.style.padding = '14px 16px'; // padding بیشتر برای فاصله از border
                                        cellEl.style.setProperty('padding', '14px 16px', 'important');
                                        cellEl.style.verticalAlign = 'middle';
                                        cellEl.style.wordWrap = 'break-word';
                                        cellEl.style.overflow = 'hidden';
                                        cellEl.style.lineHeight = '1.6'; // فاصله خطوط
                                        
                                        // تنظیم text-align بر اساس نوع محتوا - فونت بزرگتر
                                        if (cellEl.tagName === 'TH') {
                                            cellEl.style.textAlign = 'center';
                                            cellEl.style.setProperty('text-align', 'center', 'important');
                                            cellEl.style.fontWeight = 'bold';
                                            cellEl.style.fontSize = '20px'; // فونت بزرگتر
                                            cellEl.style.setProperty('font-size', '20px', 'important');
                                            cellEl.style.padding = '16px 18px'; // padding بیشتر
                                            cellEl.style.setProperty('padding', '16px 18px', 'important');
                                        } else {
                                            // برای td ها: اگر عدد است center، اگر متن است right
                                            const cellText = (cellEl.textContent || '').trim();
                                            const isNumber = /^[\d,\-]+$/.test(cellText.replace(/[^\d,\-]/g, ''));
                                            cellEl.style.fontSize = '18px'; // فونت بزرگتر
                                            cellEl.style.setProperty('font-size', '18px', 'important');
                                            cellEl.style.padding = '14px 16px';
                                            cellEl.style.setProperty('padding', '14px 16px', 'important');
                                            if (isNumber || cellText === '-') {
                                                cellEl.style.textAlign = 'center';
                                                cellEl.style.setProperty('text-align', 'center', 'important');
                                            } else {
                                                cellEl.style.textAlign = 'right';
                                                cellEl.style.setProperty('text-align', 'right', 'important');
                                            }
                                        }
                                    });
                                    
                                    // اطمینان از اینکه هدر جدول رنگ سفید دارد و منظم است
                                    const theadRows = tableEl.querySelectorAll('thead tr');
                                    theadRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        const rowBg = rowEl.style.backgroundColor || window.getComputedStyle(rowEl).backgroundColor;
                                        if (rowBg.includes('rgb(30, 64, 175)') || rowBg.includes('#1e40af')) {
                                            const headerCells = rowEl.querySelectorAll('th');
                                            headerCells.forEach((th) => {
                                                const thEl = th as HTMLElement;
                                                thEl.style.color = '#ffffff';
                                                thEl.style.setProperty('color', '#ffffff', 'important');
                                                thEl.style.textAlign = 'center';
                                                thEl.style.setProperty('text-align', 'center', 'important');
                                                thEl.style.fontWeight = 'bold';
                                                thEl.style.fontSize = '20px'; // فونت بزرگتر
                                                thEl.style.setProperty('font-size', '20px', 'important');
                                                thEl.style.padding = '16px 18px';
                                                thEl.style.setProperty('padding', '16px 18px', 'important');
                                            });
                                        }
                                    });
                                    
                                    // اطمینان از اینکه سلول‌های ستون دسته‌بندی رنگ مشکی دارند و منظم هستند
                                    const tbodyRows = tableEl.querySelectorAll('tbody tr');
                                    tbodyRows.forEach((row) => {
                                        const rowEl = row as HTMLElement;
                                        const firstCell = rowEl.querySelector('td:first-child') as HTMLElement;
                                        if (firstCell) {
                                            const cellText = (firstCell.textContent || '').trim();
                                            const rowBg = rowEl.style.backgroundColor || window.getComputedStyle(rowEl).backgroundColor;
                                            const isTotalRow = cellText.includes('جمع کل') || rowBg.includes('rgb(59, 130, 246)') || rowBg.includes('#3b82f6');
                                            if (!isTotalRow && cellText.length > 0) {
                                                firstCell.style.color = '#000000';
                                                firstCell.style.setProperty('color', '#000000', 'important');
                                                firstCell.style.textAlign = 'right';
                                                firstCell.style.fontWeight = 'bold';
                                            }
                                        }
                                        
                                        // تنظیم text-align برای همه سلول‌های ردیف
                                        const cells = rowEl.querySelectorAll('td');
                                        cells.forEach((cell, cellIdx) => {
                                            const cellEl = cell as HTMLElement;
                                            const cellText = (cellEl.textContent || '').trim();
                                            const isNumber = /^[\d,\-]+$/.test(cellText.replace(/[^\d,\-]/g, ''));
                                            
                                            // ستون اول (دسته‌بندی): right
                                            if (cellIdx === 0) {
                                                cellEl.style.textAlign = 'right';
                                                cellEl.style.setProperty('text-align', 'right', 'important');
                                            }
                                            // ستون آخر (مبلغ کل): center برای اعداد
                                            else if (cellIdx === cells.length - 1) {
                                                const align = isNumber || cellText === '-' ? 'center' : 'right';
                                                cellEl.style.textAlign = align;
                                                cellEl.style.setProperty('text-align', align, 'important');
                                            }
                                            // ستون‌های میانی: center برای اعداد، right برای متن
                                            else {
                                                const align = isNumber || cellText === '-' ? 'center' : 'right';
                                                cellEl.style.textAlign = align;
                                                cellEl.style.setProperty('text-align', align, 'important');
                                            }
                                            
                                            // اطمینان از padding و font size
                                            cellEl.style.padding = '14px 16px';
                                            cellEl.style.setProperty('padding', '14px 16px', 'important');
                                            cellEl.style.fontSize = '18px';
                                            cellEl.style.setProperty('font-size', '18px', 'important');
                                            cellEl.style.lineHeight = '1.6';
                                        });
                                    });
                                    
                                    // اطمینان از اینکه جدول کامل render می‌شود
                                    tableEl.style.display = 'table';
                                    tableEl.style.visibility = 'visible';
                                    tableEl.style.opacity = '1';
                                });
                                
                                // تنظیم رنگ برای سلول‌های "مبلغ کل"
                                const totalAmountCells = clonedInvoice.querySelectorAll('td[data-total-amount="true"]');
                                totalAmountCells.forEach((cell) => {
                                    const cellEl = cell as HTMLElement;
                                    const cellBg = cellEl.style.backgroundColor || window.getComputedStyle(cellEl).backgroundColor;
                                    const isTotalRow = cellBg.includes('rgb(59, 130, 246)') || cellBg.includes('#3b82f6');
                                    if (isTotalRow) {
                                        cellEl.style.color = '#ffffff';
                                        cellEl.style.setProperty('color', '#ffffff', 'important');
                                    } else {
                                        cellEl.style.color = '#1e293b';
                                        cellEl.style.setProperty('color', '#1e293b', 'important');
                                    }
                                });
                            }
                        }
                    });
                    
                    // بررسی اینکه canvas خالی نیست
                    if (!canvas || canvas.width === 0 || canvas.height === 0) {
                        console.error(`❌ [ZIP_IMAGES] Canvas is empty for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    console.log(`🖼️ [ZIP_IMAGES] Canvas size: ${canvas.width}x${canvas.height}`);
                    
                    // تبدیل به PNG
                    const imgData = canvas.toDataURL('image/png', 1.0);
                    
                    if (!imgData || imgData.length < 100) {
                        console.error(`❌ [ZIP_IMAGES] Image data is too small for ${record.driverName}`);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                    
                    // بازگرداندن استایل‌های اصلی
                    invoiceElement.style.maxWidth = originalMaxWidth;
                    invoiceElement.style.width = originalWidth;
                    invoiceElement.style.margin = '';
                    
                    // حذف div موقت
                    document.body.removeChild(tempDiv);
                    
                    // اضافه کردن تصویر به ZIP - استفاده از blob به جای base64
                    const base64Data = imgData.split(',')[1];
                    if (!base64Data || base64Data.length < 100) {
                        console.error(`❌ [ZIP_IMAGES] Base64 data is invalid for ${record.driverName}`);
                        continue;
                    }
                    
                    // تبدیل base64 به binary string برای JSZip
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let j = 0; j < binaryString.length; j++) {
                        bytes[j] = binaryString.charCodeAt(j);
                    }
                    
                    const fileName = `صورتحساب_${record.driverName}_${record.employeeId}_${record.paymentDate.replace(/\//g, '-')}.png`;
                    zip.file(fileName, bytes);
                    successCount++;
                    
                    console.log(`✅ [ZIP_IMAGES] تصویر ${i + 1} اضافه شد: ${fileName} (${bytes.length} bytes)`);
                } catch (err: any) {
                    failCount++;
                    console.error(`❌ [ZIP_IMAGES] Error processing record ${i + 1}:`, err);
                    // ادامه به رکورد بعدی
                }
            }
            
            // بررسی اینکه آیا فایلی به ZIP اضافه شده است
            const fileCount = Object.keys(zip.files).length;
            console.log(`🖼️ [ZIP_IMAGES] Total files in ZIP: ${fileCount}, Success: ${successCount}, Failed: ${failCount}`);
            
            if (fileCount === 0) {
                alert('هیچ تصویری تولید نشد. لطفاً مطمئن شوید که محاسبات و اعلان‌ها موجود هستند.');
                return;
            }
            
            // تولید و دانلود فایل ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            console.log(`🖼️ [ZIP_IMAGES] ZIP blob size: ${zipBlob.size} bytes`);
            
            if (zipBlob.size === 0) {
                alert('فایل ZIP خالی است. لطفاً دوباره تلاش کنید.');
                return;
            }
            
            const zipUrl = URL.createObjectURL(zipBlob);
            const zipLink = document.createElement('a');
            zipLink.download = `صورتحساب_های_پرداخت_شده_${new Date().toISOString().split('T')[0]}.zip`;
            zipLink.href = zipUrl;
            zipLink.click();
            URL.revokeObjectURL(zipUrl);
            
            console.log('✅ [ZIP_IMAGES] ZIP file generated and downloaded');
            alert(`فایل ZIP با ${fileCount} تصویر با موفقیت تولید شد.${failCount > 0 ? ` (${failCount} تصویر ناموفق)` : ''}`);
        } catch (err: any) {
            console.error('❌ [ZIP_IMAGES] Error:', err);
            alert(`خطا در تولید ZIP تصاویر: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
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
        // محدود به عرض A4 با حاشیه‌ها (718px = 210mm - 20mm margins)
        const CONTENT_WIDTH_PX = 718; // عرض محتوا در پیکسل
        
        let html = `<div dir="rtl" data-invoice-ref="true" style="width: ${CONTENT_WIDTH_PX}px; max-width: ${CONTENT_WIDTH_PX}px; min-height: 100%; font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif; padding: 0; background-color: #ffffff; box-sizing: border-box; direction: rtl; text-align: right; overflow: hidden; margin: 0 auto;">
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
                <div style="margin-bottom: 20px; width: 100%; max-width: ${CONTENT_WIDTH_PX}px; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;">
                    <h3 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 10px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; font-family: 'Vazirmatn', Arial, sans-serif; width: 100%; box-sizing: border-box; overflow: hidden;">
                        هزینه‌های راننده اصلی
                    </h3>
                    <div style="width: 100%; max-width: ${CONTENT_WIDTH_PX}px; margin: 0 auto; display: block; box-sizing: border-box; overflow-x: auto; overflow-y: visible;">
                        <table style="font-size: 14px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: fixed; width: 100%; max-width: ${CONTENT_WIDTH_PX}px; margin: 0 auto; border-collapse: collapse; border: 2px solid #1e40af; background-color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); box-sizing: border-box;">
                            <thead>
                                <tr style="background-color: #1e40af; color: #ffffff;">
                                    <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 15%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">دسته‌بندی</th>
                                    <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: right; vertical-align: middle; width: 40%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">شرح هزینه / (ریال)</th>
                                    <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 22%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">مبلغ واحد / (ریال)</th>
                                    <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 23%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">مبلغ کل / (ریال)</th>
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

                // ردیف‌های اطلاعات اولیه - محدود شده برای A4
                initialInfoRows.forEach((infoRow, infoIdx) => {
                    const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                    const isFirstInCategory = infoIdx === 0;
                
                html += `
                        <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'};">
                            ${isFirstInCategory ? `<td rowspan="${initialInfoRows.length}" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'}; box-sizing: border-box; overflow: hidden; word-wrap: break-word;" class="category-cell">اطلاعات اولیه</td>` : ''}
                            <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">${infoRow.label}</td>
                            <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word; white-space: nowrap;">${infoRow.value}</td>
                            <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155; box-sizing: border-box; overflow: hidden;">-</td>
                    </tr>
                `;
            });

                // ردیف‌های هزینه - محدود شده برای A4
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
                        <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'};">
                            ${isFirstInCategory ? `<td rowspan="${categoryRowSpan}" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'}; box-sizing: border-box; overflow: hidden; word-wrap: break-word;" class="category-cell">${row.category}</td>` : ''}
                            <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">${row.label}</td>
                            <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}</td>
                            <td data-total-amount="true" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: bold; background-color: #f1f5f9; color: #1e293b; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${value > 0 ? value.toLocaleString('fa-IR') : '-'}</td>
                                </tr>
                    `;
                });
            });

            // ردیف جمع کل - محدود شده برای A4
            html += `
                                <tr style="background-color: #3b82f6;">
                                    <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">جمع کل</td>
                                    <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">-</td>
                                    <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">-</td>
                                    <td data-total-amount="true" style="font-size: 13px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${totalMainAll.toLocaleString('fa-IR')}</td>
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
                    <div style="margin-bottom: 20px; width: 100%; max-width: ${CONTENT_WIDTH_PX}px; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;">
                        <h3 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 10px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; font-family: 'Vazirmatn', Arial, sans-serif; width: 100%; box-sizing: border-box; overflow: hidden;">راننده کمکی - کد پرسنلی: ${helperEmployeeId} - ${helperData.name}</h3>
                        <div style="width: 100%; max-width: ${CONTENT_WIDTH_PX}px; margin: 0 auto; display: block; box-sizing: border-box; overflow-x: auto; overflow-y: visible;">
                            <table style="font-size: 14px; font-family: 'Vazirmatn', Arial, sans-serif; table-layout: fixed; width: 100%; max-width: ${CONTENT_WIDTH_PX}px; margin: 0 auto; border-collapse: collapse; border: 2px solid #1e40af; background-color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); box-sizing: border-box;">
                                <thead>
                                    <tr style="background-color: #1e40af; color: #ffffff;">
                                        <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 15%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">دسته‌بندی</th>
                                        <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: right; vertical-align: middle; width: 40%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">شرح هزینه / (ریال)</th>
                                        <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 22%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">مبلغ واحد / (ریال)</th>
                                        <th style="font-size: 12px; font-weight: bold; padding: 8px 6px; border: 1px solid #1e3a8a; text-align: center; vertical-align: middle; width: 23%; color: #ffffff; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">مبلغ کل / (ریال)</th>
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

                    // ردیف‌های اطلاعات اولیه - محدود شده برای A4
                    initialInfoRows.forEach((infoRow, infoIdx) => {
                        const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                        const isFirstInCategory = infoIdx === 0;
                    
                    html += `
                            <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'};">
                                ${isFirstInCategory ? `<td rowspan="${initialInfoRows.length}" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'}; box-sizing: border-box; overflow: hidden; word-wrap: break-word;" class="category-cell">اطلاعات اولیه</td>` : ''}
                                <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">${infoRow.label}</td>
                                <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word; white-space: nowrap;">${infoRow.value}</td>
                                <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155; box-sizing: border-box; overflow: hidden;">-</td>
                        </tr>
                    `;
                });

                    // ردیف‌های هزینه - محدود شده برای A4
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
                            <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'};">
                                ${isFirstInCategory ? `<td rowspan="${categoryRowSpan}" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top; font-weight: bold; color: #000000; background-color: ${isEven ? '#ffffff' : '#f8fafc'}; box-sizing: border-box; overflow: hidden; word-wrap: break-word;" class="category-cell">${row.category}</td>` : ''}
                                <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; vertical-align: middle; font-weight: 600; color: #334155; background-color: transparent; box-sizing: border-box; overflow: hidden; word-wrap: break-word;">${row.label}</td>
                                <td style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: normal; color: #334155; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}</td>
                                <td data-total-amount="true" style="font-size: 11px; padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; font-weight: bold; background-color: #f1f5f9; color: #1e293b; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${value > 0 ? value.toLocaleString('fa-IR') : '-'}</td>
                                    </tr>
                        `;
                    });
                });

                // ردیف جمع کل - محدود شده برای A4
                html += `
                                    <tr style="background-color: #3b82f6;">
                                        <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">جمع کل</td>
                                        <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">-</td>
                                        <td style="font-size: 12px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden;">-</td>
                                        <td data-total-amount="true" style="font-size: 13px; padding: 8px 6px; border: 1px solid #3b82f6; text-align: center; vertical-align: middle; font-weight: bold; background-color: #3b82f6; color: #ffffff; box-sizing: border-box; overflow: hidden; white-space: nowrap;">${helperTotal.toLocaleString('fa-IR')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        });

        // جمع کل نهایی (فقط یک بار در footer) - محدود شده برای A4
        html += `
                <div style="margin-top: 12px; padding: 10px; background-color: #e2e8f0; border-radius: 4px; border: 1px solid #475569; width: 100%; max-width: ${CONTENT_WIDTH_PX}px; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;">
                    <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box; overflow: hidden;">
                            <span style="font-size: 11px; font-weight: bold; color: #1e293b; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">جمع کل هزینه سفر:</span>
                            <span style="font-size: 11px; font-weight: bold; color: #059669; flex: 0 0 auto; direction: rtl; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">${grandTotal.toLocaleString('fa-IR')} ریال</span>
                        </div>
                        ${totalAdvancePayment > 0 ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 6px; width: 100%; box-sizing: border-box; overflow: hidden;">
                                <span style="font-size: 10px; font-weight: 600; color: #1e293b; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">کسور (پیش پرداخت):</span>
                                <span style="font-size: 10px; font-weight: bold; color: #ea580c; flex: 0 0 auto; direction: rtl; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">${totalAdvancePayment.toLocaleString('fa-IR')} ریال</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #475569; padding-top: 6px; margin-top: 6px; width: 100%; box-sizing: border-box; overflow: hidden;">
                                <span style="font-size: 11px; font-weight: bold; color: #1e293b; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">مبلغ قابل پرداخت:</span>
                                <span style="font-size: 11px; font-weight: bold; color: #0284c7; flex: 0 0 auto; direction: rtl; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">${payableAmount.toLocaleString('fa-IR')} ریال</span>
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
                                onClick={exportAllInvoicesToImagesZip}
                                disabled={filteredRecords.length === 0}
                                className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                دانلود ZIP تصاویر
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

