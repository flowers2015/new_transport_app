import { Destination, Driver, FreightAnnouncement, FreightAnnouncementStatus, FreightLineType, PersonalDriver, Vehicle } from '../types';
import { formatPlateNumber, jalaliCalendarDayDiff } from './jalali';

/** نوع نماینده — همیشه فارسی برای UI و اکسل */
export function formatRepresentativeType(value?: string | null): string {
    if (!value) return '-';
    const v = String(value).trim().toLowerCase();
    if (v === 'distributor' || v === 'distribution' || v === 'پخش') return 'پخش';
    if (v === 'depot' || v === 'دپو') return 'دپو';
    if (v === 'agent' || v === 'representative' || v === 'نماینده') return 'نماینده';
    if (value === 'پخش' || value === 'نماینده' || value === 'دپو') return value;
    return String(value);
}

/** نوع بارگیری بستنی — تک مبدا / دو مبدا (فقط از فیلد loading_type یا مبدا با « و ») */
export function formatLoadingType(
    value?: string | null,
    ann?: Pick<FreightAnnouncement, 'originCity'>
): string {
    const raw = String(value || '').trim();
    const v = raw.toLowerCase();
    if (v === 'double' || raw.includes('دو مبدا')) return 'دو مبدا بارگیری';
    if (v === 'single' || raw.includes('تک مبدا')) return 'تک مبدا';

    const origin = (ann?.originCity || '').trim();
    if (origin.includes(' و ')) return 'دو مبدا بارگیری';

    return 'تک مبدا';
}

const EXCEL_EN_FA: Record<string, string> = {
    distributor: 'پخش',
    distribution: 'پخش',
    depot: 'دپو',
    agent: 'نماینده',
    representative: 'نماینده',
    single: 'تک مبدا',
    double: 'دو مبدا بارگیری',
    low: 'کم اهمیت',
    normal: 'عادی',
    high: 'فوری',
    urgent: 'فوری',
    open: 'باز',
    'in progress': 'در حال بررسی',
    in_progress: 'در حال بررسی',
    closed: 'بسته شده',
    resolved: 'پاسخ داده شده',
    company: 'شرکتی',
    personal: 'شخصی',
    stage1: 'مرحله ۱',
    stage2: 'مرحله ۲',
    hybrid: 'هیبرید',
    manual: 'دستی',
    auto: 'خودکار',
    semi_auto: 'نیمه‌خودکار',
};

/** تبدیل مقادیر انگلیسی رایج به فارسی در خروجی اکسل */
export function localizeExcelValue(value: unknown): string | number {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const raw = String(value).trim();
    if (!raw) return '';
    const key = raw.toLowerCase();
    if (EXCEL_EN_FA[key]) return EXCEL_EN_FA[key];
    if (key.includes('distributor')) return 'پخش';
    if (key === 'agent') return 'نماینده';
    return raw;
}

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

function resolveDestinationRepTypeLabel(
    ann: Pick<FreightAnnouncement, 'representativeType' | 'representativeName'>,
    dest: Pick<Destination, 'representativeType' | 'representativeName'>
): string {
    const fromDest = formatRepresentativeType(dest.representativeType);
    if (fromDest !== '-') return fromDest;

    const fromAnn = formatRepresentativeType(ann.representativeType);
    if (fromAnn !== '-') return fromAnn;

    return '';
}

/** نوع نماینده هر مقصد — فقط از فیلد representativeType (نه حدس از نام) */
export { resolveDestinationRepTypeLabel };

/** ستون «مقاصد» فشرده پاستوریزه/لبنیات — خروجی اکسل بدون وابستگی به React */
export function formatCompactDestinationsForExcel(
    ann: Pick<FreightAnnouncement, 'representativeType' | 'representativeName' | 'destinations'>
): string {
    const destinations = ann.destinations || [];
    if (!destinations.length) return '-';

    return destinations
        .map((d) => {
            const destRepType = resolveDestinationRepTypeLabel(ann, d);
            const city = (d.city || '').trim() || '-';
            const tonnage = d.tonnage ? formatTonnageKgFromRaw(d.tonnage) : '';
            const deliveryDate = String((d as Destination & { deliveryDate?: string }).deliveryDate || '').trim();
            const unloadTime = (d.unloadTime || '').trim();

            let part = destRepType ? `(${destRepType}) ${city}` : city;
            if (tonnage && tonnage !== '-') part += ` (${tonnage})`;
            if (deliveryDate) part += ` ${deliveryDate}`;
            if (unloadTime) part += ` ${unloadTime}`;
            return part;
        })
        .join('، ');
}

