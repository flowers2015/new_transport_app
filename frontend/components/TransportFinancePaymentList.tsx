import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Driver } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Helper function for padding
const pad2 = (n: number): string => n < 10 ? `0${n}` : String(n);

// انواع ساختار صورتحساب
enum InvoiceLayoutType {
    STANDARD_ACCOUNTING = 'standard_accounting', // روش 1: استاندارد حسابداری با سرفصل‌ها
    COMPACT = 'compact', // روش 2: فشرده (برای آینده)
    DETAILED = 'detailed', // روش 3: تفصیلی (برای آینده)
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
}

// ============================================================================
// توابع Render برای انواع مختلف ساختار صورتحساب
// ============================================================================

// تابع محاسبه هزینه‌های راننده اصلی (برای استفاده در همه جا)
const calculateMainDriverCostGlobal = (calc: any): number => {
    const food = parseFloat(calc.food_cost || calc.foodCost || 0);
    const fuel = parseFloat(calc.fuel_cost || calc.fuelCost || 0);
    const toll = parseFloat(calc.toll_cost || calc.tollCost || 0);
    const bill = parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0);
    const returnCargo = parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0);
    // حذف returnBill از محاسبه چون در دیالوگ نیست
    const multiUnload = parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0);
    const excessMission = parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0);
    const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
    // هزینه‌های دپو
    const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
    const depotAllowance = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
    const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
    return food + fuel + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance + depotCargoHandling + depotAllowance + depotMissionCost;
};

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

    // تابع برای ساخت جدول راننده اصلی (روش 1)
    const renderMainDriverTableLayout1 = (calculations: any[], title: string) => {
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

    // تابع برای ساخت جدول راننده کمکی (روش 1)
    const renderHelperDriverTableLayout1 = (calculations: any[], helperEmployeeId: string, helperName: string) => {
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
                    <h2 className="text-xl font-bold text-blue-900 mb-4 border-b-2 border-blue-600 pb-2">
                        تورهای بدون راننده کمکی
                    </h2>
                    {renderMainDriverTableLayout1(calculationsWithoutHelper, 'هزینه‌های راننده اصلی')}
                </div>
            )}
            
            {/* تورهای با راننده کمکی */}
            {calculationsWithHelper.length > 0 && (
                <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                    <h2 className="text-xl font-bold text-green-900 mb-4 border-b-2 border-green-600 pb-2">
                        تورهای با راننده کمکی
                    </h2>
                    
                    {/* راننده اصلی برای تورهای با راننده کمکی */}
                    {renderMainDriverTableLayout1(calculationsWithHelper, 'هزینه‌های راننده اصلی')}
                    
                    {/* راننده‌های کمکی تفکیک شده بر اساس کد پرسنلی */}
                    {Array.from(helperCalculationsByEmployeeId.entries()).map(([employeeId, calcs]) => {
                        const firstCalc = calcs[0];
                        const helperName = firstCalc.helper_driver_name || firstCalc.helperDriverName || '-';
                        return (
                            <div key={employeeId}>
                                {renderHelperDriverTableLayout1(calcs, employeeId, helperName)}
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
// کامپوننت اصلی
// ============================================================================
const TransportFinancePaymentList: React.FC<TransportFinancePaymentListProps> = ({ currentUser }) => {
    // استفاده از تابع global
    const calculateMainDriverCost = calculateMainDriverCostGlobal;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
    const [helperRecordsMap, setHelperRecordsMap] = useState<Map<string, PaymentRecord>>(new Map());
    
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
    
    // نوع ساختار صورتحساب (پیش‌فرض: استاندارد حسابداری)
    const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayoutType>(InvoiceLayoutType.STANDARD_ACCOUNTING);

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
            const helperRecordsMap = new Map<string, PaymentRecord>(); // برای راننده‌های کمکی
            
            (Array.isArray(calculationsData) ? calculationsData : []).forEach((calc: any) => {
                // فقط محاسباتی که total_cost دارند (یعنی ثبت شده‌اند)
                const totalCost = parseFloat(calc.total_cost || calc.totalCost || 0);
                if (totalCost <= 0) return; // محاسبات ثبت نشده را نادیده بگیر
                
                const driverId = calc.driver_id || calc.driverId;
                const driver = driversData.find((d: Driver) => d.id === driverId);
                
                if (!driver) return;
                
                // محاسبه هزینه راننده اصلی (مطابق منطق صورتحساب)
                const mainDriverCost = calculateMainDriverCost(calc);
                
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
                
                // راننده اصلی
                const existing = recordsMap.get(driverId);
                if (existing) {
                    existing.mainDriverAmount += mainDriverCost; // جمع هزینه راننده اصلی برای همه تورها (مطابق منطق صورتحساب)
                    existing.advancePayment += advancePayment;
                    existing.payableAmount = existing.mainDriverAmount - existing.advancePayment;
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
                        totalAmount: mainDriverCost + helperDriverCost, // فقط برای نمایش - استفاده نمی‌شود
                        mainDriverAmount: mainDriverCost, // هزینه راننده اصلی (مطابق منطق صورتحساب)
                        helperDriverAmount: 0, // دیگر استفاده نمی‌شود
                        advancePayment: advancePayment,
                        payableAmount: mainDriverCost - advancePayment,
                        calculationDate,
                    });
                }
                
                // راننده کمکی (اگر وجود دارد)
                if (helperId && helperEmployeeId && helperDriverCost > 0) {
                    const helperDriver = driversData.find((d: Driver) => 
                        (d.employeeId === helperEmployeeId) || d.id === helperId
                    );
                    
                    const helperKey = helperEmployeeId || helperId;
                    const existingHelper = helperRecordsMap.get(helperKey);
                    
                    if (existingHelper) {
                        existingHelper.mainDriverAmount += helperDriverCost; // استفاده از mainDriverAmount برای هزینه راننده کمکی
                        existingHelper.totalAmount += helperDriverCost;
                        existingHelper.payableAmount = existingHelper.mainDriverAmount; // بدون پیش پرداخت
                        if (calculationDate && (!existingHelper.calculationDate || calculationDate > existingHelper.calculationDate)) {
                            existingHelper.calculationDate = calculationDate;
                        }
                    } else {
                        helperRecordsMap.set(helperKey, {
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
                        });
                    }
                }
            });
            
            // ساخت توضیحات برای هر رکورد
            const buildDescriptions = async (record: PaymentRecord, isHelper: boolean = false): Promise<string> => {
                const relevantCalcs = (Array.isArray(calculationsData) ? calculationsData : []).filter((calc: any) => {
                    const totalCost = parseFloat(calc.total_cost || calc.totalCost || 0);
                    if (totalCost <= 0) return false;
                    
                    if (isHelper) {
                        const helperId = calc.helper_driver_id || calc.helperDriverId;
                        return helperId === record.driverId;
                    } else {
                        const mainDriverId = calc.driver_id || calc.driverId;
                        return mainDriverId === record.driverId;
                    }
                });
                
                if (relevantCalcs.length === 0) return '';
                
                const descriptions: string[] = [];
                const processedAnnouncements = new Set<string>();
                
                for (const calc of relevantCalcs.slice(0, 10)) { // محدود به 10 مورد اول
                    try {
                        const announcementId = calc.announcement_id || calc.announcementId;
                        if (!announcementId || processedAnnouncements.has(announcementId)) continue;
                        processedAnnouncements.add(announcementId);
                        
                        const annRes = await fetch(getApiUrl(`freight-announcements/${announcementId}`), { headers });
                        if (!annRes.ok) continue;
                        
                        const annData = await annRes.json();
                        const destinations = Array.isArray(annData.destinations) 
                            ? annData.destinations.map((d: any) => d.city || '').filter(Boolean).join('، ')
                            : '-';
                        
                        const mainDriverId = calc.driver_id || calc.driverId;
                        const mainDriver = driversData.find((d: Driver) => d.id === mainDriverId);
                        const mainDriverName = mainDriver?.name || record.driverName || '';
                        
                        const helperName = calc.helper_driver_name || calc.helperDriverName || '';
                        const calcDate = calc.calculation_date || calc.calculationDate || '';
                        
                        let desc = '';
                        if (isHelper) {
                            // برای راننده کمکی: راننده کمکی، راننده اصلی، مقاصد، تاریخ
                            desc = `راننده کمکی: ${record.driverName || 'نامشخص'}، راننده اصلی: ${mainDriverName}، تور به مقاصد: ${destinations}`;
                        } else {
                            // برای راننده اصلی: فقط راننده اصلی، مقاصد، تاریخ (بدون ذکر راننده کمکی)
                            desc = `راننده اصلی: ${record.driverName || 'نامشخص'}، تور به مقاصد: ${destinations}`;
                        }
                        
                        if (calcDate) {
                            desc += ` در تاریخ: ${calcDate}`;
                        }
                        
                        descriptions.push(desc);
                    } catch (err) {
                        console.warn(`⚠️ [buildDescriptions] خطا در ساخت توضیحات:`, err);
                    }
                }
                
                return descriptions.join(' / ');
            };
            
            // ذخیره helperRecordsMap برای استفاده در generateInvoiceImage
            setHelperRecordsMap(helperRecordsMap);
            
            // ترکیب راننده اصلی و راننده کمکی
            const allRecords = [...Array.from(recordsMap.values()), ...Array.from(helperRecordsMap.values())];
            
            // بررسی اینکه آیا راننده کمکی است یا نه برای هر رکورد
            const isHelperDriverMap = new Map<string, boolean>();
            helperRecordsMap.forEach((record, key) => {
                isHelperDriverMap.set(record.driverId, true);
                isHelperDriverMap.set(record.employeeId, true);
            });
            
            // بررسی پرداخت‌های ثبت شده و فیلتر کردن راننده‌های پرداخت شده
            const recordsWithPayments = await Promise.all(
                allRecords.map(async (record) => {
                    const isHelper = isHelperDriverMap.has(record.driverId) || isHelperDriverMap.has(record.employeeId);
                    
                    try {
                        // بررسی اینکه آیا برای این راننده محاسبات پرداخت نشده وجود دارد یا نه
                        // برای راننده اصلی: بررسی محاسبات با driver_id = record.driverId و is_paid = false
                        // برای راننده کمکی: بررسی محاسبات با helper_driver_id = record.driverId و is_paid = false (در واقع باید بررسی کنم که آیا محاسباتی با helper_driver_id وجود دارد)
                        let unpaidCalculationsRes;
                        if (isHelper) {
                            // برای راننده کمکی، باید تمام محاسبات را بگیریم و بررسی کنیم که آیا محاسباتی با helper_driver_id = record.driverId و is_paid = false وجود دارد
                            unpaidCalculationsRes = await fetch(
                                getApiUrl('driver-calculations'),
                                { headers }
                            );
                        } else {
                            // برای راننده اصلی
                            unpaidCalculationsRes = await fetch(
                                getApiUrl(`driver-calculations?driverId=${record.driverId}`),
                                { headers }
                            );
                        }
                        
                        if (unpaidCalculationsRes.ok) {
                            const allCalculations = await unpaidCalculationsRes.json();
                            let unpaidCalculations;
                            
                            if (isHelper) {
                                // فیلتر کردن محاسباتی که helper_driver_id = record.driverId دارند و پرداخت نشده‌اند
                                unpaidCalculations = allCalculations.filter((calc: any) => {
                                    const calcHelperId = calc.helper_driver_id || calc.helperDriverId;
                                    const calcHelperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
                                    const isPaid = calc.is_paid || calc.isPaid;
                                    return (calcHelperId === record.driverId || calcHelperEmployeeId === record.employeeId) && !isPaid;
                                });
                            } else {
                                // برای راننده اصلی: فقط محاسبات پرداخت نشده که مربوط به این راننده است
                                unpaidCalculations = allCalculations.filter((calc: any) => {
                                    const calcDriverId = calc.driver_id || calc.driverId;
                                    const isPaid = calc.is_paid || calc.isPaid;
                                    return calcDriverId === record.driverId && !isPaid;
                                });
                            }
                            
                            // اگر هیچ محاسبه پرداخت نشده‌ای وجود ندارد، این راننده را از لیست حذف کن
                            if (!unpaidCalculations || unpaidCalculations.length === 0) {
                                return null; // این رکورد را از لیست حذف کن
                            }
                        }
                        
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
                    
                    // ساخت توضیحات
                    record.descriptions = await buildDescriptions(record, isHelper);
                    
                    return record;
                })
            );
            
            // فیلتر کردن null ها (راننده‌های پرداخت شده)
            const filteredRecords = recordsWithPayments.filter((r): r is PaymentRecord => r !== null);
            
            setPaymentRecords(filteredRecords);
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
        
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'شماره حساب مقصد', 'مبلغ هزینه (ریال)', 'کسور(پیش پرداخت) (ریال)', 'مبلغ قابل پرداخت (ریال)']
        ];

        let rowIndex = 0;
        filteredRecords.forEach((record) => {
            // استفاده از مقادیر از قبل محاسبه شده در record
            rowIndex++;
            wsData.push([
                rowIndex,
                record.employeeId || '',
                record.driverName || '',
                record.accountNumber || '',
                record.mainDriverAmount || 0,
                record.advancePayment || 0,
                record.payableAmount || 0
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

            // بررسی اینکه آیا این راننده کمکی است یا نه
            const isHelper = helperRecordsMap.has(record.driverId) || Array.from(helperRecordsMap.values()).some((r: PaymentRecord) => r.employeeId === record.employeeId);
            
            let calculationsRes;
            if (isHelper) {
                // برای راننده کمکی، باید تمام محاسبات را بگیریم و فیلتر کنیم
                calculationsRes = await fetch(
                    getApiUrl(`driver-calculations${startDate ? `?startDate=${startDate}` : '?'}${endDate ? `&endDate=${endDate}` : ''}`),
                    { headers }
                );
            } else {
                // برای راننده اصلی
                calculationsRes = await fetch(
                    getApiUrl(`driver-calculations?driverId=${record.driverId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`),
                    { headers }
                );
            }

            if (calculationsRes.ok) {
                const calculationsData = await calculationsRes.json();
                const calculationsArray = Array.isArray(calculationsData) ? calculationsData : [];
                
                // فیلتر کردن محاسبات مربوط به این راننده و پرداخت نشده
                let unpaidCalculations;
                if (isHelper) {
                    // برای راننده کمکی: فیلتر بر اساس helper_driver_id یا helper_driver_employee_id
                    unpaidCalculations = calculationsArray.filter((calc: any) => {
                        const calcHelperId = calc.helper_driver_id || calc.helperDriverId;
                        const calcHelperEmployeeId = calc.helper_driver_employee_id || calc.helperDriverEmployeeId || '';
                        const isPaid = calc.is_paid || calc.isPaid;
                        return (calcHelperId === record.driverId || calcHelperEmployeeId === record.employeeId) && !isPaid;
                    });
                } else {
                    // برای راننده اصلی: فیلتر بر اساس driver_id و is_paid = false
                    unpaidCalculations = calculationsArray.filter((calc: any) => {
                        const calcDriverId = calc.driver_id || calc.driverId;
                        const isPaid = calc.is_paid || calc.isPaid;
                        return calcDriverId === record.driverId && !isPaid;
                    });
                }
                
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

    // تبدیل صورتحساب به PDF - روش ساده و مطمئن
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

            // اعمال استایل‌های اضافی برای PDF - بدون override کردن fontSize و padding که از JSX آمده
            const allTables = tempDiv.querySelectorAll('table');
            allTables.forEach((table) => {
                const tableEl = table as HTMLElement;
                tableEl.style.width = '100%';
                tableEl.style.tableLayout = 'fixed';
                tableEl.style.borderCollapse = 'collapse';
                // حذف override کردن fontSize - استایل‌های inline حفظ می‌شوند
            });

            const allCells = tempDiv.querySelectorAll('td, th');
            allCells.forEach((cell) => {
                const cellEl = cell as HTMLElement;
                // فقط اگر padding تعریف نشده باشد، یک مقدار پیش‌فرض بگذار
                // اما اگر از JSX آمده باشد، آن را حفظ کن
                if (!cellEl.style.padding || cellEl.style.padding === '' || cellEl.style.padding === '0px') {
                    // فقط برای سلول‌هایی که padding ندارند
                    const computedStyle = window.getComputedStyle(cellEl);
                    if (computedStyle.padding === '0px') {
                        cellEl.style.padding = '12px 10px'; // مقدار پیش‌فرض بزرگتر
                    }
                }
                // textAlign و verticalAlign را فقط اگر تعریف نشده باشد تنظیم کن
                if (!cellEl.style.textAlign || cellEl.style.textAlign === '') {
                    cellEl.style.textAlign = 'center';
                }
                if (!cellEl.style.verticalAlign || cellEl.style.verticalAlign === '') {
                    cellEl.style.verticalAlign = 'middle';
                }
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
                                
                                // font-size
                                cellEl.style.fontSize = '8px';
                                
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

    // دانلود عکس صورتحساب
    const exportInvoiceToImage = async () => {
        if (!invoiceRef.current || !selectedInvoiceRecord) return;

        try {
            // استفاده از تنظیمات بهینه برای کیفیت مناسب
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2, // scale بالاتر برای کیفیت بهتر عکس
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: invoiceRef.current.scrollWidth,
                height: invoiceRef.current.scrollHeight,
                windowWidth: invoiceRef.current.scrollWidth,
                windowHeight: invoiceRef.current.scrollHeight,
                onclone: (clonedDoc) => {
                    // اعمال استایل‌های نهایی در cloned document
                    const clonedInvoice = clonedDoc.querySelector('[dir="rtl"]') as HTMLElement;
                    if (clonedInvoice) {
                        clonedInvoice.style.width = '100%';
                        clonedInvoice.style.maxWidth = '100%';
                        clonedInvoice.style.overflow = 'hidden';
                        clonedInvoice.style.visibility = 'visible';
                        clonedInvoice.style.opacity = '1';
                        
                        // اعمال استایل‌های جدول
                        const clonedTables = clonedInvoice.querySelectorAll('table');
                        clonedTables.forEach((table) => {
                            const tableEl = table as HTMLElement;
                            tableEl.style.width = '100%';
                            tableEl.style.minWidth = '100%';
                            tableEl.style.tableLayout = 'fixed';
                            tableEl.style.borderCollapse = 'collapse';
                            tableEl.style.fontSize = '11px';
                            tableEl.style.fontFamily = 'Vazirmatn, Arial, sans-serif';
                        });
                        
                        // اعمال استایل‌های thead و tbody
                        const clonedTheads = clonedInvoice.querySelectorAll('thead');
                        clonedTheads.forEach((thead) => {
                            const theadEl = thead as HTMLElement;
                            const headerRows = theadEl.querySelectorAll('tr');
                            headerRows.forEach((row) => {
                                const rowEl = row as HTMLElement;
                                rowEl.style.backgroundColor = '#1e293b';
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
                        
                        // اعمال استایل‌های سلول‌ها (td و th)
                        const clonedCells = clonedInvoice.querySelectorAll('td, th');
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
                                cellEl.style.paddingRight = '6px';
                                cellEl.style.height = '70px';
                                cellEl.style.fontSize = '11px';
                                cellEl.style.lineHeight = '1.8';
                                cellEl.style.verticalAlign = 'top';
                                cellEl.style.display = 'table-cell';
                            } else if (cellEl.tagName === 'TH') {
                                // برای headerهای عادی
                                cellEl.style.padding = '8px 4px';
                                cellEl.style.fontSize = '10px';
                                cellEl.style.verticalAlign = 'middle';
                            } else {
                                // برای سلول‌های داده
                                cellEl.style.padding = '10px 8px';
                                cellEl.style.fontSize = '11px';
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
                            
                            // font-size
                            cellEl.style.fontSize = '8px';
                            
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
                }
            });

            // تبدیل به PNG با کیفیت بالا
            const imgData = canvas.toDataURL('image/png', 1.0);
            
            // ایجاد لینک دانلود
            const link = document.createElement('a');
            link.download = `صورتحساب_${selectedInvoiceRecord.driverName}_${new Date().toISOString().split('T')[0]}.png`;
            link.href = imgData;
            link.click();
        } catch (err: any) {
            console.error('❌ [exportInvoiceToImage] Error:', err);
            alert(`خطا در تولید عکس: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
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
                    paymentAmount: record.payableAmount,
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
            // صبر کردن کمی تا backend پرداخت را ثبت کند
            await new Promise(resolve => setTimeout(resolve, 500));
            // بارگذاری مجدد داده‌ها
            await fetchData();
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
                        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center z-10">
                            <h2 className="text-xl font-bold text-slate-800">
                                صورتحساب {selectedInvoiceRecord.driverName}
                            </h2>
                            <div className="flex gap-2 items-center">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-slate-700">نوع صورتحساب:</label>
                                    <select
                                        value={invoiceLayout}
                                        onChange={(e) => setInvoiceLayout(e.target.value as InvoiceLayoutType)}
                                        className="px-3 py-1 border border-slate-300 rounded-md text-sm"
                                    >
                                        <option value={InvoiceLayoutType.STANDARD_ACCOUNTING}>روش 1: استاندارد حسابداری</option>
                                        <option value={InvoiceLayoutType.COMPACT}>روش 2: فشرده</option>
                                        <option value={InvoiceLayoutType.DETAILED}>روش 3: تفصیلی</option>
                                    </select>
                                </div>
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
                                        setInvoiceZoom(100);
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
                            {invoiceLayout === InvoiceLayoutType.STANDARD_ACCOUNTING && renderInvoiceLayout1(
                                selectedInvoiceRecord,
                                invoiceCalculations,
                                invoiceAnnouncements,
                                startDate,
                                endDate
                            )}
                            {invoiceLayout === InvoiceLayoutType.COMPACT && renderInvoiceLayout2(
                                selectedInvoiceRecord,
                                invoiceCalculations,
                                invoiceAnnouncements,
                                startDate,
                                endDate
                            )}
                            {invoiceLayout === InvoiceLayoutType.DETAILED && renderInvoiceLayout3(
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

