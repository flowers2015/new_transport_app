import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOMServer from 'react-dom/server';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
    convertToInvoiceDataFormatHorizontal, 
    renderInvoiceLayoutHorizontal, 
    exportInvoiceToImage as exportInvoiceToImageHelper,
    PaymentRecord as InvoicePaymentRecord,
    calculateMainDriverCostGlobal
} from './InvoiceImageHelper';

// Helper function for padding
const pad2 = (n: number): string => n < 10 ? `0${n}` : String(n);

// انواع ساختار صورتحساب
enum InvoiceLayoutType {
    STANDARD_ACCOUNTING = 'standard_accounting', // روش 1: استاندارد حسابداری با سرفصل‌ها
    COMPACT = 'compact', // روش 2: فشرده
    DETAILED = 'detailed', // روش 3: تفصیلی
    HORIZONTAL = 'horizontal', // روش 4: افقی (هر تور یک ردیف)
    TOUR_DETAILS_STYLE = 'tour_details_style', // روش 5: سبک جزئیات تور (هر تور یک ردیف با راننده اصلی و کمکی)
}

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
    advancePayment: number; // کسور (پیش پرداخت)
    payableAmount: number; // مبلغ قابل پرداخت (کل - پیش پرداخت)
    calculationDate: string;
    lastPaymentDate?: string;
    lastPaymentAmount?: number;
    descriptions?: string; // توضیحات خودکار
    announcementId?: string; // شناسه اعلام بار (برای نمایش هر تور به صورت جداگانه)
    calculationId?: string; // شناسه محاسبه (برای نمایش هر تور به صورت جداگانه)
    isHelper?: boolean; // آیا این ردیف برای راننده کمکی است؟
    helperDriverId?: string; // شناسه راننده کمکی (اگر این ردیف برای راننده کمکی است)
    helperEmployeeId?: string; // کد پرسنلی راننده کمکی
}

// ============================================================================
// توابع Render برای انواع مختلف ساختار صورتحساب
// ============================================================================


// تابع محاسبه هزینه‌های راننده کمکی
const calculateHelperDriverCostGlobal = (calc: any): number => {
    const helperAllowance = parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0);
    const helperFoodCost = parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0);
    const helperExcessMissionCost = parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0);
    return helperAllowance + helperFoodCost + helperExcessMissionCost;
};