/** نام نماینده/پخش — سطح اعلام بار (بستنی) یا تجمیع مقاصد (پاستوریزه/لبنیات) */
export function getRepresentativeNameLabel(
    ann: Pick<FreightAnnouncement, 'representativeName' | 'destinations'> | null | undefined
): string {
    const fromAnn = (ann?.representativeName || '').trim();
    if (fromAnn) return fromAnn;
    const names = (ann?.destinations || [])
        .map((d: Destination) => (d.representativeName || '').trim())
        .filter(Boolean);
    const unique = [...new Set(names)];
    return unique.length > 0 ? unique.join('، ') : '-';
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
    if (
        isDairyAmbientPlaceholderAssignment(ann as FreightAnnouncement)
    ) {
        return '-';
    }
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

export function isPendingAssignmentStatus(status?: string | null): boolean {
    return (
        status === FreightAnnouncementStatus.PendingCompanyAssignment ||
        status === FreightAnnouncementStatus.PendingPersonalAssignment ||
        status === 'PendingCompanyAssignment' ||
        status === 'PendingPersonalAssignment'
    );
}

/** پاک‌سازی فیلدهای تخصیص پس از لغو یا بازگشت به صف — کرایه/باربری ارجاع‌شده حفظ می‌شود */
export function clearAssignmentFromAnnouncement(
    ann: FreightAnnouncement,
    overrides: Partial<FreightAnnouncement> = {}
): FreightAnnouncement {
    const handoffFreightLocked =
        isWithCarrierHandoff(ann) || Boolean(ann.freightCostLockedAt);
    return {
        ...ann,
        ...overrides,
        assignedDriverId: undefined,
        assignedVehicleId: undefined,
        assignedDriverName: undefined,
        assignedDriverContact: undefined,
        assignedVehiclePlate: undefined,
        carrierName: handoffFreightLocked ? ann.carrierName : undefined,
        billOfLadingNumber: undefined,
        totalFreightCost: handoffFreightLocked ? ann.totalFreightCost : undefined,
        awaitingBillOfLadingAt: undefined,
        assignmentFinalizedAt: undefined,
        destinations: handoffFreightLocked
            ? ann.destinations || []
            : (ann.destinations || []).map((d) => ({ ...d, freightCost: undefined })),
    };
}

function readOptionalAssignmentId(value: unknown): string | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    return String(value);
}

function readOptionalAssignmentText(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const s = String(value).trim();
    return s || undefined;
}

