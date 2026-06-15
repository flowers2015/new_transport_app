import { getTotalKilometersFromCalculation } from './tourMileage';

export interface MileageRegulation {
    vehicleType: string;
    minKilometers: number;
    maxKilometers: number;
    allowancePerKm: number;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
}

export interface DriverCommissionSummary {
    driverId: string;
    employeeId: string;
    driverName: string;
    queueType: 'porsant' | 'fixed_allowance' | 'mixed';
    queueTypeLabel: string;
    trailerTourCount: number;
    tenWheelerTourCount: number;
    totalTourCount: number;
    trailerKilometers: number;
    tenWheelerKilometers: number;
    totalKilometers: number;
    trailerCommission: number;
    tenWheelerCommission: number;
    totalCommission: number;
    fixedAllowance: number;
    totalFoodCost: number;
    totalFuelCost: number;
    totalTollCost: number;
    totalLoadingCost: number;
    totalReturnCargoCost: number;
    totalReturnBillOfLadingCost: number;
    totalMultiUnloadCost: number;
    totalExcessMissionCost: number;
    totalHelperDriverCost: number;
    commissionBase: 'تریلی' | 'ده چرخ';
    /** خودرو غالب — همان مبنای محاسبه */
    dominantVehicleLabel: string;
    totalPayable: number;
    commissionStatus: string;
    latestBillOfLadingDate: string;
}

export interface DriverTourDetail {
    id: string;
    driverId: string;
    employeeId: string;
    driverName: string;
    announcementId: string;
    billOfLadingNumber: string;
    billOfLadingDate: string;
    destinations: string;
    vehicleType: string;
    queueType: string;
    queueTypeLabel: string;
    approvedKilometers: number;
    excessKilometers: number;
    totalKilometers: number;
    commission: number;
    fixedAllowance: number;
    foodCost: number;
    fuelCost: number;
    tollCost: number;
    totalCost: number;
    commissionStatus: string;
}

export function resolveVehicleType(calc: Record<string, unknown>): string {
    return String(
        calc.vehicle_type ||
            calc.vehicleType ||
            calc.vehicle_code ||
            calc.vehicleCode ||
            ''
    ).trim();
}

export function isTrailerOrMiniVehicle(vehicleType: string): boolean {
    const v = vehicleType.toLowerCase();
    return v.includes('تریلی') || v.includes('مینی');
}

export function isTenWheelerVehicle(vehicleType: string): boolean {
    const v = vehicleType.toLowerCase();
    return v.includes('ده چرخ') || v.includes('دهچرخ');
}

export function calculateMileageAllowance(
    vehicleType: string,
    kilometers: number,
    billOfLadingDate: string | undefined,
    mileageRegulations: MileageRegulation[]
): number {
    const regType =
        isTrailerOrMiniVehicle(vehicleType) || vehicleType === 'تریلی'
            ? 'تریلی'
            : isTenWheelerVehicle(vehicleType) || vehicleType === 'ده چرخ'
              ? 'ده چرخ'
              : null;
    if (!regType || kilometers <= 0) return 0;

    let filteredRegs = mileageRegulations.filter((r) => r.vehicleType === regType);

    if (billOfLadingDate && filteredRegs.some((r) => r.startDate && r.endDate)) {
        const regsInDateRange = filteredRegs.filter((r) => {
            if (!r.startDate || !r.endDate) return true;
            return billOfLadingDate >= r.startDate && billOfLadingDate <= r.endDate;
        });
        if (regsInDateRange.length > 0) filteredRegs = regsInDateRange;
    }

    const regulation = filteredRegs.find(
        (r) => kilometers >= r.minKilometers && kilometers <= r.maxKilometers
    );
    if (regulation) return kilometers * regulation.allowancePerKm;

    const highestReg = filteredRegs.sort((a, b) => b.maxKilometers - a.maxKilometers)[0];
    if (highestReg && kilometers > highestReg.maxKilometers) {
        return kilometers * highestReg.allowancePerKm;
    }
    return 0;
}

function normalizeDestinations(calc: Record<string, unknown>): string {
    const raw = calc.destinations;
    if (Array.isArray(raw)) {
        return raw
            .map((d) => {
                if (typeof d === 'string') return d;
                if (d && typeof d === 'object') {
                    const obj = d as { city?: string; representative_name?: string };
                    return obj.city || obj.representative_name || '';
                }
                return String(d);
            })
            .filter(Boolean)
            .join(' - ');
    }
    if (typeof raw === 'string') return raw;
    return '';
}

