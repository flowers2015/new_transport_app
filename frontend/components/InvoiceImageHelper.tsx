import React from 'react';
import html2canvas from 'html2canvas';
import ReactDOMServer from 'react-dom/server';

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
        const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
        const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
        const approvedMissionDays = parseFloat(calc.approved_mission_days || calc.approvedMissionDays || 0);
        const excessMissionDays = parseFloat(calc.excess_mission_days || calc.excessMissionDays || 0);
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
        
        return {
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
        return { billOfLadingNumber, destinations, billOfLadingDate, calculationDate, vehiclePlate, vehicleType };
    });
    
    return [
        { label: 'شماره بارنامه', getValue: (tour: any) => tour?.billOfLadingNumber || '-', getTotal: () => '-' },
        { label: 'تاریخ صدور بارنامه', getValue: (tour: any) => tour?.billOfLadingDate || '-', getTotal: () => '-' },
        { label: 'مقاصد', getValue: (tour: any) => tour?.destinations || '-', getTotal: () => '-' },
        { label: 'تاریخ محاسبه', getValue: (tour: any) => tour?.calculationDate || '-', getTotal: () => '-' },
        { label: 'پلاک خودرو', getValue: (tour: any) => tour?.vehiclePlate || '-', getTotal: () => '-' },
        { label: 'نوع خودرو', getValue: (tour: any) => tour?.vehicleType || '-', getTotal: () => '-' },
    ];
};

