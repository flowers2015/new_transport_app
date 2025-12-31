import React from 'react';
import html2canvas from 'html2canvas';
import * as domtoimage from 'dom-to-image';
import ReactDOMServer from 'react-dom/server';

// ============================================
// راه‌حل فونت: استفاده از Vazirmatn از Google Fonts
// ============================================
// استفاده از Vazirmatn که یک فونت فارسی خوب است و در Google Fonts موجود است
// این فونت برای همه کاربران بدون نیاز به فایل محلی کار می‌کند

// تابع برای ساخت @font-face CSS
const getBHomaFontFaceCSS = async (): Promise<string> => {
    return `
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block');
    `;
};

// تابع sync برای استفاده در جاهایی که نمی‌توانیم await کنیم
const getBHomaFontFaceCSSSync = (): string => {
    return `
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block');
    `;
};

// Helper function برای محاسبه هزینه راننده اصلی
export const calculateMainDriverCostGlobal = (calc: any): number => {
    const billOfLading = parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0);
    const food = parseFloat(calc.food_cost || calc.foodCost || 0);
    const fuel = parseFloat(calc.fuel_cost || calc.fuelCost || 0);
    const toll = parseFloat(calc.toll_cost || calc.tollCost || 0);
    const returnCargo = parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0);
    const returnBillOfLading = parseFloat(calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0);
    const multiUnload = parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0);
    const excessMission = parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0);
    const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
    const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
    const depotMission = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
    return billOfLading + food + fuel + toll + returnCargo + returnBillOfLading + multiUnload + excessMission + fixedAllowance + depotCargoHandling + depotMission;
};

// Helper function برای محاسبه هزینه راننده کمکی
export const calculateHelperDriverCostGlobal = (calc: any): number => {
    const helperAllowance = parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0);
    const helperFood = parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0);
    const helperExcessMission = parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0);
    return helperAllowance + helperFood + helperExcessMission;
};

// Interface برای داده‌های صورتحساب
export interface PaymentRecord {
    employeeId: string;
    driverName: string;
    accountNumber?: string;
    startDate: string;
    endDate: string;
}

export interface InvoiceData {
    blocks: Array<{
        title: string;
        rows: Array<{
            kind: 'cost' | 'categoryHeader';
            category?: string;
            description?: string;
            unitAmount?: number;
            totalAmount?: number;
            tourValues?: number[];
            isDepotCount?: boolean;
        }>;
        summary?: {
            totalTripCost: number;
            deductionsTitle?: string;
            deductionsAmount?: number;
            payableAmount: number;
            notes?: string;
        };
    }>;
    tourData?: Array<{
        billOfLadingNumber?: string;
        destinations?: string;
        vehiclePlate?: string;
        vehicleType?: string;
        billOfLadingDate?: string;
        calculationDate?: string;
        approvedKm?: number;
        excessKm?: number;
        totalKm?: number;
        approvedMissionDays?: number;
        excessMissionDays?: number;
        billOfLadingCost?: number;
        fuelCost?: number;
        foodCost?: number;
        multiUnloadCost?: number;
        tollCost?: number;
        fixedAllowance?: number;
        returnCargoCost?: number;
        excessMissionCost?: number;
        depotMissionDays?: number;
        depotCargoHandling?: number;
        depotShipmentCount?: number;
        depotTotalMileage?: number;
        depotKilometerRate?: number;
        depotMissionCost?: number;
    }>;
    helperCalculationsByEmployeeId?: Map<string, any[]>;
}

// Helper function برای تبدیل داده‌ها به فرمت افقی
export const convertToInvoiceDataFormatHorizontal = (
    selectedInvoiceRecord: PaymentRecord,
    calculations: any[],
    announcementsMap: Map<string, any>,
    startDate: string,
    endDate: string
): InvoiceData => {
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
    
    // اضافه کردن هزینه‌های مستقیم
    mainDriverRows.push({ kind: 'categoryHeader', category: 'هزینه‌های مستقیم' });
    
    const billOfLadingValues = calculations.map((calc: any) => parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0));
    const billOfLadingTotal = billOfLadingValues.reduce((sum, val) => sum + val, 0);
    if (billOfLadingTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'بارنامه',
            unitAmount: billOfLadingTotal,
            totalAmount: billOfLadingTotal,
            tourValues: billOfLadingValues
        });
    }

    const foodValues = calculations.map((calc: any) => parseFloat(calc.food_cost || calc.foodCost || 0));
    const foodTotal = foodValues.reduce((sum, val) => sum + val, 0);
    if (foodTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'غذا',
            unitAmount: foodTotal,
            totalAmount: foodTotal,
            tourValues: foodValues
        });
    }

    const fuelValues = calculations.map((calc: any) => parseFloat(calc.fuel_cost || calc.fuelCost || 0));
    const fuelTotal = fuelValues.reduce((sum, val) => sum + val, 0);
    if (fuelTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'سوخت',
            unitAmount: fuelTotal,
            totalAmount: fuelTotal,
            tourValues: fuelValues
        });
    }

    const tollValues = calculations.map((calc: any) => parseFloat(calc.toll_cost || calc.tollCost || 0));
    const tollTotal = tollValues.reduce((sum, val) => sum + val, 0);
    if (tollTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'عوارض',
            unitAmount: tollTotal,
            totalAmount: tollTotal,
            tourValues: tollValues
        });
    }

    const returnCargoValues = calculations.map((calc: any) => parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0));
    const returnCargoTotal = returnCargoValues.reduce((sum, val) => sum + val, 0);
    if (returnCargoTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'بار برگشتی',
            unitAmount: returnCargoTotal,
            totalAmount: returnCargoTotal,
            tourValues: returnCargoValues
        });
    }

    const returnBillOfLadingValues = calculations.map((calc: any) => parseFloat(calc.return_bill_of_lading_cost || calc.returnBillOfLadingCost || 0));
    const returnBillOfLadingTotal = returnBillOfLadingValues.reduce((sum, val) => sum + val, 0);
    if (returnBillOfLadingTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'بارنامه برگشتی',
            unitAmount: returnBillOfLadingTotal,
            totalAmount: returnBillOfLadingTotal,
            tourValues: returnBillOfLadingValues
        });
    }

    const multiUnloadValues = calculations.map((calc: any) => parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0));
    const multiUnloadTotal = multiUnloadValues.reduce((sum, val) => sum + val, 0);
    if (multiUnloadTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'چندجا تخلیه',
            unitAmount: multiUnloadTotal,
            totalAmount: multiUnloadTotal,
            tourValues: multiUnloadValues
        });
    }

    const excessMissionValues = calculations.map((calc: any) => parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0));
    const excessMissionTotal = excessMissionValues.reduce((sum, val) => sum + val, 0);
    if (excessMissionTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'ماموریت مازاد',
            unitAmount: excessMissionTotal,
            totalAmount: excessMissionTotal,
            tourValues: excessMissionValues
        });
    }

    const fixedAllowanceValues = calculations.map((calc: any) => parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0));
    const fixedAllowanceTotal = fixedAllowanceValues.reduce((sum, val) => sum + val, 0);
    if (fixedAllowanceTotal > 0) {
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های مستقیم',
            description: 'اجرت ثابت',
            unitAmount: fixedAllowanceTotal,
            totalAmount: fixedAllowanceTotal,
            tourValues: fixedAllowanceValues
        });
    }

    // اضافه کردن هزینه‌های دپو - همیشه نمایش داده می‌شوند برای حفظ ساختار جدول
    const depotCountValues = calculations.map((calc: any) => parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0));
    const depotCount = depotCountValues.reduce((sum, val) => sum + val, 0);
    const depotMissionDaysValues = calculations.map((calc: any) => parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0));
    const depotMissionDays = depotMissionDaysValues.reduce((sum, val) => sum + val, 0);
    const depotMileageValues = calculations.map((calc: any) => parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0));
    const depotMileage = depotMileageValues.reduce((sum, val) => sum + val, 0);
    const depotCargoHandlingValues = calculations.map((calc: any) => parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0));
    const depotCargoHandlingTotal = depotCargoHandlingValues.reduce((sum, val) => sum + val, 0);
    const depotMissionValues = calculations.map((calc: any) => parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0));
    const depotMissionTotal = depotMissionValues.reduce((sum, val) => sum + val, 0);
    
    // بررسی اینکه آیا حداقل یکی از هزینه‌های دپو وجود دارد
    const hasAnyDepotCost = depotCount > 0 || depotMissionDays > 0 || depotMileage > 0 || depotCargoHandlingTotal > 0 || depotMissionTotal > 0;
    
    if (hasAnyDepotCost) {
        mainDriverRows.push({ kind: 'categoryHeader', category: 'هزینه‌های دپو' });
        
        // تعداد بار دپو - همیشه نمایش داده می‌شود
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های دپو',
            description: 'تعداد بار دپو',
            unitAmount: depotCount,
            totalAmount: null,
            isDepotCount: true,
            tourValues: depotCountValues
        });

        // ماموریت دپو (روز) - همیشه نمایش داده می‌شود
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های دپو',
            description: 'ماموریت دپو (روز)',
            unitAmount: depotMissionDays,
            totalAmount: null,
            isDepotCount: true,
            tourValues: depotMissionDaysValues
        });

        // پیمایش دپو (کیلومتر) - همیشه نمایش داده می‌شود
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های دپو',
            description: 'پیمایش دپو (کیلومتر)',
            unitAmount: depotMileage,
            totalAmount: null,
            isDepotCount: true,
            tourValues: depotMileageValues
        });

        // ماموریت دپو جمع کل (ریال) - مجموع جابجایی بار دپو و حق ماموریت دپو
        const depotMissionTotalCombined = depotCargoHandlingTotal + depotMissionTotal;
        const depotMissionTotalCombinedValues = calculations.map((calc: any) => {
            const cargo = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
            const mission = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
            return cargo + mission;
        });
        // همیشه نمایش داده می‌شود برای حفظ ساختار جدول
        mainDriverRows.push({
            kind: 'cost',
            category: 'هزینه‌های دپو',
            description: 'ماموریت دپو جمع کل (ریال)',
            unitAmount: depotMissionTotalCombined,
            totalAmount: depotMissionTotalCombined,
            tourValues: depotMissionTotalCombinedValues
        });
    }

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
        const vehicleType = announcement?.vehicle_type || announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
        // Debug: لاگ کردن مقادیر برای دیباگ
        console.log('🔍 [convertToInvoiceDataFormatHorizontal] بررسی فیلدهای پیمایش و ماموریت:', {
            calcId: calc.id || calc.announcement_id || calc.announcementId,
            approved_kilometers: calc.approved_kilometers,
            approvedKilometers: calc.approvedKilometers,
            excess_kilometers: calc.excess_kilometers,
            excessKilometers: calc.excessKilometers,
            approved_mission_days: calc.approved_mission_days,
            approvedMissionDays: calc.approvedMissionDays,
            excess_mission_days: calc.excess_mission_days,
            excessMissionDays: calc.excessMissionDays,
            allKeys: Object.keys(calc).filter(k => k.includes('approved') || k.includes('excess') || k.includes('mission') || k.includes('kilometer'))
        });
        
        // خواندن مقادیر با بررسی دقیق‌تر برای null/undefined
        const approvedKmRaw = calc.approved_kilometers ?? calc.approvedKilometers ?? calc.approved_kilometer ?? calc.approvedKilometer ?? null;
        const excessKmRaw = calc.excess_kilometers ?? calc.excessKilometers ?? calc.excess_kilometer ?? calc.excessKilometer ?? null;
        const approvedMissionDaysRaw = calc.approved_mission_days ?? calc.approvedMissionDays ?? calc.approved_mission ?? calc.approvedMission ?? null;
        const excessMissionDaysRaw = calc.excess_mission_days ?? calc.excessMissionDays ?? calc.excess_mission ?? calc.excessMission ?? null;
        
        const approvedKm = approvedKmRaw != null && approvedKmRaw !== '' && !isNaN(Number(approvedKmRaw)) ? Number(approvedKmRaw) : 0;
        const excessKm = excessKmRaw != null && excessKmRaw !== '' && !isNaN(Number(excessKmRaw)) ? Number(excessKmRaw) : 0;
        const approvedMissionDays = approvedMissionDaysRaw != null && approvedMissionDaysRaw !== '' && !isNaN(Number(approvedMissionDaysRaw)) ? Number(approvedMissionDaysRaw) : 0;
        const excessMissionDays = excessMissionDaysRaw != null && excessMissionDaysRaw !== '' && !isNaN(Number(excessMissionDaysRaw)) ? Number(excessMissionDaysRaw) : 0;
        
        console.log('🔍 [convertToInvoiceDataFormatHorizontal] مقادیر raw و پردازش شده:', {
            approvedKmRaw,
            approvedKm,
            excessKmRaw,
            excessKm,
            approvedMissionDaysRaw,
            approvedMissionDays,
            excessMissionDaysRaw,
            excessMissionDays
        });
        const depotCargoHandling = parseFloat(calc.depot_cargo_handling_cost || calc.depotCargoHandlingCost || 0);
        const depotKilometerRate = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
        const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
        const depotShipmentCount = parseFloat(calc.depot_shipment_count || calc.depotShipmentCount || 0);
        const depotMissionDays = parseFloat(calc.depot_mission_days || calc.depotMissionDays || 0);
        const depotTotalMileage = parseFloat(calc.depot_total_mileage || calc.depotTotalMileage || 0);
        const fixedAllowance = parseFloat(calc.fixed_allowance || calc.fixedAllowance || 0);
        const billOfLadingCost = parseFloat(calc.bill_of_lading_cost || calc.billOfLadingCost || 0);
        const fuelCost = parseFloat(calc.fuel_cost || calc.fuelCost || 0);
        const foodCost = parseFloat(calc.food_cost || calc.foodCost || 0);
        const multiUnloadCost = parseFloat(calc.multi_unload_cost || calc.multiUnloadCost || 0);
        const tollCost = parseFloat(calc.toll_cost || calc.tollCost || 0);
        const returnCargoCost = parseFloat(calc.return_cargo_cost || calc.returnCargoCost || 0);
        const excessMissionCost = parseFloat(calc.excess_mission_cost || calc.excessMissionCost || 0);
        
        const tourObj = {
            billOfLadingNumber,
            destinations,
            vehiclePlate,
            vehicleType,
            billOfLadingDate,
            calculationDate,
            approvedKm,
            excessKm,
            totalKm: approvedKm + excessKm + depotTotalMileage,
            approvedMissionDays,
            excessMissionDays,
            // هزینه‌های مستقیم
            billOfLadingCost,
            fuelCost,
            foodCost,
            multiUnloadCost,
            tollCost,
            fixedAllowance,
            returnCargoCost,
            excessMissionCost,
            // هزینه‌های دپو
            depotMissionDays,
            depotCargoHandling,
            depotShipmentCount,
            depotTotalMileage,
            depotKilometerRate,
            depotMissionCost,
        };
        
        // Debug: لاگ کردن tour object برای بررسی
        console.log('🔍 [convertToInvoiceDataFormatHorizontal] tour object ساخته شد:', {
            billOfLadingNumber: tourObj.billOfLadingNumber,
            approvedKm: tourObj.approvedKm,
            excessKm: tourObj.excessKm,
            approvedMissionDays: tourObj.approvedMissionDays,
            excessMissionDays: tourObj.excessMissionDays,
        });
        
        return tourObj;
    });

    return { blocks, tourData, helperCalculationsByEmployeeId };
};

