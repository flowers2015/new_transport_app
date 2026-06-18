import {
    FreightAnnouncement,
    FreightAnnouncementStatus,
    FreightLineType,
} from '../types';
import { pickAssignmentFieldsFromApi } from '../utils/freightDisplay';

const statusMap: Record<string, FreightAnnouncementStatus> = {
    Draft: FreightAnnouncementStatus.Draft,
    PendingManagerApproval: FreightAnnouncementStatus.PendingManagerApproval,
    Rejected: FreightAnnouncementStatus.Rejected,
    PendingPersonalAssignment: FreightAnnouncementStatus.PendingPersonalAssignment,
    PendingCompanyAssignment: FreightAnnouncementStatus.PendingCompanyAssignment,
    Assigned: FreightAnnouncementStatus.Assigned,
    InTransit: FreightAnnouncementStatus.InTransit,
    Finalized: FreightAnnouncementStatus.Finalized,
    Cancelled: FreightAnnouncementStatus.Cancelled,
    ReAnnounced: FreightAnnouncementStatus.ReAnnounced,
    ChangeRequested: FreightAnnouncementStatus.ChangeRequested,
    Leftover: FreightAnnouncementStatus.Leftover,
};

export const LINE_TABS = [
    { key: FreightLineType.IceCream, label: 'بستنی' },
    { key: FreightLineType.Dairy, label: 'پاستوریزه' },
    { key: FreightLineType.Ambient, label: 'لبنیات-فروتلند' },
] as const;

export const PRIORITY_LABELS: Record<string, string> = {
    low: 'کم اهمیت',
    normal: 'عادی',
    high: 'فوری',
};

export function normalizeUpcomingAnnouncement(raw: Record<string, unknown>): FreightAnnouncement {
    const statusKey = String(raw.status || '');
    let products: string[] = [];
    if (Array.isArray(raw.products)) {
        products = raw.products.map(String);
    } else if (typeof raw.products === 'string' && raw.products) {
        try {
            const parsed = JSON.parse(raw.products);
            products = Array.isArray(parsed) ? parsed.map(String) : [raw.products];
        } catch {
            products = [raw.products];
        }
    }

    return {
        id: String(raw.id || ''),
        announcementCode: String(raw.announcement_code || raw.announcementCode || ''),
        createdAt: new Date(String(raw.created_at || raw.createdAt || Date.now())),
        loadingDate:
            typeof raw.loading_date === 'string' &&
            /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(raw.loading_date)
                ? (raw.loading_date as string).replace(/-/g, '/')
                : new Date(String(raw.loading_date || raw.loadingDate || Date.now())),
        lineType: (raw.line_type || raw.lineType) as FreightLineType,
        status: statusMap[statusKey] || (raw.status as FreightAnnouncementStatus),
        cargoValue: Number(raw.cargo_value ?? raw.cargoValue ?? 0),
        vehicleType: String(raw.vehicle_type || raw.vehicleType || ''),
        notes: raw.notes as string | undefined,
        deliveryDate: (raw.delivery_date || raw.deliveryDate) as string | undefined,
        ...pickAssignmentFieldsFromApi(raw),
        originCity: (raw.origin_city || raw.originCity) as string | undefined,
        brand: raw.brand as string | undefined,
        representativeType: (raw.representative_type || raw.representativeType) as string | undefined,
        representativeName: (raw.representative_name || raw.representativeName) as string | undefined,
        cartonCount: (raw.carton_count ?? raw.cartonCount) as number | undefined,
        palletCount: (raw.pallet_count ?? raw.palletCount) as number | undefined,
        loadingType: (raw.loading_type || raw.loadingType) as string | undefined,
        priority: raw.priority as string | undefined,
        products,
        platformArrivalTime: (raw.platform_arrival_time || raw.platformArrivalTime) as string | undefined,
        creator_full_name: (raw.creator_full_name || raw.creatorFullName) as string | undefined,
        creator_username: (raw.creator_username || raw.creatorUsername) as string | undefined,
        destinations: Array.isArray(raw.destinations)
            ? raw.destinations.map((d: Record<string, unknown>) => ({
                  id: String(d.id || ''),
                  city: String(d.city || ''),
                  representativeName: (d.representative_name || d.representativeName) as string | undefined,
                  tonnage: d.tonnage != null ? Number(d.tonnage) : undefined,
                  unloadTime: (d.unload_time || d.unloadTime) as string | undefined,
                  deliveryDate: (d.delivery_date || d.deliveryDate) as string | undefined,
                  representativeType: (d.representative_type || d.representativeType) as string | undefined,
              }))
            : [],
    } as FreightAnnouncement;
}

export function getCreatorDisplayName(ann: FreightAnnouncement): string {
    const full = ann.creator_full_name?.trim();
    const username = ann.creator_username?.trim();
    return full || username || '—';
}

export function isPendingManagerApproval(ann: FreightAnnouncement): boolean {
    const s = String(ann.status || '');
    return (
        ann.status === FreightAnnouncementStatus.PendingManagerApproval ||
        s === 'PendingManagerApproval' ||
        s === 'در انتظار تایید مدیر'
    );
}

export function matchesLineTab(ann: FreightAnnouncement, tab: FreightLineType): boolean {
    const lt = String(ann.lineType || '');
    if (tab === FreightLineType.IceCream) {
        return lt === 'IceCream' || lt === FreightLineType.IceCream || lt === 'بستنی';
    }
    if (tab === FreightLineType.Dairy) {
        return lt === 'Dairy' || lt === FreightLineType.Dairy || lt === 'پاستوریزه';
    }
    if (tab === FreightLineType.Ambient) {
        return lt === 'Ambient' || lt === FreightLineType.Ambient || lt === 'لبنیات-فروتلند';
    }
    return lt === tab;
}

export function totalTonnage(ann: FreightAnnouncement): number {
    return (ann.destinations || []).reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0);
}

export function summarizeVehicleTypes(announcements: FreightAnnouncement[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const ann of announcements) {
        const key = (ann.vehicleType || 'نامشخص').trim() || 'نامشخص';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}