export const renderInvoiceLayoutHorizontal = (
    invoiceData: InvoiceData,
    selectedInvoiceRecord: PaymentRecord,
    invoiceAnnouncements: Map<string, any>,
    containerWidth: number = 1200,
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
        { label: 'پیمایش مصوب', getValue: (tour: any) => (tour?.approvedKm || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.approvedKm || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'پیمایش مازاد', getValue: (tour: any) => (tour?.excessKm || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.excessKm || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'ماموریت مصوب', getValue: (tour: any) => (tour?.approvedMissionDays || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.approvedMissionDays || 0), 0).toLocaleString('fa-IR') || '0' },
        { label: 'ماموریت مازاد', getValue: (tour: any) => (tour?.excessMissionDays || 0).toLocaleString('fa-IR'), getTotal: () => invoiceData.tourData?.reduce((sum, t) => sum + (t.excessMissionDays || 0), 0).toLocaleString('fa-IR') || '0' },
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
        { label: 'پیمایش کل (دپو+مصوب+مازاد)', getValue: () => totalKm.toLocaleString('fa-IR'), getTotal: () => totalKm.toLocaleString('fa-IR') },
        { label: 'کل اجرت (اجرت ثابت+اجرت دپو)', getValue: () => (totalFixedAllowance + totalDepotAllowance).toLocaleString('fa-IR'), getTotal: () => (totalFixedAllowance + totalDepotAllowance).toLocaleString('fa-IR') },
        { label: 'هزینه های بغیر اجرت (شامل جمع تمامی فیلدهای هزینه)', getValue: () => totalNonAllowanceCosts.toLocaleString('fa-IR'), getTotal: () => totalNonAllowanceCosts.toLocaleString('fa-IR') },
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
                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                    width: `${containerWidth}px`,
                    minWidth: `${containerWidth}px`,
                    maxWidth: `${containerWidth}px`,
                    margin: '0 auto',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    padding: '20px',
                    boxSizing: 'border-box',
                    position: 'relative' as const,
                    textAlign: 'center',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                }}>
                {/* اطلاعات راننده */}
                <div style={{
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #1e40af',
                    textAlign: 'right',
                    direction: 'rtl',
                    unicodeBidi: 'isolate',
                }}>
                    <h3 style={{
                        fontSize: '22px',
                        fontWeight: 'bold',
                        marginBottom: '8px',
                        textAlign: 'center',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                        color: '#1e3a8a',
                    }}>
                        صورتحساب هزینه
                    </h3>
                    <div style={{
                        fontSize: '14px',
                        lineHeight: '1.8',
                        direction: 'rtl',
                        unicodeBidi: 'isolate',
                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                    }}>
                        <p style={{ marginBottom: '4px' }}>کد پرسنلی: {selectedInvoiceRecord.employeeId}</p>
                        <p style={{ marginBottom: '4px' }}>نام: {selectedInvoiceRecord.driverName}</p>
                        <p>شماره حساب: {selectedInvoiceRecord.accountNumber || '-'}</p>
                    </div>
                </div>
                
                {/* جدول جدید: برای هر دسته، label در یک ستون و value در ستون دیگر */}
                <div className="invoice-table-wrapper" style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
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
                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                        boxSizing: 'border-box',
                        borderRadius: '8px',
                        overflow: 'hidden',
                    }}>
                        <thead>
                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                <th colSpan={4} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>اطلاعات اولیه</th>
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: 'none',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>هزینه های مستقیم</th>
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: 'none',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
                                }}>هزینه دپو</th>
                                <th colSpan={2} style={{ 
                                    border: '2px solid #1e3a8a', 
                                    borderRight: 'none',
                                    padding: '12px 8px', 
                                    backgroundColor: '#1e3a8a', 
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    verticalAlign: 'middle',
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1.4',
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
                            const rowBgColor = isEven ? '#f5f5f5' : '#ffffff';
                            const hasContent = initialRow1 || initialRow2 || directRow || depotRow || summaryRow;
                            
                            // بررسی اینکه آیا مقدار عددی است یا نه
                            const isNumeric = (str: string) => {
                                if (!str || str === '-') return false;
                                return /^[\d,\.\s]+$/.test(str.replace(/[^\d,\.]/g, ''));
                            };
                            
                            // تعیین border برای دسته‌بندی‌ها
                            const categoryBorderRight = '2px solid #1e3a8a'; // border سمت راست برای جدا کردن دسته‌بندی‌ها (RTL)
                            const cellBorder = '1px solid #e5e7eb'; // حاشیه‌های کم رنگ داخل جدول
                            const isLastRow = rowIdx === maxRows - 1;
                            
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
                                            e.currentTarget.style.backgroundColor = '#e0f2fe';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (hasContent) {
                                            e.currentTarget.style.backgroundColor = rowBgColor;
                                        }
                                    }}
                                >
                                    {/* اطلاعات اولیه - فیلد 1 Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
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
                                        textAlign: isNumeric(initialValues1) ? 'center' : 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {initialValues1 || '-'}
                                    </td>
                                    {/* اطلاعات اولیه - فیلد 2 Label */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: cellBorder,
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
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
                                        textAlign: isNumeric(initialValues2) ? 'center' : 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '10%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {initialValues2 || '-'}
                                    </td>
                                    
                                    {/* هزینه های مستقیم - Label - border جداکننده در اینجا */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: categoryBorderRight, // border جداکننده بین اطلاعات اولیه و هزینه های مستقیم
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
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
                                        textAlign: isNumeric(directValues) ? 'center' : 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {directValues || '-'}
                                    </td>
                                    
                                    {/* هزینه دپو - Label - border جداکننده در اینجا */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: categoryBorderRight, // border جداکننده بین هزینه های مستقیم و هزینه دپو
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
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
                                        textAlign: isNumeric(depotValues) ? 'center' : 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {depotValues || '-'}
                                    </td>
                                    
                                    {/* جمع بندی - Label - border جداکننده در اینجا */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: cellBorder,
                                        borderLeft: categoryBorderRight, // border جداکننده بین هزینه دپو و جمع بندی
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
                                    }}>
                                        {summaryRow ? summaryRow.label : '-'}
                                    </td>
                                    {/* جمع بندی - Value */}
                                    <td style={{ 
                                        borderTop: cellBorder,
                                        borderBottom: isLastRow ? cellBorder : cellBorder,
                                        borderLeft: 'none',
                                        borderRight: cellBorder,
                                        padding: '8px', 
                                        textAlign: 'center',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        width: '15%',
                                        fontWeight: 'bold',
                                        color: '#1e3a8a',
                                        backgroundColor: hasContent ? rowBgColor : 'transparent',
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
                            fontFamily: "'B Homa', 'Tahoma', sans-serif",
                            boxSizing: 'border-box',
                        }}>
                            <tbody>
                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                    <td style={{
                                        border: '2px solid #1e3a8a',
                                        padding: '8px 15px',
                                        backgroundColor: '#dbeafe',
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        lineHeight: '1.8',
                                    }}>
                                        جمع کل هزینه سفر: <span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{mainBlock.summary.totalTripCost.toLocaleString('fa-IR')}</span> ریال
                                    </td>
                                </tr>
                                {mainBlock.summary.deductionsAmount && mainBlock.summary.deductionsAmount > 0 && (
                                    <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                        <td style={{
                                            border: '2px solid #1e3a8a',
                                            borderTop: 'none',
                                            padding: '8px 15px',
                                            backgroundColor: '#dbeafe',
                                            textAlign: 'right',
                                            direction: 'rtl',
                                            unicodeBidi: 'isolate',
                                            fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                            lineHeight: '1.8',
                                        }}>
                                            {mainBlock.summary.deductionsTitle || 'کسور'}: <span style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 'bold' }}>{mainBlock.summary.deductionsAmount.toLocaleString('fa-IR')}</span> ریال
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                    <td style={{
                                        border: '2px solid #1e3a8a',
                                        borderTop: 'none',
                                        padding: '8px 15px',
                                        backgroundColor: '#bfdbfe',
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        color: '#1e3a8a',
                                        lineHeight: '1.8',
                                    }}>
                                        مبلغ قابل پرداخت: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
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
                    const helperMaxRows = Math.max(helperInitialInfoRowCount, helperDirectCostRows.length, helperDepotCostRows.length, helperSummaryRows.length);
                    
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
                        return { billOfLadingNumber, destinations, billOfLadingDate, calculationDate, vehiclePlate, vehicleType };
                    });
                    
                    return (
                        <div key={helperIdx} style={{ marginTop: '30px' }}>
                            {/* عنوان راننده کمکی */}
                            <div style={{
                                marginBottom: '16px',
                                paddingBottom: '12px',
                                borderBottom: '2px solid #1e3a8a',
                                textAlign: 'right',
                                direction: 'rtl',
                                unicodeBidi: 'isolate',
                            }}>
                                <h3 style={{
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    marginBottom: '8px',
                                    textAlign: 'center',
                                    direction: 'rtl',
                                    unicodeBidi: 'isolate',
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    color: '#1e3a8a',
                                }}>
                                    {helperBlock.title}
                                </h3>
                            </div>
                            
                            {/* جدول راننده کمکی */}
                            <div className="invoice-table-wrapper" style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
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
                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                    boxSizing: 'border-box',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                }}>
                                    <thead>
                                        <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                            <th colSpan={4} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>اطلاعات اولیه</th>
                                            <th colSpan={2} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                borderRight: 'none',
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>هزینه های مستقیم</th>
                                            <th colSpan={2} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                borderRight: 'none',
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                lineHeight: '1.4',
                                            }}>هزینه دپو</th>
                                            <th colSpan={2} style={{ 
                                                border: '2px solid #1e3a8a', 
                                                borderRight: 'none',
                                                padding: '8px', 
                                                backgroundColor: '#1e3a8a', 
                                                color: '#ffffff',
                                                textAlign: 'center',
                                                direction: 'rtl',
                                                unicodeBidi: 'isolate',
                                                verticalAlign: 'middle',
                                                fontFamily: "'B Homa', 'Tahoma', sans-serif",
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
                                            const helperDepotRow = helperDepotCostRows[rowIdx];
                                            const helperSummaryRow = helperSummaryRows[rowIdx];
                                            
                                            const helperInitialValues1 = helperTourData?.map((tour, tourIdx) => helperInitialRow1 ? helperInitialRow1.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperInitialValues2 = helperTourData?.map((tour, tourIdx) => helperInitialRow2 ? helperInitialRow2.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperDirectValues = helperTourData?.map((tour, tourIdx) => helperDirectRow ? helperDirectRow.getValue(tour, tourIdx) : '-').join(' / ') || '-';
                                            const helperDepotValues = '-';
                                            const helperTotalValue = helperSummaryRow ? helperSummaryRow.getTotal() : '-';
                                            
                                            const isEven = rowIdx % 2 === 0;
                                            const rowBgColor = isEven ? '#f5f5f5' : '#ffffff';
                                            const hasContent = helperInitialRow1 || helperInitialRow2 || helperDirectRow || helperDepotRow || helperSummaryRow;
                                            
                                            const isNumeric = (str: string) => {
                                                if (!str || str === '-') return false;
                                                return /^[\d,\.\s]+$/.test(str.replace(/[^\d,\.]/g, ''));
                                            };
                                            
                                            const categoryBorderRight = '2px solid #1e40af';
                                            const cellBorder = '1px solid #e5e7eb';
                                            const isLastRow = rowIdx === helperMaxRows - 1;
                                            
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
                                                            e.currentTarget.style.backgroundColor = '#e0f2fe';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (hasContent) {
                                                            e.currentTarget.style.backgroundColor = rowBgColor;
                                                        }
                                                    }}
                                                >
                                                    {/* اطلاعات اولیه - فیلد 1 */}
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: cellBorder, borderRight: categoryBorderRight, padding: '8px', textAlign: 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'Vazirmatn', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '10%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperInitialRow1 ? helperInitialRow1.label : '-'}
                                                    </td>
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: 'none', borderRight: cellBorder, padding: '8px', textAlign: isNumeric(helperInitialValues1) ? 'center' : 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '10%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperInitialValues1 || '-'}
                                                    </td>
                                                    {/* اطلاعات اولیه - فیلد 2 */}
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: cellBorder, borderRight: cellBorder, padding: '8px', textAlign: 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '10%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperInitialRow2 ? helperInitialRow2.label : '-'}
                                                    </td>
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: 'none', borderRight: cellBorder, padding: '8px', textAlign: isNumeric(helperInitialValues2) ? 'center' : 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '10%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperInitialValues2 || '-'}
                                                    </td>
                                                    
                                                    {/* هزینه های مستقیم */}
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: categoryBorderRight, borderRight: cellBorder, padding: '8px', textAlign: 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperDirectRow ? helperDirectRow.label : '-'}
                                                    </td>
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: 'none', borderRight: cellBorder, padding: '8px', textAlign: isNumeric(helperDirectValues) ? 'center' : 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperDirectValues || '-'}
                                                    </td>
                                                    
                                                    {/* هزینه دپو */}
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: categoryBorderRight, borderRight: cellBorder, padding: '8px', textAlign: 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperDepotRow ? helperDepotRow.label : '-'}
                                                    </td>
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: 'none', borderRight: cellBorder, padding: '8px', textAlign: isNumeric(helperDepotValues) ? 'center' : 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperDepotValues || '-'}
                                                    </td>
                                                    
                                                    {/* جمع بندی */}
                                                    <td style={{ borderTop: cellBorder, borderBottom: cellBorder, borderLeft: categoryBorderRight, borderRight: cellBorder, padding: '8px', textAlign: 'right', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
                                                        {helperSummaryRow ? helperSummaryRow.label : '-'}
                                                    </td>
                                                    <td style={{ borderTop: cellBorder, borderBottom: isLastRow ? cellBorder : cellBorder, borderLeft: categoryBorderRight, borderRight: cellBorder, padding: '8px', textAlign: 'center', direction: 'rtl', unicodeBidi: 'isolate', verticalAlign: 'middle', fontFamily: "'B Homa', 'Tahoma', sans-serif", fontSize: '14px', lineHeight: '1.5', whiteSpace: 'normal', wordWrap: 'break-word', width: '15%', fontWeight: 'bold', color: '#1e3a8a', backgroundColor: hasContent ? rowBgColor : 'transparent' }}>
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
                                        fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                        boxSizing: 'border-box',
                                    }}>
                                        <tbody>
                                            <tr style={{ direction: 'rtl', unicodeBidi: 'isolate' }}>
                                                <td style={{
                                                    border: '2px solid #1e3a8a',
                                                    padding: '8px 15px',
                                                    backgroundColor: '#bfdbfe',
                                                    textAlign: 'right',
                                                    direction: 'rtl',
                                                    unicodeBidi: 'isolate',
                                                    fontFamily: "'B Homa', 'Tahoma', sans-serif",
                                                    fontWeight: 'bold',
                                                    fontSize: '14px',
                                                    color: '#1e3a8a',
                                                    lineHeight: '1.8',
                                                }}>
                                                    مبلغ قابل پرداخت: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{helperBlock.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// تابع برای لود کردن فونت B Homa
const loadBHomaFont = async (): Promise<void> => {
    try {
        // بررسی اینکه آیا فونت قبلاً لود شده
        if (document.fonts && document.fonts.check) {
            const fontLoaded = document.fonts.check("16px 'B Homa'");
            if (fontLoaded) {
                console.log('✅ [loadBHomaFont] فونت B Homa قبلاً لود شده');
                // انتظار کوتاه برای اطمینان
                await new Promise(resolve => setTimeout(resolve, 200));
                return;
            }
        }
        
        // استفاده از FontFace API برای لود کردن فونت
        if ('FontFace' in window) {
            console.log('🔄 [loadBHomaFont] در حال لود کردن فونت B Homa...');
            
            // چند URL مختلف برای اطمینان
            const fontUrls = [
                "url('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2') format('woff2')",
                "url('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff') format('woff')"
            ];
            
            const fontFace = new FontFace(
                'B Homa',
                fontUrls.join(', '),
                {
                    style: 'normal',
                    weight: '400',
                    display: 'block', // استفاده از block به جای swap
                    unicodeRange: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC'
                }
            );
            
            await fontFace.load();
            document.fonts.add(fontFace);
            console.log('✅ [loadBHomaFont] فونت B Homa با موفقیت لود شد');
            
            // بررسی مجدد برای اطمینان
            let retries = 0;
            while (retries < 5) {
                if (document.fonts.check("16px 'B Homa'")) {
                    console.log(`✅ [loadBHomaFont] فونت B Homa تایید شد (تلاش ${retries + 1})`);
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
                retries++;
            }
            
            // انتظار اضافی برای اطمینان از render شدن
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            // Fallback: استفاده از link tag
            console.log('⚠️ [loadBHomaFont] FontFace API در دسترس نیست، استفاده از link tag');
            const link = document.createElement('link');
            link.href = 'https://fonts.googleapis.com/css2?family=B+Homa&display=block';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    } catch (error) {
        console.error('❌ [loadBHomaFont] خطا در لود کردن فونت:', error);
        // Fallback: استفاده از link tag در صورت خطا
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=B+Homa&display=block';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};

// تابع اصلی برای export تصویر با استفاده از DOM
export const exportInvoiceToImage = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🖼️ [exportInvoiceToImage] شروع تولید عکس با روش DOM');
        
        // لود کردن فونت B Homa قبل از شروع
        await loadBHomaFont();
        
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
            // Clone کردن محتوای invoiceElement به temp div
            const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
            tempDiv.appendChild(clonedContent);
            
            // تنظیم استایل‌های temp div
            tempDiv.style.width = 'auto';
            tempDiv.style.minWidth = '1200px';
            tempDiv.style.maxWidth = '1200px';
            tempDiv.style.overflow = 'visible';
            
            const invoiceElement_internal = tempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
            if (invoiceElement_internal) {
                invoiceElement_internal.style.width = 'auto';
                invoiceElement_internal.style.minWidth = '1200px';
                invoiceElement_internal.style.maxWidth = '1200px';
                invoiceElement_internal.style.margin = '0 auto';
                invoiceElement_internal.style.overflow = 'visible';
                invoiceElement_internal.style.visibility = 'visible';
                invoiceElement_internal.style.opacity = '1';
            }
            
            // انتظار برای render کامل
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // محاسبه عرض واقعی محتوا
            const actualWidth = Math.max(tempDiv.scrollWidth, tempDiv.offsetWidth, 1200);
            const actualHeight = Math.max(tempDiv.scrollHeight, tempDiv.offsetHeight);
            
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
                    onclone: (clonedDoc) => {
                        // اضافه کردن @font-face به head برای اطمینان از لود شدن فونت
                        const style = clonedDoc.createElement('style');
                        style.textContent = `
                            * {
                                font-family: 'B Homa', 'Tahoma', sans-serif !important;
                                -webkit-font-smoothing: antialiased;
                                -moz-osx-font-smoothing: grayscale;
                            }
                            body, html {
                                font-family: 'B Homa', 'Tahoma', sans-serif !important;
                            }
                            table, td, th, tr {
                                font-family: 'B Homa', 'Tahoma', sans-serif !important;
                            }
                        `;
                        clonedDoc.head.appendChild(style);
                        
                        // اضافه کردن link tag برای فونت B Homa
                        const link = clonedDoc.createElement('link');
                        link.href = 'https://fonts.googleapis.com/css2?family=B+Homa&display=block';
                        link.rel = 'stylesheet';
                        clonedDoc.head.appendChild(link);
                        
                        // اضافه کردن preload link برای woff2
                        const link2 = clonedDoc.createElement('link');
                        link2.href = 'https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2';
                        link2.rel = 'preload';
                        link2.as = 'font';
                        link2.type = 'font/woff2';
                        link2.crossOrigin = 'anonymous';
                        clonedDoc.head.appendChild(link2);
                        
                        const clonedTempDiv = clonedDoc.querySelector('body > div:last-child') as HTMLElement;
                    if (clonedTempDiv) {
                        clonedTempDiv.style.visibility = 'visible';
                        clonedTempDiv.style.opacity = '1';
                        clonedTempDiv.style.width = 'auto';
                        clonedTempDiv.style.minWidth = '1200px';
                        clonedTempDiv.style.maxWidth = '1200px';
                        clonedTempDiv.style.overflow = 'visible';
                        
                        const clonedInvoiceElement = clonedTempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
                        if (clonedInvoiceElement) {
                            clonedInvoiceElement.style.width = 'auto';
                                clonedInvoiceElement.style.minWidth = '1200px';
                                clonedInvoiceElement.style.maxWidth = '1200px';
                        }
                        
                        // اعمال فونت B Homa به تمام المان‌ها با !important
                        const allElements = clonedTempDiv.querySelectorAll('*');
                        allElements.forEach((el) => {
                            const htmlEl = el as HTMLElement;
                            if (htmlEl.style) {
                                // استفاده از setProperty برای اعمال !important
                                htmlEl.style.setProperty('font-family', "'B Homa', 'Tahoma', sans-serif", 'important');
                                htmlEl.style.setProperty('font-size', '14px', 'important');
                                htmlEl.style.setProperty('-webkit-font-smoothing', 'antialiased', 'important');
                                htmlEl.style.setProperty('-moz-osx-font-smoothing', 'grayscale', 'important');
                            }
                        });
                        
                        // اعمال فونت به body و html
                        if (clonedDoc.body) {
                            clonedDoc.body.style.setProperty('font-family', "'B Homa', 'Tahoma', sans-serif", 'important');
                            clonedDoc.body.style.setProperty('font-size', '14px', 'important');
                        }
                        if (clonedDoc.documentElement) {
                            clonedDoc.documentElement.style.setProperty('font-family', "'B Homa', 'Tahoma', sans-serif", 'important');
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
                            tableEl.style.setProperty('font-family', "'B Homa', 'Tahoma', sans-serif", 'important');
                            tableEl.style.setProperty('font-size', '14px', 'important');
                            
                            // اعمال فونت به تمام سلول‌های جدول
                            const cells = tableEl.querySelectorAll('td, th');
                            cells.forEach((cell) => {
                                const cellEl = cell as HTMLElement;
                                cellEl.style.setProperty('font-family', "'B Homa', 'Tahoma', sans-serif", 'important');
                                cellEl.style.setProperty('font-size', '14px', 'important');
                            });
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