export function buildTourDetailsFromCalculations(
    calculations: Record<string, unknown>[]
): DriverTourDetail[] {
    return calculations.map((calc) => {
        const queueType = String(calc.queue_type || calc.queueType || 'porsant');
        const vehicleType = resolveVehicleType(calc);
        const approvedKm = Number(calc.approved_kilometers ?? calc.approvedKilometers) || 0;
        const excessKm = Number(calc.excess_kilometers ?? calc.excessKilometers) || 0;
        const totalKm = getTotalKilometersFromCalculation(calc as Parameters<typeof getTotalKilometersFromCalculation>[0]);
        const fixedAllowance =
            queueType === 'fixed_allowance'
                ? Number(calc.fixed_allowance ?? calc.fixedAllowance) ||
                  Number(calc.tour_cost ?? calc.tourCost) ||
                  0
                : 0;

        return {
            id: String(calc.id ?? ''),
            driverId: String(calc.driver_id ?? calc.driverId ?? ''),
            employeeId: String(calc.employee_id ?? calc.employeeId ?? ''),
            driverName: String(calc.driver_name ?? calc.driverName ?? ''),
            announcementId: String(calc.announcement_id ?? calc.announcementId ?? ''),
            billOfLadingNumber: String(calc.bill_of_lading_number ?? calc.billOfLadingNumber ?? ''),
            billOfLadingDate: String(calc.bill_of_lading_date ?? calc.billOfLadingDate ?? ''),
            destinations: normalizeDestinations(calc),
            vehicleType,
            queueType,
            queueTypeLabel: queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی',
            approvedKilometers: approvedKm,
            excessKilometers: excessKm,
            totalKilometers: totalKm,
            commission: 0,
            fixedAllowance,
            foodCost: Number(calc.food_cost ?? calc.foodCost) || 0,
            fuelCost: Number(calc.fuel_cost ?? calc.fuelCost) || 0,
            tollCost: Number(calc.toll_cost ?? calc.tollCost) || 0,
            totalCost: Number(calc.total_cost ?? calc.totalCost) || 0,
            commissionStatus: String(calc.commission_status ?? calc.commissionStatus ?? 'recorded'),
        };
    });
}

