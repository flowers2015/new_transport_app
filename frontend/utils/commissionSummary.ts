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
    returnTourCount: number;
    multiUnloadTourCount: number;
    helperTourCount: number;
    totalMainDriverCost: number;
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
    return v.includes('تریلی') || v.includes('مینی') || v.includes('کشنده') || v.includes('تریلر');
}

export function isTenWheelerVehicle(vehicleType: string): boolean {
    const v = vehicleType.toLowerCase();
    return v.includes('ده چرخ') || v.includes('دهچرخ') || v.includes('10 چرخ');
}

/** دسته عملیاتی برای پیوت: تریلی / مینی تریلی / ده چرخ */
export function categorizeVehicleType(vehicleType: string): string {
    const v = (vehicleType || '').trim().toLowerCase();
    if (!v) return 'نامشخص';
    if (v.includes('مینی')) return 'مینی تریلی';
    if (isTenWheelerVehicle(v)) return 'ده چرخ';
    if (v.includes('تریلی') || v.includes('کشنده') || v.includes('تریلر')) return 'تریلی';
    return 'نامشخص';
}

const VEHICLE_CATEGORY_ORDER = ['تریلی', 'مینی تریلی', 'ده چرخ', 'نامشخص'];

function n(calc: Record<string, unknown>, ...keys: string[]): number {
    for (const key of keys) {
        const raw = calc[key];
        if (raw == null || raw === '') continue;
        const num = Number(raw);
        if (Number.isFinite(num)) return num;
    }
    return 0;
}

export function getReturnCargoCostFromCalc(calc: Record<string, unknown>): number {
    return (
        n(calc, 'return_cargo_cost', 'returnCargoCost') +
        n(calc, 'return_inter_branch_cargo_cost', 'returnInterBranchCargoCost')
    );
}

export function getHelperCostFromCalc(calc: Record<string, unknown>): number {
    const stored = n(calc, 'helper_driver_cost', 'helperDriverCost');
    const parts =
        n(calc, 'helper_driver_allowance', 'helperDriverAllowance') +
        n(calc, 'helper_driver_food_cost', 'helperDriverFoodCost') +
        n(calc, 'helper_driver_excess_mission_cost', 'helperDriverExcessMissionCost');
    return stored > 0 ? stored : parts;
}

export function tourHasHelperFromCalc(calc: Record<string, unknown>): boolean {
    const id = String(calc.helper_driver_id ?? calc.helperDriverId ?? '').trim();
    const employeeId = String(
        calc.helper_driver_employee_id ?? calc.helperDriverEmployeeId ?? ''
    ).trim();
    return Boolean(id || employeeId);
}

export function getMainDriverCostFromCalc(calc: Record<string, unknown>): number {
    const total = n(calc, 'total_cost', 'totalCost');
    const helper = getHelperCostFromCalc(calc);
    if (total > 0) return Math.max(0, total - helper);
    return 0;
}

export interface TourCostBreakdown {
    porsantTourCost: number;
    fixedAllowance: number;
    foodCost: number;
    fuelCost: number;
    tollCost: number;
    loadingCost: number;
    billOfLadingCost: number;
    returnCargoCost: number;
    returnInterBranchCargoCost: number;
    returnBillOfLadingCost: number;
    multiUnloadCost: number;
    excessMissionCost: number;
    depotCargoHandlingCost: number;
    depotAllowanceCost: number;
    depotMissionCost: number;
    helperAllowance: number;
    helperFood: number;
    helperExcessMission: number;
}

const EMPTY_BREAKDOWN: TourCostBreakdown = {
    porsantTourCost: 0,
    fixedAllowance: 0,
    foodCost: 0,
    fuelCost: 0,
    tollCost: 0,
    loadingCost: 0,
    billOfLadingCost: 0,
    returnCargoCost: 0,
    returnInterBranchCargoCost: 0,
    returnBillOfLadingCost: 0,
    multiUnloadCost: 0,
    excessMissionCost: 0,
    depotCargoHandlingCost: 0,
    depotAllowanceCost: 0,
    depotMissionCost: 0,
    helperAllowance: 0,
    helperFood: 0,
    helperExcessMission: 0,
};

export function emptyTourCostBreakdown(): TourCostBreakdown {
    return { ...EMPTY_BREAKDOWN };
}

export function addTourCostBreakdown(a: TourCostBreakdown, b: TourCostBreakdown): TourCostBreakdown {
    const out = emptyTourCostBreakdown();
    (Object.keys(EMPTY_BREAKDOWN) as Array<keyof TourCostBreakdown>).forEach((key) => {
        out[key] = a[key] + b[key];
    });
    return out;
}

