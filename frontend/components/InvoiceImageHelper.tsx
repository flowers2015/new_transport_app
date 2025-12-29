import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { formatJalali } from '../utils/jalali';
import html2canvas from 'html2canvas';

// تابع محاسبه هزینه‌های راننده اصلی (برای استفاده در همه جا)
export const calculateMainDriverCostGlobal = (calc: any): number => {
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
    const depotAllowance = parseFloat(calc.depot_kilometer_rate || calc.depotKilometerRate || 0);
    const depotMissionCost = parseFloat(calc.depot_mission_cost || calc.depotMissionCost || 0);
    return food + fuel + toll + bill + returnCargo + multiUnload + excessMission + fixedAllowance + depotCargoHandling + depotAllowance + depotMissionCost;
};

// تابع محاسبه هزینه‌های راننده کمکی
export const calculateHelperDriverCostGlobal = (calc: any): number => {
    const helperAllowance = parseFloat(calc.helper_driver_allowance || calc.helperDriverAllowance || 0);
    const helperFoodCost = parseFloat(calc.helper_driver_food_cost || calc.helperDriverFoodCost || 0);
    const helperExcessMissionCost = parseFloat(calc.helper_driver_excess_mission_cost || calc.helperDriverExcessMissionCost || 0);
    return helperAllowance + helperFoodCost + helperExcessMissionCost;
};

// Interface برای PaymentRecord
export interface PaymentRecord {
    driverId: string;
    employeeId: string;
    driverName: string;
    accountNumber: string;
    totalAmount: number;
    mainDriverAmount: number;
    helperDriverAmount: number;
    advancePayment: number;
    payableAmount: number;
    calculationDate: string;
    lastPaymentDate?: string;
    lastPaymentAmount?: number;
    descriptions?: string;
}

// Interface برای InvoiceData
export interface InvoiceData {
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
        origin?: string;
        destinations?: string;
        vehiclePlate?: string;
        billOfLadingDate?: string;
        calculationDate?: string;
        approvedKm?: number;
        excessKm?: number;
        totalKm?: number;
        approvedMissionDays?: number;
        excessMissionDays?: number;
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
        const origin = announcement?.origin?.city || announcement?.origin || calc.origin || '-';
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
        const approvedKm = parseFloat(calc.approved_kilometers || calc.approvedKilometers || 0);
        const excessKm = parseFloat(calc.excess_kilometers || calc.excessKilometers || 0);
        const approvedMissionDays = parseFloat(calc.approved_mission_days || calc.approvedMissionDays || 0);
        const excessMissionDays = parseFloat(calc.excess_mission_days || calc.excessMissionDays || 0);
        
        return {
            billOfLadingNumber,
            origin,
            destinations,
            vehiclePlate,
            billOfLadingDate,
            calculationDate,
            approvedKm,
            excessKm,
            totalKm: approvedKm + excessKm,
            approvedMissionDays,
            excessMissionDays,
        };
    });

    return { blocks, tourData, helperCalculationsByEmployeeId };
};