/** جمع‌بندی راننده — اجرت پورسانت فقط یک‌بار روی کل پیمایش دوره */
export function buildCommissionSummaries(
    calculations: Record<string, unknown>[],
    mileageRegulations: MileageRegulation[]
): DriverCommissionSummary[] {
    const driverMap = new Map<string, DriverCommissionSummary>();

    calculations.forEach((calc) => {
        const driverId = String(calc.driver_id ?? calc.driverId ?? '');
        if (!driverId) return;

        const vehicleType = resolveVehicleType(calc);
        const queueType = String(calc.queue_type ?? calc.queueType ?? 'porsant');
        const isTrailer = isTrailerOrMiniVehicle(vehicleType);
        const isTenWheeler = isTenWheelerVehicle(vehicleType);
        const totalKm = getTotalKilometersFromCalculation(calc as Parameters<typeof getTotalKilometersFromCalculation>[0]);
        const billOfLadingDate = String(calc.bill_of_lading_date ?? calc.billOfLadingDate ?? '');
        const fixedAllowanceVal =
            queueType === 'fixed_allowance'
                ? Number(calc.fixed_allowance ?? calc.fixedAllowance) ||
                  Number(calc.tour_cost ?? calc.tourCost) ||
                  0
                : 0;

        const existing = driverMap.get(driverId);
        if (existing) {
            if (isTrailer) {
                existing.trailerTourCount += 1;
                existing.trailerKilometers += totalKm;
            } else if (isTenWheeler) {
                existing.tenWheelerTourCount += 1;
                existing.tenWheelerKilometers += totalKm;
            }
            existing.totalTourCount += 1;
            existing.totalKilometers += totalKm;
            existing.fixedAllowance += fixedAllowanceVal;

            if (existing.queueType === 'porsant' && queueType === 'fixed_allowance') {
                existing.queueType = 'mixed';
            } else if (existing.queueType === 'fixed_allowance' && queueType === 'porsant') {
                existing.queueType = 'mixed';
            }

            existing.totalFoodCost += Number(calc.food_cost ?? calc.foodCost) || 0;
            existing.totalFuelCost += Number(calc.fuel_cost ?? calc.fuelCost) || 0;
            existing.totalTollCost += Number(calc.toll_cost ?? calc.tollCost) || 0;
            existing.totalLoadingCost += Number(calc.loading_cost ?? calc.loadingCost) || 0;
            existing.totalReturnCargoCost += Number(calc.return_cargo_cost ?? calc.returnCargoCost) || 0;
            existing.totalReturnBillOfLadingCost +=
                Number(calc.return_bill_of_lading_cost ?? calc.returnBillOfLadingCost) || 0;
            existing.totalMultiUnloadCost += Number(calc.multi_unload_cost ?? calc.multiUnloadCost) || 0;
            existing.totalExcessMissionCost += Number(calc.excess_mission_cost ?? calc.excessMissionCost) || 0;
            existing.totalHelperDriverCost += Number(calc.helper_driver_cost ?? calc.helperDriverCost) || 0;

            if (billOfLadingDate && billOfLadingDate > existing.latestBillOfLadingDate) {
                existing.latestBillOfLadingDate = billOfLadingDate;
            }
        } else {
            driverMap.set(driverId, {
                driverId,
                employeeId: String(calc.employee_id ?? calc.employeeId ?? ''),
                driverName: String(calc.driver_name ?? calc.driverName ?? ''),
                queueType: queueType as 'porsant' | 'fixed_allowance',
                queueTypeLabel: queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی',
                trailerTourCount: isTrailer ? 1 : 0,
                tenWheelerTourCount: isTenWheeler ? 1 : 0,
                totalTourCount: 1,
                trailerKilometers: isTrailer ? totalKm : 0,
                tenWheelerKilometers: isTenWheeler ? totalKm : 0,
                totalKilometers: totalKm,
                trailerCommission: 0,
                tenWheelerCommission: 0,
                totalCommission: 0,
                fixedAllowance: fixedAllowanceVal,
                totalFoodCost: Number(calc.food_cost ?? calc.foodCost) || 0,
                totalFuelCost: Number(calc.fuel_cost ?? calc.fuelCost) || 0,
                totalTollCost: Number(calc.toll_cost ?? calc.tollCost) || 0,
                totalLoadingCost: Number(calc.loading_cost ?? calc.loadingCost) || 0,
                totalReturnCargoCost: Number(calc.return_cargo_cost ?? calc.returnCargoCost) || 0,
                totalReturnBillOfLadingCost:
                    Number(calc.return_bill_of_lading_cost ?? calc.returnBillOfLadingCost) || 0,
                totalMultiUnloadCost: Number(calc.multi_unload_cost ?? calc.multiUnloadCost) || 0,
                totalExcessMissionCost: Number(calc.excess_mission_cost ?? calc.excessMissionCost) || 0,
                totalHelperDriverCost: Number(calc.helper_driver_cost ?? calc.helperDriverCost) || 0,
                commissionBase: 'تریلی',
                dominantVehicleLabel: 'تریلی',
                totalPayable: 0,
                commissionStatus: String(calc.commission_status ?? calc.commissionStatus ?? 'recorded'),
                latestBillOfLadingDate: billOfLadingDate,
            });
        }
    });

    return Array.from(driverMap.values()).map((summary) => {
        const trailerPercent =
            summary.totalTourCount > 0
                ? (summary.trailerTourCount / summary.totalTourCount) * 100
                : 0;
        summary.commissionBase = trailerPercent >= 50 ? 'تریلی' : 'ده چرخ';
        summary.dominantVehicleLabel = summary.commissionBase;

        if (summary.queueType === 'mixed') summary.queueTypeLabel = 'ترکیبی';
        else if (summary.queueType === 'fixed_allowance') summary.queueTypeLabel = 'اجرت ثابت';
        else summary.queueTypeLabel = 'پورسانتی';

        if (summary.queueType === 'fixed_allowance') {
            summary.totalCommission = 0;
        } else {
            summary.totalCommission = calculateMileageAllowance(
                summary.commissionBase,
                summary.totalKilometers,
                summary.latestBillOfLadingDate,
                mileageRegulations
            );
        }

        summary.trailerCommission =
            summary.commissionBase === 'تریلی' ? summary.totalCommission + summary.fixedAllowance : 0;
        summary.tenWheelerCommission =
            summary.commissionBase === 'ده چرخ' ? summary.totalCommission + summary.fixedAllowance : 0;

        summary.totalPayable =
            summary.totalCommission +
            summary.fixedAllowance +
            summary.totalFoodCost +
            summary.totalFuelCost +
            summary.totalTollCost +
            summary.totalLoadingCost +
            summary.totalReturnCargoCost +
            summary.totalReturnBillOfLadingCost +
            summary.totalMultiUnloadCost +
            summary.totalExcessMissionCost;

        return summary;
    });
}

export function normalizePeriodTourRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
        ...row,
        vehicle_type: resolveVehicleType(row),
        total_kilometers: getTotalKilometersFromCalculation(
            row as Parameters<typeof getTotalKilometersFromCalculation>[0]
        ),
    };
}