/** فیلدهای تخصیص از پاسخ API (شامل payloadهای SSE و snake/camel case) */
export function pickAssignmentFieldsFromApi(a: Record<string, unknown>) {
    const driverName =
        readOptionalAssignmentText(a.assigned_driver_name) ||
        readOptionalAssignmentText(a.assignedDriverName) ||
        readOptionalAssignmentText(a.resolved_driver_name) ||
        readOptionalAssignmentText(a.driverName);
    const driverContact =
        readOptionalAssignmentText(a.resolved_driver_contact) ||
        readOptionalAssignmentText(a.assigned_driver_contact) ||
        readOptionalAssignmentText(a.assignedDriverContact) ||
        readOptionalAssignmentText(a.driverContact);

    const plateFromRow = buildAssignedVehiclePlateFromApiRow(a);
    const assignedVehiclePlate =
        plateFromRow ||
        readOptionalAssignmentText(a.vehiclePlate) ||
        readOptionalAssignmentText(a.vehicle_plate);

    const rawFreight = a.total_freight_cost ?? a.totalFreightCost;
    const totalFreightCost =
        rawFreight === null || rawFreight === undefined
            ? undefined
            : (() => {
                  const n = Number(rawFreight);
                  return Number.isFinite(n) && n > 0 ? n : undefined;
              })();

    const rawTariff = a.tariff_freight_cost ?? a.tariffFreightCost;
    const tariffFreightCost =
        rawTariff === null || rawTariff === undefined
            ? undefined
            : (() => {
                  const n = Number(rawTariff);
                  return Number.isFinite(n) && n > 0 ? n : undefined;
              })();

    return {
        assignmentType: (a.assignment_type || a.assignmentType || a.detected_assignment_type) as
            | 'company'
            | 'personal'
            | undefined,
        assignedDriverId: readOptionalAssignmentId(
            a.assigned_driver_id ?? a.assignedDriverId ?? a.driverId
        ),
        assignedVehicleId: readOptionalAssignmentId(
            a.assigned_vehicle_id ?? a.assignedVehicleId ?? a.vehicleId
        ),
        assignedDriverName: driverName,
        assignedDriverContact: driverContact,
        assignedVehiclePlate,
        carrierName: readOptionalAssignmentText(a.carrier_name ?? a.carrierName),
        handoffStatus: (a.handoff_status ?? a.handoffStatus) as
            | 'with_carrier'
            | 'returned'
            | 'carrier_done'
            | null
            | undefined,
        handoffCarrierId: readOptionalAssignmentId(a.handoff_carrier_id ?? a.handoffCarrierId),
        handoffCarrierName: readOptionalAssignmentText(a.handoff_carrier_name ?? a.handoffCarrierName),
        freightCostLockedAt:
            a.freight_cost_locked_at === null || a.freightCostLockedAt === null
                ? undefined
                : ((a.freight_cost_locked_at ?? a.freightCostLockedAt) as string | Date | undefined),
        billOfLadingNumber: readOptionalAssignmentText(
            a.bill_of_lading_number ?? a.billOfLadingNumber
        ),
        totalFreightCost,
        tariffFreightCost,
        awaitingBillOfLadingAt:
            a.awaiting_bill_of_lading_at === null || a.awaitingBillOfLadingAt === null
                ? undefined
                : ((a.awaiting_bill_of_lading_at ?? a.awaitingBillOfLadingAt) as string | Date | undefined),
    };
}

const pickNonEmptyText = (incoming?: string | null, previous?: string | null): string | undefined => {
    const next = (incoming ?? '').toString().trim();
    if (next) return next;
    const prev = (previous ?? '').toString().trim();
    return prev || undefined;
};