// Helper function برای formatJalali
const formatJalali = (date: any): string => {
    if (!date) return '-';
    if (typeof date === 'string') return date;
    // اگر date object است، باید تبدیل شود
    return date.toString();
};

// تابع render برای افقی layout - ساختار جدید: دسته‌بندی‌ها به صورت ستون و فیلدها به صورت ردیف
// تابع helper برای ساخت ردیف‌های اطلاعات اولیه راننده کمکی
const createHelperInitialInfoRows = (helperCalculations: any[], announcementsMap: Map<string, any>) => {
    const formatJalali = (date: any): string => {
        if (!date) return '-';
        if (typeof date === 'string') return date;
        return date.toString();
    };
    
    const tours = helperCalculations.map((calc: any) => {
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
        const vehicleType = announcement?.vehicle_type || announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
        
        // خواندن مقادیر پیمایش و ماموریت مازاد راننده کمکی
        const helperExcessKilometersRaw = calc.helper_driver_excess_kilometers ?? calc.helperDriverExcessKilometers ?? null;
        const helperExcessMissionDaysRaw = calc.helper_driver_excess_mission_days ?? calc.helperDriverExcessMissionDays ?? null;
        
        const helperExcessKilometers = helperExcessKilometersRaw != null && helperExcessKilometersRaw !== '' && !isNaN(Number(helperExcessKilometersRaw)) ? Number(helperExcessKilometersRaw) : 0;
        const helperExcessMissionDays = helperExcessMissionDaysRaw != null && helperExcessMissionDaysRaw !== '' && !isNaN(Number(helperExcessMissionDaysRaw)) ? Number(helperExcessMissionDaysRaw) : 0;
        
        return { 
            billOfLadingNumber, 
            destinations, 
            billOfLadingDate, 
            calculationDate, 
            vehiclePlate, 
            vehicleType,
            helperExcessKilometers,
            helper_excess_kilometers: helperExcessKilometers,
            helperExcessMissionDays,
            helper_excess_mission_days: helperExcessMissionDays,
        };
    });
    
    return [
        { label: 'شماره بارنامه', getValue: (tour: any) => tour?.billOfLadingNumber || '-', getTotal: () => '-' },
        { label: 'تاریخ صدور بارنامه', getValue: (tour: any) => tour?.billOfLadingDate || '-', getTotal: () => '-' },
        { label: 'مقاصد', getValue: (tour: any) => tour?.destinations || '-', getTotal: () => '-' },
        { label: 'تاریخ محاسبه', getValue: (tour: any) => tour?.calculationDate || '-', getTotal: () => '-' },
        { label: 'پلاک خودرو', getValue: (tour: any) => tour?.vehiclePlate || '-', getTotal: () => '-' },
        { label: 'نوع خودرو', getValue: (tour: any) => tour?.vehicleType || '-', getTotal: () => '-' },
        { label: 'پیمایش مازاد راننده کمکی (کیلومتر)', getValue: (tour: any) => {
            const value = tour?.helperExcessKilometers ?? tour?.helper_excess_kilometers ?? 0;
            return value != null && value !== '' && !isNaN(Number(value)) && Number(value) > 0 ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = tours.reduce((sum, t) => {
                const val = t.helperExcessKilometers ?? t.helper_excess_kilometers ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0);
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
        { label: 'ماموریت مازاد راننده کمکی (روز)', getValue: (tour: any) => {
            const value = tour?.helperExcessMissionDays ?? tour?.helper_excess_mission_days ?? 0;
            return value != null && value !== '' && !isNaN(Number(value)) && Number(value) > 0 ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = tours.reduce((sum, t) => {
                const val = t.helperExcessMissionDays ?? t.helper_excess_mission_days ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0);
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
    ];
};

export const renderInvoiceLayoutHorizontal = (
    invoiceData: InvoiceData,
    selectedInvoiceRecord: PaymentRecord,
    invoiceAnnouncements: Map<string, any>,
    containerWidth: number = 1600,
    fontSize: number = 13,
    cellPadding: string = '14px 12px'
): JSX.Element => {
    const numTours = invoiceData.tourData?.length || 0;
    const mainBlock = invoiceData.blocks[0];
    const helperBlocks = invoiceData.blocks.slice(1); // بلوک‌های راننده کمکی
    
    // محاسبه مقادیر برای هر دسته‌بندی
    const initialInfoRows = [
        { label: 'شماره بارنامه', getValue: (tour: any) => tour?.billOfLadingNumber || '-', getTotal: () => '-' },
        { label: 'تاریخ صدور بارنامه', getValue: (tour: any) => tour?.billOfLadingDate || '-', getTotal: () => '-' },
        { label: 'مقاصد', getValue: (tour: any) => tour?.destinations || '-', getTotal: () => '-' },
        { label: 'تاریخ محاسبه', getValue: (tour: any) => tour?.calculationDate || '-', getTotal: () => '-' },
        { label: 'پلاک خودرو', getValue: (tour: any) => tour?.vehiclePlate || '-', getTotal: () => '-' },
        { label: 'نوع خودرو', getValue: (tour: any) => tour?.vehicleType || '-', getTotal: () => '-' },
        { label: 'پیمایش مصوب', getValue: (tour: any) => {
            const value = tour?.approvedKm ?? tour?.approved_kilometers ?? tour?.approvedKilometers ?? 0;
            console.log('🔍 [renderInvoiceLayoutHorizontal] پیمایش مصوب - tour:', tour, 'value:', value);
            return value != null && value !== '' && !isNaN(Number(value)) ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = invoiceData.tourData?.reduce((sum, t) => {
                const val = t.approvedKm ?? t.approved_kilometers ?? t.approvedKilometers ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0) || 0;
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
        { label: 'پیمایش مازاد', getValue: (tour: any) => {
            const value = tour?.excessKm ?? tour?.excess_kilometers ?? tour?.excessKilometers ?? 0;
            console.log('🔍 [renderInvoiceLayoutHorizontal] پیمایش مازاد - tour:', tour, 'value:', value);
            return value != null && value !== '' && !isNaN(Number(value)) ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = invoiceData.tourData?.reduce((sum, t) => {
                const val = t.excessKm ?? t.excess_kilometers ?? t.excessKilometers ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0) || 0;
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
        { label: 'ماموریت مصوب', getValue: (tour: any) => {
            const value = tour?.approvedMissionDays ?? tour?.approved_mission_days ?? 0;
            console.log('🔍 [renderInvoiceLayoutHorizontal] ماموریت مصوب - tour:', tour, 'value:', value);
            return value != null && value !== '' && !isNaN(Number(value)) ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = invoiceData.tourData?.reduce((sum, t) => {
                const val = t.approvedMissionDays ?? t.approved_mission_days ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0) || 0;
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
        { label: 'ماموریت مازاد', getValue: (tour: any) => {
            const value = tour?.excessMissionDays ?? tour?.excess_mission_days ?? 0;
            console.log('🔍 [renderInvoiceLayoutHorizontal] ماموریت مازاد - tour:', tour, 'value:', value);
            return value != null && value !== '' && !isNaN(Number(value)) ? Number(value).toLocaleString('fa-IR') : '-';
        }, getTotal: () => {
            const total = invoiceData.tourData?.reduce((sum, t) => {
                const val = t.excessMissionDays ?? t.excess_mission_days ?? 0;
                return sum + (val != null && val !== '' && !isNaN(Number(val)) ? Number(val) : 0);
            }, 0) || 0;
            return total > 0 ? total.toLocaleString('fa-IR') : '-';
        }},
    ];
    
    // هزینه‌های مستقیم
    const directCostRows = [
        { label: 'هزینه بارنامه', getValue: (tour: any) => (tour?.billOfLadingCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.billOfLadingCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'سوخت', getValue: (tour: any) => (tour?.fuelCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.fuelCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'غذا', getValue: (tour: any) => (tour?.foodCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.foodCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'چندجا تخلیه', getValue: (tour: any) => (tour?.multiUnloadCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.multiUnloadCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'هزینه عوارض آزاد راهی', getValue: (tour: any) => (tour?.tollCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.tollCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'اجرت ثابت', getValue: (tour: any) => (tour?.fixedAllowance || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.fixedAllowance || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'هزینه بار برگشتی', getValue: (tour: any) => (tour?.returnCargoCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.returnCargoCost || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'ماموریت مازاد', getValue: (tour: any) => (tour?.excessMissionCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.excessMissionCost || 0), 0).toLocaleString('fa-IR') || '0' },
    ];
    
    // هزینه‌های دپو
    const depotCostRows = [
        { label: 'تعداد روز ماموریت دپو', getValue: (tour: any) => (tour?.depotMissionDays || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotMissionDays || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'هزینه جابجایی بار در دپو (ریال)', getValue: (tour: any) => (tour?.depotCargoHandling || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotCargoHandling || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'تعداد بار ارسالی', getValue: (tour: any) => (tour?.depotShipmentCount || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotShipmentCount || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'پیمایش کل دپو (کیلومتر)', getValue: (tour: any) => (tour?.depotTotalMileage || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotTotalMileage || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'اجرت دپو (ریال)', getValue: (tour: any) => (tour?.depotKilometerRate || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotKilometerRate || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'حق ماموریت دپو (ریال)', getValue: (tour: any) => (tour?.depotMissionCost || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.depotMissionCost || 0), 0).toLocaleString('fa-IR') || '0' },
    ];
    
    // جمع بندی
    const totalKm = invoiceData.tourData?.reduce((sum, t) => sum + (t.approvedKm || 0) + (t.excessKm || 0) + (t.depotTotalMileage || 0), 0) || 0;
    const totalFixedAllowance = invoiceData.tourData?.reduce((sum, t) => sum + (t.fixedAllowance || 0), 0) || 0;
    const totalDepotAllowance = invoiceData.tourData?.reduce((sum, t) => sum + (t.depotKilometerRate || 0), 0) || 0;
    const totalNonAllowanceCosts = invoiceData.tourData?.reduce((sum, t) => 
        sum + (t.billOfLadingCost || 0) + (t.fuelCost || 0) + (t.foodCost || 0) + 
        (t.multiUnloadCost || 0) + (t.tollCost || 0) + (t.returnCargoCost || 0) + 
        (t.excessMissionCost || 0) + (t.depotCargoHandling || 0) + (t.depotMissionCost || 0), 0) || 0;
    const totalTourCost = totalFixedAllowance + totalDepotAllowance + totalNonAllowanceCosts;
    
    const summaryRows = [
        { label: 'پیمایش کل', getValue: () => totalKm.toLocaleString('fa-IR'), getTotal: () => totalKm.toLocaleString('fa-IR') },
        { label: 'کل اجرت', getValue: () => (totalFixedAllowance + totalDepotAllowance).toLocaleString('fa-IR'), getTotal: () => (totalFixedAllowance + totalDepotAllowance).toLocaleString('fa-IR') },
        { label: 'هزینه های بغیر اجرت', getValue: () => totalNonAllowanceCosts.toLocaleString('fa-IR'), getTotal: () => totalNonAllowanceCosts.toLocaleString('fa-IR') },
        { label: 'کل هزینه تور', getValue: () => totalTourCost.toLocaleString('fa-IR'), getTotal: () => totalTourCost.toLocaleString('fa-IR') },
    ];
    
    // محاسبه حداکثر تعداد ردیف‌ها - اطلاعات اولیه را به 2 تقسیم می‌کنیم چون در هر ردیف 2 فیلد نمایش می‌دهیم
    const initialInfoRowCount = Math.ceil(initialInfoRows.length / 2);
    const maxRows = Math.max(initialInfoRowCount, directCostRows.length, depotCostRows.length, summaryRows.length);
    
    return (
        <div style={{ width: '100%', overflowX: 'auto', direction: 'rtl' }}>
            <style>{`
                @media (max-width: 768px) {
                    .invoice-table-wrapper {
                        overflow-x: auto;
                    }
                    .invoice-table {
                        min-width: 800px;
                    }
                }
            `}</style>
            <div 
                data-invoice-ref="true"
                style={{
                    direction: 'rtl',
                    unicodeBidi: 'isolate',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                    width: `${containerWidth}px`,
                    minWidth: `${containerWidth}px`,
                    maxWidth: 'none',
                    margin: '0 auto',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    padding: '30px',
                    boxSizing: 'border-box',
                    position: 'relative' as const,
                    textAlign: 'center',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'visible',
                }}>
                {/* اطلاعات راننده */}
                <div style={{
                    marginBottom: '30px',
                    paddingBottom: '20px',
                    borderBottom: '2px solid #1e40af',
                    textAlign: 'right',
                    direction: 'rtl',
                    unicodeBidi: 'isolate',
                }}>
                    <h3 style={{
                        fontSize: '22px',
                        fontWeight: 'bold',
                        marginBottom: '15px',
                        textAlign: 'center',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                        color: '#1e3a8a',
                    }}>
                        صورتحساب هزینه
                    </h3>
                    <div style={{
                        fontSize: '14px',
                        lineHeight: '1.8',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                    }}>
                        <p style={{ marginBottom: '4px' }}>کد پرسنلی: {selectedInvoiceRecord.employeeId}</p>
                        <p style={{ marginBottom: '4px' }}>نام: {selectedInvoiceRecord.driverName}</p>
                        <p>شماره حساب: {selectedInvoiceRecord.accountNumber || '-'}</p>
                    </div>
                </div>
                
                {/* جدول جدید: برای هر دسته، label در یک ستون و value در ستون دیگر */}
                <div className="invoice-table-wrapper" style={{ 
                    borderRadius: '12px', 
                    overflow: 'visible', 
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    background: 'white',
                    margin: '0 auto 15px auto',
                }}>
                    <table className="invoice-table" style={{
                        width: '100%',
                        maxWidth: '100%',
                        borderCollapse: 'separate',
                        borderSpacing: '0',
                        tableLayout: 'fixed',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontSize: '14px',
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                        boxSizing: 'border-box',
                        borderRadius: '12px',
                        overflow: 'visible',
                        background: 'white',
                    }}>
                        <thead>
                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                {/* اطلاعات اولیه - 4 ستون: Label1, Value1, Label2, Value2 */}
                                <th colSpan={4} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: '1px solid #1e3a8a',
                                    fontWeight: '700',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>اطلاعات اولیه</th>
                                {/* ستون جداکننده */}
                                <th colSpan={1} style={{
                                    border: 'none',
                                    padding: '0',
                                    width: '8px',
                                    backgroundColor: '#e5e7eb',
                                    minWidth: '8px',
                                    maxWidth: '8px',
                                }}></th>
                                {/* هزینه های مستقیم - 2 ستون: Label, Value */}
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: '1px solid #1e3a8a',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>هزینه های مستقیم</th>
                                {/* ستون جداکننده */}
                                <th colSpan={1} style={{
                                    border: 'none',
                                    padding: '0',
                                    width: '8px',
                                    backgroundColor: '#e5e7eb',
                                    minWidth: '8px',
                                    maxWidth: '8px',
                                }}></th>
                                {/* هزینه دپو - 2 ستون: Label, Value */}
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: '1px solid #1e3a8a',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>هزینه دپو</th>
                                {/* ستون جداکننده */}
                                <th colSpan={1} style={{
                                    border: 'none',
                                    padding: '0',
                                    width: '8px',
                                    backgroundColor: '#e5e7eb',
                                    minWidth: '8px',
                                    maxWidth: '8px',
                                }}></th>
                                {/* جمع بندی - 2 ستون: Label, Value */}
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    padding: '12px 15px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                    minWidth: '350px',
                                }}>جمع بندی</th>
                            </tr>
                        </thead>
                    <tbody style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                        {Array.from({ length: maxRows }, (_, rowIdx) => {
                            // برای اطلاعات اولیه: 2 فیلد در هر ردیف
                            const initialRow1 = initialInfoRows[rowIdx * 2];
                            const initialRow2 = initialInfoRows[rowIdx * 2 + 1];
                            const directRow = directCostRows[rowIdx];
                            const depotRow = depotCostRows[rowIdx];
                            const summaryRow = summaryRows[rowIdx];
                            
                            // محاسبه مقادیر برای هر تور
                            const initialValues1 = invoiceData.tourData?.map(tour => initialRow1 ? initialRow1.getValue(tour) : '-').join(' / ') || '-';
                            const initialValues2 = invoiceData.tourData?.map(tour => initialRow2 ? initialRow2.getValue(tour) : '-').join(' / ') || '-';
                            const directValues = invoiceData.tourData?.map(tour => directRow ? directRow.getValue(tour) : '-').join(' / ') || '-';
                            const depotValues = invoiceData.tourData?.map(tour => depotRow ? depotRow.getValue(tour) : '-').join(' / ') || '-';
                            const summaryValue = summaryRow ? summaryRow.getValue() : '-';
                            const totalValue = summaryRow ? summaryRow.getTotal() : '-';
                            
                            const isEven = rowIdx % 2 === 0;
                            const rowBgColor = isEven ? '#f8fbff' : '#ffffff';
                            const hasContent = initialRow1 || initialRow2 || directRow || depotRow || summaryRow;
                            
                            // بررسی اینکه آیا مقدار عددی است یا نه
                            const isNumeric = (str: string) => {
                                if (!str || str === '-') return false;
                                return /^[\d,\.\s]+$/.test(str.replace(/[^\d,\.]/g, ''));
                            };
                            
                            // تعیین استایل برای دسته‌بندی‌ها - استفاده از background-color برای جدا کردن
                            const cellBorder = '1px solid #cccccc'; // حاشیه‌های عادی داخل جدول
                            const isLastRow = rowIdx === maxRows - 1;
                            
                            // رنگ پس‌زمینه برای هر دسته
                            const initialInfoBg = '#f0f9ff'; // آبی خیلی روشن برای اطلاعات اولیه
                            const directCostBg = '#fef3c7'; // زرد روشن برای هزینه های مستقیم
                            const depotCostBg = '#dbeafe'; // آبی روشن برای هزینه دپو
                            const summaryBg = '#f3e8ff'; // بنفش روشن برای جمع بندی
                            
                            return (
                                <tr 
                                    key={rowIdx} 
                                    style={{ 
                                        direction: 'rtl', 
                                        unicodeBidi: 'isolate',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                        transition: 'background-color 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (hasContent) {
                                            e.currentTarget.style.backgroundColor = '#e6f0ff';
                                            e.currentTarget.style.transition = 'background-color 0.3s';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (hasContent) {
                                            e.currentTarget.style.backgroundColor = rowBgColor;
                                            e.currentTarget.style.transition = 'background-color 0.3s';
                                        }
                                    }}
                                >
                                    {/* اطلاعات اولیه - فیلد 1 Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '12px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? initialInfoBg : '#ffffff') : 'transparent',
                                    }}>
                                        {initialRow1 ? initialRow1.label : '-'}
                                    </td>
                                    {/* اطلاعات اولیه - فیلد 1 Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? initialInfoBg : '#ffffff') : 'transparent',
                                    }}>
                                        {initialValues1 || '-'}
                                    </td>
                                    {/* اطلاعات اولیه - فیلد 2 Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '12px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? initialInfoBg : '#ffffff') : 'transparent',
                                    }}>
                                        {initialRow2 ? initialRow2.label : '-'}
                                    </td>
                                    {/* اطلاعات اولیه - فیلد 2 Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? initialInfoBg : '#ffffff') : 'transparent',
                                    }}>
                                        {initialValues2 || '-'}
                                    </td>
                                    
                                    {/* ستون جداکننده بین اطلاعات اولیه و هزینه های مستقیم */}
                                    <td style={{ 
                                        borderTop: 'none',
                                        borderBottom: 'none',
                                        borderLeft: 'none',
                                        borderRight: 'none',
                                        padding: '0',
                                        width: '8px',
                                        backgroundColor: '#e5e7eb',
                                        minWidth: '8px',
                                        maxWidth: '8px',
                                    }}>
                                    </td>
                                    
                                    {/* هزینه های مستقیم - Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '12px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? directCostBg : '#ffffff') : 'transparent',
                                    }}>
                                        {directRow ? directRow.label : '-'}
                                    </td>
                                    {/* هزینه های مستقیم - Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? directCostBg : '#ffffff') : 'transparent',
                                    }}>
                                        {directValues || '-'}
                                    </td>
                                    
                                    {/* ستون جداکننده بین هزینه های مستقیم و هزینه دپو */}
                                    <td style={{ 
                                        borderTop: 'none',
                                        borderBottom: 'none',
                                        borderLeft: 'none',
                                        borderRight: 'none',
                                        padding: '0',
                                        width: '8px',
                                        backgroundColor: '#e5e7eb',
                                        minWidth: '8px',
                                        maxWidth: '8px',
                                    }}>
                                    </td>
                                    
                                    {/* هزینه دپو - Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '12px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {depotRow ? depotRow.label : '-'}
                                    </td>
                                    {/* هزینه دپو - Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? depotCostBg : '#ffffff') : 'transparent',
                                    }}>
                                        {depotValues || '-'}
                                    </td>
                                    
                                    {/* ستون جداکننده بین هزینه دپو و جمع بندی */}
                                    <td style={{ 
                                        borderTop: 'none',
                                        borderBottom: 'none',
                                        borderLeft: 'none',
                                        borderRight: 'none',
                                        padding: '0',
                                        width: '8px',
                                        backgroundColor: '#e5e7eb',
                                        minWidth: '8px',
                                        maxWidth: '8px',
                                    }}>
                                    </td>
                                    
                                    {/* جمع بندی - Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '12px 15px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '18%',
                                        minWidth: '200px',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? summaryBg : '#ffffff') : 'transparent',
                                    }}>
                                        {summaryRow ? summaryRow.label : '-'}
                                    </td>
                                    {/* جمع بندی - Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: isLastRow ? cellBorder : cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '12px 15px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '18%',
                                        minWidth: '150px',
                                        fontWeight: 'bold',
                                        color: '#1e3a8a',
                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? summaryBg : '#ffffff') : 'transparent',
                                    }}>
                                        {summaryRow ? totalValue : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>
                
                {/* بخش خلاصه تور */}
                {mainBlock?.summary && (
                    <div style={{
                        width: '100%',
                        maxWidth: '100%',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        marginTop: '15px',
                    }}>
                        <table style={{
                            width: '100%',
                            maxWidth: '100%',
                            borderCollapse: 'collapse',
                            direction: 'rtl',
                            unicodeBidi: 'isolate',
                            fontSize: '14px',
                            fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                            boxSizing: 'border-box',
                        }}>
                            <tbody>
                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                    <td style={{
                                        border: '2px solid #1e3a8a',
                                        padding: '12px 20px',
                                        backgroundColor: '#dbeafe',
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        lineHeight: '1.8',
                                    }}>
                                        جمع کل هزینه سفر: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{mainBlock.summary.totalTripCost.toLocaleString('fa-IR')}</span> ریال
                                    </td>
                                </tr>
                                {mainBlock.summary.deductionsAmount && mainBlock.summary.deductionsAmount > 0 && (
                                    <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                        <td style={{
                                            border: '2px solid #1e3a8a',
                                            borderTop: 'none',
                                            padding: '12px 20px',
                                            backgroundColor: '#dbeafe',
                                            textAlign: 'center',
                                            direction: 'rtl',
                                            unicodeBidi: 'isolate',
                                            fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                            lineHeight: '1.8',
                                        }}>
                                            {mainBlock.summary.deductionsTitle || 'کسور'}: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{mainBlock.summary.deductionsAmount.toLocaleString('fa-IR')}</span> ریال
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                    <td style={{
                                        border: '2px solid #1e3a8a',
                                        borderTop: 'none',
                                        padding: '12px 20px',
                                        backgroundColor: '#bfdbfe',
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        color: '#1e3a8a',
                                        lineHeight: '1.8',
                                    }}>
                                        مبلغ قابل پرداخت: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
                
                {/* جداول راننده کمکی */}
                {helperBlocks.map((helperBlock, helperIdx) => {
                    const helperCalculations = invoiceData.helperCalculationsByEmployeeId?.get(
                        helperBlock.title.match(/کدپرسنلی:\s*(\d+)/)?.[1] || ''
                    ) || [];
                    
                    // ساخت ردیف‌های اطلاعات اولیه برای راننده کمکی
                    const helperInitialInfoRows = createHelperInitialInfoRows(helperCalculations, invoiceAnnouncements);
                    
                    // ساخت ردیف‌های هزینه‌های مستقیم برای راننده کمکی
                    const helperDirectCostRows = helperBlock.rows
                        .filter((row: any) => row.kind === 'cost' && row.category === 'هزینه‌های مستقیم')
                        .map((row: any) => ({
                            label: row.description || '-',
                            getValue: (tour: any, tourIdx: number) => {
                                const value = row.tourValues?.[tourIdx] || 0;
                                return value > 0 ? value.toLocaleString('fa-IR') : '-';
                            },
                            getTotal: () => (row.totalAmount || 0).toLocaleString('fa-IR')
                        }));
                    
                    // راننده کمکی هزینه دپو و جمع بندی ندارد
                    const helperDepotCostRows: any[] = [];
                    const helperSummaryRows = [
                        { label: 'کل هزینه تور', getValue: () => (helperBlock.summary?.totalTripCost || 0).toLocaleString('fa-IR'), getTotal: () => (helperBlock.summary?.totalTripCost || 0).toLocaleString('fa-IR') }
                    ];
                    
                    const helperInitialInfoRowCount = Math.ceil(helperInitialInfoRows.length / 2);
                    // برای راننده کمکی، دسته دپو را حذف می‌کنیم
                    const helperMaxRows = Math.max(helperInitialInfoRowCount, helperDirectCostRows.length, helperSummaryRows.length);
                    
                    // ساخت tourData برای راننده کمکی
                    const helperTourData = helperCalculations.map((calc: any) => {
                        const announcement = invoiceAnnouncements.get(calc.announcement_id || calc.announcementId);
                        const destinations = announcement?.destinations?.map((d: any) => d.city || '').filter(Boolean).join('، ') || '-';
                        const billOfLadingNumber = calc.bill_of_lading_number || calc.billOfLadingNumber || '-';
                        const billOfLadingDate = calc.bill_of_lading_date || calc.billOfLadingDate ? 
                            (typeof (calc.bill_of_lading_date || calc.billOfLadingDate) === 'string' 
                                ? (calc.bill_of_lading_date || calc.billOfLadingDate)
                                : String(calc.bill_of_lading_date || calc.billOfLadingDate)) : '-';
                        const calculationDate = calc.calculation_date || calc.calculationDate ? 
                            (typeof (calc.calculation_date || calc.calculationDate) === 'string' 
                                ? (calc.calculation_date || calc.calculationDate)
                                : String(calc.calculation_date || calc.calculationDate)) : '-';
                        const vehiclePlate = calc.vehicle_plate || calc.vehiclePlate || announcement?.vehicle_plate || announcement?.vehiclePlate || '-';
                        const vehicleType = announcement?.vehicle_type || announcement?.vehicleType || calc.vehicle_type || calc.vehicleType || '-';
                        
                        // خواندن مقادیر پیمایش و ماموریت مازاد راننده کمکی
                        const helperExcessKilometersRaw = calc.helper_driver_excess_kilometers ?? calc.helperDriverExcessKilometers ?? null;
                        const helperExcessMissionDaysRaw = calc.helper_driver_excess_mission_days ?? calc.helperDriverExcessMissionDays ?? null;
                        
                        const helperExcessKilometers = helperExcessKilometersRaw != null && helperExcessKilometersRaw !== '' && !isNaN(Number(helperExcessKilometersRaw)) ? Number(helperExcessKilometersRaw) : 0;
                        const helperExcessMissionDays = helperExcessMissionDaysRaw != null && helperExcessMissionDaysRaw !== '' && !isNaN(Number(helperExcessMissionDaysRaw)) ? Number(helperExcessMissionDaysRaw) : 0;
                        
                        return { 
                            billOfLadingNumber, 
                            destinations, 
                            billOfLadingDate, 
                            calculationDate, 
                            vehiclePlate, 
                            vehicleType,
                            helperExcessKilometers,
                            helper_excess_kilometers: helperExcessKilometers,
                            helperExcessMissionDays,
                            helper_excess_mission_days: helperExcessMissionDays,
                        };
                    });
                    
                    return (
                        <div key={helperIdx} style={{ marginTop: '50px' }}>
                            {/* عنوان راننده کمکی */}
                            <div style={{
                                marginBottom: '30px',
                                paddingBottom: '20px',
                                borderBottom: '2px solid #1e3a8a',
                                textAlign: 'right',
                                direction: 'rtl',
                                unicodeBidi: 'isolate',
                            }}>
                                <h3 style={{
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    color: '#1e3a8a',
                                }}>
                                    {helperBlock.title}
                                </h3>
                            </div>
                            
                            {/* جدول راننده کمکی */}
                            <div className="invoice-table-wrapper" style={{ borderRadius: '12px', overflow: 'visible', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: '30px' }}>
                                <table className="invoice-table" style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    borderCollapse: 'separate',
                                    borderSpacing: '0',
                                    tableLayout: 'fixed',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    margin: '0 auto 15px auto',
                                    fontSize: '14px',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    boxSizing: 'border-box',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                }}>
                                    <thead>
                                        <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                            {/* اطلاعات اولیه - 4 ستون: Label1, Value1, Label2, Value2 */}
                                            <th colSpan={4} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                borderRight: '1px solid #1e3a8a',
                                                fontWeight: '700',
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>اطلاعات اولیه</th>
                                            {/* ستون جداکننده */}
                                            <th colSpan={1} style={{
                                                border: 'none',
                                                padding: '0',
                                                width: '8px',
                                                backgroundColor: '#e5e7eb',
                                                minWidth: '8px',
                                                maxWidth: '8px',
                                            }}></th>
                                            {/* هزینه های مستقیم - 2 ستون: Label, Value */}
                                            <th colSpan={2} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                borderRight: '1px solid #1e3a8a',
                                                fontWeight: '700',
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>هزینه های مستقیم</th>
                                            {/* ستون جداکننده */}
                                            <th colSpan={1} style={{
                                                border: 'none',
                                                padding: '0',
                                                width: '8px',
                                                backgroundColor: '#e5e7eb',
                                                minWidth: '8px',
                                                maxWidth: '8px',
                                            }}></th>
                                            {/* برای راننده کمکی، دسته دپو را حذف می‌کنیم - فقط جمع بندی */}
                                            <th colSpan={2} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>جمع بندی</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                        {Array.from({ length: helperMaxRows }, (_, rowIdx) => {
                                            const helperInitialRow1 = helperInitialInfoRows[rowIdx * 2];
                                            const helperInitialRow2 = helperInitialInfoRows[rowIdx * 2 + 1];
                                            const helperDirectRow = helperDirectCostRows[rowIdx];
                                            // برای راننده کمکی، دسته دپو را حذف می‌کنیم
                                            const helperSummaryRow = helperSummaryRows[rowIdx];
                                            
                                            const helperInitialValues1 = helperTourData?.map((tour, tourIdx) => helperInitialRow1 ? helperInitialRow1.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperInitialValues2 = helperTourData?.map((tour, tourIdx) => helperInitialRow2 ? helperInitialRow2.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperDirectValues = helperTourData?.map((tour, tourIdx) => helperDirectRow ? helperDirectRow.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperTotalValue = helperSummaryRow ? helperSummaryRow.getTotal() : '-';
                                            
                                            const isEven = rowIdx % 2 === 0;
                                            const rowBgColor = isEven ? '#f8fbff' : '#ffffff';
                                            const hasContent = helperInitialRow1 || helperInitialRow2 || helperDirectRow || helperSummaryRow;
                                            
                                            const isNumeric = (str: string) => {
                                                if (!str || str === '-') return false;
                                                return /^[\d,\.\s]+$/.test(str.replace(/[^\d,\.]/g, ''));
                                            };
                                            
                                            const cellBorder = '1px solid #cccccc';
                                            const isLastRow = rowIdx === helperMaxRows - 1;
                                            
                                            // رنگ پس‌زمینه برای هر دسته (همانند راننده اصلی)
                                            const helperInitialInfoBg = '#f0f9ff';
                                            const helperDirectCostBg = '#fef3c7';
                                            const helperSummaryBg = '#f3e8ff';
                                            
                                            return (
                                                <tr 
                                                    key={rowIdx} 
                                                    style={{ 
                                                        direction: 'rtl', 
                                                        unicodeBidi: 'isolate',
                                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                                        transition: 'background-color 0.2s ease',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (hasContent) {
                                                            const cells = e.currentTarget.querySelectorAll('td');
                                                            cells.forEach((cell: any) => {
                                                                cell.style.backgroundColor = '#e6f2ff';
                                                                cell.style.transition = 'background 0.3s';
                                                            });
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (hasContent) {
                                                            const cells = e.currentTarget.querySelectorAll('td');
                                                            cells.forEach((cell: any, idx: number) => {
                                                                const isEven = rowIdx % 2 === 0;
                                                                cell.style.backgroundColor = isEven ? '#f8fbff' : '#ffffff';
                                                                cell.style.transition = 'background 0.3s';
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {/* اطلاعات اولیه - فیلد 1 */}
                                                    {/* اطلاعات اولیه - فیلد 1 Label */}
                                                    {/* اطلاعات اولیه - فیلد 1 Label */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: cellBorder,
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '10%',
                                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                                    }}>
                                                        {helperInitialRow1 ? helperInitialRow1.label : '-'}
                                                    </td>
                                                    {/* اطلاعات اولیه - فیلد 1 Value */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: 'none',
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '10%',
                                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                                    }}>
                                                        {helperInitialValues1 || '-'}
                                                    </td>
                                                    {/* اطلاعات اولیه - فیلد 2 Label */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: cellBorder,
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '10%',
                                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                                    }}>
                                                        {helperInitialRow2 ? helperInitialRow2.label : '-'}
                                                    </td>
                                                    {/* اطلاعات اولیه - فیلد 2 Value */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: 'none',
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '10%',
                                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? helperInitialInfoBg : '#ffffff') : 'transparent',
                                                    }}>
                                                        {helperInitialValues2 || '-'}
                                                    </td>
                                                    
                                                    {/* ستون جداکننده بین اطلاعات اولیه و هزینه های مستقیم */}
                                                    <td style={{ 
                                                        borderTop: 'none',
                                                        borderBottom: 'none',
                                                        borderLeft: 'none',
                                                        borderRight: 'none',
                                                        padding: '0',
                                                        width: '8px',
                                                        backgroundColor: '#e5e7eb',
                                                        minWidth: '8px',
                                                        maxWidth: '8px',
                                                    }}>
                                                    </td>
                                                    
                                                    {/* هزینه های مستقیم - Label */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: cellBorder,
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '15%',
                                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? helperDirectCostBg : '#ffffff') : 'transparent',
                                                    }}>
                                                        {helperDirectRow ? helperDirectRow.label : '-'}
                                                    </td>
                                                    {/* هزینه های مستقیم - Value */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: 'none',
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '15%',
                                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? helperDirectCostBg : '#ffffff') : 'transparent',
                                                    }}>
                                                        {helperDirectValues || '-'}
                                                    </td>
                                                    
                                                    {/* ستون جداکننده بین هزینه های مستقیم و جمع بندی */}
                                                    <td style={{ 
                                                        borderTop: 'none',
                                                        borderBottom: 'none',
                                                        borderLeft: 'none',
                                                        borderRight: 'none',
                                                        padding: '0',
                                                        width: '8px',
                                                        backgroundColor: '#e5e7eb',
                                                        minWidth: '8px',
                                                        maxWidth: '8px',
                                                    }}>
                                                    </td>
                                                    
                                                    {/* برای راننده کمکی، دسته دپو را حذف می‌کنیم */}
                                                    
                                                    {/* جمع بندی - Label */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: cellBorder,
                                                        borderLeft: cellBorder,
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '15%',
                                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? helperSummaryBg : '#ffffff') : 'transparent',
                                                    }}>
                                                        {helperSummaryRow ? helperSummaryRow.label : '-'}
                                                    </td>
                                                    {/* جمع بندی - Value */}
                                                    <td style={{ 
                                                        borderTop: cellBorder,
                                                        borderBottom: isLastRow ? cellBorder : cellBorder,
                                                        borderLeft: 'none',
                                                        borderRight: cellBorder,
                                                        padding: '12px', 
                                                        textAlign: 'center',
                                                        direction: 'rtl',
                                                        unicodeBidi: 'isolate',
                                                        verticalAlign: 'middle',
                                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                        fontSize: '14px',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'normal',
                                                        wordWrap: 'break-word',
                                                        width: '15%',
                                                        fontWeight: 'bold',
                                                        color: '#1e3a8a',
                                                        backgroundColor: hasContent ? (rowBgColor === '#f8fbff' ? helperSummaryBg : '#ffffff') : 'transparent',
                                                    }}>
                                                        {helperSummaryRow ? helperTotalValue : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* بخش خلاصه راننده کمکی */}
                            {helperBlock.summary && (
                                <div style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                    marginTop: '15px',
                                }}>
                                    <table style={{
                                        width: '100%',
                                        maxWidth: '100%',
                                        borderCollapse: 'collapse',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        fontSize: '14px',
                                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                        boxSizing: 'border-box',
                                    }}>
                                        <tbody>
                                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                <td style={{
                                                    border: '2px solid #1e3a8a',
                                                    padding: '12px 20px',
                                                    backgroundColor: '#bfdbfe',
                                                    textAlign: 'center',
                                                    direction: 'rtl',
                                                    unicodeBidi: 'isolate',
                                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                                    fontWeight: 'bold',
                                                    fontSize: '14px',
                                                    color: '#1e3a8a',
                                                    lineHeight: '1.8',
                                                }}>
                                                    مبلغ قابل پرداخت: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{helperBlock.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
                
                {/* خلاصه تور - زیر جدول راننده کمکی */}
                <div 
                    data-tour-summary="true"
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        borderRadius: '12px',
                        overflow: 'visible',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        marginTop: '50px',
                        marginBottom: '50px',
                        paddingBottom: '30px',
                        textAlign: 'center',
                        position: 'relative' as const,
                        zIndex: 1,
                        display: 'block',
                        visibility: 'visible',
                    }}>
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                        textAlign: 'center',
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                        color: '#1e3a8a',
                        padding: '12px',
                        backgroundColor: '#f0f9ff',
                        borderBottom: '2px solid #1e3a8a',
                    }}>
                        خلاصه تور
                    </h3>
                    <table style={{
                        width: '100%',
                        maxWidth: '100%',
                        borderCollapse: 'collapse',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontSize: '14px',
                        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                        boxSizing: 'border-box',
                        margin: '0 auto',
                    }}>
                        <tbody>
                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                <td style={{
                                    border: '1px solid #cccccc',
                                    padding: '12px 20px',
                                    backgroundColor: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    lineHeight: '1.8',
                                }}>
                                    تعداد تور راننده اصلی: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{invoiceData.tourData?.length || 0}</span>
                                </td>
                            </tr>
                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                <td style={{
                                    border: '1px solid #cccccc',
                                    borderTop: 'none',
                                    padding: '12px 20px',
                                    backgroundColor: '#f8fbff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                    lineHeight: '1.8',
                                }}>
                                    هزینه کل تورهای راننده اصلی: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{mainBlock?.summary?.totalTripCost?.toLocaleString('fa-IR') || '0'}</span> ریال
                                </td>
                            </tr>
                            {helperBlocks.map((helperBlock, helperIdx) => {
                                const helperEmployeeId = helperBlock.title.match(/کدپرسنلی[:\s]*(\d+)/)?.[1] || '';
                                const helperName = helperBlock.title.match(/-\s*([^-]+)$/)?.[1]?.trim() || helperBlock.title.match(/:\s*\d+\s*-\s*(.+)$/)?.[1]?.trim() || '';
                                return (
                                    <tr key={helperIdx} style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                        <td style={{
                                            border: '1px solid #cccccc',
                                            borderTop: 'none',
                                            padding: '12px 20px',
                                            backgroundColor: helperIdx % 2 === 0 ? '#ffffff' : '#f8fbff',
                                            textAlign: 'center',
                                            direction: 'rtl',
                                            unicodeBidi: 'isolate',
                                            fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
                                            lineHeight: '1.8',
                                        }}>
                                            راننده کمکی {helperIdx + 1}: کد پرسنلی {helperEmployeeId} - {helperName} - هزینه: <span style={{ marginLeft: '15px', display: 'inline-block' }}></span><span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{helperBlock?.summary?.totalTripCost?.toLocaleString('fa-IR') || '0'}</span> ریال
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// تابع برای لود کردن فونت Vazirmatn (جایگزین B Homa)
const loadBHomaFont = async (): Promise<void> => {
    try {
        // بررسی اینکه آیا فونت Vazirmatn قبلاً لود شده
        if (document.fonts && document.fonts.check) {
            const fontLoaded = document.fonts.check("16px 'Vazirmatn'");
            if (fontLoaded) {
                console.log('✅ [loadBHomaFont] فونت Vazirmatn قبلاً لود شده');
                await new Promise(resolve => setTimeout(resolve, 200));
                return;
            }
        }
        
        // استفاده از link tag برای لود کردن Vazirmatn از Google Fonts
        console.log('🔄 [loadBHomaFont] در حال لود کردن فونت Vazirmatn...');
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        
        // انتظار برای لود شدن فونت
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ [loadBHomaFont] فونت Vazirmatn با موفقیت لود شد');
    } catch (error) {
        console.error('❌ [loadBHomaFont] خطا در لود کردن فونت:', error);
        // Fallback: استفاده از link tag در صورت خطا
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};

// تابع اصلی برای export تصویر با استفاده از DOM
// نسخه بهبود یافته: استفاده از iframe برای isolation کامل
export const exportInvoiceToImage = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🖼️ [exportInvoiceToImage] شروع تولید عکس با dom-to-image');
        
        // روش 1: استفاده مستقیم از dom-to-image روی element اصلی
        try {
            // Clone کردن element برای اطمینان از عدم تغییر DOM اصلی
            const clonedElement = invoiceElement.cloneNode(true) as HTMLElement;
            
            // ایجاد container موقت
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                position: absolute;
                left: -9999px;
                top: 0;
                width: auto;
                min-width: 1600px;
                max-width: none;
                background: white;
                direction: rtl;
                padding: 20px;
            `;
            
            // دانلود فونت و اضافه کردن استایل‌های فونت
            const fontFaceCSS = await getBHomaFontFaceCSS();
            const fontStyle = document.createElement('style');
            fontStyle.textContent = `
                ${fontFaceCSS}
                * {
                    font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                }
            `;
            document.head.appendChild(fontStyle);
            
            tempContainer.appendChild(clonedElement);
            document.body.appendChild(tempContainer);
            
            // انتظار برای render و لود شدن فونت
            await document.fonts.ready;
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // بررسی فونت
            const fontCheck = document.fonts.check("16px 'Vazirmatn'");
            console.log(fontCheck ? '✅ [exportInvoiceToImage] فونت Vazirmatn تایید شد' : '⚠️ [exportInvoiceToImage] فونت Vazirmatn تایید نشد');
            
            // محاسبه اندازه
            const width = Math.max(tempContainer.scrollWidth, 1600);
            const height = tempContainer.scrollHeight;
            
            console.log(`📐 [exportInvoiceToImage] Dimensions: ${width}x${height}`);
            
            // استفاده از dom-to-image
            const imgData = await domtoimage.toPng(tempContainer, {
                quality: 1.0,
                width: width,
                height: height,
                style: {
                    transform: 'scale(1)',
                    transformOrigin: 'top left',
                },
                filter: (node: Node) => {
                    if (node instanceof HTMLElement) {
                        const style = window.getComputedStyle(node);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    }
                    return true;
                },
                bgcolor: '#ffffff',
            });
            
            // پاک کردن
            document.body.removeChild(tempContainer);
            document.head.removeChild(fontStyle);
            
            // دانلود
            const link = document.createElement('a');
            link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
            link.href = imgData;
            link.click();
            
            console.log('✅ [exportInvoiceToImage] عکس با موفقیت تولید شد (dom-to-image)');
            return;
        } catch (domtoimageError: any) {
            console.warn('⚠️ [exportInvoiceToImage] dom-to-image مستقیم خطا داد، استفاده از iframe:', domtoimageError);
        }
        
        // روش 2: استفاده از iframe (fallback)
        console.log('🖼️ [exportInvoiceToImage] شروع تولید عکس با روش iframe (fallback)');
        
        // روش جدید: استفاده از iframe برای isolation کامل و رندر بهتر
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            width: 3000px;
            height: 50000px;
            border: none;
            overflow: hidden;
        `;
        document.body.appendChild(iframe);
        
        // انتظار برای load شدن iframe
        await new Promise<void>((resolve, reject) => {
            iframe.onload = () => resolve();
            iframe.onerror = () => reject(new Error('Failed to load iframe'));
            iframe.src = 'about:blank';
        });
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            throw new Error('Cannot access iframe document');
        }
        
        // دانلود فونت قبل از نوشتن به iframe
        const fontFaceCSS = await getBHomaFontFaceCSS();
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        
        // نوشتن HTML کامل به iframe با فونت و استایل‌های لازم
        iframeDoc.open();
        iframeDoc.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>صورتحساب</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block" rel="stylesheet">
                <style>
                    ${fontFaceCSS}
                    * {
                        font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                        font-size: 14px !important;
                        box-sizing: border-box;
                        margin: 0;
                        padding: 0;
                    }
                    body {
                        margin: 0;
                        padding: 20px;
                        background: white;
                        direction: rtl;
                        font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                        font-size: 14px !important;
                        width: 100%;
                        overflow: visible !important;
                    }
                    [data-invoice-ref="true"] {
                        width: auto !important;
                        min-width: 1600px !important;
                        max-width: none !important;
                        margin: 0 auto !important;
                        overflow: visible !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                    }
                    [data-tour-summary="true"] {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        overflow: visible !important;
                        position: relative !important;
                        z-index: 1 !important;
                        margin-top: 50px !important;
                        margin-bottom: 50px !important;
                        padding-bottom: 30px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    .invoice-table-wrapper {
                        overflow: visible !important;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
                        border-radius: 12px !important;
                        margin-bottom: 30px !important;
                    }
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
                        border-radius: 12px !important;
                        overflow: hidden !important;
                    }
                    th {
                        background-color: #1e3a8a !important;
                        color: #ffffff !important;
                        font-weight: bold !important;
                        padding: 12px 8px !important;
                    }
                    tr:nth-child(even) {
                        background: #f8fbff !important;
                    }
                    tr:hover {
                        background: #e6f0ff !important;
                        transition: background-color 0.3s !important;
                    }
                    td {
                        border: 1px solid #cccccc !important;
                        padding: 8px !important;
                    }
                    /* جداکننده‌های border برای دسته‌بندی‌ها */
                    td[style*="border-right: 3px solid"] {
                        border-right: 3px solid #003366 !important;
                    }
                </style>
            </head>
            <body>
                ${clonedContent.outerHTML}
            </body>
            </html>
        `);
        iframeDoc.close();
        
        // لود کردن فونت Vazirmatn در iframe
        console.log('🔄 [exportInvoiceToImage] در حال لود کردن فونت Vazirmatn در iframe...');
        
        // اضافه کردن @font-face به iframe با استفاده از Base64
        // (fontFaceCSS قبلاً در iframeDoc.write اعمال شده)
        // اما برای اطمینان بیشتر، دوباره اضافه می‌کنیم
        const fontStyle = iframeDoc.createElement('style');
        fontStyle.textContent = fontFaceCSS;
        iframeDoc.head.appendChild(fontStyle);
        
        // اضافه کردن link tag برای فونت Vazirmatn
        const fontLink = iframeDoc.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block';
        iframeDoc.head.appendChild(fontLink);
        
        // انتظار برای render کامل و لود شدن فونت
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // اطمینان از لود شدن فونت
        await iframeDoc.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // بررسی نهایی
        const fontCheck = iframeDoc.fonts.check("16px 'Vazirmatn'");
        console.log(fontCheck ? '✅ [exportInvoiceToImage] فونت Vazirmatn تایید شد' : '⚠️ [exportInvoiceToImage] فونت Vazirmatn تایید نشد');
        
        // محاسبه اندازه واقعی - با در نظر گرفتن خلاصه تور
        const body = iframeDoc.body;
        const summaryElement = body.querySelector('[data-tour-summary="true"]') as HTMLElement;
        const invoiceRef = body.querySelector('[data-invoice-ref="true"]') as HTMLElement;
        
        // محاسبه عرض واقعی از invoice container
        let actualWidth = 1600; // حداقل عرض
        if (invoiceRef) {
            // استفاده از scrollWidth برای محاسبه عرض واقعی محتوا
            actualWidth = Math.max(
                invoiceRef.scrollWidth,
                invoiceRef.offsetWidth,
                body.scrollWidth,
                body.offsetWidth,
                1600
            );
            // اضافه کردن padding و margin
            const computedStyle = iframeDoc.defaultView?.getComputedStyle(invoiceRef);
            if (computedStyle) {
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
                const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
                const marginRight = parseFloat(computedStyle.marginRight) || 0;
                actualWidth += paddingLeft + paddingRight + marginLeft + marginRight;
            }
        } else {
            actualWidth = Math.max(body.scrollWidth, body.offsetWidth, 1600);
        }
        
        let actualHeight = body.scrollHeight;
        
        // اگر خلاصه تور وجود دارد، اطمینان از اینکه در محاسبه ارتفاع قرار دارد
        if (summaryElement) {
            const summaryBottom = summaryElement.offsetTop + summaryElement.offsetHeight;
            actualHeight = Math.max(actualHeight, summaryBottom + 100); // اضافه کردن فضای خالی پایین
        }
        
        // اضافه کردن padding به ارتفاع
        const bodyComputedStyle = iframeDoc.defaultView?.getComputedStyle(body);
        if (bodyComputedStyle) {
            const paddingTop = parseFloat(bodyComputedStyle.paddingTop) || 0;
            const paddingBottom = parseFloat(bodyComputedStyle.paddingBottom) || 0;
            actualHeight += paddingTop + paddingBottom;
        }
        
        console.log(`📐 [exportInvoiceToImage] Dimensions: ${actualWidth}x${actualHeight}`);
        console.log(`📐 [exportInvoiceToImage] Summary element:`, summaryElement ? 'Found' : 'Not found');
        
        // استفاده از dom-to-image به جای html2canvas
        console.log('🔄 [exportInvoiceToImage] استفاده از dom-to-image...');
        
        let imgData: string;
        
        try {
            // استفاده از dom-to-image - باید از window iframe استفاده کنیم
            const iframeWindow = iframe.contentWindow;
            if (!iframeWindow) {
                throw new Error('Cannot access iframe window');
            }
            
            // استفاده از dom-to-image با window iframe
            // dom-to-image نیاز به window دارد، پس باید از iframe.contentWindow استفاده کنیم
            // اما dom-to-image نمی‌تواند مستقیماً با iframe کار کند
            // پس باید محتوا را به صفحه اصلی clone کنیم
            
            // Clone کردن body iframe به یک div موقت در صفحه اصلی
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                position: absolute;
                left: -9999px;
                top: 0;
                width: auto;
                min-width: ${actualWidth}px;
                height: ${actualHeight}px;
                background: white;
                direction: rtl;
                overflow: visible;
            `;
            
            // Clone کردن محتوای body iframe
            const bodyClone = body.cloneNode(true) as HTMLElement;
            
            // دانلود فونت قبل از clone
            const fontFaceCSSForClone = await getBHomaFontFaceCSS();
            
            // اضافه کردن استایل‌های لازم به clone با استفاده از Base64
            const style = document.createElement('style');
            style.textContent = `
                ${fontFaceCSSForClone}
                * {
                    font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                }
            `;
            document.head.appendChild(style);
            
            tempContainer.appendChild(bodyClone);
            document.body.appendChild(tempContainer);
            
            // انتظار برای render
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // استفاده از dom-to-image
            imgData = await domtoimage.toPng(tempContainer, {
                quality: 1.0,
                width: actualWidth,
                height: actualHeight,
                style: {
                    transform: 'scale(1)',
                    transformOrigin: 'top left',
                },
                filter: (node: Node) => {
                    // فیلتر کردن المان‌های نامرئی
                    if (node instanceof HTMLElement) {
                        const style = window.getComputedStyle(node);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    }
                    return true;
                },
                bgcolor: '#ffffff',
                imagePlaceholder: undefined,
            });
            
            // پاک کردن temp container
            document.body.removeChild(tempContainer);
            document.head.removeChild(style);
            
            console.log('✅ [exportInvoiceToImage] dom-to-image موفق بود');
        } catch (domtoimageError: any) {
            console.warn('⚠️ [exportInvoiceToImage] dom-to-image خطا داد، استفاده از html2canvas:', domtoimageError);
            
            // Fallback: استفاده از html2canvas
            const canvas = await html2canvas(body, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: actualWidth,
                height: actualHeight,
                windowWidth: actualWidth,
                windowHeight: actualHeight,
                scrollX: 0,
                scrollY: 0,
                onclone: (clonedDoc) => {
                    // اطمینان از نمایش خلاصه تور در cloned document
                    const clonedSummary = clonedDoc.querySelector('[data-tour-summary="true"]') as HTMLElement;
                    if (clonedSummary) {
                        clonedSummary.style.display = 'block';
                        clonedSummary.style.visibility = 'visible';
                        clonedSummary.style.opacity = '1';
                        clonedSummary.style.overflow = 'visible';
                    }
                    
                    // اضافه کردن @font-face برای B Homa در cloned document
                    // استفاده از sync version چون در onclone نمی‌توانیم await کنیم
                    // اما Base64 باید قبلاً در cache باشد
                    const clonedFontStyle = clonedDoc.createElement('style');
                    clonedFontStyle.textContent = `
                        ${getBHomaFontFaceCSSSync()}
                        * {
                            font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                        }
                    `;
                    clonedDoc.head.appendChild(clonedFontStyle);
                    
                    // اعمال فونت Vazirmatn به تمام المان‌ها
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach((el) => {
                        if (el instanceof HTMLElement) {
                            el.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                        }
                    });
                }
            });
            
            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                throw new Error('Canvas is empty');
            }
            
            imgData = canvas.toDataURL('image/png', 1.0);
        }
        
        // پاک کردن iframe
        document.body.removeChild(iframe);
        
        // دانلود
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
        
        console.log('✅ [exportInvoiceToImage] عکس با موفقیت تولید شد');
        
    } catch (err: any) {
        console.error('❌ [exportInvoiceToImage] Error with iframe method:', err);
        // Fallback: استفاده از روش قبلی
        console.log('🔄 [exportInvoiceToImage] Trying fallback method...');
        
        try {
            // ایجاد temp div برای render کردن محتوا
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '0';
            tempDiv.style.opacity = '1';
            tempDiv.style.visibility = 'visible';
            tempDiv.style.backgroundColor = '#ffffff';
            document.body.appendChild(tempDiv);
            // Clone کردن محتوای invoiceElement به temp div
            const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
            tempDiv.appendChild(clonedContent);
            
            // تنظیم استایل‌های temp div
            tempDiv.style.width = 'auto';
            tempDiv.style.minWidth = '1400px';
            tempDiv.style.maxWidth = 'none';
            tempDiv.style.overflow = 'visible';
            
            const invoiceElement_internal = tempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
            if (invoiceElement_internal) {
                invoiceElement_internal.style.width = 'auto';
                invoiceElement_internal.style.minWidth = '1400px';
                invoiceElement_internal.style.maxWidth = 'none';
                invoiceElement_internal.style.margin = '0 auto';
                invoiceElement_internal.style.overflow = 'visible';
                invoiceElement_internal.style.visibility = 'visible';
                invoiceElement_internal.style.opacity = '1';
            }
            
            // انتظار برای render کامل
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // محاسبه عرض و ارتفاع واقعی محتوا - با padding اضافی برای اطمینان از نمایش کامل
            const actualWidth = Math.max(tempDiv.scrollWidth, tempDiv.offsetWidth, 1400);
            // محاسبه ارتفاع با در نظر گرفتن تمام محتوا شامل خلاصه تور
            const baseHeight = Math.max(tempDiv.scrollHeight, tempDiv.offsetHeight);
            // پیدا کردن خلاصه تور و محاسبه ارتفاع کامل
            const summaryElement = tempDiv.querySelector('[data-tour-summary="true"]') as HTMLElement;
            let actualHeight = baseHeight;
            if (summaryElement) {
                const summaryBottom = summaryElement.offsetTop + summaryElement.offsetHeight;
                actualHeight = Math.max(baseHeight, summaryBottom + 100); // اضافه کردن 100px padding اضافی
            } else {
                // اگر خلاصه تور پیدا نشد، از scrollHeight استفاده کن
                actualHeight = baseHeight + 300;
            }
            
            // استفاده از html2canvas
            const canvas = await html2canvas(tempDiv, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                removeContainer: false,
                width: actualWidth,
                height: actualHeight,
                windowWidth: actualWidth,
                windowHeight: actualHeight,
                    onclone: async (clonedDoc) => {
                        // اضافه کردن @font-face به head برای اطمینان از لود شدن فونت
                        const style = clonedDoc.createElement('style');
                        style.textContent = `
                            @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
                            * {
                                font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                                font-size: 14px !important;
                                -webkit-font-smoothing: antialiased;
                                -moz-osx-font-smoothing: grayscale;
                            }
                            body, html {
                                font-family: 'Vazirmatn', sans-serif !important;
                                font-size: 14px !important;
                            }
                            table, td, th, tr, div, span, p, h1, h2, h3, h4, h5, h6 {
                                font-family: 'Vazirmatn', sans-serif !important;
                                font-size: 14px !important;
                            }
                            tr:nth-child(even) {
                                background: #f8fbff !important;
                            }
                            tr:hover {
                                background: #e6f0ff !important;
                                transition: background-color 0.3s;
                            }
                        `;
                        clonedDoc.head.appendChild(style);
                        
                        // اضافه کردن link tag برای فونت Vazirmatn از Google Fonts
                        const link = clonedDoc.createElement('link');
                        link.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap';
                        link.rel = 'stylesheet';
                        clonedDoc.head.appendChild(link);
                        
                        // انتظار برای لود شدن فونت
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        const clonedTempDiv = clonedDoc.querySelector('body > div:last-child') as HTMLElement;
                    if (clonedTempDiv) {
                        clonedTempDiv.style.visibility = 'visible';
                        clonedTempDiv.style.opacity = '1';
                        clonedTempDiv.style.width = 'auto';
                        clonedTempDiv.style.minWidth = '1400px';
                        clonedTempDiv.style.maxWidth = 'none';
                        clonedTempDiv.style.overflow = 'visible';
                        
                        const clonedInvoiceElement = clonedTempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
                        if (clonedInvoiceElement) {
                            clonedInvoiceElement.style.width = 'auto';
                            clonedInvoiceElement.style.minWidth = '1400px';
                            clonedInvoiceElement.style.maxWidth = 'none';
                            clonedInvoiceElement.style.overflow = 'visible';
                        }
                        
                        // اعمال فونت Vazirmatn به تمام المان‌ها با !important
                        const allElements = clonedTempDiv.querySelectorAll('*');
                        allElements.forEach((el) => {
                            const htmlEl = el as HTMLElement;
                            if (htmlEl.style) {
                                // استفاده از setProperty برای اعمال !important
                                htmlEl.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                                htmlEl.style.setProperty('font-size', '14px', 'important');
                                htmlEl.style.setProperty('-webkit-font-smoothing', 'antialiased', 'important');
                                htmlEl.style.setProperty('-moz-osx-font-smoothing', 'grayscale', 'important');
                            }
                        });
                        
                        // اعمال فونت به body و html
                        if (clonedDoc.body) {
                            clonedDoc.body.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                            clonedDoc.body.style.setProperty('font-size', '14px', 'important');
                        }
                        if (clonedDoc.documentElement) {
                            clonedDoc.documentElement.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                            clonedDoc.documentElement.style.setProperty('font-size', '14px', 'important');
                        }
                        
                        // اعمال استایل‌های جدول
                        const clonedTables = clonedTempDiv.querySelectorAll('table');
                        clonedTables.forEach((table) => {
                            const tableEl = table as HTMLElement;
                            tableEl.style.width = '100%';
                            tableEl.style.minWidth = '100%';
                            tableEl.style.tableLayout = 'auto';
                            tableEl.style.borderCollapse = 'collapse';
                            tableEl.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                            tableEl.style.setProperty('font-size', '14px', 'important');
                            
                            // اعمال فونت به تمام سلول‌های جدول
                            const cells = tableEl.querySelectorAll('td, th');
                            cells.forEach((cell) => {
                                const cellEl = cell as HTMLElement;
                                cellEl.style.setProperty('font-family', "'Vazirmatn', 'Tahoma', sans-serif", 'important');
                                cellEl.style.setProperty('font-size', '14px', 'important');
                            });
                        });
                        
                        // اطمینان از نمایش خلاصه تور
                        const clonedSummaryElement = clonedTempDiv.querySelector('[data-tour-summary="true"]') as HTMLElement;
                        if (clonedSummaryElement) {
                            clonedSummaryElement.style.visibility = 'visible';
                            clonedSummaryElement.style.display = 'block';
                            clonedSummaryElement.style.opacity = '1';
                            clonedSummaryElement.style.overflow = 'visible';
                            clonedSummaryElement.style.position = 'relative';
                            clonedSummaryElement.style.zIndex = '1';
                        }
                        
                        // اطمینان از overflow: visible برای تمام wrapperها
                        const clonedWrappers = clonedTempDiv.querySelectorAll('.invoice-table-wrapper');
                        clonedWrappers.forEach((wrapper) => {
                            const wrapperEl = wrapper as HTMLElement;
                            wrapperEl.style.overflow = 'visible';
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
            link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
            link.href = imgData;
            link.click();
            
            console.log('✅ [exportInvoiceToImage] عکس با موفقیت تولید شد');
            
            // پاک کردن temp div
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
        } catch (fallbackErr: any) {
            console.error('❌ [exportInvoiceToImage] Error in fallback method:', fallbackErr);
            // پاک کردن temp div در صورت وجود
            const tempDivCheck = document.querySelector('div[style*="-9999px"]') as HTMLElement;
            if (tempDivCheck && document.body.contains(tempDivCheck)) {
                document.body.removeChild(tempDivCheck);
            }
            // نمایش خطا به کاربر
            alert(`خطا در تولید عکس: ${fallbackErr.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    }
};
