import { FreightAnnouncement, FreightLineType } from '../types';
import {
    formatRepresentativeType,
    getCarrierName,
    hasDriverAndVehicleAssigned,
    hasRealPersonalDriverAssignment,
    isCompanyAssignmentType,
    isDairyAmbientPersonalIsolatedAssignment,
    isDairyOrAmbientLineType,
    isPendingBillOfLadingTab,
    isWithCarrierHandoff,
    TransportLiveTab,
} from './freightDisplay';
import {
    isCompanyAssignedAnn,
    isPersonalAssignedAnn,
    isReannouncement,
} from './transportLiveViewUtils';

export type NamedCountRow = {
    label: string;
    total: number;
    assigned?: number;
    reannounced?: number;
};

export type IceCreamLiveSummary = {
    kind: 'iceCream';
    companyTotal: number;
    companyAssigned: number;
    personalTotal: number;
    personalAssigned: number;
    byOrigin: NamedCountRow[];
    byRepType: NamedCountRow[];
};

export type LoadingShiftCounts = {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
};

export type DairyLiveSummary = {
    kind: 'dairy';
    assigned: number;
    unassigned: number;
    total: number;
    shahrLabaniatLoading: {
        overall: LoadingShiftCounts;
        morning: LoadingShiftCounts;
        night: LoadingShiftCounts;
        unknown: LoadingShiftCounts;
    };
};

export type AmbientLiveSummary = {
    kind: 'ambient';
    byCarrier: NamedCountRow[];
    reannouncedTotal: number;
    total: number;
};

export type TransportLiveSummary =
    | IceCreamLiveSummary
    | DairyLiveSummary
    | AmbientLiveSummary
    | { kind: 'none' };

export function resolveSummaryLineType(
    activeLine: TransportLiveTab,
    pendingSubLine: FreightLineType
): FreightLineType | null {
    if (isPendingBillOfLadingTab(activeLine)) return pendingSubLine;
    if (
        activeLine === FreightLineType.IceCream ||
        activeLine === FreightLineType.Dairy ||
        activeLine === FreightLineType.Ambient
    ) {
        return activeLine;
    }
    return null;
}

export function isAnnouncementAssignedForSummary(ann: FreightAnnouncement): boolean {
    if (isDairyAmbientPersonalIsolatedAssignment(ann)) {
        return hasRealPersonalDriverAssignment(ann);
    }
    if (isDairyOrAmbientLineType(ann.lineType) && isCompanyAssignmentType(ann.assignmentType)) {
        return hasDriverAndVehicleAssigned(ann);
    }
    return hasDriverAndVehicleAssigned(ann);
}

