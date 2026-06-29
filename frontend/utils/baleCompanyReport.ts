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
    'مقاصد',
    'مبدا بارگیری',
    'برند',
    'نوع نماینده',
    'نام نماینده',
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
    vehicleCode: string;
    driverName: string;
    driverContact: string;
};

const LINE_ORDER: FreightLineType[] = [
    FreightLineType.IceCream,
    FreightLineType.Dairy,
    FreightLineType.Ambient,
];

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
    sorted.push(
        ...other.sort(
            (a, b) =>
                new Date(b.createdAt as string | Date).getTime() -
                new Date(a.createdAt as string | Date).getTime()
        )
    );
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
        vehicleCode: getAssignedVehicleCode(ann, resources.vehicles),
        driverName: getAssignedDriverDisplayName(ann, resources.drivers, resources.personalDrivers),
        driverContact: getAssignedDriverContact(ann, resources.drivers, resources.personalDrivers),
    }));
}

export function baleReportRowsToMatrix(rows: BaleCompanyReportRow[]): string[][] {
    return [
        [...COMPANY_BALE_REPORT_HEADERS],
        ...rows.map((r) => [
            String(r.row),
            r.destinations,
            r.origin,
            r.brand,
            r.representativeType,
            r.representativeName,
            r.vehicleCode,
            r.driverName,
            r.driverContact,
        ]),
    ];
}