export function getTourCostBreakdown(calc: Record<string, unknown>): TourCostBreakdown {
    const queue = String(calc.queue_type ?? calc.queueType ?? 'porsant');
    const tourCost = n(calc, 'tour_cost', 'tourCost');
    const storedFixed = n(calc, 'fixed_allowance', 'fixedAllowance');
    const hasHelper = tourHasHelperFromCalc(calc);
    const helperAllowance = hasHelper ? n(calc, 'helper_driver_allowance', 'helperDriverAllowance') : 0;
    const helperFood = hasHelper ? n(calc, 'helper_driver_food_cost', 'helperDriverFoodCost') : 0;
    const helperExcessMission = hasHelper
        ? n(calc, 'helper_driver_excess_mission_cost', 'helperDriverExcessMissionCost')
        : 0;
    const helperParts = helperAllowance + helperFood + helperExcessMission;
    const helperStored = hasHelper ? n(calc, 'helper_driver_cost', 'helperDriverCost') : 0;

    return {
        porsantTourCost: 0,
        fixedAllowance: queue === 'fixed_allowance' ? storedFixed || tourCost : 0,
        foodCost: n(calc, 'food_cost', 'foodCost'),
        fuelCost: n(calc, 'fuel_cost', 'fuelCost'),
        tollCost: n(calc, 'toll_cost', 'tollCost'),
        loadingCost: n(calc, 'loading_cost', 'loadingCost'),
        billOfLadingCost: n(calc, 'bill_of_lading_cost', 'billOfLadingCost'),
        returnCargoCost: n(calc, 'return_cargo_cost', 'returnCargoCost'),
        returnInterBranchCargoCost: n(calc, 'return_inter_branch_cargo_cost', 'returnInterBranchCargoCost'),
        returnBillOfLadingCost: n(calc, 'return_bill_of_lading_cost', 'returnBillOfLadingCost'),
        multiUnloadCost: n(calc, 'multi_unload_cost', 'multiUnloadCost'),
        excessMissionCost: n(calc, 'excess_mission_cost', 'excessMissionCost'),
        depotCargoHandlingCost: n(calc, 'depot_cargo_handling_cost', 'depotCargoHandlingCost'),
        depotAllowanceCost: n(calc, 'depot_kilometer_rate', 'depotKilometerRate'),
        depotMissionCost: n(calc, 'depot_mission_cost', 'depotMissionCost'),
        helperAllowance: helperParts > 0 ? helperAllowance : helperStored,
        helperFood: helperParts > 0 ? helperFood : 0,
        helperExcessMission: helperParts > 0 ? helperExcessMission : 0,
    };
}

export function sumMainDriverBreakdown(b: TourCostBreakdown): number {
    return (
        b.porsantTourCost +
        b.fixedAllowance +
        b.foodCost +
        b.fuelCost +
        b.tollCost +
        b.loadingCost +
        b.billOfLadingCost +
        b.returnCargoCost +
        b.returnInterBranchCargoCost +
        b.returnBillOfLadingCost +
        b.multiUnloadCost +
        b.excessMissionCost +
        b.depotCargoHandlingCost +
        b.depotAllowanceCost +
        b.depotMissionCost
    );
}

export function sumHelperDriverBreakdown(b: TourCostBreakdown): number {
    return b.helperAllowance + b.helperFood + b.helperExcessMission;
}

export function getDepotCostFromCalc(calc: Record<string, unknown>): number {
    const b = getTourCostBreakdown(calc);
    return b.depotCargoHandlingCost + b.depotAllowanceCost + b.depotMissionCost;
}

export function getDispatchCostFromCalc(calc: Record<string, unknown>): number {
    const b = getTourCostBreakdown(calc);
    return Math.max(0, sumMainDriverBreakdown(b) + sumHelperDriverBreakdown(b) - getDepotCostFromCalc(calc));
}

export function getDispatchKilometersFromCalc(calc: Record<string, unknown>): number {
    const approved = n(calc, 'approved_kilometers', 'approvedKilometers');
    const excess = n(calc, 'excess_kilometers', 'excessKilometers');
    if (approved + excess > 0) return approved + excess;
    const total = getTotalKilometersFromCalculation(
        calc as Parameters<typeof getTotalKilometersFromCalculation>[0]
    );
    const depot = n(calc, 'depot_total_mileage', 'depotTotalMileage');
    return Math.max(0, total - depot);
}