/** حفظ نمایش تخصیص اگر refresh/API فیلدها را خالی برگرداند — مگر بازگشت به صف (لغو تخصیص) */
export function mergeAssignmentDisplayFields(
    incoming: FreightAnnouncement,
    previous?: FreightAnnouncement | null
): FreightAnnouncement {
    if (!previous || previous.id !== incoming.id) return incoming;

    const incomingPendingWithoutAssignment =
        isPendingAssignmentStatus(incoming.status) &&
        !incoming.assignedDriverId &&
        !incoming.assignedVehicleId;

    const handoffFreightLocked =
        isWithCarrierHandoff(incoming) || Boolean(incoming.freightCostLockedAt);

    const previousHasAssignment = Boolean(
        previous.assignedDriverId || previous.assignedVehicleId
    );

    // فقط وقتی قبلاً هم تخصیص نداشته، از روی refresh خالی پاک کن — نه برای بار ارجاع‌شده به باربری
    if (incomingPendingWithoutAssignment && !previousHasAssignment && !handoffFreightLocked) {
        return clearAssignmentFromAnnouncement(incoming);
    }

    // کش/API قدیمی: ردیف هنوز Pending است ولی UI تازه تخصیص دارد — تخصیص را نگه دار
    if (incomingPendingWithoutAssignment && previousHasAssignment) {
        return {
            ...incoming,
            status: previous.status,
            assignmentType: previous.assignmentType || incoming.assignmentType,
            assignedDriverId: previous.assignedDriverId,
            assignedVehicleId: previous.assignedVehicleId,
            assignedDriverName: pickNonEmptyText(previous.assignedDriverName, incoming.assignedDriverName),
            assignedDriverContact: pickNonEmptyText(
                previous.assignedDriverContact,
                incoming.assignedDriverContact
            ),
            assignedVehiclePlate: pickNonEmptyText(
                previous.assignedVehiclePlate,
                incoming.assignedVehiclePlate
            ),
            carrierName: pickNonEmptyText(previous.carrierName, incoming.carrierName),
            billOfLadingNumber: pickNonEmptyText(
                previous.billOfLadingNumber,
                incoming.billOfLadingNumber
            ),
            totalFreightCost: previous.totalFreightCost ?? incoming.totalFreightCost,
            tariffFreightCost: previous.tariffFreightCost ?? incoming.tariffFreightCost,
            handoffStatus: incoming.handoffStatus ?? previous.handoffStatus,
            handoffCarrierId: incoming.handoffCarrierId ?? previous.handoffCarrierId,
            handoffCarrierName: incoming.handoffCarrierName ?? previous.handoffCarrierName,
            freightCostLockedAt: incoming.freightCostLockedAt ?? previous.freightCostLockedAt,
            destinations:
                incoming.destinations?.length > 0 ? incoming.destinations : previous.destinations,
        };
    }

    return {
        ...incoming,
        status:
            incoming.status === FreightAnnouncementStatus.Assigned ||
            incoming.status === 'Assigned'
                ? incoming.status
                : previous.status === FreightAnnouncementStatus.Assigned ||
                    previous.status === 'Assigned'
                  ? previous.status
                  : incoming.status,
        assignmentType: incoming.assignmentType || previous.assignmentType,
        assignedDriverId: incoming.assignedDriverId || previous.assignedDriverId,
        assignedVehicleId: incoming.assignedVehicleId || previous.assignedVehicleId,
        assignedDriverName: pickNonEmptyText(incoming.assignedDriverName, previous.assignedDriverName),
        assignedDriverContact: pickNonEmptyText(incoming.assignedDriverContact, previous.assignedDriverContact),
        assignedVehiclePlate: pickNonEmptyText(incoming.assignedVehiclePlate, previous.assignedVehiclePlate),
        carrierName: pickNonEmptyText(incoming.carrierName, previous.carrierName),
        billOfLadingNumber: pickNonEmptyText(incoming.billOfLadingNumber, previous.billOfLadingNumber),
        totalFreightCost: incoming.totalFreightCost ?? previous.totalFreightCost,
        tariffFreightCost: incoming.tariffFreightCost ?? previous.tariffFreightCost,
        handoffStatus: incoming.handoffStatus ?? previous.handoffStatus,
        handoffCarrierId: incoming.handoffCarrierId ?? previous.handoffCarrierId,
        handoffCarrierName: incoming.handoffCarrierName ?? previous.handoffCarrierName,
        freightCostLockedAt: incoming.freightCostLockedAt ?? previous.freightCostLockedAt,
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

export function isCompanyAssignmentType(assignmentType?: string | null): boolean {
    return assignmentType === 'company' || assignmentType === 'شرکتی';
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

/** تخصیص شرکتی انجام‌شده در پیگیری زنده — برای گزارش بله */
export function isEligibleForCompanyBaleReport(ann: FreightAnnouncement): boolean {
    if (isPendingBillOfLading(ann)) return false;
    if (!isCompanyAssignmentType(ann.assignmentType)) return false;
    return hasDriverAndVehicleAssigned(ann);
}

/** نوع نماینده — سطح اعلام یا تجمیع مقاصد */
export function getRepresentativeTypesLabel(
    ann: Pick<FreightAnnouncement, 'representativeType' | 'destinations'> | null | undefined
): string {
    const fromAnn = formatRepresentativeType(ann?.representativeType);
    if (fromAnn !== '-') return fromAnn;
    const types = (ann?.destinations || [])
        .map((d) => formatRepresentativeType((d as Destination).representativeType))
        .filter((t) => t !== '-');
    const unique = [...new Set(types)];
    return unique.length > 0 ? unique.join('، ') : '-';
}

/** تماس/پلاک پیش‌فرض برای تخصیص شخصی لبنیات-فروتلند (فاز نام باربری) */
export const DAIRY_AMBIENT_PLACEHOLDER_MOBILE = '11';
export const DAIRY_AMBIENT_PLACEHOLDER_PLATE = '11ع111-11';

export function isDairyOrAmbientLineType(lineType?: string | null): boolean {
    const lt = String(lineType || '');
    return (
        lt === FreightLineType.Dairy ||
        lt === FreightLineType.Ambient ||
        lt === 'Dairy' ||
        lt === 'Ambient' ||
        lt === 'پاستوریزه' ||
        lt === 'لبنیات-فروتلند'
    );
}

export function isDairyAmbientPlaceholderAssignment(
    ann: Pick<
        FreightAnnouncement,
        'lineType' | 'assignmentType' | 'assignedDriverContact' | 'assignedVehiclePlate'
    >
): boolean {
    if (!isDairyAmbientPersonalIsolatedAssignment(ann)) return false;
    const contact = (ann.assignedDriverContact || '').replace(/\D/g, '');
    const plate = (ann.assignedVehiclePlate || '').replace(/\s/g, '');
    return contact === DAIRY_AMBIENT_PLACEHOLDER_MOBILE && plate.includes('11ع111');
}

/** تخصیص واقعی راننده (نه فاز نام باربری با ۱۱) — شامل تخصیص باربری پس از اتمام */
export function hasRealPersonalDriverAssignment(
    ann: Pick<
        FreightAnnouncement,
        | 'lineType'
        | 'assignmentType'
        | 'handoffStatus'
        | 'assignedDriverId'
        | 'assignedDriverName'
        | 'assignedDriverContact'
        | 'assignedVehiclePlate'
        | 'billOfLadingNumber'
        | 'status'
    >
): boolean {
    if (!isDairyAmbientPersonalIsolatedAssignment(ann)) {
        return Boolean(ann.assignedDriverId);
    }
    if (isDairyAmbientPlaceholderAssignment(ann)) return false;
    if (hasBillOfLadingNumber(ann)) return true;

    const contact = (ann.assignedDriverContact || '').replace(/\D/g, '');
    const plate = (ann.assignedVehiclePlate || '').replace(/\s/g, '');
    const hadRealContact = Boolean(contact) && contact !== DAIRY_AMBIENT_PLACEHOLDER_MOBILE;
    const hadRealPlate = Boolean(plate) && !/11ع111/i.test(plate);
    if (hadRealContact || hadRealPlate) return true;

    if (isCarrierDoneHandoff(ann) || isReturnedFromCarrier(ann)) {
        return hasDriverAndVehicleAssigned(ann);
    }

    if (hasDriverAndVehicleAssigned(ann) && (ann.assignedDriverName || '').trim()) {
        return true;
    }

    return false;
}

export function getCarrierName(
    ann: Pick<FreightAnnouncement, 'carrierName' | 'assignedDriverName' | 'assignedDriverId' | 'lineType' | 'assignmentType' | 'assignedDriverContact' | 'assignedVehiclePlate'>,
    personalDrivers: Array<Pick<PersonalDriver, 'id' | 'name'>> = []
): string {
    const fromColumn = (ann.carrierName || '').trim();
    if (fromColumn) return fromColumn;
    if (isDairyAmbientPlaceholderAssignment(ann)) {
        const legacy = (ann.assignedDriverName || '').trim();
        if (legacy) return legacy;
        const pd = personalDrivers.find((d) => d.id === ann.assignedDriverId);
        if (pd?.name?.trim()) return pd.name.trim();
    }
    if (
        isDairyAmbientPersonalIsolatedAssignment(ann) &&
        ann.assignedDriverId &&
        !(ann.assignedDriverName || '').trim()
    ) {
        const pd = personalDrivers.find((d) => d.id === ann.assignedDriverId);
        const pdName = pd?.name?.trim();
        if (pdName) return pdName;
    }
    return '-';
}

/** زمان «اتمام تخصیص» برای تب روز — awaiting برای صف بارنامه، finalized برای موارد نهایی‌شده */
export function getAssignmentFinalizeAnchorDate(
    ann: Pick<FreightAnnouncement, 'assignmentFinalizedAt' | 'awaitingBillOfLadingAt'>
): Date | null {
    const raw = ann.assignmentFinalizedAt ?? ann.awaitingBillOfLadingAt;
    if (!raw) return null;
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    return Number.isNaN(d.getTime()) ? null : d;
}

export function getPendingBillAgeDays(ann: FreightAnnouncement): number | null {
    const anchor = getAssignmentFinalizeAnchorDate(ann);
    if (!anchor) return null;
    const days = jalaliCalendarDayDiff(anchor, new Date());
    return days < 0 ? 0 : days;
}

/** تخصیص شخصی لبنیات/فروتلند: بدون جستجو از personal_drivers/vehicles */
export function isDairyAmbientPersonalIsolatedAssignment(
    ann: Pick<FreightAnnouncement, 'lineType' | 'assignmentType'>
): boolean {
    return isPersonalAssignmentType(ann.assignmentType) && isDairyOrAmbientLineType(ann.lineType);
}

export function isWithCarrierHandoff(
    ann: Pick<FreightAnnouncement, 'handoffStatus'>
): boolean {
    return ann.handoffStatus === 'with_carrier';
}

/** لغو ارجاع به باربری — قبل از تخصیص واقعی راننده/خودرو */
export function canPersonalCancelCarrierRefer(
    ann: Pick<
        FreightAnnouncement,
        | 'handoffStatus'
        | 'assignedDriverId'
        | 'assignedVehicleId'
        | 'lineType'
        | 'assignmentType'
        | 'assignedDriverContact'
        | 'assignedVehiclePlate'
        | 'assignedDriverName'
        | 'billOfLadingNumber'
        | 'status'
    >
): boolean {
    if (!isWithCarrierHandoff(ann)) return false;
    if (!hasDriverAndVehicleAssigned(ann)) return true;
    return !hasRealPersonalDriverAssignment(ann);
}

export function isReturnedFromCarrier(
    ann: Pick<FreightAnnouncement, 'handoffStatus'>
): boolean {
    return ann.handoffStatus === 'returned';
}

export function isCarrierDoneHandoff(
    ann: Pick<FreightAnnouncement, 'handoffStatus'>
): boolean {
    return ann.handoffStatus === 'carrier_done';
}

/** ردیف‌های نزد باربری از کارتابل ترابری شخصی پنهان می‌شوند */
export function shouldHideFromPersonalQueue(
    ann: Pick<FreightAnnouncement, 'handoffStatus'>
): boolean {
    return isWithCarrierHandoff(ann);
}

/** خلاصه قابل‌خواندن برای دیالوگ ارجاع به باربری */
export function buildFreightReferSummary(ann: FreightAnnouncement): string {
    const vehicle = (ann.vehicleType || 'خودرو').trim();
    const destCities =
        ann.destinations?.map((d) => d.city).filter(Boolean).join('، ') || 'بدون مقصد';
    const tonnage = sumDestinationTonnageKg(ann.destinations || []);
    const tonnagePart = tonnage > 0 ? `${formatTonnageKg(tonnage)} بارگیری` : '';
    const originPart = ann.originCity ? `از ${ann.originCity}` : '';
    return [vehicle, destCities, tonnagePart, originPart].filter(Boolean).join(' — ');
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

/** ستون‌های جزئیات مقصد در اکسل کامل — نه «مقاصد» فشرده */
export function isFreightDestinationDetailHeader(header: string): boolean {
    return /^مقصد \d+ -/.test(header);
}

export type IceCreamDisplayOrderItem = {
    id: string;
    displayPinned: boolean;
    displaySortOrder: number;
};

type DisplayOrderSortable = Pick<FreightAnnouncement, 'displayPinned' | 'displaySortOrder' | 'createdAt'>;

/** ترتیب نمایش بستنی: سنجاق‌شده‌ها اول، سپس displaySortOrder، سپس تاریخ ثبت */
export function sortByIceCreamDisplayOrder<T extends DisplayOrderSortable>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const pinA = a.displayPinned ? 0 : 1;
        const pinB = b.displayPinned ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;

        const orderA = a.displaySortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.displaySortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;

        const aTime = new Date(a.createdAt as string | Date).getTime();
        const bTime = new Date(b.createdAt as string | Date).getTime();
        return bTime - aTime;
    });
}

export function buildIceCreamDisplayOrderPayload(
    ordered: Array<Pick<FreightAnnouncement, 'id' | 'displayPinned'>>
): IceCreamDisplayOrderItem[] {
    return ordered.map((ann, index) => ({
        id: ann.id,
        displayPinned: !!ann.displayPinned,
        displaySortOrder: index,
    }));
}

export function applyIceCreamDisplayOrderUpdates(
    announcements: FreightAnnouncement[],
    items: IceCreamDisplayOrderItem[]
): FreightAnnouncement[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    return announcements.map((ann) => {
        const patch = byId.get(ann.id);
        if (!patch) return ann;
        return {
            ...ann,
            displayPinned: patch.displayPinned,
            displaySortOrder: patch.displaySortOrder,
        };
    });
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toPersianDigits(value: string): string {
    return value.replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
}

/** نرمال ورودی عددی حین تایپ — فقط رقم (فارسی/عربی → انگلیسی) */
export function sanitizeNumericInputString(raw: string): string {
    if (!raw) return '';
    let s = String(raw).trim();
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    persianDigits.forEach((p, i) => {
        s = s.split(p).join(String(i));
    });
    arabicDigits.forEach((p, i) => {
        s = s.split(p).join(String(i));
    });
    return s.replace(/[^\d]/g, '');
}

/** نمایش ورودی عددی با جداکننده هزارگان فارسی (برای فیلدهای تایپ) */
export function formatNumericInputDisplay(digits: string): string {
    if (!digits) return '';
    const n = Number(digits);
    if (!Number.isFinite(n) || n < 0) return '';
    return formatPersianGroupedNumber(Math.round(n));
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
    s = s.replace(/٬/g, '').replace(/،/g, '').replace(/\s/g, '');

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

/** نرمال‌سازی تناژ کیلوگرم — مطابق DECIMAL(10,2)، بدون خطای float برای اعداد صحیح */
export function normalizeTonnageKg(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'string') {
        const s = value.trim().replace(/٬/g, '').replace(/,/g, '');
        if (/^\d+$/.test(s)) return parseInt(s, 10);
        const decMatch = /^(\d+)\.(\d{1,2})$/.exec(s);
        if (decMatch) {
            const whole = parseInt(decMatch[1], 10);
            const frac = parseInt(decMatch[2].padEnd(2, '0').slice(0, 2), 10);
            return whole + frac / 100;
        }
    }
    const n = parseNumericField(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const rounded = Math.round(n * 100 + Number.EPSILON) / 100;
    const asInt = Math.round(rounded);
    if (Math.abs(rounded - asInt) < 1e-9) return asInt;
    return rounded;
}

/** نمایش تناژ از مقدار خام API/فرم — همان عدد ثبت‌شده */
export function formatTonnageKgFromRaw(value: unknown): string {
    const n = normalizeTonnageKg(value);
    if (n <= 0) return '-';
    return formatTonnageKg(n);
}

/** جمع تناژ مقاصد (کیلوگرم) — بدون خطای اعشار شناور */
export function sumDestinationTonnageKg(
    destinations: ReadonlyArray<Pick<Destination, 'tonnage'>> = []
): number {
    return destinations.reduce((acc, d) => {
        const t = normalizeTonnageKg(d.tonnage);
        return Math.round((acc + t) * 100 + Number.EPSILON) / 100;
    }, 0);
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
export const TARIFF_FREIGHT_HEADER = 'کرایه تعرفه (ریال)';
export const TARIFF_DIFF_HEADER = 'اختلاف کرایه (ریال)';

export function isPersonalTransportViewerRole(role: string): boolean {
    return (
        role === 'personal_transport_user' ||
        role === 'Transportation_Personal_Vehicle_User' ||
        role === 'کاربر ترابری (خودرو شخصی)' ||
        role === 'کاربر ترابری شخصی' ||
        role === 'کاربر ترابری (شخصی)'
    );
}

export function parseFreightMoney(value: unknown): number {
    const n = parseNumericField(value);
    return Number.isFinite(n) ? n : 0;
}

export function computeFreightTariffDiff(
    registered?: number | string | null,
    tariff?: number | string | null
): number | null {
    const reg = parseFreightMoney(registered);
    const tar = parseFreightMoney(tariff);
    if (reg <= 0 && tar <= 0) return null;
    return reg - tar;
}

export function formatFreightTariffDiffCell(
    ann: Pick<FreightAnnouncement, 'totalFreightCost' | 'tariffFreightCost'>
): string {
    const diff = computeFreightTariffDiff(ann.totalFreightCost, ann.tariffFreightCost);
    if (diff === null) return '-';
    const abs = Math.abs(Math.round(diff)).toLocaleString('fa-IR');
    if (diff > 0) return `+${abs}`;
    if (diff < 0) return `-${abs}`;
    return '0';
}

export function buildTariffFreightColumns(): Array<{
    header: string;
    render: (ann: FreightAnnouncement) => string;
}> {
    return [
        {
            header: TARIFF_FREIGHT_HEADER,
            render: (ann) => formatFreightAmountCell(ann.tariffFreightCost),
        },
        {
            header: TARIFF_DIFF_HEADER,
            render: (ann) => formatFreightTariffDiffCell(ann),
        },
    ];
}

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