// ============================================================================
// روش 1: استاندارد حسابداری با سرفصل‌ها
// ============================================================================
const renderInvoiceLayout1 = (
    selectedInvoiceRecord: PaymentRecord,
    invoiceCalculations: any[],
    invoiceAnnouncements: Map<string, any>,
    startDate: string,
    endDate: string
) => {
    // جدا کردن محاسبات با راننده کمکی و بدون راننده کمکی
    const calculationsWithoutHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return !helperId || (helperAllowance + helperFoodCost + helperExcessMissionCost === 0);
    });
    
    const calculationsWithHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return helperId && (helperAllowance + helperFoodCost + helperExcessMissionCost > 0);
    });

    // گروه‌بندی محاسبات با راننده کمکی بر اساس کد پرسنلی راننده کمکی
    const helperCalculationsByEmployeeId = new Map<string, any[]>();
    calculationsWithHelper.forEach((calc: any) => {
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        if (helperEmployeeId) {
            if (!helperCalculationsByEmployeeId.has(helperEmployeeId)) {
                helperCalculationsByEmployeeId.set(helperEmployeeId, []);
            }
            helperCalculationsByEmployeeId.get(helperEmployeeId)!.push(calc);
        }
    });

    // تابع برای ساخت جدول راننده اصلی (روش 1 - استاندارد حسابداری)
    const renderMainDriverTableLayout1 = (calculations: any[], title: string, invoiceAnnouncements: Map<string, any>) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    {title}
                </h3>
                <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
                    <table className="w-full border-collapse mb-3" style={{ fontSize: '11px', fontFamily: 'Vazirmatn, Arial, sans-serif', tableLayout: 'fixed', width: '100%', minWidth: '100%', borderCollapse: 'collapse', border: '2px solid #1e293b' }}>
                        <thead>
                            <tr className="bg-slate-800 text-white" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                <th rowSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '3%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>ردیف</th>
                                <th rowSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '5%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>شماره<br/>بارنامه</th>
                                <th rowSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '7%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>مقاصد</th>
                                <th rowSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '5%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>تاریخ<br/>صدور</th>
                                <th rowSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '5%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>تاریخ<br/>محاسبه</th>
                                <th colSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '6%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>پیمایش<br/>(کیلومتر)</th>
                                <th colSpan={2} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '6%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>ماموریت<br/>(روز)</th>
                                <th colSpan={7} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '24%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>هزینه‌های<br/>مستقیم<br/>(ریال)</th>
                                <th colSpan={5} className="text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '22%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>هزینه‌های<br/>دپو</th>
                                <th rowSpan={2} className="text-center font-semibold" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '6%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell', boxSizing: 'border-box' }}>پیمایش<br/>کل<br/>(کیلومتر)</th>
                                <th rowSpan={2} className="text-center font-semibold" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '7%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell', boxSizing: 'border-box' }}>اجرت<br/>کل تور<br/>(ریال)</th>
                                <th rowSpan={2} className="text-center font-semibold" style={{ fontSize: '15px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '16%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '12px', paddingRight: '12px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell', boxSizing: 'border-box', minWidth: '180px' }}>جمع کل<br/>هزینه<br/>(ریال)</th>
                            </tr>
                            <tr className="bg-slate-800 text-white" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مصوب</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مازاد</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مصوب</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مازاد</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>بارنامه</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>غذا</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>سوخت</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>عوارض</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>بار<br/>برگشتی</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>چندجا<br/>تخلیه</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>ماموریت<br/>مازاد</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>تعداد</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>ماموریت<br/>(روز)</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>پیمایش<br/>(کیلومتر)</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>جابجایی<br/>بار<br/>(ریال)</th>
                                <th className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>حق<br/>ماموریت<br/>(ریال)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calculations.map((calc, idx) => {
                                const announcementId = calc.announcement_id || calc.announcementId;
                                const announcement = invoiceAnnouncements.get(announcementId);
                                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                const mainCost = calculateMainDriverCostGlobal(calc);
                                
                                // بررسی نوع اجرت (پورسانت یا اجرت ثابت)
                                const queueType = calc.queue_type || calc.queueType || 'porsant';
                                const isFixedAllowance = queueType === 'fixed_allowance';
                                const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
                                const tourCost = parseFloat(calc.tour_cost || calc.tourCost || 0);
                                
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
                                
                                return (
                                    <tr key={calc.id || idx} className="border-b border-slate-300">
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{(idx + 1).toLocaleString('fa-IR')}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{destinations}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                    ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                    : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                : '-'}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {calc.calculation_date || calc.calculationDate || '-'}
                                        </td>
                                        {/* پیمایش */}
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {approvedKm.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {excessKm.toLocaleString('fa-IR')}
                                        </td>
                                        {/* ماموریت */}
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* هزینه‌های مستقیم */}
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.return_cargo_cost || calc.returnCargoCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.multi_unload_cost || calc.multiUnloadCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.excess_mission_cost || calc.excessMissionCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* هزینه‌های دپو */}
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {depotShipmentCount.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {depotMissionDays.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {depotTotalMileage.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {depotCargoHandling.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {depotMissionCost.toLocaleString('fa-IR')}
                                        </td>
                                        {/* پیمایش کل */}
                                        <td className="text-center font-semibold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', boxSizing: 'border-box' }}>
                                            {totalMileage.toLocaleString('fa-IR')}
                                        </td>
                                        {/* اجرت کل تور (فقط برای اجرت ثابت) */}
                                        <td className="text-center font-semibold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', boxSizing: 'border-box' }}>
                                            {isFixedAllowance ? fixedAllowance.toLocaleString('fa-IR') : '-'}
                                        </td>
                                        {/* جمع کل هزینه */}
                                        <td className="text-center font-semibold" style={{ fontSize: '15px', whiteSpace: 'nowrap', lineHeight: '1.7', padding: '14px 12px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', boxSizing: 'border-box', minWidth: '180px', overflow: 'visible' }}>
                                            {mainCost.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold">
                                <td colSpan={5} className="p-1 border border-slate-300 text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    جمع کل سراسری:
                                </td>
                                {/* جمع کل پیمایش */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_kilometers || calc.excessKilometers || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل ماموریت */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.approved_mission_days || calc.approvedMissionDays || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_mission_days || calc.excessMissionDays || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل هزینه‌های مستقیم */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.food_cost || calc.foodCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.fuel_cost || calc.fuelCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.toll_cost || calc.tollCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل هزینه‌های دپو */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    {calculations.reduce((sum, calc) => sum + (parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0)), 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل پیمایش کل */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold', boxSizing: 'border-box' }}>
                                    {calculations.reduce((sum, calc) => {
                                        const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
                                        const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
                                        const depotKm = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
                                        return sum + approvedKm + excessKm + depotKm;
                                    }, 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل اجرت تور */}
                                <td className="text-center font-bold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold', boxSizing: 'border-box' }}>
                                    {calculations.reduce((sum, calc) => {
                                        const queueType = calc.queue_type || calc.queueType || 'porsant';
                                        if (queueType === 'fixed_allowance') {
                                            return sum + (parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0));
                                        }
                                        return sum;
                                    }, 0).toLocaleString('fa-IR')}
                                </td>
                                {/* جمع کل هزینه */}
                                <td className="text-center font-bold" style={{ fontSize: '15px', whiteSpace: 'nowrap', lineHeight: '1.7', padding: '14px 12px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f1f5f9', fontWeight: 'bold', boxSizing: 'border-box', minWidth: '180px', overflow: 'visible' }}>
                                    {(() => {
                                        const total = calculations.reduce((sum, calc) => {
                                            return sum + calculateMainDriverCostGlobal(calc);
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

    // تابع برای ساخت جدول راننده اصلی با ساختار ستونی (هزینه‌ها در ردیف، بارنامه‌ها در ستون)
    const renderMainDriverTableLayoutVertical = (calculations: any[], title: string, invoiceAnnouncements: Map<string, any>) => {
        if (calculations.length === 0) return null;

        // تعریف ردیف‌های هزینه با دسته‌بندی: دسته‌بندی | شرح | مبلغ واحد | مبلغ کل
        const costRows = [
            // هزینه‌های مستقیم
            { 
                key: 'bill_of_lading', 
                category: 'هزینه‌های مستقیم',
                label: 'بارنامه', 
                getValue: (calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.bill_of_lading_cost || c.billOfLadingCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0)
            },
            { 
                key: 'food', 
                category: 'هزینه‌های مستقیم',
                label: 'غذا', 
                getValue: (calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.food_cost || c.foodCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0)
            },
            { 
                key: 'fuel', 
                category: 'هزینه‌های مستقیم',
                label: 'سوخت', 
                getValue: (calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.fuel_cost || c.fuelCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0)
            },
            { 
                key: 'toll', 
                category: 'هزینه‌های مستقیم',
                label: 'عوارض', 
                getValue: (calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.toll_cost || c.tollCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0)
            },
            { 
                key: 'return_cargo', 
                category: 'هزینه‌های مستقیم',
                label: 'بار برگشتی', 
                getValue: (calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.return_cargo_cost || c.returnCargoCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0)
            },
            { 
                key: 'multi_unload', 
                category: 'هزینه‌های مستقیم',
                label: 'چندجا تخلیه', 
                getValue: (calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.multi_unload_cost || c.multiUnloadCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0)
            },
            { 
                key: 'excess_mission', 
                category: 'هزینه‌های مستقیم',
                label: 'ماموریت مازاد', 
                getValue: (calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.excess_mission_cost || c.excessMissionCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0)
            },
            // هزینه‌های دپو
            { 
                key: 'depot_shipment_count', 
                category: 'هزینه‌های دپو',
                label: 'تعداد بار دپو', 
                getValue: (calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_shipment_count || c.depotShipmentCount || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0)
            },
            { 
                key: 'depot_mission_days', 
                category: 'هزینه‌های دپو',
                label: 'ماموریت دپو (روز)', 
                getValue: (calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_mission_days || c.depotMissionDays || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0)
            },
            { 
                key: 'depot_total_mileage', 
                category: 'هزینه‌های دپو',
                label: 'پیمایش دپو (کیلومتر)', 
                getValue: (calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_total_mileage || c.depotTotalMileage || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0)
            },
            { 
                key: 'depot_cargo_handling', 
                category: 'هزینه‌های دپو',
                label: 'جابجایی بار دپو', 
                getValue: (calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_cargo_handling_cost || c.depotCargoHandlingCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0)
            },
            { 
                key: 'depot_mission', 
                category: 'هزینه‌های دپو',
                label: 'حق ماموریت دپو', 
                getValue: (calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_mission_cost || c.depotMissionCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0)
            },
            { 
                key: 'depot_allowance', 
                category: 'هزینه‌های دپو',
                label: 'اجرت دپو', 
                getValue: (calc: any) => parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0),
                getCount: () => calculations.filter(c => parseFloat(c.depot_kilometer_rate || c.depotKilometerRate || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0)
            },
            // اجرت ثابت
            { 
                key: 'fixed_allowance', 
                category: 'اجرت ثابت',
                label: 'اجرت ثابت', 
                getValue: (calc: any) => {
                    const queueType = calc.queue_type || calc.queueType || 'porsant';
                    return queueType === 'fixed_allowance' ? parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0) : 0;
                },
                getCount: () => calculations.filter(c => {
                    const queueType = c.queue_type || c.queueType || 'porsant';
                    return queueType === 'fixed_allowance' && parseFloat(c.fixed_allowance || c.fixedAllowance || 0) > 0;
                }).length,
                getUnitPrice: (calc: any) => {
                    const queueType = calc.queue_type || calc.queueType || 'porsant';
                    return queueType === 'fixed_allowance' ? parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0) : 0;
                }
            },
            // جمع کل
            { 
                key: 'total', 
                category: 'جمع کل',
                label: 'جمع کل', 
                getValue: (calc: any) => calculateMainDriverCostGlobal(calc), 
                isTotal: true,
                getCount: () => calculations.length,
                getUnitPrice: () => 0
            },
        ];

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-blue-600 pb-2" style={{ 
                    fontSize: '20px', 
                    fontWeight: 'bold',
                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                }}>
                    {title}
                </h3>
                {/* Desktop Table View */}
                <div className="hidden md:block" style={{ maxWidth: '90%', margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                        <table className="border-collapse mb-3" style={{ 
                            fontSize: '18px', 
                            fontFamily: 'Vazirmatn, Arial, sans-serif', 
                            tableLayout: 'auto', 
                            width: 'auto', 
                            margin: '0 auto',
                            borderCollapse: 'collapse', 
                            border: '2px solid #1e40af',
                            backgroundColor: 'white',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '25%',
                                        color: '#ffffff'
                                    }}>
                                        دسته‌بندی
                                    </th>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'right', 
                                        verticalAlign: 'middle',
                                        width: '30%',
                                        color: '#ffffff'
                                    }}>
                                        شرح هزینه / (ریال)
                                    </th>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '22%',
                                        color: '#ffffff'
                                    }}>
                                        مبلغ واحد / (ریال)
                                    </th>
                                    <th style={{ 
                                        fontSize: '20px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '23%',
                                        color: '#ffffff'
                                    }}>
                                        مبلغ کل / (ریال)
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* برای هر محاسبه، ابتدا ردیف اطلاعات اولیه، سپس ردیف‌های هزینه */}
                                {calculations.map((calc, calcIdx) => {
                                    const announcement = invoiceAnnouncements.get(calc.announcement_id || calc.announcementId);
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
                                    
                                    // فیلتر کردن ردیف‌های هزینه که برای این محاسبه مقدار دارند
                                    const relevantCostRows = costRows.filter(row => !row.isTotal && row.getValue(calc) > 0);
                                    
                                    // استخراج فیلدهای اضافی از محاسبات و اعلام بار
                                    const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                                    const vehicleType = announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
                                    const approvedKm = (calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR');
                                    const excessKm = (calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR');
                                    const approvedMissionDays = (calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR');
                                    const excessMissionDays = (calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR');
                                    
                                    // تعریف ردیف‌های اطلاعات اولیه - مطابق با فهرست 10 فیلد
                                    const initialInfoRows = [
                                        { key: 'bill_number', label: 'شماره بارنامه', value: billOfLadingNumber },
                                        { key: 'bill_date', label: 'تاریخ صدور بارنامه', value: billOfLadingDate },
                                        { key: 'destinations', label: 'مقاصد', value: destinations },
                                        { key: 'calc_date', label: 'تاریخ محاسبه', value: calculationDate },
                                        { key: 'vehicle_plate', label: 'پلاک خودرو', value: vehiclePlate },
                                        { key: 'vehicle_type', label: 'نوع خودرو', value: vehicleType },
                                        { key: 'approved_km', label: 'پیمایش مصوب', value: approvedKm },
                                        { key: 'excess_km', label: 'پیمایش مازاد', value: excessKm },
                                        { key: 'approved_mission', label: 'ماموریت مصوب', value: approvedMissionDays },
                                        { key: 'excess_mission', label: 'ماموریت مازاد', value: excessMissionDays }
                                    ];
                                    
                                    // محاسبه تعداد کل ردیف‌ها (اطلاعات اولیه + هزینه‌ها)
                                    const totalRowsCount = initialInfoRows.length + relevantCostRows.length;
                                    
                                    const rows = [];
                                    
                                    // ردیف‌های اطلاعات اولیه
                                    initialInfoRows.forEach((infoRow, infoIdx) => {
                                        const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                                        const isFirstInCategory = infoIdx === 0;
                                        
                                        rows.push(
                                            <tr key={`info-${calcIdx}-${infoRow.key}`} style={{ 
                                                backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                                                height: '50px'
                                            }}>
                                                {isFirstInCategory ? (
                                                    <td rowSpan={initialInfoRows.length} style={{ 
                                                        fontSize: '16px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'right', 
                                                        verticalAlign: 'top',
                                                        fontWeight: 'bold',
                                                        color: '#000000',
                                                        backgroundColor: isEven ? '#ffffff' : '#f8fafc'
                                                    }}>
                                                        اطلاعات اولیه
                                                    </td>
                                                ) : null}
                                                <td style={{ 
                                                    fontSize: '16px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'right', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {infoRow.label}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '16px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {infoRow.value}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'normal',
                                                    color: '#334155'
                                                }}>
                                                    -
                                                </td>
                                            </tr>
                                        );
                                    });
                                    
                                    // ردیف‌های هزینه
                                    relevantCostRows.forEach((row, rowIdx) => {
                                        const value = row.getValue(calc);
                                        const unitPrice = row.getUnitPrice(calc);
                                        const isEven = (calcIdx + rowIdx) % 2 === 0;
                                        
                                        // بررسی اینکه آیا این اولین ردیف در این دسته‌بندی برای این محاسبه است
                                        const isFirstInCategory = rowIdx === 0 || relevantCostRows[rowIdx - 1].category !== row.category;
                                        
                                        // محاسبه rowSpan برای merge کردن دسته‌بندی‌های یکسان
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
                                        
                                        rows.push(
                                            <tr key={`calc-${calcIdx}-${row.key}`} style={{ 
                                                backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                                                height: '50px'
                                            }}>
                                                {isFirstInCategory ? (
                                                    <td rowSpan={categoryRowSpan} style={{ 
                                                        fontSize: '16px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'right', 
                                                        verticalAlign: 'top',
                                                        fontWeight: 'bold',
                                                        color: '#000000',
                                                        backgroundColor: isEven ? '#ffffff' : '#f8fafc'
                                                    }}>
                                                        {row.category}
                                                    </td>
                                                ) : null}
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {row.label}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'normal',
                                                    color: '#334155'
                                                }}>
                                                    {unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}
                                                </td>
                                                <td 
                                                    data-total-amount="true"
                                                    style={{ 
                                                        fontSize: '20px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'center', 
                                                        verticalAlign: 'middle',
                                                        fontWeight: 'bold',
                                                        backgroundColor: '#f1f5f9',
                                                        color: '#1e293b'
                                                    }}>
                                                    {value > 0 ? value.toLocaleString('fa-IR') : '-'}
                                                </td>
                                            </tr>
                                        );
                                    });
                                    
                                    return rows;
                                }).flat()}
                                {/* ردیف جمع کل */}
                                {(() => {
                                    const total = calculations.reduce((sum, calc) => sum + calculateMainDriverCostGlobal(calc), 0);
                                    return (
                                        <tr style={{ 
                                            backgroundColor: '#3b82f6',
                                            height: '50px'
                                        }}>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                جمع کل
                                            </td>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                -
                                            </td>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                -
                                            </td>
                                            <td 
                                                data-total-amount="true"
                                                style={{ 
                                                    fontSize: '24px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #3b82f6', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'bold',
                                                    backgroundColor: '#3b82f6',
                                                    color: '#ffffff'
                                                }}>
                                                {total.toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {costRows.map((row, rowIdx) => {
                        const total = calculations.reduce((sum, calc) => sum + row.getValue(calc), 0);
                        const count = row.getCount();
                        const avgUnitPrice = count > 0 ? total / count : 0;
                        
                        return (
                            <div key={row.key} style={{
                                backgroundColor: row.isTotal ? '#3b82f6' : 'white',
                                border: '2px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '12px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ 
                                    fontSize: '16px', 
                                    fontWeight: '500',
                                    marginBottom: '4px',
                                    color: '#64748b',
                                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                                }}>
                                    {row.isTotal ? '' : row.category}
                                </div>
                                <div style={{ 
                                    fontSize: row.isTotal ? '20px' : '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '8px',
                                    color: row.isTotal ? '#ffffff' : '#334155',
                                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                                }}>
                                    {row.label}
                                </div>
                                <div className="grid grid-cols-2 gap-2" style={{ fontSize: '16px', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '14px' }}>مبلغ واحد</div>
                                        <div style={{ fontWeight: '600' }}>{row.isTotal ? '-' : (avgUnitPrice > 0 ? avgUnitPrice.toLocaleString('fa-IR') : '-')}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '14px' }}>مبلغ کل</div>
                                        <div style={{ fontWeight: 'bold', fontSize: '20px', color: row.isTotal ? '#ffffff' : '#1e293b' }}>
                                            {total > 0 || row.isTotal ? total.toLocaleString('fa-IR') : '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // تابع برای ساخت جدول راننده کمکی با ساختار جدید
    const renderHelperDriverTableLayoutVertical = (calculations: any[], helperEmployeeId: string, helperName: string, invoiceAnnouncements: Map<string, any>) => {
        if (calculations.length === 0) return null;

        // تعریف ردیف‌های هزینه برای راننده کمکی با دسته‌بندی
        const costRows = [
            { 
                key: 'helper_allowance', 
                category: 'هزینه‌های مستقیم',
                label: 'اجرت راننده کمکی', 
                getValue: (calc: any) => parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0),
                getCount: () => calculations.filter(c => parseFloat(c.helper_driver_allowance || c.helperDriverAllowance || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0)
            },
            { 
                key: 'helper_food', 
                category: 'هزینه‌های مستقیم',
                label: 'غذای راننده کمکی', 
                getValue: (calc: any) => parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.helper_driver_food_cost || c.helperDriverFoodCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0)
            },
            { 
                key: 'helper_excess_mission', 
                category: 'هزینه‌های مستقیم',
                label: 'ماموریت مازاد راننده کمکی', 
                getValue: (calc: any) => parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0),
                getCount: () => calculations.filter(c => parseFloat(c.helper_driver_excess_mission_cost || c.helperDriverExcessMissionCost || 0) > 0).length,
                getUnitPrice: (calc: any) => parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0)
            },
            { 
                key: 'total', 
                category: 'جمع کل',
                label: 'جمع کل', 
                getValue: (calc: any) => calculateHelperDriverCostGlobal(calc), 
                isTotal: true,
                getCount: () => calculations.length,
                getUnitPrice: () => 0
            },
        ];

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-blue-600 pb-2" style={{ 
                    fontSize: '20px', 
                    fontWeight: 'bold',
                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                }}>
                    راننده کمکی - کد پرسنلی: {helperEmployeeId} - {helperName}
                </h3>
                {/* Desktop Table View */}
                <div className="hidden md:block" style={{ maxWidth: '90%', margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                        <table className="border-collapse mb-3" style={{ 
                            fontSize: '18px', 
                            fontFamily: 'Vazirmatn, Arial, sans-serif', 
                            tableLayout: 'auto', 
                            width: 'auto', 
                            margin: '0 auto',
                            borderCollapse: 'collapse', 
                            border: '2px solid #1e40af',
                            backgroundColor: 'white',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '25%',
                                        color: '#ffffff'
                                    }}>
                                        دسته‌بندی
                                    </th>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'right', 
                                        verticalAlign: 'middle',
                                        width: '30%',
                                        color: '#ffffff'
                                    }}>
                                        شرح هزینه / (ریال)
                                    </th>
                                    <th style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '22%',
                                        color: '#ffffff'
                                    }}>
                                        مبلغ واحد / (ریال)
                                    </th>
                                    <th style={{ 
                                        fontSize: '20px', 
                                        fontWeight: 'bold', 
                                        padding: '12px 10px', 
                                        border: '1px solid #1e3a8a', 
                                        textAlign: 'center', 
                                        verticalAlign: 'middle',
                                        width: '23%',
                                        color: '#ffffff'
                                    }}>
                                        مبلغ کل / (ریال)
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* برای هر محاسبه، ابتدا ردیف اطلاعات اولیه، سپس ردیف‌های هزینه */}
                                {calculations.map((calc, calcIdx) => {
                                    const announcement = invoiceAnnouncements.get(calc.announcement_id || calc.announcementId);
                                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                    const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '-';
                                    const helperName = calc.helper_driver_name || calc.helperDriverName || '-';
                                    const billOfLadingNumber = calc.bill_of_lading_number || calc.billOfLadingNumber || '-';
                                    const billOfLadingDate = calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                        (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                            ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                            : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate)) : '-';
                                    const calculationDate = calc.calculation_date || calc.calculationDate ? 
                                        (typeof (calc.calculation_date || calc.calculationDate) === 'string' 
                                            ? (calc.calculation_date || calc.calculationDate)
                                            : formatJalali(calc.calculation_date || calc.calculationDate)) : '-';
                                    
                                    // فیلتر کردن ردیف‌های هزینه که برای این محاسبه مقدار دارند
                                    const relevantCostRows = costRows.filter(row => !row.isTotal && row.getValue(calc) > 0);
                                    
                                    // استخراج فیلدهای اضافی از محاسبات و اعلام بار
                                    const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                                    const vehicleType = announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
                                    const approvedKm = (calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR');
                                    const excessKm = (calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR');
                                    const approvedMissionDays = (calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR');
                                    const excessMissionDays = (calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR');
                                    
                                    // تعریف ردیف‌های اطلاعات اولیه برای راننده کمکی - مطابق با فهرست 10 فیلد (به اضافه کد پرسنلی و نام برای راننده کمکی)
                                    const initialInfoRows = [
                                        { key: 'employee_id', label: 'کد پرسنلی', value: helperEmployeeId },
                                        { key: 'name', label: 'نام', value: helperName },
                                        { key: 'bill_number', label: 'شماره بارنامه', value: billOfLadingNumber },
                                        { key: 'bill_date', label: 'تاریخ صدور بارنامه', value: billOfLadingDate },
                                        { key: 'destinations', label: 'مقاصد', value: destinations },
                                        { key: 'calc_date', label: 'تاریخ محاسبه', value: calculationDate },
                                        { key: 'vehicle_plate', label: 'پلاک خودرو', value: vehiclePlate },
                                        { key: 'vehicle_type', label: 'نوع خودرو', value: vehicleType },
                                        { key: 'approved_km', label: 'پیمایش مصوب', value: approvedKm },
                                        { key: 'excess_km', label: 'پیمایش مازاد', value: excessKm },
                                        { key: 'approved_mission', label: 'ماموریت مصوب', value: approvedMissionDays },
                                        { key: 'excess_mission', label: 'ماموریت مازاد', value: excessMissionDays }
                                    ];
                                    
                                    const rows = [];
                                    
                                    // ردیف‌های اطلاعات اولیه
                                    initialInfoRows.forEach((infoRow, infoIdx) => {
                                        const isEven = (calcIdx * 100 + infoIdx) % 2 === 0;
                                        const isFirstInCategory = infoIdx === 0;
                                        
                                        rows.push(
                                            <tr key={`helper-info-${calcIdx}-${infoRow.key}`} style={{ 
                                                backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                                                height: '50px'
                                            }}>
                                                {isFirstInCategory ? (
                                                    <td rowSpan={initialInfoRows.length} style={{ 
                                                        fontSize: '16px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'right', 
                                                        verticalAlign: 'top',
                                                        fontWeight: 'bold',
                                                        color: '#000000',
                                                        backgroundColor: isEven ? '#ffffff' : '#f8fafc'
                                                    }}>
                                                        اطلاعات اولیه
                                                    </td>
                                                ) : null}
                                                <td style={{ 
                                                    fontSize: '16px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'right', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {infoRow.label}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '16px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {infoRow.value}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'normal',
                                                    color: '#334155'
                                                }}>
                                                    -
                                                </td>
                                            </tr>
                                        );
                                    });
                                    
                                    // ردیف‌های هزینه
                                    relevantCostRows.forEach((row, rowIdx) => {
                                        const value = row.getValue(calc);
                                        const unitPrice = row.getUnitPrice(calc);
                                        const isEven = (calcIdx + rowIdx) % 2 === 0;
                                        
                                        // بررسی اینکه آیا این اولین ردیف در این دسته‌بندی برای این محاسبه است
                                        const isFirstInCategory = rowIdx === 0 || relevantCostRows[rowIdx - 1].category !== row.category;
                                        
                                        // محاسبه rowSpan برای merge کردن دسته‌بندی‌های یکسان
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
                                        
                                        rows.push(
                                            <tr key={`helper-calc-${calcIdx}-${row.key}`} style={{ 
                                                backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                                                height: '50px'
                                            }}>
                                                {isFirstInCategory ? (
                                                    <td rowSpan={categoryRowSpan} style={{ 
                                                        fontSize: '16px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'right', 
                                                        verticalAlign: 'top',
                                                        fontWeight: 'bold',
                                                        color: '#000000',
                                                        backgroundColor: isEven ? '#ffffff' : '#f8fafc'
                                                    }}>
                                                        {row.category}
                                                    </td>
                                                ) : null}
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'right', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    backgroundColor: 'transparent'
                                                }}>
                                                    {row.label}
                                                </td>
                                                <td style={{ 
                                                    fontSize: '18px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #cbd5e1', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'normal',
                                                    color: '#334155'
                                                }}>
                                                    {unitPrice > 0 ? unitPrice.toLocaleString('fa-IR') : '-'}
                                                </td>
                                                <td 
                                                    data-total-amount="true"
                                                    style={{ 
                                                        fontSize: '20px', 
                                                        padding: '10px 12px', 
                                                        border: '1px solid #cbd5e1', 
                                                        textAlign: 'center', 
                                                        verticalAlign: 'middle',
                                                        fontWeight: 'bold',
                                                        backgroundColor: '#f1f5f9',
                                                        color: '#1e293b'
                                                    }}>
                                                    {value > 0 ? value.toLocaleString('fa-IR') : '-'}
                                                </td>
                                            </tr>
                                        );
                                    });
                                    
                                    return rows;
                                }).flat()}
                                {/* ردیف جمع کل */}
                                {(() => {
                                    const total = calculations.reduce((sum, calc) => sum + calculateHelperDriverCostGlobal(calc), 0);
                                    return (
                                        <tr style={{ 
                                            backgroundColor: '#3b82f6',
                                            height: '50px'
                                        }}>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                جمع کل
                                            </td>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                -
                                            </td>
                                            <td style={{ 
                                                fontSize: '20px', 
                                                padding: '10px 12px', 
                                                border: '1px solid #3b82f6', 
                                                textAlign: 'center', 
                                                verticalAlign: 'middle',
                                                fontWeight: 'bold',
                                                backgroundColor: '#3b82f6',
                                                color: '#ffffff'
                                            }}>
                                                -
                                            </td>
                                            <td 
                                                data-total-amount="true"
                                                style={{ 
                                                    fontSize: '24px', 
                                                    padding: '10px 12px', 
                                                    border: '1px solid #3b82f6', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    fontWeight: 'bold',
                                                    backgroundColor: '#3b82f6',
                                                    color: '#ffffff'
                                                }}>
                                                {total.toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {costRows.map((row, rowIdx) => {
                        const total = calculations.reduce((sum, calc) => sum + row.getValue(calc), 0);
                        const count = row.getCount();
                        const avgUnitPrice = count > 0 ? total / count : 0;
                        
                        return (
                            <div key={row.key} style={{
                                backgroundColor: row.isTotal ? '#f1f5f9' : 'white',
                                border: '2px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '12px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ 
                                    fontSize: '16px', 
                                    fontWeight: '500',
                                    marginBottom: '4px',
                                    color: '#64748b',
                                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                                }}>
                                    {row.isTotal ? '' : row.category}
                                </div>
                                <div style={{ 
                                    fontSize: row.isTotal ? '20px' : '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '8px',
                                    color: row.isTotal ? '#1e293b' : '#334155',
                                    fontFamily: 'Vazirmatn, Arial, sans-serif'
                                }}>
                                    {row.label}
                                </div>
                                <div className="grid grid-cols-2 gap-2" style={{ fontSize: '16px', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '14px' }}>مبلغ واحد</div>
                                        <div style={{ fontWeight: '600' }}>{row.isTotal ? '-' : (avgUnitPrice > 0 ? avgUnitPrice.toLocaleString('fa-IR') : '-')}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', fontSize: '14px' }}>مبلغ کل</div>
                                        <div style={{ fontWeight: 'bold', fontSize: '20px', color: '#1e293b' }}>
                                            {total > 0 || row.isTotal ? total.toLocaleString('fa-IR') : '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // تابع برای ساخت جدول راننده کمکی (روش 1 - استاندارد حسابداری)
    const renderHelperDriverTableLayout1 = (calculations: any[], helperEmployeeId: string, helperName: string, invoiceAnnouncements: Map<string, any>) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    راننده کمکی - کد پرسنلی: {helperEmployeeId} - {helperName}
                </h3>
                <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
                    <table className="w-full border-collapse mb-3" style={{ fontSize: '14px', fontFamily: 'Vazirmatn, Arial, sans-serif', tableLayout: 'fixed', width: '100%', minWidth: '100%', borderCollapse: 'collapse', border: '2px solid #1e293b' }}>
                        <thead>
                            <tr className="bg-slate-800 text-white" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '3%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>ردیف</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '5%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>کد<br/>پرسنلی</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '8%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>نام و نام<br/>خانوادگی</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '6%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>شماره<br/>بارنامه</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '8%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>مقاصد</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '6%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>تاریخ<br/>صدور</th>
                                <th rowSpan={2} className="border border-slate-600 text-center" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.8', width: '6%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell' }}>تاریخ<br/>محاسبه</th>
                                <th colSpan={2} className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '6%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>پیمایش<br/>(کیلومتر)</th>
                                <th colSpan={2} className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '6%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>ماموریت<br/>(روز)</th>
                                <th colSpan={3} className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '20%', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>هزینه‌های<br/>راننده کمکی<br/>(ریال)</th>
                                <th rowSpan={2} className="text-center font-semibold" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '7%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '8px', paddingRight: '8px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell', boxSizing: 'border-box' }}>پیمایش<br/>مازاد<br/>راننده کمکی</th>
                                <th rowSpan={2} className="text-center font-semibold" style={{ fontSize: '15px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', width: '16%', padding: '0', paddingTop: '15px', paddingBottom: '5px', paddingLeft: '12px', paddingRight: '12px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'top', height: '70px', display: 'table-cell', boxSizing: 'border-box', minWidth: '180px' }}>جمع کل<br/>(ریال)</th>
                            </tr>
                            <tr className="bg-slate-800 text-white" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مصوب</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مازاد</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مصوب</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>مازاد</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>اجرت</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>غذا</th>
                                <th className="p-1 border border-slate-600 text-center align-middle" style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.5', padding: '10px 6px', border: '1px solid #475569', textAlign: 'center', verticalAlign: 'middle' }}>ماموریت<br/>مازاد</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calculations.map((calc, idx) => {
                                const announcementId = calc.announcement_id || calc.announcementId;
                                const announcement = invoiceAnnouncements.get(announcementId);
                                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                const helperCost = calculateHelperDriverCostGlobal(calc);
                                
                                return (
                                    <tr key={calc.id || idx} className="border-b border-slate-300">
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{idx + 1}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{helperEmployeeId}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{helperName}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>{destinations}</td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                    ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                    : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                : '-'}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {calc.calculation_date || calc.calculationDate || '-'}
                                        </td>
                                        {/* پیمایش */}
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* ماموریت */}
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.helper_driver_excess_mission_days || calc.helperDriverExcessMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* هزینه‌های راننده کمکی */}
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="text-center" style={{ fontSize: '13px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* پیمایش مازاد راننده کمکی */}
                                        <td className="text-center font-semibold" style={{ fontSize: '13px', whiteSpace: 'nowrap', lineHeight: '1.6', padding: '12px 10px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', boxSizing: 'border-box' }}>
                                            {(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        {/* جمع کل */}
                                        <td className="text-center font-semibold" style={{ fontSize: '15px', whiteSpace: 'nowrap', lineHeight: '1.7', padding: '14px 12px', border: '1px solid #cbd5e1', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', boxSizing: 'border-box', minWidth: '180px', overflow: 'visible' }}>
                                            {helperCost.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold" style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                <td colSpan={14} className="text-center" style={{ fontSize: '11px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.6', padding: '10px 8px', border: '1px solid #cbd5e1', textAlign: 'center', backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                    جمع کل:
                                </td>
                                <td className="p-1 border border-slate-300 text-center font-bold" style={{ fontSize: '15px', whiteSpace: 'nowrap', lineHeight: '1.7', padding: '14px 12px', border: '1px solid #cbd5e1', textAlign: 'center', backgroundColor: '#f1f5f9', fontWeight: 'bold', minWidth: '180px', overflow: 'visible' }}>
                                    {(() => {
                                        const total = calculations.reduce((sum, calc) => {
                                            return sum + calculateHelperDriverCostGlobal(calc);
                                        }, 0);
                                        return total.toLocaleString('fa-IR');
                                    })} ریال
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    // محاسبه جمع کل نهایی
    const totalMainAll = invoiceCalculations.reduce((sum, calc) => {
        return sum + calculateMainDriverCostGlobal(calc);
    }, 0);
    
    const helperCostsByEmployee = new Map<string, number>();
    invoiceCalculations.forEach((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        const helperTotal = calculateHelperDriverCostGlobal(calc);
        
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
    
    const totalAdvancePayment = invoiceCalculations.reduce((sum, calc) => {
        return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
    }, 0);
    
    const mainDriverPayable = totalMainAll - totalAdvancePayment;
    const payableAmount = mainDriverPayable + totalHelper;

    return (
        <>
            {/* تورهای بدون راننده کمکی */}
            {calculationsWithoutHelper.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <h2 className="text-xl font-bold text-blue-900 mb-4 border-b-2 border-blue-600 pb-2" style={{ fontSize: '22px', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
                        تورهای بدون راننده کمکی
                    </h2>
                    {renderMainDriverTableLayoutVertical(calculationsWithoutHelper, 'هزینه‌های راننده اصلی', invoiceAnnouncements)}
                </div>
            )}
            
            {/* تورهای با راننده کمکی */}
            {calculationsWithHelper.length > 0 && (
                <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                    <h2 className="text-xl font-bold text-green-900 mb-4 border-b-2 border-green-600 pb-2" style={{ fontSize: '22px', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
                        تورهای با راننده کمکی
                    </h2>
                    
                    {/* راننده اصلی برای تورهای با راننده کمکی */}
                    {renderMainDriverTableLayoutVertical(calculationsWithHelper, 'هزینه‌های راننده اصلی', invoiceAnnouncements)}
                    
                    {/* راننده‌های کمکی تفکیک شده بر اساس کد پرسنلی */}
                    {Array.from(helperCalculationsByEmployeeId.entries()).map(([employeeId, calcs]) => {
                        const firstCalc = calcs[0];
                        const helperName = firstCalc.helper_driver_name || firstCalc.helperDriverName || '-';
                        return (
                            <div key={employeeId}>
                                {renderHelperDriverTableLayoutVertical(calcs, employeeId, helperName, invoiceAnnouncements)}
                            </div>
                        );
                    })}
                </div>
            )}
            
            {/* جمع کل نهایی */}
            {invoiceCalculations.length > 0 && (
                <div className="mt-4 p-4 bg-slate-200 rounded-lg border-2 border-slate-600">
                    <div className="space-y-2">
                        <div className="mb-3 pb-3 border-b border-slate-400">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده اصلی:</span>
                                <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                    {totalMainAll.toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                            {totalHelper > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده کمکی:</span>
                                    <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                        {totalHelper.toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>جمع کل هزینه سفر:</span>
                            <span className="text-xl font-bold text-green-700" style={{ fontSize: '18px' }}>
                                {grandTotal.toLocaleString('fa-IR')} ریال
                            </span>
                        </div>
                        {totalAdvancePayment !== 0 && (
                            <div className="flex justify-between items-center border-t border-slate-400 pt-2 mt-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>کسور (پیش پرداخت - فقط از راننده اصلی):</span>
                                <span className="text-lg font-bold text-orange-700" style={{ fontSize: '17px' }}>
                                    {totalAdvancePayment < 0 ? '−' : ''}{Math.abs(totalAdvancePayment).toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center border-t-2 border-slate-600 pt-2 mt-2">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>مبلغ قابل پرداخت:</span>
                            <span className={`text-xl font-bold ${payableAmount < 0 ? 'text-red-700' : 'text-blue-700'}`} style={{ fontSize: '18px' }}>
                                <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                                    {payableAmount < 0 ? '−' : ''}{Math.abs(payableAmount).toLocaleString('fa-IR')} ریال
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ============================================================================
// روش 2: فشرده (بدون سرفصل‌ها - همه ستون‌ها در یک ردیف)
// ============================================================================
const renderInvoiceLayout2 = (
    selectedInvoiceRecord: PaymentRecord,
    invoiceCalculations: any[],
    invoiceAnnouncements: Map<string, any>,
    startDate: string,
    endDate: string
) => {
    // جدا کردن محاسبات با راننده کمکی و بدون راننده کمکی
    const calculationsWithoutHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return !helperId || (helperAllowance + helperFoodCost + helperExcessMissionCost === 0);
    });
    
    const calculationsWithHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return helperId && (helperAllowance + helperFoodCost + helperExcessMissionCost > 0);
    });

    // گروه‌بندی محاسبات با راننده کمکی بر اساس کد پرسنلی راننده کمکی
    const helperCalculationsByEmployeeId = new Map<string, any[]>();
    calculationsWithHelper.forEach((calc: any) => {
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        if (helperEmployeeId) {
            if (!helperCalculationsByEmployeeId.has(helperEmployeeId)) {
                helperCalculationsByEmployeeId.set(helperEmployeeId, []);
            }
            helperCalculationsByEmployeeId.get(helperEmployeeId)!.push(calc);
        }
    });

    // تابع برای ساخت جدول راننده اصلی (روش 2 - فشرده)
    const renderMainDriverTableLayout2 = (calculations: any[], title: string) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    {title}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-800 mb-3" style={{ fontSize: '9px', fontFamily: 'Vazirmatn, Arial, sans-serif', tableLayout: 'auto' }}>
                        <thead>
                            <tr className="bg-slate-800 text-white">
                                <th className="p-1 border border-slate-600 text-center" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ردیف</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>شماره بارنامه</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>مقاصد</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>تاریخ صدور</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>تاریخ محاسبه</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>پیمایش مصوب</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>پیمایش مازاد</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مصوب</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مازاد</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>بارنامه</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>غذا</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>سوخت</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>عوارض</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>بار برگشتی</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>چندجا تخلیه</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مازاد</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>جابجایی دپو</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>اجرت کیلومتر دپو</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>حق ماموریت دپو</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>اجرت تور</th>
                                <th className="p-1 border border-slate-600 text-left font-semibold" style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>جمع کل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calculations.map((calc, idx) => {
                                const announcementId = calc.announcement_id || calc.announcementId;
                                const announcement = invoiceAnnouncements.get(announcementId);
                                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                const mainCost = calculateMainDriverCostGlobal(calc);
                                
                                // بررسی نوع اجرت (پورسانت یا اجرت ثابت)
                                const queueType = calc.queue_type || calc.queueType || 'porsant';
                                const isFixedAllowance = queueType === 'fixed_allowance';
                                const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
                                
                                // هزینه‌های دپو
                                const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
                                const depotAllowance = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
                                const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
                                
                                return (
                                    <tr key={calc.id || idx} className="border-b border-slate-300">
                                        <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '9px' }}>{(idx + 1).toLocaleString('fa-IR')}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>{destinations}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>
                                            {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                    ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                    : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                : '-'}
                                        </td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>
                                            {calc.calculation_date || calc.calculationDate || '-'}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}
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
                                            {depotCargoHandling.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {depotAllowance.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                            {depotMissionCost.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '9px' }}>
                                            {isFixedAllowance ? fixedAllowance.toLocaleString('fa-IR') : '-'}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '9px' }}>
                                            {mainCost.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold">
                                <td colSpan={19} className="p-1 border border-slate-300 text-right" style={{ fontSize: '9px' }}>
                                    جمع کل:
                                </td>
                                <td className="p-1 border border-slate-300 text-left font-bold" style={{ fontSize: '9px' }}>
                                    {(() => {
                                        const total = calculations.reduce((sum, calc) => {
                                            return sum + calculateMainDriverCostGlobal(calc);
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

    // تابع برای ساخت جدول راننده کمکی (روش 2 - فشرده)
    const renderHelperDriverTableLayout2 = (calculations: any[], helperEmployeeId: string, helperName: string) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    راننده کمکی - کد پرسنلی: {helperEmployeeId} - {helperName}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse border border-slate-800 mb-3" style={{ fontSize: '8px' }}>
                        <thead>
                            <tr className="bg-slate-800 text-white">
                                <th className="p-1 border border-slate-600 text-center" style={{ fontSize: '8px' }}>ردیف</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>کد پرسنلی</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>نام</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>شماره بارنامه</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>مقاصد</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>تاریخ صدور</th>
                                <th className="p-1 border border-slate-600" style={{ fontSize: '8px' }}>تاریخ محاسبه</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>پیمایش مصوب</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>پیمایش مازاد</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>ماموریت مصوب</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>ماموریت مازاد</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>اجرت</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>غذا</th>
                                <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '8px' }}>ماموریت مازاد</th>
                                <th className="p-1 border border-slate-600 text-left font-semibold" style={{ fontSize: '8px' }}>جمع کل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calculations.map((calc, idx) => {
                                const announcementId = calc.announcement_id || calc.announcementId;
                                const announcement = invoiceAnnouncements.get(announcementId);
                                const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                const helperCost = calculateHelperDriverCostGlobal(calc);
                                
                                return (
                                    <tr key={calc.id || idx} className="border-b border-slate-300">
                                        <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '8px' }}>{idx + 1}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>{helperEmployeeId}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>{helperName}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>{destinations}</td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>
                                            {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                    ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                    : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                : '-'}
                                        </td>
                                        <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>
                                            {calc.calculation_date || calc.calculationDate || '-'}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {calc.approved_mission_days || calc.approvedMissionDays || 0}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.helper_driver_excess_mission_days || calc.helperDriverExcessMissionDays || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                            {(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}
                                        </td>
                                        <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '8px' }}>
                                            {helperCost.toLocaleString('fa-IR')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold">
                                <td colSpan={15} className="p-1 border border-slate-300 text-right" style={{ fontSize: '8px' }}>
                                    جمع کل:
                                </td>
                                <td className="p-1 border border-slate-300 text-left font-bold" style={{ fontSize: '8px' }}>
                                    {(() => {
                                        const total = calculations.reduce((sum, calc) => {
                                            return sum + calculateHelperDriverCostGlobal(calc);
                                        }, 0);
                                        return total.toLocaleString('fa-IR');
                                    })} ریال
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    // محاسبه جمع کل نهایی
    const totalMainAll = invoiceCalculations.reduce((sum, calc) => {
        return sum + calculateMainDriverCostGlobal(calc);
    }, 0);
    
    const helperCostsByEmployee = new Map<string, number>();
    invoiceCalculations.forEach((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        const helperTotal = calculateHelperDriverCostGlobal(calc);
        
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
    
    const totalAdvancePayment = invoiceCalculations.reduce((sum, calc) => {
        return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
    }, 0);
    
    const mainDriverPayable = totalMainAll - totalAdvancePayment;
    const payableAmount = mainDriverPayable + totalHelper;

    return (
        <>
            {/* تورهای بدون راننده کمکی */}
            {calculationsWithoutHelper.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <h2 className="text-xl font-bold text-blue-900 mb-4 border-b-2 border-blue-600 pb-2">
                        تورهای بدون راننده کمکی
                    </h2>
                    {renderMainDriverTableLayout2(calculationsWithoutHelper, 'هزینه‌های راننده اصلی')}
                </div>
            )}
            
            {/* تورهای با راننده کمکی */}
            {calculationsWithHelper.length > 0 && (
                <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                    <h2 className="text-xl font-bold text-green-900 mb-4 border-b-2 border-green-600 pb-2">
                        تورهای با راننده کمکی
                    </h2>
                    
                    {/* راننده اصلی برای تورهای با راننده کمکی */}
                    {renderMainDriverTableLayout2(calculationsWithHelper, 'هزینه‌های راننده اصلی')}
                    
                    {/* راننده‌های کمکی تفکیک شده بر اساس کد پرسنلی */}
                    {Array.from(helperCalculationsByEmployeeId.entries()).map(([employeeId, calcs]) => {
                        const firstCalc = calcs[0];
                        const helperName = firstCalc.helper_driver_name || firstCalc.helperDriverName || '-';
                        return (
                            <div key={employeeId}>
                                {renderHelperDriverTableLayout2(calcs, employeeId, helperName)}
                            </div>
                        );
                    })}
                </div>
            )}
            
            {/* جمع کل نهایی */}
            {invoiceCalculations.length > 0 && (
                <div className="mt-4 p-4 bg-slate-200 rounded-lg border-2 border-slate-600">
                    <div className="space-y-2">
                        <div className="mb-3 pb-3 border-b border-slate-400">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده اصلی:</span>
                                <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                    {totalMainAll.toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                            {totalHelper > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده کمکی:</span>
                                    <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                        {totalHelper.toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>جمع کل هزینه سفر:</span>
                            <span className="text-xl font-bold text-green-700" style={{ fontSize: '18px' }}>
                                {grandTotal.toLocaleString('fa-IR')} ریال
                            </span>
                        </div>
                        {totalAdvancePayment !== 0 && (
                            <div className="flex justify-between items-center border-t border-slate-400 pt-2 mt-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>کسور (پیش پرداخت - فقط از راننده اصلی):</span>
                                <span className="text-lg font-bold text-orange-700" style={{ fontSize: '17px' }}>
                                    {totalAdvancePayment < 0 ? '−' : ''}{Math.abs(totalAdvancePayment).toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center border-t-2 border-slate-600 pt-2 mt-2">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>مبلغ قابل پرداخت:</span>
                            <span className={`text-xl font-bold ${payableAmount < 0 ? 'text-red-700' : 'text-blue-700'}`} style={{ fontSize: '18px' }}>
                                <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                                    {payableAmount < 0 ? '−' : ''}{Math.abs(payableAmount).toLocaleString('fa-IR')} ریال
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ============================================================================
// روش 3: تفصیلی (با جزئیات کامل و ردیف‌های دپو)
// ============================================================================
const renderInvoiceLayout3 = (
    selectedInvoiceRecord: PaymentRecord,
    invoiceCalculations: any[],
    invoiceAnnouncements: Map<string, any>,
    startDate: string,
    endDate: string
) => {
    // جدا کردن محاسبات با راننده کمکی و بدون راننده کمکی
    const calculationsWithoutHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return !helperId || (helperAllowance + helperFoodCost + helperExcessMissionCost === 0);
    });
    
    const calculationsWithHelper = invoiceCalculations.filter((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        return helperId && (helperAllowance + helperFoodCost + helperExcessMissionCost > 0);
    });

    // گروه‌بندی محاسبات با راننده کمکی بر اساس کد پرسنلی راننده کمکی
    const helperCalculationsByEmployeeId = new Map<string, any[]>();
    calculationsWithHelper.forEach((calc: any) => {
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        if (helperEmployeeId) {
            if (!helperCalculationsByEmployeeId.has(helperEmployeeId)) {
                helperCalculationsByEmployeeId.set(helperEmployeeId, []);
            }
            helperCalculationsByEmployeeId.get(helperEmployeeId)!.push(calc);
        }
    });

    // تابع برای ساخت جدول راننده اصلی (روش 3 - تفصیلی)
    const renderMainDriverTableLayout3 = (calculations: any[], title: string) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    {title}
                </h3>
                
                {calculations.map((calc, idx) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    const announcement = invoiceAnnouncements.get(announcementId);
                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                    const mainCost = calculateMainDriverCostGlobal(calc);
                    
                    // بررسی نوع اجرت
                    const queueType = calc.queue_type || calc.queueType || 'porsant';
                    const isFixedAllowance = queueType === 'fixed_allowance';
                    const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
                    
                    // هزینه‌های دپو
                    const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
                    const depotAllowance = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
                    const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
                    const depotTotalMileage = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
                    const depotMissionDays = parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0);
                    const depotShipmentCount = parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0);
                    
                    // ردیف‌های دپو
                    const depotRows = calc.depot_rows ? (typeof calc.depot_rows === 'string' ? JSON.parse(calc.depot_rows) : calc.depot_rows) : [];
                    
                    return (
                        <div key={calc.id || idx} className="mb-4 p-3 bg-slate-50 border border-slate-300 rounded-lg">
                            {/* هدر تور */}
                            <div className="mb-3 pb-2 border-b border-slate-400">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-slate-800" style={{ fontSize: '14px' }}>
                                            تور {idx + 1}: {calc.bill_of_lading_number || calc.billOfLadingNumber || 'بدون شماره بارنامه'}
                                        </h4>
                                        <p className="text-xs text-slate-600 mt-1">
                                            مقاصد: {destinations} | تاریخ صدور: {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                    ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                    : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                : '-'} | تاریخ محاسبه: {calc.calculation_date || calc.calculationDate || '-'}
                                        </p>
                                    </div>
                                    <div className="text-left">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            isFixedAllowance ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                                        }`}>
                                            {isFixedAllowance ? 'اجرت ثابت' : 'پورسانت'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* جدول جزئیات هزینه‌ها */}
                            <div className="overflow-x-auto mb-3">
                                <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '10px' }}>
                                    <thead>
                                        <tr className="bg-slate-700 text-white">
                                            <th colSpan={2} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>اطلاعات پایه</th>
                                            <th colSpan={2} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>پیمایش (کیلومتر)</th>
                                            <th colSpan={2} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>ماموریت (روز)</th>
                                        </tr>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="p-1 border border-slate-400" style={{ fontSize: '9px' }}>کد خودرو</th>
                                            <th className="p-1 border border-slate-400" style={{ fontSize: '9px' }}>پلاک</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مصوب</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مازاد</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مصوب</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مازاد</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>
                                                {announcement?.assigned_vehicle?.vehicleCode || calc.vehicle_code || '-'}
                                            </td>
                                            <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>
                                                {calc.vehicle_plate || '-'}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* جدول هزینه‌های مستقیم */}
                            <div className="overflow-x-auto mb-3">
                                <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '10px' }}>
                                    <thead>
                                        <tr className="bg-slate-700 text-white">
                                            <th colSpan={7} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>هزینه‌های مستقیم (ریال)</th>
                                        </tr>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>بارنامه</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>غذا</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>سوخت</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>عوارض</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>بار برگشتی</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>چندجا تخلیه</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}
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
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* جدول هزینه‌های دپو */}
                            {(depotTotalMileage > 0 || depotMissionDays > 0 || depotCargoHandling > 0 || depotAllowance > 0 || depotMissionCost > 0) && (
                                <div className="overflow-x-auto mb-3">
                                    <div className="mb-2">
                                        <h5 className="font-semibold text-slate-700" style={{ fontSize: '12px' }}>
                                            هزینه‌های دپو:
                                        </h5>
                                        <p className="text-xs text-slate-600">
                                            پیمایش کل: {depotTotalMileage.toLocaleString('fa-IR')} کیلومتر | 
                                            روز ماموریت: {depotMissionDays.toLocaleString('fa-IR')} روز | 
                                            تعداد بار: {depotShipmentCount.toLocaleString('fa-IR')}
                                        </p>
                                    </div>
                                    <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '10px' }}>
                                        <thead>
                                            <tr className="bg-purple-700 text-white">
                                                <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>جابجایی بار</th>
                                                <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>اجرت کیلومتر</th>
                                                <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>حق ماموریت</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                    {depotCargoHandling.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                    {depotAllowance.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                    {depotMissionCost.toLocaleString('fa-IR')}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    
                                    {/* ردیف‌های دپو */}
                                    {depotRows && depotRows.length > 0 && (
                                        <div className="mt-2">
                                            <h6 className="font-semibold text-slate-600 mb-1" style={{ fontSize: '11px' }}>
                                                جزئیات ردیف‌های دپو:
                                            </h6>
                                            <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '9px' }}>
                                                <thead>
                                                    <tr className="bg-purple-600 text-white">
                                                        <th className="p-1 border border-slate-400 text-center" style={{ fontSize: '8px' }}>ردیف</th>
                                                        <th className="p-1 border border-slate-400" style={{ fontSize: '8px' }}>مقصد</th>
                                                        <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '8px' }}>پیمایش (کیلومتر)</th>
                                                        <th className="p-1 border border-slate-400" style={{ fontSize: '8px' }}>شماره بارنامه</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {depotRows.map((row: any, rowIdx: number) => (
                                                        <tr key={rowIdx}>
                                                            <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '8px' }}>
                                                                {rowIdx + 1}
                                                            </td>
                                                            <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>
                                                                {row.destination || '-'}
                                                            </td>
                                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '8px' }}>
                                                                {(row.mileage || 0).toLocaleString('fa-IR')}
                                                            </td>
                                                            <td className="p-1 border border-slate-300" style={{ fontSize: '8px' }}>
                                                                {row.billOfLadingNumber || row.bill_of_lading_number || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* اجرت تور */}
                            {isFixedAllowance && fixedAllowance > 0 && (
                                <div className="mb-3 p-2 bg-orange-50 border border-orange-300 rounded">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-slate-700" style={{ fontSize: '11px' }}>اجرت تور (اجرت ثابت):</span>
                                        <span className="font-bold text-orange-700" style={{ fontSize: '12px' }}>
                                            {fixedAllowance.toLocaleString('fa-IR')} ریال
                                        </span>
                                    </div>
                                </div>
                            )}
                            
                            {/* جمع کل این تور */}
                            <div className="p-2 bg-green-50 border border-green-300 rounded">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-800" style={{ fontSize: '12px' }}>جمع کل این تور:</span>
                                    <span className="font-bold text-green-700" style={{ fontSize: '13px' }}>
                                        {mainCost.toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                
                {/* جمع کل همه تورها */}
                <div className="mt-4 p-3 bg-slate-200 rounded-lg border-2 border-slate-600">
                    <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-slate-800" style={{ fontSize: '15px' }}>
                            جمع کل {title}:
                        </span>
                        <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                            {(() => {
                                const total = calculations.reduce((sum, calc) => {
                                    return sum + calculateMainDriverCostGlobal(calc);
                                }, 0);
                                return total.toLocaleString('fa-IR');
                            })()} ریال
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    // تابع برای ساخت جدول راننده کمکی (روش 3 - تفصیلی)
    const renderHelperDriverTableLayout3 = (calculations: any[], helperEmployeeId: string, helperName: string) => {
        if (calculations.length === 0) return null;

        return (
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                    راننده کمکی - کد پرسنلی: {helperEmployeeId} - {helperName}
                </h3>
                
                {calculations.map((calc, idx) => {
                    const announcementId = calc.announcement_id || calc.announcementId;
                    const announcement = invoiceAnnouncements.get(announcementId);
                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                    const helperCost = calculateHelperDriverCostGlobal(calc);
                    
                    return (
                        <div key={calc.id || idx} className="mb-4 p-3 bg-slate-50 border border-slate-300 rounded-lg">
                            {/* هدر تور */}
                            <div className="mb-3 pb-2 border-b border-slate-400">
                                <h4 className="font-bold text-slate-800" style={{ fontSize: '14px' }}>
                                    تور {idx + 1}: {calc.bill_of_lading_number || calc.billOfLadingNumber || 'بدون شماره بارنامه'}
                                </h4>
                                <p className="text-xs text-slate-600 mt-1">
                                    مقاصد: {destinations} | تاریخ صدور: {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                        (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                            ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                            : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                        : '-'} | تاریخ محاسبه: {calc.calculation_date || calc.calculationDate || '-'}
                                </p>
                            </div>
                            
                            {/* جدول اطلاعات پایه */}
                            <div className="overflow-x-auto mb-3">
                                <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '10px' }}>
                                    <thead>
                                        <tr className="bg-slate-700 text-white">
                                            <th colSpan={2} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>پیمایش (کیلومتر)</th>
                                            <th colSpan={2} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>ماموریت (روز)</th>
                                        </tr>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مصوب</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مازاد</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مصوب</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>مازاد</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.helper_driver_excess_kilometers || calc.helperDriverExcessKilometers || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {calc.approved_mission_days || calc.approvedMissionDays || 0}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.helper_driver_excess_mission_days || calc.helperDriverExcessMissionDays || 0).toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* جدول هزینه‌های راننده کمکی */}
                            <div className="overflow-x-auto mb-3">
                                <table className="w-full border-collapse border border-slate-400" style={{ fontSize: '10px' }}>
                                    <thead>
                                        <tr className="bg-slate-700 text-white">
                                            <th colSpan={3} className="p-2 border border-slate-400 text-center" style={{ fontSize: '10px', fontWeight: 'bold' }}>هزینه‌های راننده کمکی (ریال)</th>
                                        </tr>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>اجرت</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>غذا</th>
                                            <th className="p-1 border border-slate-400 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                {(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* جمع کل این تور */}
                            <div className="p-2 bg-green-50 border border-green-300 rounded">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-800" style={{ fontSize: '12px' }}>جمع کل این تور:</span>
                                    <span className="font-bold text-green-700" style={{ fontSize: '13px' }}>
                                        {helperCost.toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                
                {/* جمع کل همه تورها */}
                <div className="mt-4 p-3 bg-slate-200 rounded-lg border-2 border-slate-600">
                    <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-slate-800" style={{ fontSize: '15px' }}>
                            جمع کل راننده کمکی ({helperName}):
                        </span>
                        <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                            {(() => {
                                const total = calculations.reduce((sum, calc) => {
                                    return sum + calculateHelperDriverCostGlobal(calc);
                                }, 0);
                                return total.toLocaleString('fa-IR');
                            })} ریال
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    // محاسبه جمع کل نهایی
    const totalMainAll = invoiceCalculations.reduce((sum, calc) => {
        return sum + calculateMainDriverCostGlobal(calc);
    }, 0);
    
    const helperCostsByEmployee = new Map<string, number>();
    invoiceCalculations.forEach((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        const helperTotal = calculateHelperDriverCostGlobal(calc);
        
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
    
    const totalAdvancePayment = invoiceCalculations.reduce((sum, calc) => {
        return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
    }, 0);
    
    const mainDriverPayable = totalMainAll - totalAdvancePayment;
    const payableAmount = mainDriverPayable + totalHelper;

    return (
        <>
            {/* تورهای بدون راننده کمکی */}
            {calculationsWithoutHelper.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <h2 className="text-xl font-bold text-blue-900 mb-4 border-b-2 border-blue-600 pb-2">
                        تورهای بدون راننده کمکی
                    </h2>
                    {renderMainDriverTableLayout3(calculationsWithoutHelper, 'هزینه‌های راننده اصلی')}
                </div>
            )}
            
            {/* تورهای با راننده کمکی */}
            {calculationsWithHelper.length > 0 && (
                <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                    <h2 className="text-xl font-bold text-green-900 mb-4 border-b-2 border-green-600 pb-2">
                        تورهای با راننده کمکی
                    </h2>
                    
                    {/* راننده اصلی برای تورهای با راننده کمکی */}
                    {renderMainDriverTableLayout3(calculationsWithHelper, 'هزینه‌های راننده اصلی')}
                    
                    {/* راننده‌های کمکی تفکیک شده بر اساس کد پرسنلی */}
                    {Array.from(helperCalculationsByEmployeeId.entries()).map(([employeeId, calcs]) => {
                        const firstCalc = calcs[0];
                        const helperName = firstCalc.helper_driver_name || firstCalc.helperDriverName || '-';
                        return (
                            <div key={employeeId}>
                                {renderHelperDriverTableLayout3(calcs, employeeId, helperName)}
                            </div>
                        );
                    })}
                </div>
            )}
            
            {/* جمع کل نهایی */}
            {invoiceCalculations.length > 0 && (
                <div className="mt-4 p-4 bg-slate-200 rounded-lg border-2 border-slate-600">
                    <div className="space-y-2">
                        <div className="mb-3 pb-3 border-b border-slate-400">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده اصلی:</span>
                                <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                    {totalMainAll.toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                            {totalHelper > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده کمکی:</span>
                                    <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                        {totalHelper.toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>جمع کل هزینه سفر:</span>
                            <span className="text-xl font-bold text-green-700" style={{ fontSize: '18px' }}>
                                {grandTotal.toLocaleString('fa-IR')} ریال
                            </span>
                        </div>
                        {totalAdvancePayment !== 0 && (
                            <div className="flex justify-between items-center border-t border-slate-400 pt-2 mt-2">
                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>کسور (پیش پرداخت - فقط از راننده اصلی):</span>
                                <span className="text-lg font-bold text-orange-700" style={{ fontSize: '17px' }}>
                                    {totalAdvancePayment < 0 ? '−' : ''}{Math.abs(totalAdvancePayment).toLocaleString('fa-IR')} ریال
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center border-t-2 border-slate-600 pt-2 mt-2">
                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>مبلغ قابل پرداخت:</span>
                            <span className={`text-xl font-bold ${payableAmount < 0 ? 'text-red-700' : 'text-blue-700'}`} style={{ fontSize: '18px' }}>
                                <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                                    {payableAmount < 0 ? '−' : ''}{Math.abs(payableAmount).toLocaleString('fa-IR')} ریال
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ============================================================================
// Helper function برای تبدیل داده‌ها به فرمت افقی (مشابه TransportFinancePaidInvoices)
// ============================================================================
const convertToInvoiceDataFormatHorizontal = (
    selectedInvoiceRecord: PaymentRecord,
    calculations: any[],
    announcementsMap: Map<string, any>,
    startDate: string,
    endDate: string
): {
    blocks: Array<{
        title: string;
        rows: Array<{
            kind: 'meta' | 'categoryHeader' | 'cost';
            label?: string;
            value?: string;
            category?: string;
            description?: string;
            unitAmount?: number;
            totalAmount?: number;
            tourValues?: number[];
            isDepotCount?: boolean;
        }>;
        summary: {
            totalTripCost: number;
            deductionsTitle?: string;
            deductionsAmount?: number;
            payableAmount: number;
            notes?: string;
        };
    }>;
    tourData?: Array<{
        billOfLadingNumber?: string;
        billOfLadingDate?: string;
        destinations?: string;
        calculationDate?: string;
        vehiclePlate?: string;
        vehicleType?: string;
        approvedKm?: number;
        excessKm?: number;
        approvedMissionDays?: number;
        excessMissionDays?: number;
    }>;
    helperCalculationsByEmployeeId?: Map<string, any[]>;
} => {
    const blocks: any[] = [];
    
    // محاسبه جمع کل
    const totalMainAll = calculations.reduce((sum, calc) => sum + calculateMainDriverCostGlobal(calc), 0);
    const helperCostsByEmployee = new Map<string, { employeeId: string; name: string; total: number; calculations: any[] }>();
    
    calculations.forEach((calc: any) => {
        const helperId = calc.helper_driver_id || calc.helperDriverId;
        const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
        const helperName = calc.helper_driver_name || calc.helperDriverName || '';
        const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
        const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
        const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
        const helperTotal = helperAllowance + helperFoodCost + helperExcessMissionCost;
        
        if (helperId && helperEmployeeId && helperTotal > 0) {
            if (!helperCostsByEmployee.has(helperEmployeeId)) {
                helperCostsByEmployee.set(helperEmployeeId, {
                    employeeId: helperEmployeeId,
                    name: helperName,
                    total: 0,
                    calculations: []
                });
            }
            const existing = helperCostsByEmployee.get(helperEmployeeId)!;
            existing.total += helperTotal;
            existing.calculations.push(calc);
        }
    });
    
    const totalHelper = Array.from(helperCostsByEmployee.values()).reduce((sum, h) => sum + h.total, 0);
    const totalAdvancePayment = calculations.reduce((sum, calc) => {
        return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
    }, 0);
    const mainDriverPayable = totalMainAll - totalAdvancePayment;
    const payableAmount = mainDriverPayable + totalHelper;

    // ساخت بلوک راننده اصلی
    const mainDriverRows: any[] = [];
    
    // اضافه کردن هزینه‌های مستقیم - همه 8 فیلد همیشه نمایش داده می‌شوند
    mainDriverRows.push({ kind: 'categoryHeader', category: 'هزینه‌های مستقیم' });
    
    // 1. هزینه بارنامه
    const billOfLadingValues = calculations.map((calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0));
    const billOfLadingTotal = billOfLadingValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'هزینه بارنامه',
        unitAmount: billOfLadingTotal,
        totalAmount: billOfLadingTotal,
        tourValues: billOfLadingValues
    });

    // 2. سوخت
    const fuelValues = calculations.map((calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0));
    const fuelTotal = fuelValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'سوخت',
        unitAmount: fuelTotal,
        totalAmount: fuelTotal,
        tourValues: fuelValues
    });

    // 3. غذا
    const foodValues = calculations.map((calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0));
    const foodTotal = foodValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'غذا',
        unitAmount: foodTotal,
        totalAmount: foodTotal,
        tourValues: foodValues
    });

    // 4. چندجا تخلیه
    const multiUnloadValues = calculations.map((calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0));
    const multiUnloadTotal = multiUnloadValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'چندجا تخلیه',
        unitAmount: multiUnloadTotal,
        totalAmount: multiUnloadTotal,
        tourValues: multiUnloadValues
    });

    // 5. هزینه عوارض آزاد راهی
    const tollValues = calculations.map((calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0));
    const tollTotal = tollValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'هزینه عوارض آزاد راهی',
        unitAmount: tollTotal,
        totalAmount: tollTotal,
        tourValues: tollValues
    });

    // 6. اجرت ثابت
    const fixedAllowanceValues = calculations.map((calc: any) => parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0));
    const fixedAllowanceTotal = fixedAllowanceValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'اجرت ثابت',
        unitAmount: fixedAllowanceTotal,
        totalAmount: fixedAllowanceTotal,
        tourValues: fixedAllowanceValues
    });

    // 7. هزینه بار برگشتی
    const returnCargoValues = calculations.map((calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0));
    const returnCargoTotal = returnCargoValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'هزینه بار برگشتی',
        unitAmount: returnCargoTotal,
        totalAmount: returnCargoTotal,
        tourValues: returnCargoValues
    });

    // 8. ماموریت مازاد (ریال)
    const excessMissionValues = calculations.map((calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0));
    const excessMissionTotal = excessMissionValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های مستقیم',
        description: 'ماموریت مازاد',
        unitAmount: excessMissionTotal,
        totalAmount: excessMissionTotal,
        tourValues: excessMissionValues
    });

    // اضافه کردن هزینه‌های دپو - 6 فیلد همیشه نمایش داده می‌شوند
    mainDriverRows.push({ kind: 'categoryHeader', category: 'هزینه‌های دپو' });
    
    // 1. تعداد روز ماموریت دپو
    const depotMissionDaysValues = calculations.map((calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0));
    const depotMissionDays = depotMissionDaysValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'تعداد روز ماموریت دپو',
        unitAmount: depotMissionDays,
        totalAmount: null,
        isDepotCount: true,
        tourValues: depotMissionDaysValues
    });

    // 2. هزینه جابجایی بار در دپو (ریال)
    const depotCargoHandlingValues = calculations.map((calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0));
    const depotCargoHandlingTotal = depotCargoHandlingValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'هزینه جابجایی بار در دپو (ریال)',
        unitAmount: depotCargoHandlingTotal,
        totalAmount: depotCargoHandlingTotal,
        tourValues: depotCargoHandlingValues
    });

    // 3. تعداد بار ارسالی
    const depotCountValues = calculations.map((calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0));
    const depotCount = depotCountValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'تعداد بار ارسالی',
        unitAmount: depotCount,
        totalAmount: null,
        isDepotCount: true,
        tourValues: depotCountValues
    });

    // 4. پیمایش کل دپو (کیلومتر)
    const depotMileageValues = calculations.map((calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0));
    const depotMileage = depotMileageValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'پیمایش کل دپو (کیلومتر)',
        unitAmount: depotMileage,
        totalAmount: null,
        isDepotCount: true,
        tourValues: depotMileageValues
    });

    // 5. اجرت دپو (ریال)
    const depotKilometerRateValues = calculations.map((calc: any) => parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0));
    const depotKilometerRateTotal = depotKilometerRateValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'اجرت دپو (ریال)',
        unitAmount: depotKilometerRateTotal,
        totalAmount: depotKilometerRateTotal,
        tourValues: depotKilometerRateValues
    });

    // 6. حق ماموریت دپو (ریال)
    const depotMissionCostValues = calculations.map((calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0));
    const depotMissionCostTotal = depotMissionCostValues.reduce((sum, val) => sum + val, 0);
    mainDriverRows.push({
        kind: 'cost',
        category: 'هزینه‌های دپو',
        description: 'حق ماموریت دپو (ریال)',
        unitAmount: depotMissionCostTotal,
        totalAmount: depotMissionCostTotal,
        tourValues: depotMissionCostValues
    });

    // اضافه کردن جمع بندی - 4 فیلد
    mainDriverRows.push({ kind: 'categoryHeader', category: 'جمع بندی' });
    
    // محاسبه مقادیر جمع بندی
    const totalApprovedKm = calculations.reduce((sum, calc) => sum + parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0), 0);
    const totalExcessKm = calculations.reduce((sum, calc) => sum + parseFloat(calc.excess_kilometers || calc.excessKilometers || 0), 0);
    const totalDepotKm = depotMileage;
    const totalKm = totalApprovedKm + totalExcessKm + totalDepotKm;
    
    const totalFixedAllowance = fixedAllowanceTotal;
    const totalDepotAllowance = depotKilometerRateTotal;
    const totalAllowance = totalFixedAllowance + totalDepotAllowance;
    
    const totalNonAllowanceCosts = billOfLadingTotal + fuelTotal + foodTotal + multiUnloadTotal + 
        tollTotal + returnCargoTotal + excessMissionTotal + depotCargoHandlingTotal + depotMissionCostTotal;
    
    const totalTourCost = totalAllowance + totalNonAllowanceCosts;
    
    // 1. پیمایش کل
    mainDriverRows.push({
        kind: 'cost',
        category: 'جمع بندی',
        description: 'پیمایش کل',
        unitAmount: totalKm,
        totalAmount: totalKm,
        isDepotCount: true,
        tourValues: calculations.map((calc: any) => {
            const approved = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
            const excess = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
            const depot = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
            return approved + excess + depot;
        })
    });
    
    // 2. کل اجرت
    mainDriverRows.push({
        kind: 'cost',
        category: 'جمع بندی',
        description: 'کل اجرت',
        unitAmount: totalAllowance,
        totalAmount: totalAllowance,
        tourValues: calculations.map((calc: any) => {
            const fixed = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
            const depot = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
            return fixed + depot;
        })
    });
    
    // 3. هزینه‌های غیر اجرت
    mainDriverRows.push({
        kind: 'cost',
        category: 'جمع بندی',
        description: 'هزینه‌های غیر اجرت',
        unitAmount: totalNonAllowanceCosts,
        totalAmount: totalNonAllowanceCosts,
        tourValues: calculations.map((calc: any) => {
            const bill = parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0);
            const fuel = parseFloat(calc.fuel_cost || calc.fuelCost || 0);
            const food = parseFloat(calc.food_cost || calc.foodCost || 0);
            const multi = parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0);
            const toll = parseFloat(calc.toll_cost || calc.tollCost || 0);
            const returnCargo = parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0);
            const excess = parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0);
            const cargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
            const mission = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
            return bill + fuel + food + multi + toll + returnCargo + excess + cargoHandling + mission;
        })
    });
    
    // 4. کل هزینه تور
    mainDriverRows.push({
        kind: 'cost',
        category: 'جمع بندی',
        description: 'کل هزینه تور',
        unitAmount: totalTourCost,
        totalAmount: totalTourCost,
        tourValues: calculations.map((calc: any) => {
            return calculateMainDriverCostGlobal(calc);
        })
    });

    blocks.push({
        title: 'هزینه‌های راننده اصلی',
        rows: mainDriverRows,
        summary: {
            totalTripCost: totalMainAll,
            deductionsTitle: 'کسور (پیش پرداخت)',
            deductionsAmount: totalAdvancePayment,
            payableAmount: mainDriverPayable,
            notes: ''
        }
    });

    // اضافه کردن بلوک‌های راننده کمکی
    const helperCalculationsByEmployeeId = new Map<string, any[]>();
    helperCostsByEmployee.forEach((helperData) => {
        const helperRows: any[] = [];
        
        helperRows.push({ kind: 'categoryHeader', category: 'هزینه‌های مستقیم' });

        const helperAllowanceValues = helperData.calculations.map((calc: any) => parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0));
        const helperAllowanceTotal = helperAllowanceValues.reduce((sum, val) => sum + val, 0);
        if (helperAllowanceTotal > 0) {
            helperRows.push({
                kind: 'cost',
                category: 'هزینه‌های مستقیم',
                description: 'اجرت راننده کمکی',
                unitAmount: helperAllowanceTotal,
                totalAmount: helperAllowanceTotal,
                tourValues: helperAllowanceValues
            });
        }

        const helperFoodValues = helperData.calculations.map((calc: any) => parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0));
        const helperFoodTotal = helperFoodValues.reduce((sum, val) => sum + val, 0);
        if (helperFoodTotal > 0) {
            helperRows.push({
                kind: 'cost',
                category: 'هزینه‌های مستقیم',
                description: 'غذای راننده کمکی',
                unitAmount: helperFoodTotal,
                totalAmount: helperFoodTotal,
                tourValues: helperFoodValues
            });
        }

        const helperExcessMissionValues = helperData.calculations.map((calc: any) => parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0));
        const helperExcessMissionTotal = helperExcessMissionValues.reduce((sum, val) => sum + val, 0);
        if (helperExcessMissionTotal > 0) {
            helperRows.push({
                kind: 'cost',
                category: 'هزینه‌های مستقیم',
                description: 'ماموریت مازاد راننده کمکی',
                unitAmount: helperExcessMissionTotal,
                totalAmount: helperExcessMissionTotal,
                tourValues: helperExcessMissionValues
            });
        }

        blocks.push({
            title: `راننده کمکی - کدپرسنلی: ${helperData.employeeId} - ${helperData.name}`,
            rows: helperRows,
            summary: {
                totalTripCost: helperData.total,
                deductionsTitle: '',
                deductionsAmount: 0,
                payableAmount: helperData.total,
                notes: ''
            }
        });

        helperCalculationsByEmployeeId.set(helperData.employeeId, helperData.calculations);
    });

    // ساخت داده‌های هر تور
    const tourData = calculations.map((calc: any) => {
        const announcement = announcementsMap.get(calc.announcement_id || calc.announcementId);
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
        const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
        const vehicleType = announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
        const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
        const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
        const approvedMissionDays = parseFloat(calc.approved_mission_days || calc.approvedMissionDays || 0);
        const excessMissionDays = parseFloat(calc.excess_mission_days || calc.excessMissionDays || 0);
        
        return {
            billOfLadingNumber,
            billOfLadingDate,
            destinations,
            calculationDate,
            vehiclePlate,
            vehicleType,
            approvedKm,
            excessKm,
            approvedMissionDays,
            excessMissionDays,
        };
    });

    return { blocks, tourData, helperCalculationsByEmployeeId };
};

// ============================================================================
// کامپوننت اصلی
// ============================================================================
const TransportFinancePaymentList: React.FC<TransportFinancePaymentListProps> = ({ currentUser }) => {
    console.log('🎬 [TransportFinancePaymentList] کامپوننت render شد', { currentUser: currentUser?.id || 'null' });
    
    // استفاده از تابع global از InvoiceImageHelper (که depot_kilometer_rate را هم شامل می‌شود)
    const calculateMainDriverCost = calculateMainDriverCostGlobal;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
    
    console.log('📊 [TransportFinancePaymentList] State initialized:', { loading, error, driversCount: drivers.length, paymentRecordsCount: paymentRecords.length });
    
    // فیلتر تاریخ (تاریخ محاسبه)
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    
    // جستجو
    const [searchTerm, setSearchTerm] = useState<string>('');
    
    // صفحه‌بندی
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(30);
    
    // دیالوگ قوانین
    const [rulesDialogOpen, setRulesDialogOpen] = useState(false);
    
    // نوع ساختار صورتحساب (پیش‌فرض: افقی)
    const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayoutType>(InvoiceLayoutType.HORIZONTAL);

    useEffect(() => {
        console.log('🔄 [useEffect] فراخوانی fetchData');
        fetchData().catch((err) => {
            console.error('❌ [useEffect] خطا در fetchData:', err);
        });
    }, []);

    const fetchData = async () => {
        try {
            console.log('🚀 [fetchData] شروع fetchData');
            setLoading(true);
            setError(null);
            
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            console.log('📡 [fetchData] در حال دریافت داده‌ها از API...');
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

            console.log('✅ [fetchData] داده‌ها دریافت شد:', {
                driversCount: Array.isArray(driversData) ? driversData.length : 0,
                calculationsCount: Array.isArray(calculationsData) ? calculationsData.length : 0,
                calculationsSample: Array.isArray(calculationsData) && calculationsData.length > 0 ? calculationsData[0] : null
            });

            setDrivers(Array.isArray(driversData) ? driversData : []);
            
            // تبدیل محاسبات به رکوردهای پرداخت - برای هر تور یک ردیف جداگانه
            const allRecords: PaymentRecord[] = [];
            
            const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
            console.log('🔄 [fetchData] شروع پردازش', calculationsArray.length, 'محاسبه');
            
            let processedCount = 0;
            let skippedCount = 0;
            let skippedReasons = { totalCostZero: 0, isPaid: 0, noDriver: 0 };
            
            calculationsArray.forEach((calc: any, index: number) => {
                // فقط محاسباتی که total_cost دارند (یعنی ثبت شده‌اند) و پرداخت نشده‌اند
                const totalCost = parseFloat(calc.total_cost || calc.totalCost || '0') || 0;
                const isPaid = calc.is_paid || calc.isPaid || false;
                
                if (totalCost <= 0) {
                    skippedCount++;
                    skippedReasons.totalCostZero++;
                    if (index < 3) { // فقط 3 مورد اول را لاگ کن
                        console.log('⏭️ [fetchData] رد شد - totalCost <= 0:', {
                            index,
                            id: calc.id,
                            total_cost: calc.total_cost || calc.totalCost,
                            totalCost
                        });
                    }
                    return;
                }
                
                if (isPaid) {
                    skippedCount++;
                    skippedReasons.isPaid++;
                    if (index < 3) {
                        console.log('⏭️ [fetchData] رد شد - isPaid:', {
                            index,
                            id: calc.id,
                            is_paid: calc.is_paid || calc.isPaid
                        });
                    }
                    return;
                }
                
                const driverId = calc.driver_id || calc.driverId;
                const driver = driversData.find((d: Driver) => d.id === driverId);
                
                if (!driver) {
                    skippedCount++;
                    skippedReasons.noDriver++;
                    if (index < 3) {
                        console.log('⏭️ [fetchData] رد شد - driver not found:', {
                            index,
                            id: calc.id,
                            driver_id: driverId
                        });
                    }
                    return;
                }
                
                processedCount++;
                
                // لاگ برای دیباگ - بررسی فیلدهای عددی
                console.log('🔍 [fetchData] بررسی calc:', {
                    id: calc.id,
                    announcementId: calc.announcement_id || calc.announcementId,
                    // هزینه‌های مستقیم
                    bill_of_lading_cost: calc.bill_of_lading_cost || calc.billOfLadingCost,
                    food_cost: calc.food_cost || calc.foodCost,
                    fuel_cost: calc.fuel_cost || calc.fuelCost,
                    toll_cost: calc.toll_cost || calc.tollCost,
                    multi_unload_cost: calc.multi_unload_cost || calc.multiUnloadCost,
                    return_cargo_cost: calc.return_cargo_cost || calc.returnCargoCost,
                    excess_mission_cost: calc.excess_mission_cost || calc.excessMissionCost,
                    fixed_allowance: calc.fixed_allowance || calc.fixedAllowance,
                    // هزینه‌های دپو
                    depot_cargo_handling_cost: calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost,
                    depot_kilometer_rate: calc.depot_kilometer_rate || calc.depotKilometerRate,
                    depot_mission_cost: calc.depot_mission_cost || calc.depotMissionCost,
                    // راننده کمکی
                    helper_driver_allowance: calc.helper_driver_allowance || calc.helperDriverAllowance,
                    helper_driver_food_cost: calc.helper_driver_food_cost || calc.helperDriverFoodCost,
                    helper_driver_excess_mission_cost: calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost,
                    // پیش پرداخت
                    advance_payment: calc.advance_payment || calc.advancePayment,
                    // کل کلیدهای موجود در calc
                    allKeys: Object.keys(calc)
                });
                
                // محاسبه هزینه راننده اصلی (مطابق منطق صورتحساب)
                const mainDriverCost = calculateMainDriverCost(calc);
                console.log('💰 [fetchData] mainDriverCost محاسبه شده:', mainDriverCost);
                
                // محاسبه هزینه راننده کمکی (فقط اگر راننده کمکی تعریف شده باشد)
                const helperId = calc.helper_driver_id || calc.helperDriverId;
                const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
                const helperName = calc.helper_driver_name || calc.helperDriverName || '';
                const helperAllowance = parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0);
                const helperFoodCost = parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0);
                const helperExcessMissionCost = parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0);
                // فقط زمانی هزینه راننده کمکی را حساب کن که واقعاً راننده کمکی وجود داشته باشد
                const helperDriverCost = helperId && helperEmployeeId ? (helperAllowance + helperFoodCost + helperExcessMissionCost) : 0;
                
                // پیش پرداخت (فقط برای راننده اصلی)
                const advancePayment = parseFloat(calc.advance_payment || calc.advancePayment || 0);
                
                const calculationDate = calc.calculation_date || calc.calculationDate || '';
                const announcementId = calc.announcement_id || calc.announcementId;
                const calculationId = calc.id;
                
                // ساخت ردیف برای راننده اصلی (این تور)
                allRecords.push({
                    driverId,
                    employeeId: driver.employee_id || driver.employeeId || '',
                    driverName: driver.name || '',
                    accountNumber: (driver as any).account_number || (driver as any).accountNumber || '',
                    totalAmount: mainDriverCost + helperDriverCost,
                    mainDriverAmount: mainDriverCost,
                    helperDriverAmount: 0,
                    advancePayment: advancePayment,
                    payableAmount: mainDriverCost - advancePayment,
                    calculationDate,
                    announcementId,
                    calculationId,
                    isHelper: false,
                });
                
                // ساخت ردیف جداگانه برای راننده کمکی (اگر وجود دارد)
                if (helperId && helperEmployeeId && helperDriverCost > 0) {
                    const helperDriver = driversData.find((d: Driver) => 
                        (d.employeeId === helperEmployeeId) || d.id === helperId
                    );
                    
                    allRecords.push({
                        driverId: helperId,
                        employeeId: helperEmployeeId,
                        driverName: helperName || (helperDriver?.name || ''),
                        accountNumber: (helperDriver as any)?.account_number || (helperDriver as any)?.accountNumber || '',
                        totalAmount: helperDriverCost,
                        mainDriverAmount: helperDriverCost,
                        helperDriverAmount: 0,
                        advancePayment: 0,
                        payableAmount: helperDriverCost,
                        calculationDate,
                        announcementId,
                        calculationId,
                        isHelper: true,
                        helperDriverId: helperId,
                        helperEmployeeId: helperEmployeeId,
                    });
                }
            });
            
            console.log('📊 [fetchData] خلاصه پردازش:', {
                totalCalculations: calculationsArray.length,
                processed: processedCount,
                skipped: skippedCount,
                skippedReasons,
                allRecordsCount: allRecords.length
            });
            
            // دریافت اطلاعات پرداخت‌ها برای هر رکورد
            const recordsWithPayments = await Promise.all(
                allRecords.map(async (record) => {
                    try {
                        // دریافت آخرین پرداخت
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
                        console.warn(`⚠️ [fetchData] Failed to fetch payment info for driver ${record.driverId}:`, err);
                    }
                    
                    return record;
                })
            );
            
            console.log('✅ [fetchData] تمام رکوردها پردازش شد:', {
                totalRecords: recordsWithPayments.length,
                sampleRecord: recordsWithPayments.length > 0 ? recordsWithPayments[0] : null
            });
            
            setPaymentRecords(recordsWithPayments);
            console.log('✅ [fetchData] paymentRecords تنظیم شد');
        } catch (err: any) {
            console.error('❌ [TransportFinancePaymentList] Failed to fetch data:', err);
            console.error('❌ [TransportFinancePaymentList] Error details:', {
                message: err.message,
                stack: err.stack,
                name: err.name
            });
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            console.log('🏁 [fetchData] finally block - setLoading(false)');
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

    // خروجی اکسل برای بانک - تجمیع شده بر اساس راننده
    const exportToExcelForBank = async () => {
        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'شماره حساب مقصد', 'مبلغ هزینه (ریال)', 'کسور(پیش پرداخت) (ریال)', 'مبلغ قابل پرداخت (ریال)']
        ];

        // Grouping بر اساس driverId و employeeId (تجمیع هزینه‌ها)
        const groupedRecords = new Map<string, { employeeId: string; driverName: string; accountNumber: string; mainDriverAmount: number; advancePayment: number; payableAmount: number }>();
        
        filteredRecords.forEach((record) => {
            const key = record.employeeId || record.driverId;
            const existing = groupedRecords.get(key);
            
            if (existing) {
                existing.mainDriverAmount += record.mainDriverAmount || 0;
                existing.advancePayment += record.advancePayment || 0;
                existing.payableAmount = existing.mainDriverAmount - existing.advancePayment;
            } else {
                groupedRecords.set(key, {
                    employeeId: record.employeeId || '',
                    driverName: record.driverName || '',
                    accountNumber: record.accountNumber || '',
                    mainDriverAmount: record.mainDriverAmount || 0,
                    advancePayment: record.advancePayment || 0,
                    payableAmount: record.payableAmount || 0
                });
            }
        });

        let rowIndex = 0;
        Array.from(groupedRecords.values()).forEach((record) => {
            rowIndex++;
            wsData.push([
                rowIndex,
                record.employeeId,
                record.driverName,
                record.accountNumber,
                record.mainDriverAmount,
                record.advancePayment,
                record.payableAmount
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
            { wch: 25 }, // مبلغ هزینه
            { wch: 25 }, // کسور(پیش پرداخت)
            { wch: 25 }  // مبلغ قابل پرداخت
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

    // تولید تصویر صورتحساب - فقط برای همان تور (announcementId/calculationId)
    const generateInvoiceImage = async (record: PaymentRecord) => {
        try {
            setSelectedInvoiceRecord(record);
            
            // دریافت جزئیات محاسبات برای همان تور خاص
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // اگر calculationId داریم، فقط همان calculation را بگیریم
            let calculation: any = null;
            if (record.calculationId) {
                const calcRes = await fetch(
                    getApiUrl(`driver-calculations`),
                    { headers }
                );
                if (calcRes.ok) {
                    const calculationsData = await calcRes.json();
                    const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
                    calculation = calculationsArray.find((calc: any) => 
                        (calc.id === record.calculationId) || 
                        (calc.announcement_id === record.announcementId && calc.driver_id === record.driverId)
                    );
                }
            } else if (record.announcementId) {
                // اگر فقط announcementId داریم، اولین calculation مربوط به این announcement را بگیریم
                const calcRes = await fetch(
                    getApiUrl(`driver-calculations`),
                    { headers }
                );
                if (calcRes.ok) {
                    const calculationsData = await calcRes.json();
                    const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
                    if (record.isHelper) {
                        calculation = calculationsArray.find((calc: any) => 
                            (calc.announcement_id === record.announcementId) &&
                            (calc.helper_driver_id === record.driverId || calc.helper_driver_employee_id === record.employeeId)
                        );
                    } else {
                        calculation = calculationsArray.find((calc: any) => 
                            (calc.announcement_id === record.announcementId) &&
                            (calc.driver_id === record.driverId)
                        );
                    }
                }
            }
            
            if (!calculation) {
                alert('محاسبه یافت نشد');
                return;
            }
            
            // فقط همان calculation را نمایش می‌دهیم
            setInvoiceCalculations([calculation]);
            
            // دریافت اطلاعات اعلام بار برای همان announcementId
            const announcementsMap = new Map<string, any>();
            if (record.announcementId) {
                try {
                    const annRes = await fetch(getApiUrl(`freight-announcements/${record.announcementId}`), { headers });
                    if (annRes.ok) {
                        const annData = await annRes.json();
                        announcementsMap.set(record.announcementId, annData);
                    }
                } catch (err) {
                    console.warn('⚠️ [generateInvoiceImage] خطا در دریافت اعلام بار:', err);
                }
            }
            setInvoiceAnnouncements(announcementsMap);

            setInvoiceDialogOpen(true);
        } catch (err: any) {
            console.error('❌ [generateInvoiceImage] Error:', err);
            alert(`خطا در تولید صورتحساب: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // تبدیل صورتحساب به PDF - روش ساده و مطمئن
    // چاپ مستقیم صورتحساب - دقیقاً همان چیزی که در دیالوگ می‌بینیم
    const handlePrintInvoiceDirect = () => {
        if (!invoiceRef.current || !selectedInvoiceRecord) return;

        try {
            // ایجاد یک پنجره جدید برای چاپ
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('لطفاً popup blocker را غیرفعال کنید');
                return;
            }

            // کپی کردن کل element با همه استایل‌ها
            const invoiceElement = invoiceRef.current.cloneNode(true) as HTMLElement;
            
            // اعمال استایل‌های اضافی برای چاپ
            invoiceElement.style.width = '100%';
            invoiceElement.style.maxWidth = '100%';
            invoiceElement.style.margin = '0';
            invoiceElement.style.padding = '20px';
            
            // اطمینان از اینکه همه استایل‌های inline حفظ می‌شوند و رنگ‌ها درست هستند
            const allRows = invoiceElement.querySelectorAll('tr');
            allRows.forEach((row) => {
                const rowEl = row as HTMLElement;
                const rowStyle = rowEl.getAttribute('style') || '';
                
                // بررسی اینکه آیا این ردیف جمع کل است (پس‌زمینه آبی)
                const isTotalRow = rowStyle.includes('background-color: rgb(59, 130, 246)') || 
                                   rowStyle.includes('background-color: #3b82f6') ||
                                   rowStyle.includes('backgroundColor: rgb(59, 130, 246)') ||
                                   rowStyle.includes('backgroundColor: #3b82f6');
                
                if (isTotalRow) {
                    // برای همه سلول‌های ردیف جمع کل، رنگ سفید
                    const cells = rowEl.querySelectorAll('td');
                    cells.forEach((cell) => {
                        const cellEl = cell as HTMLElement;
                        const cellStyle = cellEl.getAttribute('style') || '';
                        
                        // اضافه کردن رنگ سفید اگر وجود ندارد
                        if (!cellStyle.includes('color: #ffffff') && !cellStyle.includes('color:#ffffff')) {
                            cellEl.style.color = '#ffffff';
                            cellEl.style.setProperty('color', '#ffffff', 'important');
                            // همچنین در style attribute
                            cellEl.setAttribute('style', cellStyle + '; color: #ffffff !important;');
                        }
                        
                        // اطمینان از پس‌زمینه آبی
                        if (!cellStyle.includes('background-color: #3b82f6') && !cellStyle.includes('backgroundColor: #3b82f6')) {
                            cellEl.style.backgroundColor = '#3b82f6';
                            cellEl.setAttribute('style', (cellEl.getAttribute('style') || '') + '; background-color: #3b82f6 !important;');
                        }
                    });
                }
            });
            
            // ایجاد HTML کامل با استایل‌های چاپ
            const printHTML = `
                <!DOCTYPE html>
                <html dir="rtl" lang="fa">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>صورتحساب - ${selectedInvoiceRecord.driverName}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap');
                        
                        * {
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: 'Vazirmatn', Arial, sans-serif !important;
                            direction: rtl;
                            background: white;
                            padding: 20px;
                            margin: 0;
                            color: #1e293b;
                        }
                        
                        /* حفظ همه استایل‌های inline - override نکن */
                        [style] {
                            /* استایل‌های inline اولویت دارند */
                        }
                        
                        table {
                            border-collapse: collapse !important;
                            width: 100% !important;
                            max-width: 90% !important;
                            margin: 0 auto !important;
                        }
                        
                        th, td {
                            border: 1px solid #cbd5e1 !important;
                        }
                        
                        /* برای ردیف جمع کل - پس‌زمینه آبی و رنگ سفید */
                        tr[style*="background-color: rgb(59, 130, 246)"],
                        tr[style*="background-color: #3b82f6"] {
                            background-color: #3b82f6 !important;
                        }
                        
                        tr[style*="background-color: rgb(59, 130, 246)"] td,
                        tr[style*="background-color: #3b82f6"] td {
                            background-color: #3b82f6 !important;
                            color: #ffffff !important;
                        }
                        
                        /* برای سلول "مبلغ کل" در ردیف جمع کل */
                        tr[style*="background-color: rgb(59, 130, 246)"] td[data-total-amount="true"],
                        tr[style*="background-color: #3b82f6"] td[data-total-amount="true"] {
                            color: #ffffff !important;
                            background-color: #3b82f6 !important;
                        }
                        
                        @media print {
                            body {
                                padding: 10px;
                            }
                            
                            @page {
                                margin: 1cm;
                                size: A4 landscape;
                            }
                            
                            table {
                                page-break-inside: avoid;
                            }
                            
                            tr {
                                page-break-inside: avoid;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${invoiceElement.outerHTML}
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 500);
                            window.onafterprint = function() {
                                window.close();
                            };
                        };
                    </script>
                </body>
                </html>
            `;

            printWindow.document.write(printHTML);
            printWindow.document.close();
        } catch (err: any) {
            console.error('❌ [handlePrintInvoiceDirect] Error:', err);
            alert(`خطا در چاپ: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handlePrintInvoice = () => {
        if (!invoiceRef.current) {
            alert('خطا: محتوای صورتحساب یافت نشد. لطفاً ابتدا صورتحساب را باز کنید.');
            return;
        }

        // ایجاد یک پنجره جدید برای چاپ
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('لطفاً popup blocker را غیرفعال کنید.');
            return;
        }

        // کپی کردن محتوای صورتحساب
        const content = invoiceRef.current.cloneNode(true) as HTMLElement;
        
        // استایل‌های چاپ
        const printStyles = `
            <style>
                @page {
                    size: A4;
                    margin: 15mm;
                }
                * {
                    font-family: 'Vazirmatn', Arial, sans-serif !important;
                }
                body {
                    direction: rtl;
                    margin: 0;
                    padding: 20px;
                    background: white;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                th, td {
                    padding: 10px 12px;
                    border: 1px solid #cbd5e1;
                    text-align: center;
                }
                th {
                    background-color: #1e40af;
                    color: white;
                    font-weight: bold;
                }
                @media print {
                    body {
                        padding: 0;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            </style>
        `;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="UTF-8">
                <title>صورتحساب هزینه</title>
                ${printStyles}
            </head>
            <body>
                ${content.outerHTML}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // صبر برای لود شدن فونت‌ها و سپس چاپ
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };

    const exportInvoiceToPDF = async () => {
        if (!invoiceRef.current || !selectedInvoiceRecord) {
            alert('خطا: محتوای صورتحساب یافت نشد. لطفاً ابتدا صورتحساب را باز کنید.');
            return;
        }

        if (invoiceCalculations.length === 0) {
            alert('خطا: هیچ محاسبه‌ای برای نمایش در صورتحساب یافت نشد.');
            return;
        }

        try {
            // ایجاد div موقت برای render کردن HTML صورتحساب
            const tempDiv = document.createElement('div');
            tempDiv.id = 'temp-invoice-pdf';
            tempDiv.style.position = 'absolute';
            tempDiv.style.top = '-10000px';
            tempDiv.style.left = '0';
            tempDiv.style.width = '2000px'; // عرض بیشتر برای landscape و نمایش کامل ستون‌ها
            tempDiv.style.backgroundColor = '#ffffff';
            tempDiv.style.padding = '20px';
            tempDiv.style.boxSizing = 'border-box';
            tempDiv.style.overflow = 'visible';
            tempDiv.style.zIndex = '-1000';
            document.body.appendChild(tempDiv);

            // Clone کردن محتوای invoiceRef به div موقت
            const clonedContent = invoiceRef.current.cloneNode(true) as HTMLElement;
            tempDiv.appendChild(clonedContent);

            // اعمال استایل‌های اضافی برای PDF - حفظ استایل‌های inline از JSX
            const allTables = tempDiv.querySelectorAll('table');
            allTables.forEach((table) => {
                const tableEl = table as HTMLElement;
                tableEl.style.width = '100%';
                tableEl.style.tableLayout = 'fixed';
                tableEl.style.borderCollapse = 'collapse';
                // حفظ fontSize و padding از JSX - override نکن
            });

            // اطمینان از اینکه فونت‌ها و padding‌ها حفظ می‌شوند
            const allCells = tempDiv.querySelectorAll('td, th');
            allCells.forEach((cell) => {
                const cellEl = cell as HTMLElement;
                // فقط اگر padding تعریف نشده باشد، یک مقدار پیش‌فرض بگذار
                if (!cellEl.style.padding || cellEl.style.padding === '' || cellEl.style.padding === '0px') {
                    const computedStyle = window.getComputedStyle(cellEl);
                    if (computedStyle.padding === '0px') {
                        cellEl.style.padding = '10px 8px'; // مقدار پیش‌فرض برای PDF
                }
                }
                // textAlign و verticalAlign را فقط اگر تعریف نشده باشد تنظیم کن
                if (!cellEl.style.textAlign || cellEl.style.textAlign === '') {
                cellEl.style.textAlign = 'center';
                }
                if (!cellEl.style.verticalAlign || cellEl.style.verticalAlign === '') {
                cellEl.style.verticalAlign = 'middle';
                }
                // حفظ fontSize از JSX - override نکن
            });

            // صبر کردن تا محتوا render شود
            await new Promise(resolve => setTimeout(resolve, 1000));

            // بررسی اینکه آیا محتوا در DOM موجود است
            const innerContent = tempDiv.innerHTML;
            if (!innerContent || innerContent.length < 100) {
                console.error('❌ HTML content is empty or too short!');
                document.body.removeChild(tempDiv);
                alert('خطا: محتوای صورتحساب render نشده است. لطفاً دوباره تلاش کنید.');
                return;
            }

            console.log('✅ Content ready, length:', innerContent.length);

            // پیدا کردن div اصلی صورتحساب
            let invoiceDiv = tempDiv.querySelector('div[dir="rtl"]') as HTMLElement;
            if (!invoiceDiv) {
                invoiceDiv = tempDiv.firstElementChild as HTMLElement;
            }
            if (!invoiceDiv) {
                invoiceDiv = tempDiv;
            }
            
            // اعمال استایل‌های نهایی
            invoiceDiv.style.width = '100%';
            invoiceDiv.style.maxWidth = '100%';
            invoiceDiv.style.overflowX = 'visible';
            invoiceDiv.style.overflowY = 'visible';
            invoiceDiv.style.backgroundColor = '#ffffff';
            
            if (!invoiceDiv || invoiceDiv === tempDiv) {
                console.error('❌ Cannot find invoice div!');
                document.body.removeChild(tempDiv);
                alert('خطا: ساختار صورتحساب یافت نشد. لطفاً دوباره تلاش کنید.');
                return;
            }
            
            // بررسی محتوای invoiceDiv
            const divContent = invoiceDiv.innerHTML;
            console.log('✅ Invoice div found, content length:', divContent.length);

            // تبدیل به canvas - استفاده از invoiceDiv
            let canvas;
            try {
                console.log('🔄 Starting html2canvas...');
                const invoiceDivElement = invoiceDiv as HTMLElement;
                console.log('📏 Element dimensions:', {
                    width: invoiceDivElement.scrollWidth,
                    height: invoiceDivElement.scrollHeight,
                    offsetWidth: invoiceDivElement.offsetWidth,
                    offsetHeight: invoiceDivElement.offsetHeight
                });
                
                canvas = await html2canvas(invoiceDiv, {
                    scale: 2, // افزایش scale برای کیفیت بهتر در PDF
                    useCORS: true,
                    logging: false, // غیرفعال کردن لاگ برای سرعت بیشتر
                    backgroundColor: '#ffffff',
                    allowTaint: true,
                    removeContainer: false,
                    width: invoiceDiv.scrollWidth,
                    height: invoiceDiv.scrollHeight,
                    windowWidth: invoiceDiv.scrollWidth,
                    windowHeight: invoiceDiv.scrollHeight,
                    onclone: (clonedDoc) => {
                        // اضافه کردن style tag برای اطمینان از رنگ مشکی ستون دسته‌بندی
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
                        
                        // اعمال استایل‌های نهایی در cloned document
                        const clonedTempDiv = clonedDoc.querySelector('#temp-invoice-pdf') as HTMLElement;
                        if (clonedTempDiv) {
                            clonedTempDiv.style.width = '100%';
                            clonedTempDiv.style.maxWidth = '100%';
                            clonedTempDiv.style.overflow = 'visible';
                        }
                        
                        const clonedDiv = clonedDoc.querySelector('#temp-invoice-pdf div[dir="rtl"]') as HTMLElement;
                        if (clonedDiv) {
                            clonedDiv.style.visibility = 'visible';
                            clonedDiv.style.opacity = '1';
                            clonedDiv.style.width = '100%';
                            clonedDiv.style.maxWidth = '100%';
                            clonedDiv.style.overflowX = 'visible';
                            clonedDiv.style.overflowY = 'visible';
                            
                            // اعمال استایل‌های جدول - بدون override کردن fontSize تا استایل‌های inline حفظ شوند
                            const clonedTables = clonedDiv.querySelectorAll('table');
                            clonedTables.forEach((table) => {
                                const tableEl = table as HTMLElement;
                                tableEl.style.width = '100%';
                                tableEl.style.minWidth = '100%';
                                tableEl.style.tableLayout = 'fixed';
                                tableEl.style.borderCollapse = 'collapse';
                                // حذف override کردن fontSize تا استایل‌های inline از JSX حفظ شوند
                                // tableEl.style.fontSize = '11px'; // این خط باعث override شدن فونت‌های بزرگتر می‌شد
                                tableEl.style.fontFamily = 'Vazirmatn, Arial, sans-serif';
                            });
                            
                            // اعمال استایل‌های کانتینرهای جدول برای نمایش کامل ستون‌ها
                            const clonedTableContainers = clonedDiv.querySelectorAll('div[style*="overflow"]');
                            clonedTableContainers.forEach((container) => {
                                const containerEl = container as HTMLElement;
                                if (containerEl.style.overflow === 'hidden' || containerEl.style.overflowX === 'hidden') {
                                    containerEl.style.overflowX = 'visible';
                                    containerEl.style.overflowY = 'visible';
                                }
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
                            
                            // اعمال استایل‌های سلول‌ها (td و th) - بدون override کردن fontSize
                            const clonedCells = clonedDiv.querySelectorAll('td, th');
                            clonedCells.forEach((cell) => {
                                const cellEl = cell as HTMLElement;
                                
                                // padding - داینامیک بر اساس نوع سلول
                                const rowSpan = cellEl.getAttribute('rowspan');
                                if (cellEl.tagName === 'TH' && rowSpan === '2') {
                                    // برای headerهای rowspan=2، padding بیشتر و height ثابت
                                    // حذف override کردن fontSize تا استایل‌های inline حفظ شوند
                                    cellEl.style.padding = '0';
                                    cellEl.style.paddingTop = '15px';
                                    cellEl.style.paddingBottom = '5px';
                                    cellEl.style.paddingLeft = '8px';
                                    cellEl.style.paddingRight = '8px';
                                    cellEl.style.height = '70px';
                                    // cellEl.style.fontSize = '11px'; // حذف شد - استایل inline حفظ می‌شود
                                    cellEl.style.lineHeight = '1.8';
                                    cellEl.style.verticalAlign = 'top';
                                    cellEl.style.display = 'table-cell';
                                } else if (cellEl.tagName === 'TH') {
                                    // برای headerهای عادی
                                    cellEl.style.padding = '10px 6px';
                                    // cellEl.style.fontSize = '10px'; // حذف شد - استایل inline حفظ می‌شود
                                    cellEl.style.verticalAlign = 'middle';
                                } else {
                                    // برای سلول‌های داده
                                    cellEl.style.padding = '12px 10px';
                                    // cellEl.style.fontSize = '11px'; // حذف شد - استایل inline حفظ می‌شود
                                    cellEl.style.lineHeight = '1.6';
                                    cellEl.style.verticalAlign = 'middle';
                                    cellEl.style.boxSizing = 'border-box';
                                    
                                    // برای اعداد: nowrap، برای متن: normal
                                    const cellText = cellEl.textContent || '';
                                    const isNumber = /^[\d،,\s]+$/.test(cellText.trim()) || /^[\d,.\s]+$/.test(cellText.trim());
                                    if (isNumber) {
                                        cellEl.style.whiteSpace = 'nowrap';
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
                                
                                // font-size - حفظ اندازه فونت اصلی
                                const originalFontSize = cellEl.style.fontSize || window.getComputedStyle(cellEl).fontSize;
                                if (originalFontSize && originalFontSize !== '8px' && parseFloat(originalFontSize) > 8) {
                                    cellEl.style.fontSize = originalFontSize;
                                } else {
                                    // حداقل اندازه برای خوانایی
                                    cellEl.style.fontSize = '14px';
                                }
                                
                                // برای headerها
                                if (cellEl.tagName === 'TH') {
                                    cellEl.style.fontWeight = 'bold';
                                    cellEl.style.backgroundColor = '#1e40af';
                                    cellEl.style.color = '#ffffff';
                                }
                                
                                // برای footer
                                const parentRow = cellEl.parentElement;
                                if (parentRow && parentRow.tagName === 'TR' && parentRow.parentElement?.tagName === 'TFOOT') {
                                    cellEl.style.backgroundColor = '#f1f5f9';
                                    cellEl.style.fontWeight = 'bold';
                                }
                                
                                // برای ستون دسته‌بندی (اولین ستون در tbody) - اطمینان از رنگ مشکی
                                if (cellEl.tagName === 'TD' && parentRow && parentRow.parentElement?.tagName === 'TBODY') {
                                    const isFirstCell = cellEl === parentRow.querySelector('td:first-child');
                                    if (isFirstCell) {
                                        const cellText = (cellEl.textContent || '').trim();
                                        const rowBg = parentRow.style.backgroundColor || window.getComputedStyle(parentRow).backgroundColor;
                                        const isTotalRow = cellText.includes('جمع کل') || rowBg.includes('rgb(59, 130, 246)') || rowBg.includes('#3b82f6');
                                        if (!isTotalRow && cellText.length > 0) {
                                            // تنظیم رنگ مشکی برای ستون دسته‌بندی با !important
                                            cellEl.style.color = '#000000';
                                            cellEl.style.setProperty('color', '#000000', 'important');
                                            cellEl.style.setProperty('background-color', cellEl.style.backgroundColor || '#ffffff', 'important');
                                            
                                            // حذف هر رنگ دیگری و اضافه کردن رنگ مشکی
                                            const currentStyle = cellEl.getAttribute('style') || '';
                                            let newStyle = currentStyle
                                                .replace(/color:\s*[^;!]+;?/gi, '')
                                                .replace(/color\s*:\s*[^;!]+;?/gi, '')
                                                .replace(/color:\s*#[^;!]+;?/gi, '')
                                                .replace(/color:\s*rgb\([^)]+\);?/gi, '');
                                            if (!newStyle.includes('color: #000000') && !newStyle.includes('color:#000000')) {
                                                newStyle += '; color: #000000 !important;';
                                            }
                                            cellEl.setAttribute('style', newStyle);
                                            
                                            // همچنین برای div های داخل آن
                                            const innerDivs = cellEl.querySelectorAll('div');
                                            innerDivs.forEach((div) => {
                                                const divEl = div as HTMLElement;
                                                divEl.style.color = '#000000';
                                                divEl.style.setProperty('color', '#000000', 'important');
                                                const divStyle = divEl.getAttribute('style') || '';
                                                let newDivStyle = divStyle
                                                    .replace(/color:\s*[^;!]+;?/gi, '')
                                                    .replace(/color\s*:\s*[^;!]+;?/gi, '')
                                                    .replace(/color:\s*#[^;!]+;?/gi, '')
                                                    .replace(/color:\s*rgb\([^)]+\);?/gi, '');
                                                if (!newDivStyle.includes('color: #000000') && !newDivStyle.includes('color:#000000')) {
                                                    newDivStyle += '; color: #000000 !important;';
                                                }
                                                divEl.setAttribute('style', newDivStyle);
                                            });
                                            
                                            // همچنین برای همه text nodes و span ها
                                            const allTextElements = cellEl.querySelectorAll('span, p, strong, b');
                                            allTextElements.forEach((el) => {
                                                const elEl = el as HTMLElement;
                                                elEl.style.color = '#000000';
                                                elEl.style.setProperty('color', '#000000', 'important');
                                            });
                                        }
                                    }
                                }
                            });
                            
                            // اطمینان از وسط چین بودن جدول
                            clonedTables.forEach((table) => {
                                const tableEl = table as HTMLElement;
                                tableEl.style.margin = '0 auto';
                                tableEl.style.display = 'table';
                            });
                            
                            console.log('✅ Cloned div styled, content length:', clonedDiv.innerHTML.length);
                        } else {
                            console.warn('⚠️ Cloned div not found in onclone!');
                        }
                    }
                });
                
                if (!canvas || canvas.width === 0 || canvas.height === 0) {
                    console.error('❌ Canvas is empty! width:', canvas?.width, 'height:', canvas?.height);
                    document.body.removeChild(tempDiv);
                    alert('خطا: تصویر صورتحساب خالی است. لطفاً صفحه را refresh کنید.');
                    return;
                }
                
                console.log('✅ Canvas created successfully:', canvas.width, 'x', canvas.height);
            } catch (canvasError: any) {
                console.error('❌ Error creating canvas:', canvasError);
                console.error('❌ Error stack:', canvasError?.stack);
                document.body.removeChild(tempDiv);
                alert('خطا در ایجاد تصویر صورتحساب. لطفاً دوباره تلاش کنید.');
                return;
            }

            // حذف div موقت
            document.body.removeChild(tempDiv);

            // تبدیل به JPEG با کیفیت 0.90 برای کیفیت بهتر
            const imgData = canvas.toDataURL('image/jpeg', 0.90);
            
            // ابعاد A4 Landscape: 297mm x 210mm
            const pageWidth = 297; // A4 landscape width in mm
            const pageHeight = 210; // A4 landscape height in mm
            
            // محاسبه ابعاد تصویر برای fit کردن در صفحه landscape
            const imgWidth = pageWidth - 10; // 5mm margin on each side
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;

            // ایجاد PDF در حالت Landscape
            const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' = landscape
            let position = 5; // شروع از 5mm از بالا

            // اضافه کردن تصویر به PDF
            pdf.addImage(imgData, 'JPEG', 5, position, imgWidth, imgHeight);
            heightLeft -= (pageHeight - 10); // 5mm margin top and bottom

            // اگر محتوا بیشتر از یک صفحه است، صفحات اضافی اضافه کن
            while (heightLeft > 0) {
                position = -imgHeight + heightLeft + 5; // محاسبه موقعیت برای صفحه بعدی
                pdf.addPage('l'); // اضافه کردن صفحه جدید در حالت landscape
                pdf.addImage(imgData, 'JPEG', 5, position, imgWidth, imgHeight);
                heightLeft -= (pageHeight - 10);
            }

            // ذخیره PDF با استفاده از pdf.save() مستقیم
            const filename = `صورتحساب_${selectedInvoiceRecord.driverName}_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);
        } catch (err: any) {
            console.error('❌ [exportInvoiceToPDF] Error:', err);
            alert(`خطا در تولید PDF: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };


    // تابع برای تولید HTML صورتحساب - فقط div با استایل inline (مشابه TransportFinancePaidInvoices)
    const generateInvoiceHTML = (
        record: PaymentRecord,
        calculations: any[],
        announcementsMap: Map<string, any>,
        calcDateFrom: string,
        calcDateTo: string
    ): string => {
        const totalMainCost = calculations.reduce((sum, calc) => sum + calculateMainDriverCost(calc), 0);
        const totalAdvance = record.advancePayment || 0;
        const totalPayable = record.payableAmount || totalMainCost - totalAdvance;
        
        // فقط div با استایل inline (بدون DOCTYPE و head)
        let html = `<div dir="rtl" style="width: 100%; min-height: 100%; font-family: 'Vazirmatn', 'Tahoma', Arial, sans-serif; padding: 24px; background-color: #ffffff; box-sizing: border-box; direction: rtl; text-align: right;">
                <div style="margin-bottom: 16px; border-bottom: 2px solid #1e293b; padding-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <h1 style="font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 8px;">صورتحساب هزینه</h1>
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">کد پرسنلی: ${record.employeeId || '-'}</p>
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">نام: ${record.driverName || '-'}</p>
                            <p style="font-size: 14px; color: #475569;">شماره حساب: ${record.accountNumber || '-'}</p>
                        </div>
                        <div style="text-align: left;">
                            <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">تاریخ تهیه لیست: ${formatJalali(new Date())}</p>
                            ${calcDateFrom && calcDateTo ? `<p style="font-size: 14px; color: #475569;">بازه زمانی: ${calcDateFrom} تا ${calcDateTo}</p>` : ''}
                        </div>
                    </div>
                </div>
                <div style="margin-top: 20px; padding: 16px; background-color: #f1f5f9; border-radius: 8px;">
                    <p style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">تعداد تور: ${calculations.length}</p>
                    <p style="font-size: 14px; margin-bottom: 4px;">جمع کل هزینه: ${totalMainCost.toLocaleString('fa-IR')} ریال</p>
                    <p style="font-size: 14px; margin-bottom: 4px;">کسور (پیش پرداخت): ${totalAdvance.toLocaleString('fa-IR')} ریال</p>
                    <p style="font-size: 16px; font-weight: bold; margin-top: 8px;">مبلغ قابل پرداخت: ${totalPayable.toLocaleString('fa-IR')} ریال</p>
                </div>
                <table style="width: 100%; font-size: 12px; border-collapse: collapse; border: 1px solid #1e293b; margin-top: 20px;">
                    <thead>
                        <tr style="background-color: #1e293b; color: white;">
                            <th style="padding: 6px; border: 1px solid #475569; text-align: center; font-size: 12px; font-weight: bold;">ردیف</th>
                            <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">شماره بارنامه</th>
                            <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">مقاصد</th>
                            <th style="padding: 6px; border: 1px solid #475569; font-size: 12px; font-weight: bold;">تاریخ صدور</th>
                            <th style="padding: 6px; border: 1px solid #475569; text-align: left; font-size: 12px; font-weight: bold;">جمع کل (ریال)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        calculations.forEach((calc, idx) => {
            const announcementId = calc.announcement_id || calc.announcementId;
            const announcement = announcementsMap.get(announcementId);
            const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
            const mainCost = calculateMainDriverCost(calc);
            const billDate = calc.bill_of_lading_date || calc.billOfLadingDate || '-';
            
            html += `
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px;">${(idx + 1).toLocaleString('fa-IR')}</td>
                            <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                            <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${destinations}</td>
                            <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 12px;">${billDate}</td>
                            <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${mainCost.toLocaleString('fa-IR')}</td>
                        </tr>
            `;
        });
        
        html += `
                    </tbody>
                    <tfoot>
                        <tr style="background-color: #f1f5f9; font-weight: bold;">
                            <td colspan="4" style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-size: 12px;">جمع کل:</td>
                            <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px;">${totalMainCost.toLocaleString('fa-IR')} ریال</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
        
        return html;
    };

    // دانلود عکس صورتحساب - استفاده از روش DOM
    const exportInvoiceToImage = async () => {
        if (!invoiceRef.current || !selectedInvoiceRecord) return;

        try {
            console.log('🖼️ [exportInvoiceToImage] شروع تولید عکس با روش DOM');
            
            // ایجاد temp div برای render کردن محتوا
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '0';
            tempDiv.style.opacity = '1';
            tempDiv.style.visibility = 'visible';
            tempDiv.style.backgroundColor = '#ffffff';
            document.body.appendChild(tempDiv);

            try {
                // Clone کردن محتوای invoiceRef به temp div
                const clonedContent = invoiceRef.current.cloneNode(true) as HTMLElement;
                tempDiv.appendChild(clonedContent);
                
                // تنظیم استایل‌های temp div
                const invoiceElement = tempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
                if (invoiceElement) {
                    invoiceElement.style.width = '100%';
                    invoiceElement.style.maxWidth = '100%';
                    invoiceElement.style.margin = '0 auto';
                    invoiceElement.style.overflow = 'visible';
                    invoiceElement.style.visibility = 'visible';
                    invoiceElement.style.opacity = '1';
                }
                
                // انتظار برای render کامل
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // محاسبه ارتفاع دینامیک
                const calculatedHeight = tempDiv.scrollHeight || 2000;
                
                // گرفتن تصویر با html2canvas
                const canvas = await html2canvas(tempDiv, {
                    scale: 1.5,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    allowTaint: true,
                    logging: false,
                    width: tempDiv.scrollWidth,
                    height: calculatedHeight,
                    onclone: (clonedDoc) => {
                    // اضافه کردن style tag برای اطمینان از رنگ مشکی ستون دسته‌بندی
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
                    
                    // اعمال استایل‌های نهایی در cloned document
                    const clonedInvoice = clonedDoc.querySelector('[data-invoice-ref="true"]') as HTMLElement || 
                                         clonedDoc.querySelector('[dir="rtl"]') as HTMLElement;
                    if (clonedInvoice) {
                        clonedInvoice.style.width = 'auto';
                        clonedInvoice.style.maxWidth = '90%';
                        clonedInvoice.style.margin = '0 auto';
                        clonedInvoice.style.overflow = 'visible';
                        clonedInvoice.style.visibility = 'visible';
                        clonedInvoice.style.opacity = '1';
                        
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
                                        
                                        // همچنین برای div های داخل آن
                                        const innerDivs = firstCell.querySelectorAll('div');
                                        innerDivs.forEach((div) => {
                                            const divEl = div as HTMLElement;
                                            divEl.style.color = '#000000';
                                            divEl.style.setProperty('color', '#000000', 'important');
                                            const divStyle = divEl.getAttribute('style') || '';
                                            let newDivStyle = divStyle
                                                .replace(/color:\s*[^;!]+;?/gi, '')
                                                .replace(/color\s*:\s*[^;!]+;?/gi, '')
                                                .replace(/color:\s*#[^;!]+;?/gi, '')
                                                .replace(/color:\s*rgb\([^)]+\);?/gi, '');
                                            if (!newDivStyle.includes('color: #000000') && !newDivStyle.includes('color:#000000')) {
                                                newDivStyle += '; color: #000000 !important;';
                                            }
                                            divEl.setAttribute('style', newDivStyle);
                                        });
                                        
                                        // همچنین برای همه text nodes و span ها
                                        const allTextElements = firstCell.querySelectorAll('span, p, strong, b');
                                        allTextElements.forEach((el) => {
                                            const elEl = el as HTMLElement;
                                            elEl.style.color = '#000000';
                                            elEl.style.setProperty('color', '#000000', 'important');
                                        });
                                    }
                                }
                            });
                            
                            // اطمینان از وسط چین بودن جدول
                            tableEl.style.margin = '0 auto';
                            tableEl.style.display = 'table';
                        });
                        
                        // اول از همه، برای همه سلول‌های "مبلغ کل" رنگ مناسب تنظیم کن
                        // استفاده از data attribute برای شناسایی سریع‌تر
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
                                const currentStyle = cellEl.getAttribute('style') || '';
                                if (!currentStyle.includes('color: #ffffff') && !currentStyle.includes('color:#ffffff')) {
                                    cellEl.setAttribute('style', currentStyle + '; color: #ffffff !important;');
                                }
                            } else {
                                // برای ردیف‌های عادی: رنگ مشکی
                                cellEl.style.color = '#1e293b';
                                cellEl.style.setProperty('color', '#1e293b', 'important');
                                const currentStyle = cellEl.getAttribute('style') || '';
                                if (!currentStyle.includes('color: #1e293b') && !currentStyle.includes('color:#1e293b')) {
                                    cellEl.setAttribute('style', currentStyle + '; color: #1e293b !important;');
                                }
                            }
                        });
                        
                        // همچنین برای سلول‌هایی که data attribute ندارند اما مشخصات مشابه دارند
                        const allCells = clonedInvoice.querySelectorAll('td');
                        allCells.forEach((cell) => {
                            const cellEl = cell as HTMLElement;
                            // اگر قبلاً تنظیم نشده باشد
                            if (!cellEl.hasAttribute('data-total-amount')) {
                                const cellStyle = cellEl.getAttribute('style') || '';
                                const cellText = (cellEl.textContent || '').trim();
                                
                                // بررسی مستقیم style attribute برای backgroundColor و fontWeight
                                const hasTotalBg = (
                                    cellStyle.includes('background-color: #f1f5f9') || 
                                    cellStyle.includes('background-color: #e2e8f0') ||
                                    cellStyle.includes('backgroundColor: #f1f5f9') || 
                                    cellStyle.includes('backgroundColor: #e2e8f0')
                                );
                                
                                const hasBoldFont = (
                                    cellStyle.includes('font-weight: bold') || 
                                    cellStyle.includes('fontWeight: bold') ||
                                    cellStyle.includes('font-weight:bold') ||
                                    cellStyle.includes('fontWeight:bold')
                                );
                                
                                // اگر backgroundColor و fontWeight درست باشد و متن خالی نباشد
                                if (hasTotalBg && hasBoldFont && cellText !== '' && cellText !== '-') {
                                    // همیشه رنگ مشکی - override کن
                                    cellEl.style.color = '#1e293b';
                                    cellEl.style.setProperty('color', '#1e293b', 'important');
                                    // همچنین در style attribute هم اضافه کن
                                    if (!cellStyle.includes('color: #1e293b') && !cellStyle.includes('color:#1e293b')) {
                                        cellEl.setAttribute('style', cellStyle + '; color: #1e293b !important;');
                                    }
                                }
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
                            if (rowSpan) {
                                const rowSpanNum = parseInt(rowSpan);
                                // مطمئن شو که rowSpan در DOM حفظ شده است
                                cellEl.setAttribute('rowspan', rowSpan);
                                cellEl.setAttribute('rowSpan', rowSpan); // برای اطمینان
                                (cellEl as any).rowSpan = rowSpanNum;
                                
                                // برای سلول‌های merge شده - مطمئن شو که display درست است
                                if (rowSpanNum > 1) {
                                    cellEl.style.display = 'table-cell';
                                    cellEl.style.verticalAlign = 'middle';
                                    
                                    // حفظ استایل‌های موجود برای سلول‌های merge شده
                                    const originalStyle = cellEl.getAttribute('style') || '';
                                    const computedStyle = window.getComputedStyle(cellEl);
                                    
                                    // حفظ fontSize
                                    if (!originalStyle.includes('fontSize') && !originalStyle.includes('font-size')) {
                                        if (computedStyle.fontSize && computedStyle.fontSize !== '0px') {
                                            cellEl.style.fontSize = computedStyle.fontSize;
                                        } else {
                                            cellEl.style.fontSize = '18px';
                                        }
                                    }
                                    
                                    // حفظ color
                                    if (!originalStyle.includes('color:')) {
                                        const computedColor = computedStyle.color;
                                        if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)') {
                                            cellEl.style.color = computedColor;
                                        } else {
                                            cellEl.style.color = '#64748b';
                                        }
                                    }
                                    
                                    // حفظ backgroundColor
                                    if (!originalStyle.includes('background-color:') && !originalStyle.includes('backgroundColor')) {
                                        const computedBg = computedStyle.backgroundColor;
                                        if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
                                            cellEl.style.backgroundColor = computedBg;
                                        }
                                    }
                                    
                                    // حفظ padding
                                    if (!originalStyle.includes('padding:')) {
                                        const computedPadding = computedStyle.padding;
                                        if (computedPadding && computedPadding !== '0px') {
                                            cellEl.style.padding = computedPadding;
                                        } else {
                                            cellEl.style.padding = '10px 12px';
                                        }
                                    }
                                    
                                    // حفظ textAlign
                                    if (!originalStyle.includes('text-align:') && !originalStyle.includes('textAlign')) {
                                        const computedTextAlign = computedStyle.textAlign;
                                        if (computedTextAlign) {
                                            cellEl.style.textAlign = computedTextAlign;
                                        } else {
                                            cellEl.style.textAlign = 'right';
                                        }
                                    }
                                    
                                    // حفظ fontWeight
                                    if (!originalStyle.includes('font-weight:') && !originalStyle.includes('fontWeight')) {
                                        const computedFontWeight = computedStyle.fontWeight;
                                        if (computedFontWeight) {
                                            cellEl.style.fontWeight = computedFontWeight;
                                        } else {
                                            cellEl.style.fontWeight = '600';
                                        }
                                    }
                                }
                            }
                            
                            // حفظ استایل‌های inline موجود - override نکن (فقط برای سلول‌های بدون rowSpan)
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
                                
                                // حفظ استایل‌های inline موجود - override نکن
                                // فقط اگر استایل‌ها در inline style نیستند، از computed style استفاده کن
                                if (!originalStyle.includes('fontSize') && !originalStyle.includes('font-size')) {
                                    const computedStyle = window.getComputedStyle(cellEl);
                                    if (computedStyle.fontSize && computedStyle.fontSize !== '0px') {
                                        cellEl.style.fontSize = computedStyle.fontSize;
                                    }
                                }
                                
                                // برای سلول "مبلغ کل" - رنگ مشکی (همیشه override کن - حتی اگر در inline style تعریف شده باشد)
                                // بررسی مستقیم style attribute
                                const cellText = (cellEl.textContent || '').trim();
                                const hasTotalBg = (
                                    originalStyle.includes('background-color: #f1f5f9') || 
                                    originalStyle.includes('background-color: #e2e8f0') ||
                                    originalStyle.includes('backgroundColor: #f1f5f9') || 
                                    originalStyle.includes('backgroundColor: #e2e8f0')
                                );
                                const hasBoldFont = (
                                    originalStyle.includes('font-weight: bold') || 
                                    originalStyle.includes('fontWeight: bold') ||
                                    originalStyle.includes('font-weight:bold') ||
                                    originalStyle.includes('fontWeight:bold')
                                );
                                
                                if (hasTotalBg && hasBoldFont && cellText !== '' && cellText !== '-') {
                                    // همیشه رنگ مشکی - override کن حتی اگر در inline style تعریف شده باشد
                                    cellEl.style.color = '#1e293b';
                                    cellEl.style.setProperty('color', '#1e293b', 'important');
                                    // همچنین در style attribute هم اضافه کن
                                    if (!originalStyle.includes('color: #1e293b') && !originalStyle.includes('color:#1e293b')) {
                                        cellEl.setAttribute('style', originalStyle + '; color: #1e293b !important;');
                                    }
                                } else {
                                    // حفظ رنگ فونت - اگر در inline style تعریف شده، override نکن
                                    if (!originalStyle.includes('color:')) {
                                        const computedColor = window.getComputedStyle(cellEl).color;
                                        if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)') {
                                            cellEl.style.color = computedColor;
                                        }
                                    }
                                }
                                
                                // حفظ backgroundColor اگر در inline style تعریف شده
                                if (!originalStyle.includes('background-color:') && !originalStyle.includes('backgroundColor')) {
                                    const computedBg = window.getComputedStyle(cellEl).backgroundColor;
                                    if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
                                        cellEl.style.backgroundColor = computedBg;
                                    }
                                }
                                
                                // حفظ padding اگر در inline style تعریف شده
                                if (!originalStyle.includes('padding:')) {
                                    const computedPadding = window.getComputedStyle(cellEl).padding;
                                    if (computedPadding && computedPadding !== '0px') {
                                        cellEl.style.padding = computedPadding;
                                    }
                                }
                                
                                // حفظ textAlign اگر در inline style تعریف شده
                                if (!originalStyle.includes('text-align:') && !originalStyle.includes('textAlign')) {
                                    const computedTextAlign = window.getComputedStyle(cellEl).textAlign;
                                    if (computedTextAlign) {
                                        cellEl.style.textAlign = computedTextAlign;
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
                            
                            // برای سلول‌های merge شده (rowSpan) - مطمئن شو که display درست است
                            if (rowSpan && parseInt(rowSpan) > 1) {
                                cellEl.style.display = 'table-cell';
                                cellEl.style.verticalAlign = 'middle';
                            }
                        });
                    }
                }
                });

                if (!canvas || canvas.width === 0 || canvas.height === 0) {
                    console.error('❌ [exportInvoiceToImage] Canvas خالی');
                    document.body.removeChild(tempDiv);
                    alert('خطا در تولید عکس. لطفاً دوباره تلاش کنید.');
                    return;
                }

                // تبدیل به PNG با کیفیت بالا
                const imgData = canvas.toDataURL('image/png', 1.0);
                
                // پاک کردن temp div
                document.body.removeChild(tempDiv);
                
                // ایجاد لینک دانلود
                const link = document.createElement('a');
                link.download = `صورتحساب_${selectedInvoiceRecord.driverName}_${new Date().toISOString().split('T')[0]}.png`;
                link.href = imgData;
                link.click();
                
                console.log('✅ [exportInvoiceToImage] عکس با موفقیت تولید شد');
            } catch (err: any) {
                console.error('❌ [exportInvoiceToImage] Error:', err);
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                throw err;
            }
        } catch (err: any) {
            console.error('❌ [exportInvoiceToImage] Error:', err);
            alert(`خطا در تولید عکس: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // علامت‌گذاری پرداخت شد - فقط برای همان تور خاص
    const markAsPaid = async (record: PaymentRecord) => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // اگر calculationId نداریم، نمی‌توانیم پرداخت را ثبت کنیم
            if (!record.calculationId && !record.announcementId) {
                alert('خطا: شناسه محاسبه یافت نشد');
                return;
            }

            // تاریخ امروز
            const today = new Date();
            const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const paymentDate = `${jy}/${pad2(jm)}/${pad2(jd)}`;

            const userId = currentUser?.id || currentUser?.userId || '';

            // برای هر تور، فقط همان calculationId را پرداخت می‌کنیم
            // از API payments استفاده می‌کنیم اما با calculationId (یا announcementId + driverId)
            const response = await fetch(getApiUrl('payments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    driverId: record.driverId,
                    paymentDate,
                    paymentAmount: record.payableAmount,
                    calculationDateFrom: record.calculationDate || startDate || null,
                    calculationDateTo: record.calculationDate || endDate || null,
                    paymentListDate: paymentDate,
                    userId,
                    announcementId: record.announcementId || null, // اضافه کردن announcementId برای شناسایی تور خاص
                    calculationId: record.calculationId || null, // اضافه کردن calculationId برای شناسایی محاسبه خاص
                    isHelper: record.isHelper || false, // مشخص کردن اینکه آیا برای راننده کمکی است یا نه
                }),
            });

            if (!response.ok) {
                throw new Error('خطا در ثبت پرداخت');
            }

            alert(`پرداخت برای ${record.driverName} (تور خاص) با موفقیت ثبت شد`);
            // صبر کردن کمی تا backend پرداخت را ثبت کند
            await new Promise(resolve => setTimeout(resolve, 500));
            // بارگذاری مجدد داده‌ها
            await fetchData();
        } catch (err: any) {
            console.error('❌ [markAsPaid] Error:', err);
            alert(`خطا در ثبت پرداخت: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    console.log('🎨 [TransportFinancePaymentList] قبل از render:', { loading, error, paymentRecordsCount: paymentRecords.length });
    
    if (loading) {
        console.log('⏳ [TransportFinancePaymentList] نمایش loading...');
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">در حال بارگذاری...</div>
            </div>
        );
    }

    if (error) {
        console.log('❌ [TransportFinancePaymentList] نمایش error:', error);
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    console.log('✅ [TransportFinancePaymentList] render کردن محتوای اصلی');
    return (
        <div className="w-full px-6 py-4 space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-800">
                        لیست پرداخت
                    </h1>
                    <button
                        onClick={() => setRulesDialogOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        قوانین کارتابل
                    </button>
                </div>

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
                                <th className="p-3 text-right border-l border-slate-600">مبلغ هزینه (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">کسور(پیش پرداخت) (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">مبلغ قابل پرداخت (ریال)</th>
                                <th className="p-3 text-right border-l border-slate-600">تاریخ محاسبه</th>
                                <th className="p-3 text-right border-l border-slate-600">آخرین پرداخت هزینه</th>
                                <th className="p-3 text-right border-l border-slate-600">توضیحات</th>
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
                                    <td className="p-3 border-l border-slate-200 text-left font-semibold text-orange-700">
                                        {record.advancePayment < 0 ? '−' : ''}{Math.abs(record.advancePayment).toLocaleString('fa-IR')}
                                    </td>
                                    <td className={`p-3 border-l border-slate-200 text-left font-semibold ${record.payableAmount < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                        <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                                            {record.payableAmount < 0 ? '−' : ''}{Math.abs(record.payableAmount).toLocaleString('fa-IR')}
                                        </span>
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
                                    <td className="p-3 border-l border-slate-200 text-xs text-slate-700" style={{ maxWidth: '300px' }}>
                                        <div className="line-clamp-2" title={record.descriptions || '-'}>
                                            {record.descriptions || '-'}
                                        </div>
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
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-full max-h-[95vh] overflow-hidden flex flex-col">
                        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10">
                            <h2 className="text-xl font-bold text-white">
                                صورتحساب {selectedInvoiceRecord.driverName}
                            </h2>
                            <div className="flex gap-2 items-center">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-white">نوع صورتحساب:</label>
                                    <select
                                        value={invoiceLayout}
                                        onChange={(e) => setInvoiceLayout(e.target.value as InvoiceLayoutType)}
                                        className="px-3 py-1 border border-slate-300 rounded-md text-sm bg-white text-slate-800"
                                    >
                                        <option value={InvoiceLayoutType.HORIZONTAL}>روش 1: افقی (هر تور یک ردیف)</option>
                                        <option value={InvoiceLayoutType.STANDARD_ACCOUNTING}>روش 2: استاندارد حسابداری</option>
                                        <option value={InvoiceLayoutType.TOUR_DETAILS_STYLE}>روش 3: سبک جزئیات تور (هر تور یک ردیف با راننده اصلی و کمکی)</option>
                                    </select>
                                </div>
                                <button
                                    onClick={exportInvoiceToImage}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                                >
                                    دانلود عکس
                                </button>
                                <button
                                    onClick={() => {
                                        setInvoiceDialogOpen(false);
                                        setSelectedInvoiceRecord(null);
                                        setInvoiceCalculations([]);
                                        setInvoiceAnnouncements(new Map());
                                    }}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                                >
                                    بستن
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                            <div 
                                ref={invoiceRef} 
                                data-invoice-ref="true"
                                className="p-6 bg-white mx-auto" 
                                dir="rtl" 
                                style={{ 
                                    width: '100%',
                                    maxWidth: '100%',
                                    minHeight: '210mm',
                                    overflowX: 'hidden',
                                    overflowY: 'visible',
                                }}
                            >
                            {/* هدر صورتحساب */}
                            <div className="mb-4 border-b-2 border-slate-800 pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontSize: '20px' }}>صورتحساب هزینه</h1>
                                        <p className="text-sm text-slate-600 mb-1" style={{ fontSize: '14px' }}>کد پرسنلی: {selectedInvoiceRecord.employeeId}</p>
                                        <p className="text-sm text-slate-600 mb-1" style={{ fontSize: '14px' }}>نام: {selectedInvoiceRecord.driverName}</p>
                                        <p className="text-sm text-slate-600" style={{ fontSize: '14px' }}>شماره حساب: {selectedInvoiceRecord.accountNumber || '-'}</p>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm text-slate-600 mb-1" style={{ fontSize: '14px' }}>تاریخ تهیه لیست: {formatJalali(new Date())}</p>
                                        {startDate && endDate && (
                                            <p className="text-sm text-slate-600" style={{ fontSize: '14px' }}>
                                                بازه زمانی: {startDate} تا {endDate}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* انتخاب نوع ساختار صورتحساب */}
                            {invoiceLayout === InvoiceLayoutType.HORIZONTAL && (() => {
                                const invoiceData = convertToInvoiceDataFormatHorizontal(
                                    selectedInvoiceRecord,
                                    invoiceCalculations,
                                    invoiceAnnouncements,
                                    startDate,
                                    endDate
                                );
                                // محاسبه تعداد تورها
                                const numTours = invoiceData.tourData?.length || invoiceCalculations.length;
                                
                                // محاسبه تعداد ستون‌های هزینه
                                const mainBlock = invoiceData.blocks[0];
                                const costRows = mainBlock?.rows.filter(r => r.kind === 'cost' || r.kind === 'categoryHeader') || [];
                                const costColumnsCount = costRows.filter(r => r.kind === 'cost').length;
                                const totalColumns = 10 + costColumnsCount + 1; // 10 ستون اطلاعات اولیه + ستون‌های هزینه + جمع کل
                                
                                // محاسبه عرض و فونت دینامیک
                                let containerWidth = 2100;
                                let fontSize = 13;
                                let cellPadding = '14px 12px';
                                
                                if (totalColumns > 20) {
                                    containerWidth = 2400;
                                    fontSize = 11;
                                    cellPadding = '12px 10px';
                                } else if (totalColumns > 15) {
                                    containerWidth = 2200;
                                    fontSize = 12;
                                    cellPadding = '13px 11px';
                                } else if (totalColumns > 12) {
                                    containerWidth = 2100;
                                    fontSize = 13;
                                    cellPadding = '14px 12px';
                                }
                                
                                if (numTours > 10) {
                                    containerWidth = Math.max(containerWidth, 2400);
                                    fontSize = Math.min(fontSize, 11);
                                    cellPadding = '12px 10px';
                                } else if (numTours > 8) {
                                    containerWidth = Math.max(containerWidth, 2200);
                                    fontSize = Math.min(fontSize, 12);
                                    cellPadding = '13px 11px';
                                }
                                
                                const allBlocks = invoiceData.blocks || [];
                                const mainBlock2 = allBlocks[0];
                                const helperBlocks = allBlocks.slice(1);
                                const costRows2 = mainBlock2?.rows.filter(r => r.kind === 'cost' || r.kind === 'categoryHeader') || [];
                                
                                // ساخت ستون‌های هزینه با دسته‌بندی
                                const costColumns: Array<{ 
                                    label: string; 
                                    category: string;
                                    tourValues?: number[]; 
                                    totalAmount?: number; 
                                    isDepotCount?: boolean;
                                }> = [];
                                let currentCategory = '';
                                
                                costRows2.forEach(row => {
                                    if (row.kind === 'categoryHeader') {
                                        currentCategory = row.category || '';
                                    } else if (row.kind === 'cost') {
                                        costColumns.push({
                                            label: row.description || '',
                                            category: currentCategory,
                                            tourValues: row.tourValues || [],
                                            totalAmount: row.totalAmount || undefined,
                                            isDepotCount: row.isDepotCount || false,
                                        });
                                    }
                                });
                                
                                // ساخت دسته‌بندی‌ها
                                const categoryGroups: Array<{ category: string; startIndex: number; count: number }> = [];
                                let currentGroupCategory = '';
                                let currentGroupStart = 0;
                                
                                costColumns.forEach((col, idx) => {
                                    if (col.category !== currentGroupCategory) {
                                        if (currentGroupCategory) {
                                            categoryGroups.push({
                                                category: currentGroupCategory,
                                                startIndex: currentGroupStart,
                                                count: idx - currentGroupStart
                                            });
                                        }
                                        currentGroupCategory = col.category;
                                        currentGroupStart = idx;
                                    }
                                });
                                if (currentGroupCategory) {
                                    categoryGroups.push({
                                        category: currentGroupCategory,
                                        startIndex: currentGroupStart,
                                        count: costColumns.length - currentGroupStart
                                    });
                                }
                                
                                return (
                                    <div style={{ width: '100%', overflowX: 'auto', direction: 'rtl' }}>
                                        <div style={{
                                            direction: 'rtl',
                                            unicodeBidi: 'isolate',
                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                            width: `${containerWidth}px`,
                                            maxWidth: '100%',
                                            margin: '0 auto',
                                            backgroundColor: '#ffffff',
                                            color: '#000000',
                                            padding: '20px',
                                            boxSizing: 'border-box',
                                            position: 'relative' as const,
                                            textAlign: 'center',
                                        }}>
                                            {/* اطلاعات راننده */}
                                            <div style={{
                                                marginBottom: '16px',
                                                paddingBottom: '12px',
                                                borderBottom: '1px solid #000',
                                                textAlign: 'right',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                            }}>
                                                <h3 style={{
                                                    fontSize: '18px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '8px',
                                                    textAlign: 'center',
                                                    direction: 'rtl',
                                                    unicodeBidi: 'isolate',
                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                }}>
                                                    صورتحساب هزینه
                                                </h3>
                                                <div style={{
                                                    fontSize: `${fontSize + 2}px`,
                                                    lineHeight: '1.8',
                                                    direction: 'rtl',
                                                    unicodeBidi: 'isolate',
                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                }}>
                                                    <p style={{ marginBottom: '4px' }}>کد پرسنلی: {selectedInvoiceRecord.employeeId}</p>
                                                    <p style={{ marginBottom: '4px' }}>نام: {selectedInvoiceRecord.driverName}</p>
                                                    <p>شماره حساب: {selectedInvoiceRecord.accountNumber || '-'}</p>
                                                </div>
                                            </div>
                                            
                                            {/* جدول افقی - راننده اصلی */}
                                            <table style={{
                                                width: '100%',
                                                maxWidth: '100%',
                                                borderCollapse: 'collapse',
                                                tableLayout: 'auto',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                margin: '0 auto 12px auto',
                                                fontSize: `${fontSize}px`,
                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                boxSizing: 'border-box',
                                            }}>
                                                <thead>
                                                    {/* ردیف اول: دسته‌بندی‌ها */}
                                                    <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                        <th colSpan={10} style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize + 1}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                        }}>اطلاعات اولیه</th>
                                                        {categoryGroups.map((group, groupIdx) => (
                                                            <th key={groupIdx} colSpan={group.count} style={{ 
                                                                border: '1px solid #000', 
                                                                padding: cellPadding, 
                                                                backgroundColor: '#e5e7eb', 
                                                                textAlign: 'center',
                                                                direction: 'rtl',
                                                                unicodeBidi: 'isolate',
                                                                verticalAlign: 'middle',
                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                fontSize: `${fontSize + 1}px`,
                                                                fontWeight: 'bold',
                                                                lineHeight: '1.4',
                                                            }}>{group.category}</th>
                                                        ))}
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize + 1}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                        }}>جمع کل (ریال)</th>
                                                    </tr>
                                                    {/* ردیف دوم: عناوین ستون‌ها */}
                                                    <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>ردیف</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>شماره بارنامه</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>تاریخ صدور بارنامه</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>مقاصد</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>تاریخ محاسبه</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>پلاک خودرو</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>نوع خودرو</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>پیمایش مصوب</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>پیمایش مازاد</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>ماموریت مصوب</th>
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>ماموریت مازاد</th>
                                                        {costColumns.map((col, colIdx) => (
                                                            <th key={colIdx} style={{ 
                                                                border: '1px solid #000', 
                                                                padding: cellPadding, 
                                                                backgroundColor: '#e5e7eb', 
                                                                textAlign: 'center',
                                                                direction: 'rtl',
                                                                unicodeBidi: 'isolate',
                                                                verticalAlign: 'middle',
                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                fontSize: `${fontSize}px`,
                                                                fontWeight: 'bold',
                                                                lineHeight: '1.4',
                                                                whiteSpace: 'normal',
                                                                wordWrap: 'break-word',
                                                                minWidth: '80px',
                                                            }}>{col.label}</th>
                                                        ))}
                                                        <th style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            backgroundColor: '#e5e7eb', 
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize}px`,
                                                            fontWeight: 'bold',
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>جمع کل (ریال)</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                    {Array.from({ length: numTours }, (_, tourIdx) => {
                                                        const tour = invoiceData.tourData?.[tourIdx];
                                                        const tourTotal = costColumns
                                                            .filter(col => !col.isDepotCount && col.tourValues && col.tourValues[tourIdx] !== undefined)
                                                            .reduce((sum, col) => sum + (col.tourValues?.[tourIdx] || 0), 0);
                                                        
                                                        return (
                                                            <tr key={tourIdx} style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'center',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'nowrap',
                                                                }}>{tourIdx + 1}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '120px',
                                                                }}>{tour?.billOfLadingNumber || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '120px',
                                                                }}>{tour?.billOfLadingDate || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '150px',
                                                                }}>{tour?.destinations || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '120px',
                                                                }}>{tour?.calculationDate || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '120px',
                                                                }}>{tour?.vehiclePlate || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '100px',
                                                                }}>{tour?.vehicleType || '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '100px',
                                                                }}>{tour?.approvedKm != null && !isNaN(Number(tour.approvedKm)) ? Number(tour.approvedKm).toLocaleString('fa-IR') : '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '100px',
                                                                }}>{tour?.excessKm != null && !isNaN(Number(tour.excessKm)) ? Number(tour.excessKm).toLocaleString('fa-IR') : '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '100px',
                                                                }}>{tour?.approvedMissionDays != null && !isNaN(Number(tour.approvedMissionDays)) ? Number(tour.approvedMissionDays).toLocaleString('fa-IR') : '-'}</td>
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                    whiteSpace: 'normal',
                                                                    wordWrap: 'break-word',
                                                                    maxWidth: '100px',
                                                                }}>{tour?.excessMissionDays != null && !isNaN(Number(tour.excessMissionDays)) ? Number(tour.excessMissionDays).toLocaleString('fa-IR') : '-'}</td>
                                                                {costColumns.map((col, colIdx) => {
                                                                    const tourValue = col.tourValues?.[tourIdx];
                                                                    const tourValueStr = tourValue !== undefined && tourValue !== null ? tourValue.toLocaleString('fa-IR') : '-';
                                                                    return (
                                                                        <td key={colIdx} style={{ 
                                                                            border: '1px solid #000', 
                                                                            padding: cellPadding, 
                                                                            textAlign: 'right',
                                                                            whiteSpace: 'normal',
                                                                            wordWrap: 'break-word',
                                                                            direction: 'rtl',
                                                                            unicodeBidi: 'isolate',
                                                                            verticalAlign: 'middle',
                                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                            fontSize: `${fontSize}px`,
                                                                            lineHeight: '1.4',
                                                                        }}>{tourValueStr}</td>
                                                                    );
                                                                })}
                                                                <td style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    whiteSpace: 'nowrap',
                                                                    fontWeight: 'bold',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                }}>{tourTotal.toLocaleString('fa-IR')}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {/* ردیف جمع کل */}
                                                    <tr style={{ backgroundColor: '#3b82f6', direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                        <td colSpan={10} style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            textAlign: 'center', 
                                                            fontWeight: 'bold', 
                                                            color: '#ffffff',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize + 1}px`,
                                                            lineHeight: '1.4',
                                                            whiteSpace: 'nowrap',
                                                        }}>جمع کل</td>
                                                        {costColumns.map((col, colIdx) => {
                                                            if (col.isDepotCount) {
                                                                return (
                                                                    <td key={colIdx} style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        textAlign: 'center', 
                                                                        fontWeight: 'bold', 
                                                                        color: '#ffffff',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>-</td>
                                                                );
                                                            }
                                                            const colTotal = col.tourValues?.reduce((sum, val) => sum + (val || 0), 0) || 0;
                                                            return (
                                                                <td key={colIdx} style={{ 
                                                                    border: '1px solid #000', 
                                                                    padding: cellPadding, 
                                                                    textAlign: 'right',
                                                                    whiteSpace: 'nowrap',
                                                                    fontWeight: 'bold', 
                                                                    color: '#ffffff',
                                                                    direction: 'rtl',
                                                                    unicodeBidi: 'isolate',
                                                                    verticalAlign: 'middle',
                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                    fontSize: `${fontSize}px`,
                                                                    lineHeight: '1.4',
                                                                }}>{colTotal.toLocaleString('fa-IR')}</td>
                                                            );
                                                        })}
                                                        <td style={{ 
                                                            border: '1px solid #000', 
                                                            padding: cellPadding, 
                                                            textAlign: 'right',
                                                            whiteSpace: 'nowrap',
                                                            fontWeight: 'bold', 
                                                            color: '#ffffff',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            verticalAlign: 'middle',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            fontSize: `${fontSize + 1}px`,
                                                            lineHeight: '1.4',
                                                        }}>
                                                            {costColumns
                                                                .filter(col => !col.isDepotCount && col.totalAmount)
                                                                .reduce((sum, col) => sum + (col.totalAmount || 0), 0)
                                                                .toLocaleString('fa-IR')}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                            
                                            {/* بخش خلاصه */}
                                            {mainBlock2?.summary && (
                                                <div style={{
                                                    width: '100%',
                                                    maxWidth: '100%',
                                                    padding: '8px 10px',
                                                    border: '2px solid #3b82f6',
                                                    backgroundColor: '#dbeafe',
                                                    fontSize: `${fontSize + 1}px`,
                                                    lineHeight: '1.8',
                                                    direction: 'rtl',
                                                    unicodeBidi: 'isolate',
                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                    boxSizing: 'border-box',
                                                    margin: '8px auto 0 auto',
                                                }}>
                                                    <div style={{ direction: 'rtl', unicodeBidi: 'isolate', marginBottom: '4px' }}>
                                                        جمع کل هزینه سفر: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock2.summary.totalTripCost.toLocaleString('fa-IR')}</span> ریال
                                                    </div>
                                                    {mainBlock2.summary.deductionsAmount && mainBlock2.summary.deductionsAmount > 0 && (
                                                        <div style={{ direction: 'rtl', unicodeBidi: 'isolate', marginBottom: '4px' }}>
                                                            {mainBlock2.summary.deductionsTitle || 'کسور'}: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock2.summary.deductionsAmount.toLocaleString('fa-IR')}</span> ریال
                                                        </div>
                                                    )}
                                                    <div style={{ direction: 'rtl', unicodeBidi: 'isolate', fontWeight: 'bold', marginBottom: '4px' }}>
                                                        مبلغ قابل پرداخت: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock2.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* جداول راننده‌های کمکی */}
                                            {helperBlocks.length > 0 && helperBlocks.map((helperBlock, helperIdx) => {
                                                const titleMatch = helperBlock.title.match(/راننده کمکی - کدپرسنلی: (\d+) - (.+)/);
                                                const helperEmployeeId = titleMatch ? titleMatch[1] : '';
                                                const helperName = titleMatch ? titleMatch[2] : '';
                                                
                                                const helperCostRows = helperBlock.rows.filter(r => r.kind === 'cost' || r.kind === 'categoryHeader') || [];
                                                const helperCostColumns: Array<{ 
                                                    label: string; 
                                                    category: string;
                                                    tourValues?: number[]; 
                                                    totalAmount?: number; 
                                                    isDepotCount?: boolean;
                                                }> = [];
                                                let helperCurrentCategory = '';
                                                
                                                helperCostRows.forEach(row => {
                                                    if (row.kind === 'categoryHeader') {
                                                        helperCurrentCategory = row.category || '';
                                                    } else if (row.kind === 'cost') {
                                                        helperCostColumns.push({
                                                            label: row.description || '',
                                                            category: helperCurrentCategory,
                                                            tourValues: row.tourValues || [],
                                                            totalAmount: row.totalAmount || undefined,
                                                            isDepotCount: row.isDepotCount || false,
                                                        });
                                                    }
                                                });
                                                
                                                const helperCategoryGroups: Array<{ category: string; startIndex: number; count: number }> = [];
                                                let helperCurrentGroupCategory = '';
                                                let helperCurrentGroupStart = 0;
                                                
                                                helperCostColumns.forEach((col, idx) => {
                                                    if (col.category !== helperCurrentGroupCategory) {
                                                        if (helperCurrentGroupCategory) {
                                                            helperCategoryGroups.push({
                                                                category: helperCurrentGroupCategory,
                                                                startIndex: helperCurrentGroupStart,
                                                                count: idx - helperCurrentGroupStart
                                                            });
                                                        }
                                                        helperCurrentGroupCategory = col.category;
                                                        helperCurrentGroupStart = idx;
                                                    }
                                                });
                                                if (helperCurrentGroupCategory) {
                                                    helperCategoryGroups.push({
                                                        category: helperCurrentGroupCategory,
                                                        startIndex: helperCurrentGroupStart,
                                                        count: helperCostColumns.length - helperCurrentGroupStart
                                                    });
                                                }
                                                
                                                const helperCalculations = invoiceData.helperCalculationsByEmployeeId?.get(helperEmployeeId) || [];
                                                const helperTourData = helperCalculations.map((calc: any) => {
                                                    const announcement = invoiceAnnouncements.get(calc.announcement_id || calc.announcementId);
                                                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                                    const origin = announcement?.origin?.city || announcement?.origin || calc.origin || '-';
                                                    const billOfLadingNumber = calc.bill_of_lading_number || calc.billOfLadingNumber || '-';
                                                    const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                                                    return {
                                                        billOfLadingNumber,
                                                        origin,
                                                        destinations,
                                                        vehiclePlate,
                                                    };
                                                });
                                                const helperNumTours = helperTourData.length;
                                                
                                                return (
                                                    <div key={helperIdx} style={{ marginTop: '32px' }}>
                                                        <h4 style={{
                                                            fontSize: `${fontSize + 3}px`,
                                                            fontWeight: 'bold',
                                                            marginBottom: '16px',
                                                            textAlign: 'center',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            color: '#16a34a',
                                                            borderBottom: '2px solid #16a34a',
                                                            paddingBottom: '8px',
                                                        }}>
                                                            {helperBlock.title}
                                                        </h4>
                                                        
                                                        {/* جدول افقی راننده کمکی */}
                                                        <table style={{
                                                            width: '100%',
                                                            maxWidth: '100%',
                                                            borderCollapse: 'collapse',
                                                            tableLayout: 'fixed',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                            margin: '0 auto 12px auto',
                                                            fontSize: `${fontSize}px`,
                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                            boxSizing: 'border-box',
                                                        }}>
                                                            <thead>
                                                                {/* ردیف اول: دسته‌بندی‌ها */}
                                                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                    <th colSpan={5} style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize + 1}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                    }}>اطلاعات اولیه</th>
                                                                    {helperCategoryGroups.map((group, groupIdx) => (
                                                                        <th key={groupIdx} colSpan={group.count} style={{ 
                                                                            border: '1px solid #000', 
                                                                            padding: cellPadding, 
                                                                            backgroundColor: '#e5e7eb', 
                                                                            textAlign: 'center',
                                                                            direction: 'rtl',
                                                                            unicodeBidi: 'isolate',
                                                                            verticalAlign: 'middle',
                                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                            fontSize: `${fontSize + 1}px`,
                                                                            fontWeight: 'bold',
                                                                            lineHeight: '1.4',
                                                                        }}>{group.category}</th>
                                                                    ))}
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize + 1}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                    }}>جمع کل (ریال)</th>
                                                                </tr>
                                                                {/* ردیف دوم: عناوین ستون‌ها */}
                                                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>ردیف</th>
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>شماره بارنامه</th>
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>مبدأ</th>
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>مقصد</th>
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>پلاک خودرو</th>
                                                                    {helperCostColumns.map((col, colIdx) => (
                                                                        <th key={colIdx} style={{ 
                                                                            border: '1px solid #000', 
                                                                            padding: cellPadding, 
                                                                            backgroundColor: '#e5e7eb', 
                                                                            textAlign: 'center',
                                                                            direction: 'rtl',
                                                                            unicodeBidi: 'isolate',
                                                                            verticalAlign: 'middle',
                                                                            fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                            fontSize: `${fontSize}px`,
                                                                            fontWeight: 'bold',
                                                                            lineHeight: '1.4',
                                                                            whiteSpace: 'normal',
                                                                            wordWrap: 'break-word',
                                                                            minWidth: '80px',
                                                                        }}>{col.label}</th>
                                                                    ))}
                                                                    <th style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        backgroundColor: '#e5e7eb', 
                                                                        textAlign: 'center',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize}px`,
                                                                        fontWeight: 'bold',
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>جمع کل (ریال)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                {Array.from({ length: helperNumTours }, (_, tourIdx) => {
                                                                    const tour = helperTourData[tourIdx];
                                                                    const tourTotal = helperCostColumns
                                                                        .filter(col => !col.isDepotCount && col.tourValues && col.tourValues[tourIdx] !== undefined)
                                                                        .reduce((sum, col) => sum + (col.tourValues?.[tourIdx] || 0), 0);
                                                                    
                                                                    return (
                                                                        <tr key={tourIdx} style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'center',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>{tourIdx + 1}</td>
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                                whiteSpace: 'normal',
                                                                                wordWrap: 'break-word',
                                                                                maxWidth: '120px',
                                                                            }}>{tour?.billOfLadingNumber || '-'}</td>
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                                whiteSpace: 'normal',
                                                                                wordWrap: 'break-word',
                                                                                maxWidth: '100px',
                                                                            }}>{tour?.origin || '-'}</td>
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                                whiteSpace: 'normal',
                                                                                wordWrap: 'break-word',
                                                                                maxWidth: '150px',
                                                                            }}>{tour?.destinations || '-'}</td>
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                                whiteSpace: 'normal',
                                                                                wordWrap: 'break-word',
                                                                                maxWidth: '120px',
                                                                            }}>{tour?.vehiclePlate || '-'}</td>
                                                                            {helperCostColumns.map((col, colIdx) => {
                                                                                const tourValue = col.tourValues?.[tourIdx];
                                                                                const tourValueStr = tourValue !== undefined && tourValue !== null ? tourValue.toLocaleString('fa-IR') : '-';
                                                                                return (
                                                                                    <td key={colIdx} style={{ 
                                                                                        border: '1px solid #000', 
                                                                                        padding: cellPadding, 
                                                                                        textAlign: 'right',
                                                                                        whiteSpace: 'normal',
                                                                                        wordWrap: 'break-word',
                                                                                        direction: 'rtl',
                                                                                        unicodeBidi: 'isolate',
                                                                                        verticalAlign: 'middle',
                                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                        fontSize: `${fontSize}px`,
                                                                                        lineHeight: '1.4',
                                                                                    }}>{tourValueStr}</td>
                                                                                );
                                                                            })}
                                                                            <td style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                whiteSpace: 'nowrap',
                                                                                fontWeight: 'bold',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                            }}>{tourTotal.toLocaleString('fa-IR')}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                                {/* ردیف جمع کل راننده کمکی */}
                                                                <tr style={{ backgroundColor: '#16a34a', direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                                    <td colSpan={5} style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        textAlign: 'center', 
                                                                        fontWeight: 'bold', 
                                                                        color: '#ffffff',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize + 1}px`,
                                                                        lineHeight: '1.4',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>جمع کل</td>
                                                                    {helperCostColumns.map((col, colIdx) => {
                                                                        if (col.isDepotCount) {
                                                                            return (
                                                                                <td key={colIdx} style={{ 
                                                                                    border: '1px solid #000', 
                                                                                    padding: cellPadding, 
                                                                                    textAlign: 'center', 
                                                                                    fontWeight: 'bold', 
                                                                                    color: '#ffffff',
                                                                                    direction: 'rtl',
                                                                                    unicodeBidi: 'isolate',
                                                                                    verticalAlign: 'middle',
                                                                                    fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                    fontSize: `${fontSize}px`,
                                                                                    lineHeight: '1.4',
                                                                                    whiteSpace: 'nowrap',
                                                                                }}>-</td>
                                                                            );
                                                                        }
                                                                        const colTotal = col.tourValues?.reduce((sum, val) => sum + (val || 0), 0) || 0;
                                                                        return (
                                                                            <td key={colIdx} style={{ 
                                                                                border: '1px solid #000', 
                                                                                padding: cellPadding, 
                                                                                textAlign: 'right',
                                                                                whiteSpace: 'nowrap',
                                                                                fontWeight: 'bold', 
                                                                                color: '#ffffff',
                                                                                direction: 'rtl',
                                                                                unicodeBidi: 'isolate',
                                                                                verticalAlign: 'middle',
                                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                                fontSize: `${fontSize}px`,
                                                                                lineHeight: '1.4',
                                                                            }}>{colTotal.toLocaleString('fa-IR')}</td>
                                                                        );
                                                                    })}
                                                                    <td style={{ 
                                                                        border: '1px solid #000', 
                                                                        padding: cellPadding, 
                                                                        textAlign: 'right',
                                                                        whiteSpace: 'nowrap',
                                                                        fontWeight: 'bold', 
                                                                        color: '#ffffff',
                                                                        direction: 'rtl',
                                                                        unicodeBidi: 'isolate',
                                                                        verticalAlign: 'middle',
                                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                        fontSize: `${fontSize + 1}px`,
                                                                        lineHeight: '1.4',
                                                                    }}>
                                                                        {helperCostColumns
                                                                            .filter(col => !col.isDepotCount && col.totalAmount)
                                                                            .reduce((sum, col) => sum + (col.totalAmount || 0), 0)
                                                                            .toLocaleString('fa-IR')}
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        
                                                        {/* خلاصه راننده کمکی */}
                                                        {helperBlock.summary && (
                                                            <div style={{
                                                                width: '100%',
                                                                maxWidth: '100%',
                                                                padding: '8px 10px',
                                                                border: '2px solid #16a34a',
                                                                backgroundColor: '#dcfce7',
                                                                fontSize: `${fontSize + 1}px`,
                                                                lineHeight: '1.8',
                                                                direction: 'rtl',
                                                                unicodeBidi: 'isolate',
                                                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                                boxSizing: 'border-box',
                                                                margin: '8px auto 0 auto',
                                                            }}>
                                                                <div style={{ direction: 'rtl', unicodeBidi: 'isolate', fontWeight: 'bold', marginBottom: '4px' }}>
                                                                    جمع کل هزینه راننده کمکی: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{helperBlock.summary.totalTripCost.toLocaleString('fa-IR')}</span> ریال
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* خلاصه نهایی */}
                                            {invoiceCalculations.length > 0 && (() => {
                                                const totalMainAll = invoiceCalculations.reduce((sum, calc) => sum + calculateMainDriverCostGlobal(calc), 0);
                                                const totalHelper = Array.from(helperBlocks).reduce((sum, block) => sum + (block.summary?.totalTripCost || 0), 0);
                                                const totalAdvancePayment = invoiceCalculations.reduce((sum, calc) => sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0)), 0);
                                                const mainDriverPayable = totalMainAll - totalAdvancePayment;
                                                const payableAmount = mainDriverPayable + totalHelper;
                                                
                                                return (
                                                    <div style={{
                                                        marginTop: '16px',
                                                        padding: '12px',
                                                        backgroundColor: '#f1f5f9',
                                                        borderRadius: '4px',
                                                        border: '1px solid #cbd5e1',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                                    }}>
                                                        <p style={{ 
                                                            fontSize: `${fontSize + 2}px`, 
                                                            fontWeight: 'bold', 
                                                            marginBottom: '8px',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                        }}>
                                                            خلاصه:
                                                        </p>
                                                        <p style={{ 
                                                            fontSize: `${fontSize}px`, 
                                                            marginBottom: '4px',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                        }}>
                                                            تعداد تور: {invoiceCalculations.length}
                                                        </p>
                                                        <p style={{ 
                                                            fontSize: `${fontSize}px`, 
                                                            marginBottom: '4px',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                        }}>
                                                            هزینه‌های راننده اصلی: <span style={{ fontWeight: 'bold' }}>{totalMainAll.toLocaleString('fa-IR')}</span> ریال
                                                        </p>
                                                        {helperBlocks.length > 0 && (
                                                            <div style={{ marginTop: '4px' }}>
                                                                {helperBlocks.map((helperBlock, idx) => {
                                                                    const titleMatch = helperBlock.title.match(/راننده کمکی - کدپرسنلی: (\d+) - (.+)/);
                                                                    const helperEmployeeId = titleMatch ? titleMatch[1] : '';
                                                                    const helperName = titleMatch ? titleMatch[2] : '';
                                                                    return (
                                                                        <p key={idx} style={{ 
                                                                            fontSize: `${fontSize}px`, 
                                                                            marginBottom: '4px',
                                                                            direction: 'rtl',
                                                                            unicodeBidi: 'isolate',
                                                                        }}>
                                                                            هزینه راننده کمکی ({helperEmployeeId} - {helperName}): <span style={{ fontWeight: 'bold' }}>{(helperBlock.summary?.totalTripCost || 0).toLocaleString('fa-IR')}</span> ریال
                                                                        </p>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {totalAdvancePayment !== 0 && (
                                                            <p style={{ 
                                                                fontSize: `${fontSize}px`, 
                                                                marginBottom: '4px',
                                                                direction: 'rtl',
                                                                unicodeBidi: 'isolate',
                                                            }}>
                                                                کسور (پیش پرداخت): <span style={{ fontWeight: 'bold' }}>{totalAdvancePayment.toLocaleString('fa-IR')}</span> ریال
                                                            </p>
                                                        )}
                                                        <p style={{ 
                                                            fontSize: `${fontSize + 1}px`, 
                                                            fontWeight: 'bold',
                                                            marginTop: '8px',
                                                            direction: 'rtl',
                                                            unicodeBidi: 'isolate',
                                                        }}>
                                                            مبلغ قابل پرداخت: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{payableAmount.toLocaleString('fa-IR')}</span> ریال
                                                        </p>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })()}
                            {invoiceLayout === InvoiceLayoutType.STANDARD_ACCOUNTING && renderInvoiceLayout1(
                                selectedInvoiceRecord,
                                invoiceCalculations,
                                invoiceAnnouncements,
                                startDate,
                                endDate
                            )}
                            {/* منطق قدیمی - حذف شده (برای مرجع در git history) */}
                            {false && (() => {
                                // جدا کردن محاسبات با راننده کمکی و بدون راننده کمکی
                                const calculationsWithoutHelper = invoiceCalculations.filter((calc: any) => {
                                    const helperId = calc.helper_driver_id || calc.helperDriverId;
                                    const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                    const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                    const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                    return !helperId || (helperAllowance + helperFoodCost + helperExcessMissionCost === 0);
                                });
                                
                                const calculationsWithHelper = invoiceCalculations.filter((calc: any) => {
                                    const helperId = calc.helper_driver_id || calc.helperDriverId;
                                    const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                    const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                    const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                    return helperId && (helperAllowance + helperFoodCost + helperExcessMissionCost > 0);
                                });

                                // گروه‌بندی محاسبات با راننده کمکی بر اساس کد پرسنلی راننده کمکی
                                const helperCalculationsByEmployeeId = new Map<string, any[]>();
                                calculationsWithHelper.forEach((calc: any) => {
                                    const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
                                    if (helperEmployeeId) {
                                        if (!helperCalculationsByEmployeeId.has(helperEmployeeId)) {
                                            helperCalculationsByEmployeeId.set(helperEmployeeId, []);
                                        }
                                        helperCalculationsByEmployeeId.get(helperEmployeeId)!.push(calc);
                                    }
                                });

                                // تابع محاسبه هزینه‌های راننده اصلی (تعریف مجدد برای استفاده محلی - اما با همان منطق)
                                const calculateMainDriverCostLocal = (calc: any) => {
                                    const food = calc.food_cost || calc.foodCost || 0;
                                    const fuel = calc.fuel_cost || calc.fuelCost || 0;
                                    const toll = calc.toll_cost || calc.tollCost || 0;
                                    const bill = calc.bill_of_lading_cost || calc.billOfLadingCost || 0;
                                    const returnCargo = calc.return_cargo_cost || calc.returnCargoCost || 0;
                                    const returnBill = calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0;
                                    const multiUnload = calc.multi_unload_cost || calc.multiUnloadCost || 0;
                                    const excessMission = calc.excess_mission_cost || calc.excessMissionCost || 0;
                                    const fixedAllowance = calc.fixed_allowance || calc.fixedAllowance || 0;
                                    // هزینه‌های دپو
                                    const depotAllowance = calc.depot_kilometer_rate || calc.depotKilometerRate || 0;
                                    const depotMissionCost = calc.depot_mission_cost || calc.depotMissionCost || 0;
                                    return food + fuel + toll + bill + returnCargo + returnBill + multiUnload + excessMission + fixedAllowance + depotAllowance + depotMissionCost;
                                };

                                // محاسبه هزینه‌های راننده کمکی
                                const calculateHelperDriverCost = (calc: any) => {
                                    const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                    const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                    const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                    return helperAllowance + helperFoodCost + helperExcessMissionCost;
                                };

                                // تابع برای ساخت جدول راننده اصلی
                                const renderMainDriverTable = (calculations: any[], title: string) => {
                                    if (calculations.length === 0) return null;

                                    return (
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                                                {title}
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full border-collapse border border-slate-800 mb-3" style={{ fontSize: '10px', fontFamily: 'Vazirmatn, Arial, sans-serif', tableLayout: 'auto' }}>
                                                    <thead>
                                                        <tr className="bg-slate-800 text-white">
                                                            <th className="p-1 border border-slate-600 text-center" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ردیف</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>شماره بارنامه</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>مقاصد</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>تاریخ صدور</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>تاریخ محاسبه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>پیمایش مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>پیمایش مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>بارنامه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>غذا</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>سوخت</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>عوارض</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>بار برگشتی</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>بارنامه برگشتی</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>چندجا تخلیه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ماموریت مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>اجرت ثابت</th>
                                                            <th className="p-1 border border-slate-600 text-left font-semibold" style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>جمع کل</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {calculations.map((calc, idx) => {
                                                            const announcementId = calc.announcement_id || calc.announcementId;
                                                            const announcement = invoiceAnnouncements.get(announcementId);
                                                            const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                                            const mainCost = calculateMainDriverCost(calc);
                                                            
                                                            return (
                                                                <tr key={calc.id || idx} className="border-b border-slate-300">
                                                                    <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '10px' }}>{(idx + 1).toLocaleString('fa-IR')}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>{calc.bill_of_lading_number || calc.billOfLadingNumber || '-'}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>{destinations}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                                                                        {calc.bill_of_lading_date || calc.billOfLadingDate ? 
                                                                            (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                                                                ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                                                                : formatJalali(calc.bill_of_lading_date || calc.billOfLadingDate))
                                                                            : '-'}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                                                                        {calc.calculation_date || calc.calculationDate || '-'}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.approved_kilometers || calc.approvedKilometers || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.excess_kilometers || calc.excessKilometers || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.approved_mission_days || calc.approvedMissionDays || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.excess_mission_days || calc.excessMissionDays || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.bill_of_lading_cost || calc.billOfLadingCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.food_cost || calc.foodCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.fuel_cost || calc.fuelCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.toll_cost || calc.tollCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.return_cargo_cost || calc.returnCargoCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.multi_unload_cost || calc.multiUnloadCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.excess_mission_cost || calc.excessMissionCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '10px' }}>
                                                                        {(calc.fixed_allowance || calc.fixedAllowance || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '10px' }}>
                                                                        {mainCost.toLocaleString('fa-IR')}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-slate-100 font-bold">
                                                            <td colSpan={18} className="p-1 border border-slate-300 text-right" style={{ fontSize: '10px' }}>
                                                                جمع کل:
                                                            </td>
                                                            <td className="p-1 border border-slate-300 text-left font-bold" style={{ fontSize: '10px' }}>
                                                                {(() => {
                                                                    const total = calculations.reduce((sum, calc) => {
                                                                        return sum + calculateMainDriverCost(calc);
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

                                // تابع برای ساخت جدول راننده کمکی
                                const renderHelperDriverTable = (calculations: any[], helperEmployeeId: string, helperName: string) => {
                                    if (calculations.length === 0) return null;

                                    return (
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-slate-600 pb-2" style={{ fontSize: '16px' }}>
                                                راننده کمکی - کد پرسنلی: {helperEmployeeId} - {helperName}
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs border-collapse border border-slate-800 mb-3" style={{ fontSize: '9px' }}>
                                                    <thead>
                                                        <tr className="bg-slate-800 text-white">
                                                            <th className="p-1 border border-slate-600 text-center" style={{ fontSize: '9px' }}>ردیف</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>کد پرسنلی</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>نام و نام خانوادگی</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>شماره بارنامه</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>مقاصد</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>تاریخ صدور</th>
                                                            <th className="p-1 border border-slate-600" style={{ fontSize: '9px' }}>تاریخ محاسبه</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>پیمایش مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>پیمایش مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مصوب</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>ماموریت مازاد</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه اجرت راننده کمکی (ریال)</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه غذای راننده کمکی (ریال)</th>
                                                            <th className="p-1 border border-slate-600 text-left" style={{ fontSize: '9px' }}>هزینه ماموریت مازاد راننده کمکی (ریال)</th>
                                                            <th className="p-1 border border-slate-600 text-left font-semibold" style={{ fontSize: '9px' }}>جمع کل (ریال)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {calculations.map((calc, idx) => {
                                                            const announcementId = calc.announcement_id || calc.announcementId;
                                                            const announcement = invoiceAnnouncements.get(announcementId);
                                                            const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                                            const helperCost = calculateHelperDriverCost(calc);
                                                            
                                                            return (
                                                                <tr key={calc.id || idx} className="border-b border-slate-300">
                                                                    <td className="p-1 border border-slate-300 text-center" style={{ fontSize: '9px' }}>{idx + 1}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>{helperEmployeeId}</td>
                                                                    <td className="p-1 border border-slate-300" style={{ fontSize: '9px' }}>{helperName}</td>
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
                                                                        {(calc.helper_driver_allowance || calc.helperDriverAllowance || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left" style={{ fontSize: '9px' }}>
                                                                        {(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0).toLocaleString('fa-IR')}
                                                                    </td>
                                                                    <td className="p-1 border border-slate-300 text-left font-semibold" style={{ fontSize: '9px' }}>
                                                                        {helperCost.toLocaleString('fa-IR')}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-slate-100 font-bold">
                                                            <td colSpan={15} className="p-1 border border-slate-300 text-right" style={{ fontSize: '9px' }}>
                                                                جمع کل:
                                                            </td>
                                                            <td className="p-1 border border-slate-300 text-left font-bold" style={{ fontSize: '9px' }}>
                                                                {(() => {
                                                                    const total = calculations.reduce((sum, calc) => {
                                                                        return sum + calculateHelperDriverCost(calc);
                                                                    }, 0);
                                                                    return total.toLocaleString('fa-IR');
                                                                })} ریال
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
                                        {/* تورهای بدون راننده کمکی */}
                                        {calculationsWithoutHelper.length > 0 && (
                                            <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                                                <h2 className="text-xl font-bold text-blue-900 mb-4 border-b-2 border-blue-600 pb-2">
                                                    تورهای بدون راننده کمکی
                                                </h2>
                                                {renderMainDriverTable(calculationsWithoutHelper, 'هزینه‌های راننده اصلی')}
                                            </div>
                                        )}
                                        
                                        {/* تورهای با راننده کمکی */}
                                        {calculationsWithHelper.length > 0 && (
                                            <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                                                <h2 className="text-xl font-bold text-green-900 mb-4 border-b-2 border-green-600 pb-2">
                                                    تورهای با راننده کمکی
                                                </h2>
                                                
                                                {/* راننده اصلی برای تورهای با راننده کمکی */}
                                                {renderMainDriverTable(calculationsWithHelper, 'هزینه‌های راننده اصلی')}
                                                
                                                {/* راننده‌های کمکی تفکیک شده بر اساس کد پرسنلی */}
                                                {Array.from(helperCalculationsByEmployeeId.entries()).map(([employeeId, calcs]) => {
                                                    const firstCalc = calcs[0];
                                                    const helperName = firstCalc.helper_driver_name || firstCalc.helperDriverName || '-';
                                                    return (
                                                        <div key={employeeId}>
                                                            {renderHelperDriverTable(calcs, employeeId, helperName)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        
                                        {/* جمع کل نهایی */}
                                        {invoiceCalculations.length > 0 && (() => {
                                            // محاسبه هزینه کل راننده اصلی (همه تورها - با و بدون راننده کمکی)
                                            const totalMainAll = invoiceCalculations.reduce((sum, calc) => {
                                                return sum + calculateMainDriverCost(calc);
                                            }, 0);
                                            // محاسبه هزینه کل راننده‌های کمکی
                                            const helperCostsByEmployee = new Map<string, number>();
                                            invoiceCalculations.forEach((calc: any) => {
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
                                            
                                            // محاسبه کل پیش پرداخت برای راننده اصلی
                                            const totalAdvancePayment = invoiceCalculations.reduce((sum, calc) => {
                                                return sum + (parseFloat(calc.advance_payment || calc.advancePayment || 0));
                                            }, 0);
                                            
                                            // پیش پرداخت فقط از هزینه راننده اصلی کم می‌شود
                                            const mainDriverPayable = totalMainAll - totalAdvancePayment;
                                            const payableAmount = mainDriverPayable + totalHelper;
                                            
                                            return (
                                                <div className="mt-4 p-4 bg-slate-200 rounded-lg border-2 border-slate-600">
                                                    <div className="space-y-2">
                                                        {/* خلاصه تفکیکی */}
                                                        <div className="mb-3 pb-3 border-b border-slate-400">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده اصلی:</span>
                                                                <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                                                    {totalMainAll.toLocaleString('fa-IR')} ریال
                                                                </span>
                                                            </div>
                                                            {totalHelper > 0 && (
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>جمع هزینه راننده کمکی:</span>
                                                                    <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>
                                                                        {totalHelper.toLocaleString('fa-IR')} ریال
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>جمع کل هزینه سفر:</span>
                                                            <span className="text-xl font-bold text-green-700" style={{ fontSize: '18px' }}>
                                                                {grandTotal.toLocaleString('fa-IR')} ریال
                                                            </span>
                                                        </div>
                                                        {totalAdvancePayment !== 0 && (
                                                            <div className="flex justify-between items-center border-t border-slate-400 pt-2 mt-2">
                                                                <span className="text-base font-semibold text-slate-800" style={{ fontSize: '15px' }}>کسور (پیش پرداخت - فقط از راننده اصلی):</span>
                                                                <span className="text-lg font-bold text-orange-700" style={{ fontSize: '17px' }}>
                                                                    {totalAdvancePayment < 0 ? '−' : ''}{Math.abs(totalAdvancePayment).toLocaleString('fa-IR')} ریال
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center border-t-2 border-slate-600 pt-2 mt-2">
                                                            <span className="text-lg font-bold text-slate-900" style={{ fontSize: '16px' }}>مبلغ قابل پرداخت:</span>
                                                            <span className={`text-xl font-bold ${payableAmount < 0 ? 'text-red-700' : 'text-blue-700'}`} style={{ fontSize: '18px' }}>
                                                                <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                                                                    {payableAmount < 0 ? '−' : ''}{Math.abs(payableAmount).toLocaleString('fa-IR')} ریال
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </>
                                );
                            })()}

                            {/* روش 3: سبک جزئیات تور - هر تور یک ردیف با راننده اصلی و کمکی */}
                            {invoiceLayout === InvoiceLayoutType.TOUR_DETAILS_STYLE && (() => {
                                // تبدیل داده‌ها به فرمت InvoiceImageHelper
                                const invoicePaymentRecord: InvoicePaymentRecord = {
                                    employeeId: selectedInvoiceRecord.employeeId,
                                    driverName: selectedInvoiceRecord.driverName,
                                    accountNumber: selectedInvoiceRecord.accountNumber || '',
                                    startDate: startDate,
                                    endDate: endDate
                                };

                                // تبدیل calculations به فرمت مورد نیاز InvoiceImageHelper
                                const convertedCalculations = invoiceCalculations.map((calc: any) => {
                                    const announcement = invoiceAnnouncements.get(calc.announcement_id || calc.announcementId);
                                    const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                                    
                                    return {
                                        ...calc,
                                        destinations: destinations,
                                        origin: announcement?.origin?.city || announcement?.origin || calc.origin || '-',
                                    };
                                });

                                // تبدیل به فرمت InvoiceImageHelper
                                const invoiceData = convertToInvoiceDataFormatHorizontal(
                                    invoicePaymentRecord,
                                    convertedCalculations,
                                    invoiceAnnouncements,
                                    startDate,
                                    endDate
                                );

                                // محاسبه عرض و فونت دینامیک
                                const numTours = invoiceData.tourData?.length || invoiceCalculations.length;
                                const mainBlock = invoiceData.blocks[0];
                                const costRows = mainBlock?.rows.filter(r => r.kind === 'cost' || r.kind === 'categoryHeader') || [];
                                const costColumnsCount = costRows.filter(r => r.kind === 'cost').length;
                                const totalColumns = 10 + costColumnsCount + 1;
                                
                                let containerWidth = 2100;
                                let fontSize = 13;
                                let cellPadding = '14px 12px';
                                
                                if (totalColumns > 20) {
                                    containerWidth = 2400;
                                    fontSize = 11;
                                    cellPadding = '12px 10px';
                                } else if (totalColumns > 15) {
                                    containerWidth = 2200;
                                    fontSize = 12;
                                    cellPadding = '13px 11px';
                                }
                                
                                if (numTours > 10) {
                                    containerWidth = Math.max(containerWidth, 2400);
                                    fontSize = Math.min(fontSize, 11);
                                    cellPadding = '12px 10px';
                                } else if (numTours > 8) {
                                    containerWidth = Math.max(containerWidth, 2200);
                                    fontSize = Math.min(fontSize, 12);
                                    cellPadding = '13px 11px';
                                }

                                // Render کردن با استفاده از InvoiceImageHelper
                                const invoiceJSX = renderInvoiceLayoutHorizontal(
                                    invoiceData,
                                    invoicePaymentRecord,
                                    invoiceAnnouncements,
                                    containerWidth,
                                    fontSize,
                                    cellPadding
                                );

                                return invoiceJSX;
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
                                // محاسبه هزینه کل راننده اصلی (همه تورها - با و بدون راننده کمکی) - مطابق منطق جدول
                                const totalMainAll = invoiceCalculations.reduce((sum, calc) => {
                                    return sum + calculateMainDriverCost(calc);
                                }, 0);
                                
                                // گروه‌بندی هزینه‌های راننده کمکی بر اساس کد پرسنلی
                                const helperCostsByEmployee = new Map<string, { employeeId: string; name: string; total: number }>();
                                invoiceCalculations.forEach((calc: any) => {
                                    const helperId = calc.helper_driver_id || calc.helperDriverId;
                                    const helperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
                                    const helperName = calc.helper_driver_name || calc.helperDriverName || '';
                                    const helperAllowance = calc.helper_driver_allowance || calc.helperDriverAllowance || 0;
                                    const helperFoodCost = calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0;
                                    const helperExcessMissionCost = calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0;
                                    const helperTotal = helperAllowance + helperFoodCost + helperExcessMissionCost;
                                    
                                    if (helperId && helperEmployeeId && helperTotal > 0) {
                                        if (!helperCostsByEmployee.has(helperEmployeeId)) {
                                            helperCostsByEmployee.set(helperEmployeeId, {
                                                employeeId: helperEmployeeId,
                                                name: helperName,
                                                total: 0
                                            });
                                        }
                                        const existing = helperCostsByEmployee.get(helperEmployeeId)!;
                                        existing.total += helperTotal;
                                    }
                                });
                                
                                const totalHelperCosts = Array.from(helperCostsByEmployee.values()).reduce((sum, h) => sum + h.total, 0);
                                const grandTotal = totalMainAll + totalHelperCosts;
                                
                                return (
                                    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="font-semibold text-slate-700 mb-2" style={{ fontSize: '14px' }}>خلاصه:</p>
                                                <p className="text-sm mb-1" style={{ fontSize: '13px' }}>تعداد تور: {invoiceCalculations.length}</p>
                                                <div className="mt-2 space-y-1">
                                                    <p className="text-sm" style={{ fontSize: '13px' }}>هزینه‌های راننده اصلی: <span className="font-semibold">{totalMainAll.toLocaleString('fa-IR')}</span> ریال</p>
                                                    {Array.from(helperCostsByEmployee.values()).map((helper, idx) => (
                                                        <p key={idx} className="text-sm" style={{ fontSize: '13px' }}>
                                                            هزینه راننده کمکی ({helper.employeeId}-{helper.name}): <span className="font-semibold">{helper.total.toLocaleString('fa-IR')}</span> ریال
                                                        </p>
                                                    ))}
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-slate-300">
                                                    <p className="text-base font-bold text-green-700" style={{ fontSize: '15px' }}>
                                                        جمع کل هزینه سفر: {grandTotal.toLocaleString('fa-IR')} ریال
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-left">
                                                <p className="font-semibold text-slate-700 mb-1" style={{ fontSize: '14px' }}>توضیحات:</p>
                                                <p className="text-sm text-slate-600" style={{ fontSize: '13px' }}>
                                                    این صورتحساب بر اساس محاسبات ثبت شده و پرداخت نشده در سیستم تهیه شده است.
                                                </p>
                                                <p className="text-sm text-slate-500 mt-2" style={{ fontSize: '13px' }}>
                                                    جمع کل = هزینه‌های راننده اصلی + اجرت ثابت + هزینه راننده کمکی
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
            
            {/* دیالوگ قوانین کارتابل */}
            {rulesDialogOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center z-10">
                        <h2 className="text-xl font-bold text-slate-800">
                            قوانین کارتابل لیست پرداخت
                        </h2>
                        <button
                            onClick={() => setRulesDialogOpen(false)}
                            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                        >
                            بستن
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-6">
                        <div className="space-y-6 text-slate-700">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-3">📋 ورود به کارتابل لیست پرداخت</h3>
                                <ul className="list-disc list-inside space-y-2 mr-4">
                                    <li>بارها زمانی وارد لیست پرداخت می‌شوند که محاسبات راننده برای آنها ثبت شده باشد (یعنی مبلغ کل هزینه بیشتر از صفر باشد)</li>
                                    <li>راننده اصلی و راننده کمکی به صورت جداگانه در لیست پرداخت نمایش داده می‌شوند</li>
                                    <li>هر راننده (اصلی یا کمکی) یک رکورد در لیست پرداخت دارد که شامل مجموع هزینه‌های همه تورهای پرداخت نشده او می‌شود</li>
                                    <li>فقط محاسباتی که <strong>پرداخت نشده</strong> هستند، در لیست پرداخت نمایش داده می‌شوند</li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-3">✅ خروج از کارتابل لیست پرداخت</h3>
                                <ul className="list-disc list-inside space-y-2 mr-4">
                                    <li>پس از ثبت پرداخت برای یک راننده، وضعیت تمام محاسبات مربوط به آن راننده به <strong>پرداخت شده</strong> تغییر می‌کند</li>
                                    <li>راننده‌هایی که همه محاسباتشان پرداخت شده است، از لیست پرداخت حذف می‌شوند و به کارتابل <strong>صورتحساب‌های پرداخت شده</strong> منتقل می‌شوند</li>
                                    <li>پرداخت راننده اصلی و راننده کمکی کاملاً مستقل است:
                                        <ul className="list-circle list-inside mr-6 mt-2 space-y-1">
                                            <li>اگر برای راننده اصلی پرداخت ثبت شود، فقط راننده اصلی از لیست حذف می‌شود</li>
                                            <li>راننده کمکی همچنان در لیست پرداخت باقی می‌ماند (مگر اینکه پرداخت او نیز ثبت شده باشد)</li>
                                            <li>برای حذف راننده کمکی از لیست، باید پرداخت جداگانه‌ای برای او ثبت شود</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-3">💰 محاسبه هزینه راننده</h3>
                                <ul className="list-disc list-inside space-y-2 mr-4">
                                    <li><strong>هزینه راننده اصلی</strong> شامل: هزینه غذا، سوخت، عوارض، بارنامه، بار برگشتی، بارنامه برگشتی، چندجا تخلیه، ماموریت مازاد، اجرت ثابت، اجرت دپو، و حق ماموریت دپو</li>
                                    <li>هزینه راننده کمکی شامل: اجرت راننده کمکی، هزینه غذا راننده کمکی، و هزینه ماموریت مازاد راننده کمکی</li>
                                    <li>پیش پرداخت (کسور) فقط از هزینه راننده اصلی کم می‌شود، نه از هزینه راننده کمکی</li>
                                    <li>مبلغ قابل پرداخت = (هزینه راننده اصلی - پیش پرداخت) + هزینه راننده کمکی</li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-3">🔍 فیلتر و جستجو</h3>
                                <ul className="list-disc list-inside space-y-2 mr-4">
                                    <li>می‌توانید بر اساس کد پرسنلی یا نام راننده جستجو کنید</li>
                                    <li>می‌توانید بر اساس بازه تاریخ محاسبه فیلتر کنید</li>
                                    <li>خروجی اکسل برای بانک شامل: کد پرسنلی، نام، شماره حساب، مبلغ هزینه، کسور، و مبلغ قابل پرداخت است</li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-3">📄 صورتحساب</h3>
                                <ul className="list-disc list-inside space-y-2 mr-4">
                                    <li>با کلیک روی دکمه "مشاهده صورتحساب" می‌توانید جزئیات کامل هزینه‌های راننده را مشاهده کنید</li>
                                    <li>صورتحساب شامل تفکیک تورهای با راننده کمکی و بدون راننده کمکی است</li>
                                    <li>می‌توانید صورتحساب را به صورت PDF یا عکس دانلود کنید</li>
                                </ul>
                            </div>
                            
                            <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded">
                                <p className="text-blue-800 font-semibold">
                                    💡 نکته مهم: پرداخت راننده اصلی و راننده کمکی مستقل است. هر کدام باید جداگانه پرداخت شوند تا از لیست حذف شوند.
                                </p>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransportFinancePaymentList;

