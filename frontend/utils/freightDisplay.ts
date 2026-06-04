import { Destination, Driver, FreightAnnouncement, FreightLineType, PersonalDriver, Vehicle } from '../types';
import { formatPlateNumber } from './jalali';

/** تب مجزا برای تخصیص شخصی بدون شماره بارنامه */
export const PENDING_BILL_OF_LADING_TAB = '__pending_bill_of_lading__' as const;
export type TransportLiveTab = FreightLineType | typeof PENDING_BILL_OF_LADING_TAB;

export function isPendingBillOfLadingTab(tab: TransportLiveTab): tab is typeof PENDING_BILL_OF_LADING_TAB {
    return tab === PENDING_BILL_OF_LADING_TAB;
}

/** همه شهرهای مقصد برای نمایش در جدول (یک یا چند مقصد) */
export function getDestinationCitiesLabel(
    ann: Pick<FreightAnnouncement, 'destinations'> | null | undefined
): string {
    const cities = (ann?.destinations || [])
        .map((d: Destination) => (d.city || '').trim())
        .filter(Boolean);
    return cities.length > 0 ? cities.join('، ') : '-';
}

/** پلاک از پاسخ خام API (ستون‌های JOIN) */
export function buildAssignedVehiclePlateFromApiRow(row: Record<string, unknown>): string | undefined {
    const p1 = row.plate_part1 as string | undefined;
    const letter = row.plate_letter as string | undefined;
    const p2 = row.plate_part2 as string | undefined;
    const city = row.plate_city_code as string | undefined;
    if (p1 && letter && p2) {
        return city ? `${p1}${letter}${p2}-${city}` : `${p1}${letter}${p2}`;
    }
    const plate =
        (row.vehicle_plate as string) ||
        (row.vehiclePlate as string) ||
        (row.assigned_vehicle_plate as string) ||
        undefined;
    return plate?.trim() || undefined;
}

type AssignmentAnn = Pick<
    FreightAnnouncement,
    'assignedDriverId' | 'assignedDriverName' | 'assignedDriverContact' | 'assignedVehicleId' | 'assignedVehiclePlate' | 'assignmentType'
>;

export function getAssignedDriverDisplayName(
    ann: AssignmentAnn,
    drivers: Array<Pick<Driver, 'id' | 'name'>> = [],
    personalDrivers: Array<Pick<PersonalDriver, 'id' | 'name'>> = []
): string {
    const fromAnn = (ann.assignedDriverName || '').trim();
    if (fromAnn) return fromAnn;
    const id = ann.assignedDriverId;
    if (!id) return '-';
    const driver = drivers.find((d) => d.id === id) || personalDrivers.find((d) => d.id === id);
    return (driver?.name || '').trim() || '-';
}

export function getAssignedDriverContact(
    ann: AssignmentAnn,
    drivers: Array<Pick<Driver, 'id' | 'mobile'>> = [],
    personalDrivers: Array<Pick<PersonalDriver, 'id' | 'mobile'>> = []
): string {
    const fromAnn = (ann.assignedDriverContact || '').trim();
    if (fromAnn) return fromAnn;
    const id = ann.assignedDriverId;
    if (!id) return '-';
    const driver = drivers.find((d) => d.id === id) || personalDrivers.find((d) => d.id === id);
    return (driver?.mobile || '').trim() || '-';
}

export function formatCompanyVehiclePlate(vehicle: Vehicle): string {
    if (vehicle.plateNumber) {
        const formatted = formatPlateNumber(vehicle.plateNumber);
        if (formatted) return formatted;
    }
    return vehicle.serialNumber || (vehicle as Vehicle & { vehicleCode?: string }).vehicleCode || 'نامشخص';
}

/** فیلدهای تخصیص از پاسخ API (شامل payloadهای SSE و snake/camel case) */
export function pickAssignmentFieldsFromApi(a: Record<string, unknown>) {
    const driverName =
        (a.resolved_driver_name as string) ||
        (a.assigned_driver_name as string) ||
        (a.assignedDriverName as string) ||
        (a.driverName as string) ||
        undefined;
    const driverContact =
        (a.resolved_driver_contact as string) ||
        (a.assigned_driver_contact as string) ||
        (a.assignedDriverContact as string) ||
        (a.driverContact as string) ||
        undefined;

    return {
        assignmentType: (a.assignment_type || a.assignmentType || a.detected_assignment_type) as
            | 'company'
            | 'personal'
            | undefined,
        assignedDriverId: (a.assigned_driver_id || a.assignedDriverId || a.driverId) as string | undefined,
        assignedVehicleId: (a.assigned_vehicle_id || a.assignedVehicleId || a.vehicleId) as string | undefined,
        assignedDriverName: driverName,
        assignedDriverContact: driverContact,
        assignedVehiclePlate:
            buildAssignedVehiclePlateFromApiRow(a) ||
            ((a.vehiclePlate as string) || (a.vehicle_plate as string) || undefined),
        billOfLadingNumber: (a.bill_of_lading_number ?? a.billOfLadingNumber) as string | undefined,
        totalFreightCost: (a.total_freight_cost ?? a.totalFreightCost) as number | undefined,
        awaitingBillOfLadingAt: (a.awaiting_bill_of_lading_at ?? a.awaitingBillOfLadingAt) as
            | string
            | Date
            | undefined,
    };
}