// تابع render برای افقی layout
export const renderInvoiceLayoutHorizontal = (
    invoiceData: InvoiceData,
    selectedInvoiceRecord: PaymentRecord,
    invoiceAnnouncements: Map<string, any>,
    containerWidth: number = 2100,
    fontSize: number = 13,
    cellPadding: string = '14px 12px'
): JSX.Element => {
    const numTours = invoiceData.tourData?.length || 0;
    const mainBlock = invoiceData.blocks[0];
    const helperBlocks = invoiceData.blocks.slice(1);
    
    const costRows = mainBlock?.rows.filter(r => r.kind === 'cost' || r.kind === 'categoryHeader') || [];
    const costColumns: Array<{ 
        label: string; 
        category: string;
        tourValues?: number[]; 
        totalAmount?: number; 
        isDepotCount?: boolean;
    }> = [];
    let currentCategory = '';
    
    costRows.forEach(row => {
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
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                        fontSize: `${fontSize}px`,
                                        fontWeight: 'bold',
                                        lineHeight: '1.4',
                                    }}>{tourTotal > 0 ? tourTotal.toLocaleString('fa-IR') : '-'}</td>
                                </tr>
                            );
                        })}
                        {/* ردیف جمع کل */}
                        <tr style={{ 
                            direction: 'rtl', 
                            unicodeBidi: 'isolate',
                            backgroundColor: '#3b82f6',
                        }}>
                            <td colSpan={5} style={{ 
                                border: '1px solid #000', 
                                padding: cellPadding, 
                                textAlign: 'center',
                                direction: 'rtl',
                                unicodeBidi: 'isolate',
                                verticalAlign: 'middle',
                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                fontSize: `${fontSize}px`,
                                fontWeight: 'bold',
                                lineHeight: '1.4',
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                            }}>جمع کل</td>
                            {costColumns.map((col, colIdx) => {
                                const totalValue = col.isDepotCount ? '-' : (col.totalAmount !== undefined ? col.totalAmount.toLocaleString('fa-IR') : '-');
                                return (
                                    <td key={colIdx} style={{ 
                                        border: '1px solid #000', 
                                        padding: cellPadding, 
                                        textAlign: 'right',
                                        direction: 'rtl',
                                        unicodeBidi: 'isolate',
                                        verticalAlign: 'middle',
                                        fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                        fontSize: `${fontSize}px`,
                                        fontWeight: 'bold',
                                        lineHeight: '1.4',
                                        backgroundColor: '#3b82f6',
                                        color: '#ffffff',
                                    }}>{totalValue}</td>
                                );
                            })}
                            <td style={{ 
                                border: '1px solid #000', 
                                padding: cellPadding, 
                                textAlign: 'right',
                                direction: 'rtl',
                                unicodeBidi: 'isolate',
                                verticalAlign: 'middle',
                                fontFamily: "'Vazir', 'Tahoma', sans-serif",
                                fontSize: `${fontSize}px`,
                                fontWeight: 'bold',
                                lineHeight: '1.4',
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                            }}>{mainBlock?.summary.totalTripCost > 0 ? mainBlock.summary.totalTripCost.toLocaleString('fa-IR') : '-'}</td>
                        </tr>
                    </tbody>
                </table>
                
                {/* بخش خلاصه */}
                {mainBlock?.summary && (
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
                            جمع کل هزینه سفر: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock.summary.totalTripCost.toLocaleString('fa-IR')}</span> ریال
                        </div>
                        {mainBlock.summary.deductionsAmount && mainBlock.summary.deductionsAmount > 0 && (
                            <div style={{ direction: 'rtl', unicodeBidi: 'isolate', marginBottom: '4px' }}>
                                {mainBlock.summary.deductionsTitle || 'کسور'}: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock.summary.deductionsAmount.toLocaleString('fa-IR')}</span> ریال
                            </div>
                        )}
                        <div style={{ direction: 'rtl', unicodeBidi: 'isolate', fontWeight: 'bold', marginBottom: '4px' }}>
                            مبلغ قابل پرداخت: <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{mainBlock.summary.payableAmount.toLocaleString('fa-IR')}</span> ریال
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
                                                }}>{tourTotal > 0 ? tourTotal.toLocaleString('fa-IR') : '-'}</td>
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
            </div>
        </div>
    );
};

// تابع اصلی برای export تصویر با استفاده از DOM
export const exportInvoiceToImage = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
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
            // Clone کردن محتوای invoiceElement به temp div
            const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
            tempDiv.appendChild(clonedContent);
            
            // تنظیم استایل‌های temp div
            const invoiceElement_internal = tempDiv.querySelector('[data-invoice-ref="true"]') as HTMLElement;
            if (invoiceElement_internal) {
                invoiceElement_internal.style.width = '100%';
                invoiceElement_internal.style.maxWidth = '100%';
                invoiceElement_internal.style.margin = '0 auto';
                invoiceElement_internal.style.overflow = 'visible';
                invoiceElement_internal.style.visibility = 'visible';
                invoiceElement_internal.style.opacity = '1';
            }
            
            // انتظار برای render کامل
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // استفاده از html2canvas
            const canvas = await html2canvas(tempDiv, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                removeContainer: false,
                onclone: (clonedDoc) => {
                    const clonedTempDiv = clonedDoc.querySelector('body > div:last-child') as HTMLElement;
                    if (clonedTempDiv) {
                        clonedTempDiv.style.visibility = 'visible';
                        clonedTempDiv.style.opacity = '1';
                        clonedTempDiv.style.width = '100%';
                        clonedTempDiv.style.maxWidth = '100%';
                        clonedTempDiv.style.overflow = 'visible';
                        
                        // اعمال استایل‌های جدول
                        const clonedTables = clonedTempDiv.querySelectorAll('table');
                        clonedTables.forEach((table) => {
                            const tableEl = table as HTMLElement;
                            tableEl.style.width = '100%';
                            tableEl.style.minWidth = '100%';
                            tableEl.style.tableLayout = 'auto';
                            tableEl.style.borderCollapse = 'collapse';
                            tableEl.style.fontFamily = "'Vazir', 'Tahoma', sans-serif";
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

