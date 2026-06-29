import {
    Driver,
    FreightAnnouncement,
    FreightLineType,
    PersonalDriver,
    Vehicle,
} from '../types';
import {
    getAssignedDriverContact,
    getAssignedDriverDisplayName,
    getDestinationCitiesLabel,
    getRepresentativeNameLabel,
    getRepresentativeTypesLabel,
    isEligibleForCompanyBaleReport,
    matchesFreightLine,
    sortByIceCreamDisplayOrder,
} from './freightDisplay';
import { getAssignedVehicleCode } from './transportLiveViewUtils';

export const COMPANY_BALE_REPORT_HEADERS = [
    'ردیف',
    'نوع خودرو',
    'مقاصد',
    'مبدا بارگیری',
    'برند',
    'نوع نماینده',
    'نام نماینده',
    'محصولات',
    'کد خودرو',
    'نام راننده',
    'شماره تماس',
] as const;

export type BaleCompanyReportRow = {
    row: number;
    destinations: string;
    origin: string;
    brand: string;
    representativeType: string;
    representativeName: string;
    products: string;
    vehicleType: string;
    vehicleCode: string;
    driverName: string;
    driverContact: string;
    /** پاستوریزه — رنگ زرد در تصویر/اکسل */
    isDairy: boolean;
};

/** بستنی و لبنیات بالا؛ پاستوریزه انتهای جدول */
const LINE_ORDER: FreightLineType[] = [
    FreightLineType.IceCream,
    FreightLineType.Ambient,
    FreightLineType.Dairy,
];

/** ده چرخ → مینی تریلی → تریلی */
function getVehicleTypeSortRank(vehicleType?: string | null): number {
    const v = (vehicleType || '').trim();
    if (v.includes('ده چرخ') || v.includes('دهچرخ')) return 0;
    if (v.includes('مینی تریلی') || v.includes('مینیتریلی')) return 1;
    if (v.includes('تریلی')) return 2;
    return 99;
}

function getProductsLabel(ann: FreightAnnouncement): string {
    if (!matchesFreightLine(ann, FreightLineType.IceCream)) return '';
    const products = ann.products || [];
    return products.length > 0 ? products.join('، ') : '-';
}

function detectLine(ann: FreightAnnouncement): FreightLineType | null {
    for (const line of LINE_ORDER) {
        if (matchesFreightLine(ann, line)) return line;
    }
    return null;
}

export function selectCompanyBaleReportAnnouncements(
    announcements: FreightAnnouncement[]
): FreightAnnouncement[] {
    return announcements.filter(isEligibleForCompanyBaleReport);
}

function sortByVehicleTypeThenLineRules(
    items: FreightAnnouncement[],
    line: FreightLineType
): FreightAnnouncement[] {
    const grouped = new Map<number, FreightAnnouncement[]>();
    for (const ann of items) {
        const rank = getVehicleTypeSortRank(ann.vehicleType);
        if (!grouped.has(rank)) grouped.set(rank, []);
        grouped.get(rank)!.push(ann);
    }

    const sorted: FreightAnnouncement[] = [];
    for (const rank of [...grouped.keys()].sort((a, b) => a - b)) {
        const batch = grouped.get(rank)!;
        if (line === FreightLineType.IceCream) {
            sorted.push(...sortByIceCreamDisplayOrder(batch));
        } else {
            sorted.push(
                ...batch.sort(
                    (a, b) =>
                        new Date(b.createdAt as string | Date).getTime() -
                        new Date(a.createdAt as string | Date).getTime()
                )
            );
        }
    }
    return sorted;
}

export function sortCompanyBaleReportAnnouncements(
    announcements: FreightAnnouncement[]
): FreightAnnouncement[] {
    const buckets = new Map<FreightLineType, FreightAnnouncement[]>();
    const other: FreightAnnouncement[] = [];

    for (const ann of announcements) {
        const line = detectLine(ann);
        if (!line) {
            other.push(ann);
            continue;
        }
        if (!buckets.has(line)) buckets.set(line, []);
        buckets.get(line)!.push(ann);
    }

    const sorted: FreightAnnouncement[] = [];
    for (const line of LINE_ORDER) {
        const batch = buckets.get(line) || [];
        sorted.push(...sortByVehicleTypeThenLineRules(batch, line));
    }
    sorted.push(...sortByVehicleTypeThenLineRules(other, FreightLineType.IceCream));
    return sorted;
}

export function buildCompanyBaleReportRows(
    announcements: FreightAnnouncement[],
    resources: {
        drivers: Array<Pick<Driver, 'id' | 'name' | 'mobile'>>;
        personalDrivers: Array<Pick<PersonalDriver, 'id' | 'name' | 'mobile'>>;
        vehicles: Array<Pick<Vehicle, 'id' | 'vehicleCode' | 'serialNumber'>>;
    }
): BaleCompanyReportRow[] {
    const ordered = sortCompanyBaleReportAnnouncements(announcements);
    return ordered.map((ann, idx) => ({
        row: idx + 1,
        destinations: getDestinationCitiesLabel(ann),
        origin: (ann.originCity || '-').trim() || '-',
        brand: (ann.brand || '-').trim() || '-',
        representativeType: getRepresentativeTypesLabel(ann),
        representativeName: getRepresentativeNameLabel(ann),
        products: getProductsLabel(ann),
        vehicleType: (ann.vehicleType || '-').trim() || '-',
        vehicleCode: getAssignedVehicleCode(ann, resources.vehicles),
        driverName: getAssignedDriverDisplayName(ann, resources.drivers, resources.personalDrivers),
        driverContact: getAssignedDriverContact(ann, resources.drivers, resources.personalDrivers),
        isDairy: matchesFreightLine(ann, FreightLineType.Dairy),
    }));
}

export function baleReportRowsToMatrix(rows: BaleCompanyReportRow[]): string[][] {
    return [
        [...COMPANY_BALE_REPORT_HEADERS],
        ...rows.map((r) => [
            String(r.row),
            r.vehicleType,
            r.destinations,
            r.origin,
            r.brand,
            r.representativeType,
            r.representativeName,
            r.products,
            r.vehicleCode,
            r.driverName,
            r.driverContact,
        ]),
    ];
}