const pickNonEmptyText = (incoming?: string | null, previous?: string | null): string | undefined => {
    const next = (incoming ?? '').toString().trim();
    if (next) return next;
    const prev = (previous ?? '').toString().trim();
    return prev || undefined;
};

/** حفظ نمایش تخصیص اگر refresh/API فیلدها را خالی برگرداند */
export function mergeAssignmentDisplayFields(
    incoming: FreightAnnouncement,
    previous?: FreightAnnouncement | null
): FreightAnnouncement {
    if (!previous || previous.id !== incoming.id) return incoming;
    return {
        ...incoming,
        assignedDriverId: incoming.assignedDriverId || previous.assignedDriverId,
        assignedVehicleId: incoming.assignedVehicleId || previous.assignedVehicleId,
        assignedDriverName: pickNonEmptyText(incoming.assignedDriverName, previous.assignedDriverName),
        assignedDriverContact: pickNonEmptyText(incoming.assignedDriverContact, previous.assignedDriverContact),
        assignedVehiclePlate: pickNonEmptyText(incoming.assignedVehiclePlate, previous.assignedVehiclePlate),
        billOfLadingNumber: pickNonEmptyText(incoming.billOfLadingNumber, previous.billOfLadingNumber),
        totalFreightCost: incoming.totalFreightCost ?? previous.totalFreightCost,
    };
}

/** نوع عملیاتی خودرو از رکورد vehicles */
export function getVehicleOperationalType(vehicle: Record<string, unknown> | null | undefined): string {
    if (!vehicle) return '';
    return String(
        vehicle.currentVehicleType ||
            vehicle.current_vehicle_type ||
            vehicle.vehicleType ||
            vehicle.type ||
            vehicle.vehicleCategory ||
            vehicle.vehicle_category ||
            ''
    ).trim();
}

/** تطابق نوع خودرو تخصیصی با نوع اعلام‌شده در بار */
export function checkVehicleMatchesAnnouncement(
    announcementVehicleType: string | undefined,
    vehicle: Record<string, unknown> | null | undefined
): { ok: boolean; message?: string } {
    const annType = (announcementVehicleType || '').trim();
    const vehicleType = getVehicleOperationalType(vehicle);
    if (!annType || !vehicleType) return { ok: true };

    if (annType === 'تریلی' || annType === 'مینی تریلی') {
        if (vehicleType !== 'کشنده') {
            return {
                ok: false,
                message: `این اعلام بار برای «${annType}» است؛ باید خودروی «کشنده» تخصیص دهید (نوع خودروی انتخاب‌شده: «${vehicleType}»).`,
            };
        }
    } else if (annType === 'ده چرخ' && vehicleType !== 'ده چرخ') {
        return {
            ok: false,
            message: `این اعلام بار برای «ده چرخ» است؛ باید خودروی «ده چرخ» تخصیص دهید (نوع خودروی انتخاب‌شده: «${vehicleType}»).`,
        };
    }
    return { ok: true };
}

export function isPersonalAssignmentType(assignmentType?: string | null): boolean {
    return assignmentType === 'personal' || assignmentType === 'شخصی';
}

export function hasDriverAndVehicleAssigned(ann: Pick<FreightAnnouncement, 'assignedDriverId' | 'assignedVehicleId'>): boolean {
    return Boolean(ann.assignedDriverId && ann.assignedVehicleId);
}

export function hasBillOfLadingNumber(ann: Pick<FreightAnnouncement, 'billOfLadingNumber'>): boolean {
    return Boolean((ann.billOfLadingNumber || '').toString().trim());
}

export function hasAwaitingBillOfLadingAfterFinalize(
    ann: Pick<FreightAnnouncement, 'awaitingBillOfLadingAt'>
): boolean {
    return Boolean(ann.awaitingBillOfLadingAt);
}

/** شخصی + تخصیص کامل + در صف بارنامه (پس از اتمام تخصیص بدون بارنامه) — تا «اتمام تخصیص» نهایی بماند حتی اگر بارنامه ثبت شده باشد */
export function isPendingBillOfLading(ann: FreightAnnouncement): boolean {
    return (
        isPersonalAssignmentType(ann.assignmentType) &&
        hasDriverAndVehicleAssigned(ann) &&
        hasAwaitingBillOfLadingAfterFinalize(ann)
    );
}

export function matchesFreightLine(ann: FreightAnnouncement, line: FreightLineType): boolean {
    const lt = ann.lineType as string;
    if (line === FreightLineType.IceCream) {
        return lt === FreightLineType.IceCream || lt === 'IceCream' || lt === 'بستنی';
    }
    if (line === FreightLineType.Dairy) {
        return lt === FreightLineType.Dairy || lt === 'Dairy' || lt === 'پاستوریزه';
    }
    if (line === FreightLineType.Ambient) {
        return lt === FreightLineType.Ambient || lt === 'Ambient' || lt === 'لبنیات-فروتلند';
    }
    return lt === line;
}