function normalizePlaceKey(value: string): string {
    return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function getLastDestinationFromCalc(
    calc: Record<string, unknown>,
    cityProvinceMap?: Map<string, string>
): { city: string; province: string } {
    const raw = calc.destinations;
    let city = '';
    let province = '';
    if (Array.isArray(raw) && raw.length > 0) {
        const last = raw[raw.length - 1];
        if (typeof last === 'string') {
            city = last.trim();
        } else if (last && typeof last === 'object') {
            const obj = last as { city?: string; province?: string };
            city = String(obj.city || '').trim();
            province = String(obj.province || '').trim();
        }
    } else if (typeof raw === 'string' && raw.trim()) {
        const parts = raw.split(/[-،,]/).map((p) => p.trim()).filter(Boolean);
        city = parts[parts.length - 1] || '';
    }
    if (!city) city = 'نامشخص';
    if (!province && cityProvinceMap) {
        province = cityProvinceMap.get(normalizePlaceKey(city)) || '';
    }
    if (!province) province = 'نامشخص';
    return { city, province };
}

export interface GeoCostRow {
    level: 'استان' | 'شهر' | 'جمع کل';
    province: string;
    city: string;
    tourCount: number;
    kilometers: number;
    dispatchCost: number;
    costPerKm: number;
    costPerTour: number;
}

export function buildGeoDispatchCostRows(
    calculations: Record<string, unknown>[],
    cityProvinceMap?: Map<string, string>
): GeoCostRow[] {
    type Agg = { tourCount: number; kilometers: number; dispatchCost: number };
    const empty = (): Agg => ({ tourCount: 0, kilometers: 0, dispatchCost: 0 });
    const provinces = new Map<string, Agg>();
    const cities = new Map<string, Agg & { province: string; city: string }>();

    for (const calc of calculations) {
        const dest = getLastDestinationFromCalc(calc, cityProvinceMap);
        const km = getDispatchKilometersFromCalc(calc);
        const cost = getDispatchCostFromCalc(calc);
        const p = provinces.get(dest.province) || empty();
        p.tourCount += 1;
        p.kilometers += km;
        p.dispatchCost += cost;
        provinces.set(dest.province, p);

        const cityKey = `${dest.province}|||${dest.city}`;
        const c = cities.get(cityKey) || { ...empty(), province: dest.province, city: dest.city };
        c.tourCount += 1;
        c.kilometers += km;
        c.dispatchCost += cost;
        cities.set(cityKey, c);
    }

    const perKm = (agg: Agg) => (agg.kilometers > 0 ? Math.round(agg.dispatchCost / agg.kilometers) : 0);
    const perTour = (agg: Agg) => (agg.tourCount > 0 ? Math.round(agg.dispatchCost / agg.tourCount) : 0);
    const toRow = (
        level: GeoCostRow['level'],
        province: string,
        city: string,
        agg: Agg
    ): GeoCostRow => ({
        level,
        province,
        city,
        tourCount: agg.tourCount,
        kilometers: agg.kilometers,
        dispatchCost: agg.dispatchCost,
        costPerKm: perKm(agg),
        costPerTour: perTour(agg),
    });

    const provinceList = Array.from(provinces.entries()).sort((a, b) => perKm(b[1]) - perKm(a[1]));
    const rows: GeoCostRow[] = [];
    for (const [province, pagg] of provinceList) {
        rows.push(toRow('استان', province, '', pagg));
        const cityRows = Array.from(cities.values())
            .filter((c) => c.province === province)
            .sort((a, b) => perKm(b) - perKm(a));
        cityRows.forEach((c) => rows.push(toRow('شهر', c.province, c.city, c)));
    }
    if (rows.length > 0) {
        const total = empty();
        provinces.forEach((p) => {
            total.tourCount += p.tourCount;
            total.kilometers += p.kilometers;
            total.dispatchCost += p.dispatchCost;
        });
        rows.push(toRow('جمع کل', 'جمع کل', '', total));
    }
    return rows;
}

export function aggregateBreakdownByDriver(
    calculations: Record<string, unknown>[],
    summaries: DriverCommissionSummary[] = []
): Map<string, TourCostBreakdown> {
    const map = new Map<string, TourCostBreakdown>();
    for (const calc of calculations) {
        const driverId = String(calc.driver_id ?? calc.driverId ?? '');
        if (!driverId) continue;
        const next = getTourCostBreakdown(calc);
        const prev = map.get(driverId);
        map.set(driverId, prev ? addTourCostBreakdown(prev, next) : next);
    }
    summaries.forEach((summary) => {
        const existing = map.get(summary.driverId) || emptyTourCostBreakdown();
        existing.porsantTourCost = summary.totalCommission;
        map.set(summary.driverId, existing);
    });
    return map;
}

export function resolveLineLabel(calc: Record<string, unknown>): string {
    const raw = String(calc.line_type ?? calc.lineType ?? '').trim();
    if (!raw) return 'نامشخص';
    const v = raw.toLowerCase();
    if (v === 'icecream' || raw.includes('بستنی')) return 'بستنی';
    if (v === 'dairy' || raw.includes('پاستوریزه')) return 'پاستوریزه';
    if (v === 'ambient' || raw.includes('فروتلند') || raw.includes('لبنیات')) return 'لبنیات-فروتلند';
    return raw;
}

export type KmBandKey = '0-1500' | '1500-2750' | '2750-4000' | '4000+';

export function getKmBand(km: number): KmBandKey {
    if (km <= 1500) return '0-1500';
    if (km <= 2750) return '1500-2750';
    if (km <= 4000) return '2750-4000';
    return '4000+';
}

export interface LineVehicleStatRow {
    line: string;
    vehicleType: string;
    tourCount: number;
    returnTourCount: number;
    helperTourCount: number;
    band0to1500: number;
    band1500to2750: number;
    band2750to4000: number;
    band4000plus: number;
}

const LINE_ORDER = ['بستنی', 'پاستوریزه', 'لبنیات-فروتلند', 'نامشخص'];

function emptyLineVehicleStat(line: string, vehicleType: string): LineVehicleStatRow {
    return {
        line,
        vehicleType,
        tourCount: 0,
        returnTourCount: 0,
        helperTourCount: 0,
        band0to1500: 0,
        band1500to2750: 0,
        band2750to4000: 0,
        band4000plus: 0,
    };
}

function addLineVehicleStat(target: LineVehicleStatRow, source: LineVehicleStatRow) {
    target.tourCount += source.tourCount;
    target.returnTourCount += source.returnTourCount;
    target.helperTourCount += source.helperTourCount;
    target.band0to1500 += source.band0to1500;
    target.band1500to2750 += source.band1500to2750;
    target.band2750to4000 += source.band2750to4000;
    target.band4000plus += source.band4000plus;
}

export function buildLineVehicleStatRows(calculations: Record<string, unknown>[]): LineVehicleStatRow[] {
    const map = new Map<string, LineVehicleStatRow>();
    for (const calc of calculations) {
        const line = resolveLineLabel(calc);
        const vehicleType = categorizeVehicleType(resolveVehicleType(calc));
        const key = `${line}|||${vehicleType}`;
        const row = map.get(key) || emptyLineVehicleStat(line, vehicleType);
        row.tourCount += 1;
        if (getReturnCargoCostFromCalc(calc) > 0) row.returnTourCount += 1;
        if (tourHasHelperFromCalc(calc)) row.helperTourCount += 1;
        const band = getKmBand(getDispatchKilometersFromCalc(calc));
        if (band === '0-1500') row.band0to1500 += 1;
        else if (band === '1500-2750') row.band1500to2750 += 1;
        else if (band === '2750-4000') row.band2750to4000 += 1;
        else row.band4000plus += 1;
        map.set(key, row);
    }

    const rows: LineVehicleStatRow[] = [];
    const grand = emptyLineVehicleStat('جمع کل', '');
    LINE_ORDER.forEach((line) => {
        const lineRows = VEHICLE_CATEGORY_ORDER.map((v) => map.get(`${line}|||${v}`)).filter(
            (row): row is LineVehicleStatRow => Boolean(row) && row.tourCount > 0
        );
        if (lineRows.length === 0) return;
        const lineTotal = emptyLineVehicleStat(line, 'جمع لاین');
        lineRows.forEach((row) => {
            rows.push(row);
            addLineVehicleStat(lineTotal, row);
            addLineVehicleStat(grand, row);
        });
        rows.push(lineTotal);
    });
    if (grand.tourCount > 0) rows.push(grand);
    return rows;
}

export interface VehicleTypePivotRow {
    vehicleType: string;
    tourCount: number;
    returnTourCount: number;
    totalKilometers: number;
    mainDriverCost: number;
    helperTourCount: number;
    helperCost: number;
}

export function buildVehicleTypePivot(calculations: Record<string, unknown>[]): VehicleTypePivotRow[] {
    const map = new Map<string, VehicleTypePivotRow>();
    const ensureRow = (vehicleType: string): VehicleTypePivotRow => {
        const existing = map.get(vehicleType);
        if (existing) return existing;
        const created: VehicleTypePivotRow = {
            vehicleType,
            tourCount: 0,
            returnTourCount: 0,
            totalKilometers: 0,
            mainDriverCost: 0,
            helperTourCount: 0,
            helperCost: 0,
        };
        map.set(vehicleType, created);
        return created;
    };

    for (const calc of calculations) {
        const vehicleType = categorizeVehicleType(resolveVehicleType(calc));
        const row = ensureRow(vehicleType);
        row.tourCount += 1;
        if (getReturnCargoCostFromCalc(calc) > 0) row.returnTourCount += 1;
        row.totalKilometers += getTotalKilometersFromCalculation(
            calc as Parameters<typeof getTotalKilometersFromCalculation>[0]
        );
        const breakdown = getTourCostBreakdown(calc);
        row.mainDriverCost += sumMainDriverBreakdown(breakdown);
        if (tourHasHelperFromCalc(calc)) {
            row.helperTourCount += 1;
            row.helperCost += sumHelperDriverBreakdown(breakdown);
        }
    }

    const rows = VEHICLE_CATEGORY_ORDER.map((name) => map.get(name)).filter(
        (row): row is VehicleTypePivotRow => Boolean(row) && row.tourCount > 0
    );
    if (rows.length === 0) return rows;
    rows.push({
        vehicleType: 'جمع کل',
        tourCount: rows.reduce((s, r) => s + r.tourCount, 0),
        returnTourCount: rows.reduce((s, r) => s + r.returnTourCount, 0),
        totalKilometers: rows.reduce((s, r) => s + r.totalKilometers, 0),
        mainDriverCost: rows.reduce((s, r) => s + r.mainDriverCost, 0),
        helperTourCount: rows.reduce((s, r) => s + r.helperTourCount, 0),
        helperCost: rows.reduce((s, r) => s + r.helperCost, 0),
    });
    return rows;
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
        const foodCostVal = n(calc, 'food_cost', 'foodCost');
        const fuelCostVal = n(calc, 'fuel_cost', 'fuelCost');
        const returnCostVal = getReturnCargoCostFromCalc(calc);
        const multiUnloadCostVal = n(calc, 'multi_unload_cost', 'multiUnloadCost');
        const helperCostVal = getHelperCostFromCalc(calc);
        const mainCostVal = getMainDriverCostFromCalc(calc);
        const hasReturn = returnCostVal > 0;
        const hasMultiUnload =
            multiUnloadCostVal > 0 || n(calc, 'multi_unload_count', 'multiUnloadCount') > 0;
        const hasHelper = tourHasHelperFromCalc(calc);
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
            existing.returnTourCount += hasReturn ? 1 : 0;
            existing.multiUnloadTourCount += hasMultiUnload ? 1 : 0;
            existing.helperTourCount += hasHelper ? 1 : 0;
            existing.totalMainDriverCost += mainCostVal;

            if (existing.queueType === 'porsant' && queueType === 'fixed_allowance') {
                existing.queueType = 'mixed';
            } else if (existing.queueType === 'fixed_allowance' && queueType === 'porsant') {
                existing.queueType = 'mixed';
            }

            existing.totalFoodCost += foodCostVal;
            existing.totalFuelCost += fuelCostVal;
            existing.totalTollCost += Number(calc.toll_cost ?? calc.tollCost) || 0;
            existing.totalLoadingCost += Number(calc.loading_cost ?? calc.loadingCost) || 0;
            existing.totalReturnCargoCost += returnCostVal;
            existing.totalReturnBillOfLadingCost +=
                Number(calc.return_bill_of_lading_cost ?? calc.returnBillOfLadingCost) || 0;
            existing.totalMultiUnloadCost += multiUnloadCostVal;
            existing.totalExcessMissionCost += Number(calc.excess_mission_cost ?? calc.excessMissionCost) || 0;
            existing.totalHelperDriverCost += helperCostVal;

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
                totalFoodCost: foodCostVal,
                totalFuelCost: fuelCostVal,
                totalTollCost: Number(calc.toll_cost ?? calc.tollCost) || 0,
                totalLoadingCost: Number(calc.loading_cost ?? calc.loadingCost) || 0,
                totalReturnCargoCost: returnCostVal,
                totalReturnBillOfLadingCost:
                    Number(calc.return_bill_of_lading_cost ?? calc.returnBillOfLadingCost) || 0,
                totalMultiUnloadCost: multiUnloadCostVal,
                totalExcessMissionCost: Number(calc.excess_mission_cost ?? calc.excessMissionCost) || 0,
                totalHelperDriverCost: helperCostVal,
                returnTourCount: hasReturn ? 1 : 0,
                multiUnloadTourCount: hasMultiUnload ? 1 : 0,
                helperTourCount: hasHelper ? 1 : 0,
                totalMainDriverCost: mainCostVal,
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