function sortedNamedRows(
    map: Map<string, { total: number; assigned?: number; reannounced?: number }>,
    withAssigned: boolean,
    withReannounced: boolean
): NamedCountRow[] {
    return Array.from(map.entries())
        .map(([label, v]) => ({
            label,
            total: v.total,
            ...(withAssigned ? { assigned: v.assigned || 0 } : {}),
            ...(withReannounced ? { reannounced: v.reannounced || 0 } : {}),
        }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fa'));
}

export function buildIceCreamLiveSummary(items: FreightAnnouncement[]): IceCreamLiveSummary {
    let companyTotal = 0;
    let companyAssigned = 0;
    let personalTotal = 0;
    let personalAssigned = 0;
    const byOrigin = new Map<string, { total: number; assigned: number; reannounced: number }>();
    const byRepType = new Map<string, { total: number; assigned: number }>();

    for (const ann of items) {
        const assigned = isAnnouncementAssignedForSummary(ann);
        const re = isReannouncement(ann);

        if (isCompanyAssignedAnn(ann)) {
            companyTotal += 1;
            if (assigned) companyAssigned += 1;
        } else if (isPersonalAssignedAnn(ann)) {
            personalTotal += 1;
            if (assigned) personalAssigned += 1;
        }

        const origin = (ann.originCity || '').trim() || 'نامشخص';
        const originRow = byOrigin.get(origin) || { total: 0, assigned: 0, reannounced: 0 };
        originRow.total += 1;
        if (assigned) originRow.assigned += 1;
        if (re) originRow.reannounced += 1;
        byOrigin.set(origin, originRow);

        const rep = formatRepresentativeType(ann.representativeType);
        const repLabel = rep === '-' ? 'نامشخص' : rep;
        const repRow = byRepType.get(repLabel) || { total: 0, assigned: 0 };
        repRow.total += 1;
        if (assigned) repRow.assigned += 1;
        byRepType.set(repLabel, repRow);
    }

    return {
        kind: 'iceCream',
        companyTotal,
        companyAssigned,
        personalTotal,
        personalAssigned,
        byOrigin: sortedNamedRows(byOrigin, true, true),
        byRepType: sortedNamedRows(byRepType, true, false),
    };
}

export function isShahrLabaniatOrigin(origin?: string | null): boolean {
    const n = String(origin || '')
        .replace(/\s+/g, '')
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک');
    return n.includes('شهرلبنیات') || (n.includes('لبنیات') && n.includes('میهن'));
}

export function parseHourFromPlatformTime(value?: string | Date | null): number | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return value.getHours();
    }
    const m = String(value).match(/(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    const h = Number(m[1]);
    if (Number.isNaN(h) || h < 0 || h > 23) return null;
    return h;
}

/** صبح ۷ تا ۱۹ — شب ۱۹ تا ۷ (همان شیفت‌بندی قبلی) */
export function shiftFromHour(hour: number): 'morning' | 'night' {
    return hour >= 7 && hour < 19 ? 'morning' : 'night';
}

function announcedLoadingHour(ann: FreightAnnouncement): number | null {
    for (const d of ann.destinations || []) {
        const h = parseHourFromPlatformTime(d.platformArrivalTime);
        if (h != null) return h;
    }
    return parseHourFromPlatformTime(ann.platformArrivalTime);
}

export function announcementLoadingShift(
    ann: FreightAnnouncement
): 'morning' | 'night' | 'unknown' {
    const hour = announcedLoadingHour(ann);
    if (hour != null) return shiftFromHour(hour);
    return 'unknown';
}

function emptyLoadingCounts(): LoadingShiftCounts {
    return { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
}

function bumpLoadingCount(counts: LoadingShiftCounts, status?: string | null) {
    counts.total += 1;
    if (status === 'completed') counts.completed += 1;
    else if (status === 'in_progress') counts.inProgress += 1;
    else counts.notStarted += 1;
}

export function buildShahrLabaniatLoadingSummary(items: FreightAnnouncement[]) {
    const overall = emptyLoadingCounts();
    const morning = emptyLoadingCounts();
    const night = emptyLoadingCounts();
    const unknown = emptyLoadingCounts();
    for (const ann of items) {
        bumpLoadingCount(overall, ann.loadingStatus);
        const shift = announcementLoadingShift(ann);
        if (shift === 'morning') bumpLoadingCount(morning, ann.loadingStatus);
        else if (shift === 'night') bumpLoadingCount(night, ann.loadingStatus);
        else bumpLoadingCount(unknown, ann.loadingStatus);
    }
    return { overall, morning, night, unknown };
}

export function buildDairyLiveSummary(items: FreightAnnouncement[]): DairyLiveSummary {
    let assigned = 0;
    for (const ann of items) {
        if (isAnnouncementAssignedForSummary(ann)) assigned += 1;
    }
    const total = items.length;
    return {
        kind: 'dairy',
        assigned,
        unassigned: Math.max(0, total - assigned),
        total,
        shahrLabaniatLoading: buildShahrLabaniatLoadingSummary(items),
    };
}

export function buildAmbientLiveSummary(
    items: FreightAnnouncement[],
    personalDrivers: Array<{ id: string; name: string }> = []
): AmbientLiveSummary {
    const byCarrier = new Map<string, { total: number }>();
    let reannouncedTotal = 0;

    for (const ann of items) {
        if (isReannouncement(ann)) reannouncedTotal += 1;

        const carrier = getCarrierName(ann, personalDrivers);
        const hasCarrier =
            (carrier && carrier !== '-') || isWithCarrierHandoff(ann);
        if (!hasCarrier) continue;
        const label = carrier && carrier !== '-' ? carrier : 'نامشخص';
        const row = byCarrier.get(label) || { total: 0 };
        row.total += 1;
        byCarrier.set(label, row);
    }

    return {
        kind: 'ambient',
        byCarrier: sortedNamedRows(byCarrier, false, false),
        reannouncedTotal,
        total: items.length,
    };
}

export function buildTransportLiveSummary(
    items: FreightAnnouncement[],
    lineType: FreightLineType | null,
    personalDrivers: Array<{ id: string; name: string }> = []
): TransportLiveSummary {
    if (!lineType) return { kind: 'none' };
    if (lineType === FreightLineType.IceCream) return buildIceCreamLiveSummary(items);
    if (lineType === FreightLineType.Dairy) return buildDairyLiveSummary(items);
    if (lineType === FreightLineType.Ambient) {
        return buildAmbientLiveSummary(items, personalDrivers);
    }
    return { kind: 'none' };
}

export function summaryLineTitle(lineType: FreightLineType | null, isPendingBol: boolean): string {
    const base =
        lineType === FreightLineType.IceCream
            ? 'بستنی'
            : lineType === FreightLineType.Dairy
              ? 'پاستوریزه'
              : lineType === FreightLineType.Ambient
                ? 'لبنیات-فروتلند'
                : 'خلاصه';
    return isPendingBol ? `خلاصه تب در انتظار بارنامه — ${base}` : `خلاصه تب ${base}`;
}