export function lineTypeToBackend(line: FreightLineType | string): string {
    if (line === FreightLineType.IceCream || line === 'بستنی' || line === 'IceCream') return 'IceCream';
    if (line === FreightLineType.Dairy || line === 'پاستوریزه' || line === 'Dairy') return 'Dairy';
    if (line === FreightLineType.Ambient || line === 'لبنیات-فروتلند' || line === 'Ambient') return 'Ambient';
    return String(line);
}

export function lineTypeFromAnnouncement(ann: FreightAnnouncement): string {
    return lineTypeToBackend(ann.lineType as string);
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toPersianDigits(value: string): string {
    return value.replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
}

/** پارس امن عدد (فارسی/انگلیسی، جداکننده هزارگان) */
export function parseNumericField(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let s = String(value).trim();
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    persianDigits.forEach((p, i) => {
        s = s.split(p).join(String(i));
    });
    arabicDigits.forEach((p, i) => {
        s = s.split(p).join(String(i));
    });
    s = s.replace(/٬/g, '').replace(/\s/g, '');

    // فرمت اروپایی: 12.000 یا 12.000,50 (هزارگان با نقطه)
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }

    // فقط یک جداکننده اعشار
    s = s.replace(/٫/g, '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

/** نمایش عدد با جداکننده هزارگان فارسی — بدون باگ locale (مثل / به‌جای ممیز) */
export function formatPersianGroupedNumber(value: number, maxDecimals = 0): string {
    if (!Number.isFinite(value)) return '-';
    const rounded =
        maxDecimals > 0 ? Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals : Math.round(value);
    const isWhole = maxDecimals === 0 || Math.abs(rounded - Math.round(rounded)) < 1e-6;
    let raw: string;
    if (isWhole) {
        raw = String(Math.round(rounded));
    } else {
        raw = rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
    }
    const [intPart, decPart] = raw.split('.');
    const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '،');
    const combined = decPart != null && decPart.length > 0 ? `${groupedInt}٫${decPart}` : groupedInt;
    return toPersianDigits(combined);
}

/** جمع تناژ مقاصد (کیلوگرم) — بدون خطای اعشار شناور */
export function sumDestinationTonnageKg(
    destinations: ReadonlyArray<Pick<Destination, 'tonnage'>> = []
): number {
    const sum = destinations.reduce((acc, d) => acc + parseNumericField(d.tonnage), 0);
    return Math.round(sum * 1000) / 1000;
}

/** نمایش تناژ کیلوگرم — بدون ممیز اضافی وقتی عدد صحیح است */
export function formatTonnageKg(tonnageKg: number): string {
    if (!Number.isFinite(tonnageKg) || tonnageKg <= 0) return '-';
    const rounded = Math.round(tonnageKg * 1000) / 1000;
    const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-6;
    return formatPersianGroupedNumber(isWhole ? Math.round(rounded) : rounded, isWhole ? 0 : 3);
}

export function formatTotalTonnageFromDestinations(
    destinations: ReadonlyArray<Pick<Destination, 'tonnage'>> = []
): string {
    const sum = sumDestinationTonnageKg(destinations);
    if (sum <= 0) return '-';
    return formatTonnageKg(sum);
}

/** هدر ستون کرایه — واحد «ریال» فقط در عنوان */
export const TOTAL_FREIGHT_HEADER = 'کرایه کل (ریال)';

/** مقدار مبلغ در سلول جدول — همان فرمت `toLocaleString('fa-IR')` مثل ستون ارزش بار */
export function formatFreightAmountCell(amount?: number | string | null): string {
    const numAmount = parseNumericField(amount);
    if (numAmount <= 0) return '-';
    return Math.round(numAmount).toLocaleString('fa-IR');
}

export function getAssignedVehiclePlate(
    ann: AssignmentAnn,
    vehicles: Vehicle[] = [],
    personalVehicles: Array<{
        id: string;
        platePart1?: string;
        plateLetter?: string;
        platePart2?: string;
        plateCityCode?: string;
    }> = []
): string {
    const fromAnn = (ann.assignedVehiclePlate || '').trim();
    if (fromAnn && fromAnn !== '-') return fromAnn;
    const id = ann.assignedVehicleId;
    if (!id) return '-';

    const companyVehicle = vehicles.find((v) => v.id === id);
    if (companyVehicle) return formatCompanyVehiclePlate(companyVehicle);

    const personalV = personalVehicles.find((v) => v.id === id);
    if (personalV?.platePart1 && personalV.plateLetter && personalV.platePart2) {
        const base = `${personalV.platePart1}${personalV.plateLetter}${personalV.platePart2}`;
        return personalV.plateCityCode ? `${base}-${personalV.plateCityCode}` : base;
    }

    return '-';
}
