import {
    FreightAnnouncement,
    FreightAnnouncementStatus,
    FreightLineType,
    UserRole,
    Vehicle,
} from '../types';
import {
    PENDING_BILL_OF_LADING_TAB,
    TransportLiveTab,
    isPendingBillOfLadingTab,
    matchesFreightLine,
    sortByIceCreamDisplayOrder,
} from './freightDisplay';

/** ستون کد خودرو: بستنی و پاستوریزه — نه لبنیات-فروتلند */
export function shouldShowVehicleCodeColumn(activeLine: TransportLiveTab): boolean {
    if (isPendingBillOfLadingTab(activeLine)) return true;
    return activeLine === FreightLineType.IceCream || activeLine === FreightLineType.Dairy;
}

/** کد خودرو شرکتی — تخصیص شخصی کد ندارد */
export function getAssignedVehicleCode(
    ann: Pick<FreightAnnouncement, 'assignedVehicleId' | 'assignmentType'>,
    vehicles: Array<Pick<Vehicle, 'id' | 'vehicleCode' | 'serialNumber'>> = []
): string {
    const assignmentType = String(ann.assignmentType || '').toLowerCase();
    if (assignmentType === 'personal' || assignmentType === 'شخصی') return '—';
    const id = ann.assignedVehicleId;
    if (!id) return '—';
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return '—';
    const code = (vehicle.vehicleCode || vehicle.serialNumber || '').trim();
    return code || '—';
}

export function isCompanyAssignedAnn(ann: FreightAnnouncement): boolean {
    return (
        ann.assignmentType === 'company' ||
        ann.assignmentType === 'شرکتی' ||
        ann.status === FreightAnnouncementStatus.PendingCompanyAssignment
    );
}

export function isPersonalAssignedAnn(ann: FreightAnnouncement): boolean {
    return (
        ann.assignmentType === 'personal' ||
        ann.assignmentType === 'شخصی' ||
        ann.status === FreightAnnouncementStatus.PendingPersonalAssignment
    );
}

export function isTransportRole(role: string): boolean {
    return (
        role === UserRole.TransportationUser ||
        role === UserRole.Transportation_Personal_Vehicle_User ||
        role === UserRole.Transportation
    );
}

/** آیا این ترابری می‌تواند روی این بار عمل کند (صف خودش) */
export function canTransportTakeAction(ann: FreightAnnouncement, role: string): boolean {
    const isCompanyAssigned = isCompanyAssignedAnn(ann);
    const isPersonalAssigned = isPersonalAssignedAnn(ann);

    if (role === UserRole.TransportationUser) {
        if (
            ann.lineType === FreightLineType.IceCream ||
            ann.lineType === 'IceCream' ||
            ann.lineType === 'بستنی'
        ) {
            return isCompanyAssigned;
        }
        if (
            matchesFreightLine(ann, FreightLineType.Dairy) ||
            matchesFreightLine(ann, FreightLineType.Ambient)
        ) {
            return isCompanyAssigned;
        }
        return false;
    }

    if (role === UserRole.Transportation_Personal_Vehicle_User) {
        if (matchesFreightLine(ann, FreightLineType.Dairy) || matchesFreightLine(ann, FreightLineType.Ambient)) {
            return isPersonalAssigned;
        }
        if (
            ann.lineType === FreightLineType.IceCream ||
            ann.lineType === 'IceCream' ||
            ann.lineType === 'بستنی'
        ) {
            return isPersonalAssigned;
        }
        return false;
    }

    return true;
}

export function isAssignedToOtherTransport(ann: FreightAnnouncement, role: string): boolean {
    return (
        (role === UserRole.TransportationUser && isPersonalAssignedAnn(ann)) ||
        (role === UserRole.Transportation_Personal_Vehicle_User && isCompanyAssignedAnn(ann))
    );
}

export function canTransportForward(ann: FreightAnnouncement, role: string): boolean {
    const isPending = [
        FreightAnnouncementStatus.PendingCompanyAssignment,
        FreightAnnouncementStatus.PendingPersonalAssignment,
    ].includes(ann.status);
    return canTransportTakeAction(ann, role) && isPending;
}

export type IceCreamTransportViewMode = 'my' | 'planning';

/** اعلام مجدد از «بار مانده» — کارمند برنامه‌ریزی دوباره برای تایید مدیر ارسال کرده */
export function isReannouncement(ann: FreightAnnouncement): boolean {
    if (ann.isReannouncement === true) {
        return true;
    }
    const status = String(ann.status || '');
    return (
        status === FreightAnnouncementStatus.ReAnnounced ||
        status === 'ReAnnounced' ||
        status === 'اعلام مجدد شده' ||
        status === 'Reannounced'
    );
}

/** @deprecated use isReannouncement */
export const isReannouncedFromLeftover = isReannouncement;

export function applyTransportLiveDisplayOrder(
    items: FreightAnnouncement[],
    options: {
        activeLine: TransportLiveTab;
        role: string;
        iceCreamViewMode: IceCreamTransportViewMode;
        hideReferred: boolean;
    }
): FreightAnnouncement[] {
    let list = [...items];

    if (options.activeLine === FreightLineType.IceCream && !isPendingBillOfLadingTab(options.activeLine)) {
        list = sortByIceCreamDisplayOrder(list);
    }

    const useMyView =
        isTransportRole(options.role) &&
        options.activeLine === FreightLineType.IceCream &&
        !isPendingBillOfLadingTab(options.activeLine) &&
        options.iceCreamViewMode === 'my';

    if (!useMyView) {
        return list;
    }

    const mine: FreightAnnouncement[] = [];
    const referred: FreightAnnouncement[] = [];
    for (const ann of list) {
        if (canTransportTakeAction(ann, options.role)) {
            mine.push(ann);
        } else {
            referred.push(ann);
        }
    }

    if (options.hideReferred) {
        return mine;
    }
    return [...mine, ...referred];
}
