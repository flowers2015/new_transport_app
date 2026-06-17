import {
    FreightAnnouncement,
    FreightAnnouncementStatus,
    FreightLineType,
} from '../types';
import { pickAssignmentFieldsFromApi } from '../utils/freightDisplay';

export const STATUS_LABELS: Record<string, string> = {
    Draft: 'پیش‌نویس',
    PendingManagerApproval: 'در انتظار تایید مدیر',
    Rejected: 'رد شده',
    PendingPersonalAssignment: 'در انتظار تخصیص شخصی',
    PendingCompanyAssignment: 'در انتظار تخصیص شرکتی',
    Assigned: 'تخصیص یافته',
    InTransit: 'در حال حمل',
    Finalized: 'نهایی شده',
    Cancelled: 'لغو شده',
    ReAnnounced: 'اعلام مجدد',
    ChangeRequested: 'درخواست تغییر',
    Archived: 'آرشیو',
};

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
};

export function normalizeAnnouncement(raw: Record<string, unknown>): FreightAnnouncement {
    const statusKey = String(raw.status || '');
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
        ...pickAssignmentFieldsFromApi(raw),
        originCity: (raw.origin_city || raw.originCity) as string | undefined,
        brand: raw.brand as string | undefined,
        representativeName: (raw.representative_name || raw.representativeName) as string | undefined,
        destinations: Array.isArray(raw.destinations)
            ? raw.destinations.map((d: Record<string, unknown>) => ({
                  id: String(d.id || ''),
                  city: String(d.city || ''),
                  representativeName: (d.representative_name || d.representativeName) as string | undefined,
                  tonnage: d.tonnage != null ? Number(d.tonnage) : undefined,
              }))
            : [],
        history: Array.isArray(raw.history) ? raw.history : [],
        assignmentFinalizedAt: (raw.assignment_finalized_at ||
            raw.assignmentFinalizedAt) as string | undefined,
        creator_full_name: (raw.creator_full_name || raw.creatorFullName) as string | undefined,
    } as FreightAnnouncement;
}

export function formatStatus(status: unknown): string {
    const key = String(status || '');
    return STATUS_LABELS[key] || key || '—';
}

export function formatLineType(lineType: unknown): string {
    const v = String(lineType || '');
    if (v === 'IceCream' || v === FreightLineType.IceCream) return 'بستنی';
    if (v === 'Dairy' || v === FreightLineType.Dairy) return 'پاستوریزه';
    if (v === 'Ambient' || v === FreightLineType.Ambient) return 'لبنیات-فروتلند';
    return v || '—';
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
    return true;
}

export function filterLiveAnnouncements(list: FreightAnnouncement[]): FreightAnnouncement[] {
    return list.filter(a => {
        const status = String(a.status || '');
        if (
            status === 'ChangeRequested' ||
            status === FreightAnnouncementStatus.ChangeRequested ||
            status === 'Finalized' ||
            status === FreightAnnouncementStatus.Finalized
        ) {
            return false;
        }
        if (a.assignmentFinalizedAt) return false;
        return true;
    });
}

export function formatDestinations(ann: FreightAnnouncement): string {
    if (!ann.destinations?.length) return '—';
    return ann.destinations.map(d => d.city).filter(Boolean).join('، ');
}

export function formatLoadingDate(value: FreightAnnouncement['loadingDate']): string {
    if (!value) return '—';
    if (typeof value === 'string') return value;
    try {
        return value.toLocaleDateString('fa-IR');
    } catch {
        return String(value);
    }
}

export const LINE_TABS = [
    { key: FreightLineType.IceCream, label: 'بستنی' },
    { key: FreightLineType.Dairy, label: 'پاستوریزه' },
    { key: FreightLineType.Ambient, label: 'لبنیات-فروتلند' },
] as const;
