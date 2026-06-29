// This is a new file: components/FreightDashboard.tsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { FreightAnnouncement, FreightLineType, Destination, FreightAnnouncementStatus, UserRole, User, View, DispatchRouteSuggestion } from '../types';
import { formatJalaliDateTime, formatJalali, parseJalaliDateString } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { DocumentArrowDownIcon } from './icons/DocumentArrowDownIcon';
import { buildExcelFileName, downloadStyledExcel } from '../utils/excelExport';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import FreightHistoryDialog from './FreightHistoryDialog';
import { generateUUID } from '../utils/uuid';
import { formatLoadingType, formatRepresentativeType, getDestinationCitiesLabel, getRepresentativeNameLabel, localizeExcelValue, sortByIceCreamDisplayOrder, buildIceCreamDisplayOrderPayload } from '../utils/freightDisplay';
import CargoValueInput from './CargoValueInput';
import CityAutocomplete from './CityAutocomplete';
import IceCreamDisplayOrderControls from './IceCreamDisplayOrderControls';

// --- Constants from user request ---
const BRANDS = ['میهن', 'پاندا', 'برنارد', 'میلکوم', 'پانلا', 'آلینوس', 'فروتلند'];
const VEHICLE_TYPES = ['تریلی', 'مینی تریلی', 'ده چرخ', 'تک', 'مینی تک', 'خاور'];
const PRIORITIES = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };
const ICE_CREAM_PRODUCTS = ['کره', 'کترینگ', 'پنیر پیتزا', 'خامه قنادی'];
const RequiredField: React.FC<{
    label: string;
    children: React.ReactNode;
    className?: string;
    hint?: string;
}> = ({ label, children, className = '', hint }) => (
    <div className={`rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 ${className}`}>
        <label className="text-xs font-medium text-sky-900">{label}</label>
        {children}
        {hint ? <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div> : null}
    </div>
);

interface FreightDashboardProps {
    announcements: FreightAnnouncement[];
    onAddAnnouncement: (announcement: Omit<FreightAnnouncement, 'id' | 'status' | 'announcementCode' | 'createdAt' | 'history'>, isDraft: boolean) => void;
    onUpdateAnnouncement: (updatedAnn: FreightAnnouncement) => void;
    onApprove: (announcementId: string) => void;
    onReject: (announcementId: string, reason: string) => void;
    onDelete: (announcementId: string) => void;
    onReAnnounce: (announcementId: string) => void;
    currentUser: User;
    onSwitchQueue?: (id: string, nextQueue: 'company' | 'personal') => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
    onSendForApproval?: (announcement: FreightAnnouncement) => void;
    onSearchRoutes: (query: string) => Promise<DispatchRouteSuggestion[]>;
    changeRequests?: any[];
    loadingChangeRequests?: boolean;
    onFetchChangeRequests?: () => void;
    onApproveChangeRequest?: (requestId: string, newAnnouncements?: any[]) => void;
    onRejectChangeRequest?: (requestId: string, reviewNote?: string) => void;
    onArchiveChangeRequest?: (requestId: string) => void;
    onUpdateIceCreamDisplayOrder?: (items: import('../utils/freightDisplay').IceCreamDisplayOrderItem[]) => Promise<void>;
}

const statusStyles: { [key in FreightAnnouncementStatus]: string } = {
    [FreightAnnouncementStatus.Draft]: 'bg-gray-100 text-gray-800',
    [FreightAnnouncementStatus.PendingManagerApproval]: 'bg-yellow-100 text-yellow-800',
    [FreightAnnouncementStatus.Rejected]: 'bg-red-100 text-red-800',
    [FreightAnnouncementStatus.PendingPersonalAssignment]: 'bg-orange-100 text-orange-800',
    [FreightAnnouncementStatus.PendingCompanyAssignment]: 'bg-orange-100 text-orange-800',
    [FreightAnnouncementStatus.Assigned]: 'bg-blue-100 text-blue-800',
    [FreightAnnouncementStatus.InTransit]: 'bg-purple-100 text-purple-800',
    [FreightAnnouncementStatus.Finalized]: 'bg-green-100 text-green-800',
    [FreightAnnouncementStatus.Cancelled]: 'bg-slate-100 text-slate-800',
    [FreightAnnouncementStatus.ReAnnounced]: 'bg-gray-400 text-white',
    [FreightAnnouncementStatus.Leftover]: 'bg-red-200 text-red-900',
    [FreightAnnouncementStatus.ChangeRequested]: 'bg-orange-200 text-orange-900',
    [FreightAnnouncementStatus.Archived]: 'bg-slate-300 text-slate-800',
};

const formatCurrency = (amount?: number) => amount ? `${amount.toLocaleString('fa-IR')}` : '-';

/** هر «مسیر» بستنی: مبدا + برند + مقصد + نماینده (جدا برای هر مقصد) */
type IceCreamLeg = {
    originCity: string;
    brand: string;
    destinationCity: string;
    representativeType: 'agent' | 'distributor' | 'depot';
    representativeName: string;
};

const normalizeIceCreamRepType = (value?: string): 'agent' | 'distributor' | 'depot' => {
    if (value === 'distributor' || value === 'distribution') return 'distributor';
    if (value === 'depot' || value === 'دپو') return 'depot';
    return 'agent';
};

const createInitialIceCreamLeg = (): IceCreamLeg => ({
    originCity: '',
    brand: 'میهن',
    destinationCity: '',
    representativeType: 'agent',
    representativeName: '',
});

type LastFreightChoices = {
    loadingType?: string;
    originCity1?: string;
    originCity2?: string;
    brandType?: string;
    brand1?: string;
    brand2?: string;
    vehicleType?: string;
    representativeType?: 'agent' | 'distributor';
};

const applyLastFreightChoices = (
    lastChoices: LastFreightChoices | null,
    lineType: FreightLineType,
    setters: {
        setLoadingLocationState: React.Dispatch<
            React.SetStateAction<{ loadingType: 'single' | 'double'; originCity1: string; originCity2: string }>
        >;
        setBrandState: React.Dispatch<
            React.SetStateAction<{ brandType: 'single' | 'double'; brand1: string; brand2: string }>
        >;
        setCommonState: React.Dispatch<
            React.SetStateAction<{
                loadingDate: string;
                deliveryDate: string;
                cargoValue: number;
                vehicleType: string;
                notes: string;
            }>
        >;
        setDestinations: React.Dispatch<React.SetStateAction<Destination[]>>;
    }
) => {
    if (!lastChoices) return;
    setters.setLoadingLocationState({
        loadingType: (lastChoices.loadingType as 'single' | 'double') || 'single',
        originCity1:
            lastChoices.originCity1 ||
            (lineType === FreightLineType.Dairy
                ? 'کارخانه شهر لبنیات'
                : lineType === FreightLineType.Ambient
                  ? 'انبار مرکزی'
                  : ''),
        originCity2: lastChoices.originCity2 || '',
    });
    setters.setBrandState({
        brandType: (lastChoices.brandType as 'single' | 'double') || 'single',
        brand1: lastChoices.brand1 || 'میهن',
        brand2: lastChoices.brand2 || '',
    });
    if (lastChoices.vehicleType) {
        setters.setCommonState(s => ({ ...s, vehicleType: lastChoices.vehicleType || '' }));
    }
    if (lastChoices.representativeType) {
        setters.setDestinations(prev =>
            prev.map((d, i) =>
                i === 0 ? { ...d, representativeType: lastChoices.representativeType! } : d
            )
        );
    }
};

const splitCombinedField = (value: string): [string, string] => {
    if (!value || !value.includes(' و ')) {
        return [value || '', ''];
    }
    const parts = value.split(' و ').map((p) => p.trim()).filter(Boolean);
    return [parts[0] || '', parts[1] || ''];
};

const buildIceCreamFromDairyLikeForm = (
    loadingLocationState: { loadingType: 'single' | 'double'; originCity1: string; originCity2: string },
    brandState: { brandType: 'single' | 'double'; brand1: string; brand2: string },
    destinations: Partial<Destination>[]
): ReturnType<typeof buildIceCreamFromLegs> => {
    const validDests = destinations.filter((d) => d.city?.trim());
    if (validDests.length === 0) return null;
    if (!loadingLocationState.originCity1.trim()) return null;
    if (loadingLocationState.loadingType === 'double' && !loadingLocationState.originCity2.trim()) {
        return null;
    }
    if (brandState.brandType === 'double' && !brandState.brand2.trim()) return null;

    const originCity =
        loadingLocationState.loadingType === 'double'
            ? `${loadingLocationState.originCity1.trim()} و ${loadingLocationState.originCity2.trim()}`
            : loadingLocationState.originCity1.trim();
    const brand =
        brandState.brandType === 'double'
            ? `${brandState.brand1.trim()} و ${brandState.brand2.trim()}`
            : brandState.brand1.trim();

    const builtDestinations: Destination[] = validDests.map((d) => ({
        id: d.id || generateUUID(),
        city: d.city!.trim(),
        brand: brandState.brand1 as Destination['brand'],
        representativeName: (d.representativeName || '').trim(),
        representativeType: (d.representativeType || 'agent') as Destination['representativeType'],
    }));

    const repNames = builtDestinations.map((d) => d.representativeName).filter(Boolean);

    return {
        originCity,
        brand,
        destinations: builtDestinations,
        loadingType: loadingLocationState.loadingType,
        originCity1: loadingLocationState.originCity1.trim(),
        originCity2:
            loadingLocationState.loadingType === 'double'
                ? loadingLocationState.originCity2.trim()
                : null,
        brandType: brandState.brandType,
        brand1: brandState.brand1.trim(),
        brand2: brandState.brandType === 'double' ? brandState.brand2.trim() : null,
        representativeType: normalizeIceCreamRepType(
            builtDestinations[0].representativeType as string
        ),
        representativeName: repNames.length > 0 ? repNames.join(' و ') : '',
    };
};

const populateIceCreamFormFromAnnouncement = (
    data: FreightAnnouncement & {
        loadingType?: string;
        originCity1?: string;
        originCity2?: string;
        brandType?: string;
        brand1?: string;
        brand2?: string;
    }
) => {
    const loadingType: 'single' | 'double' =
        data.loadingType === 'double' ||
        data.brandType === 'double' ||
        (data.destinations?.length ?? 0) >= 2 ||
        (data.originCity?.includes(' و ') && !data.originCity1)
            ? 'double'
            : 'single';

    const [originA, originB] = data.originCity1
        ? [data.originCity1, data.originCity2 || '']
        : splitCombinedField(data.originCity || '');
    const [brandA, brandB] = data.brand1
        ? [data.brand1, data.brand2 || '']
        : splitCombinedField((data.brand as string) || '');

    const brandType: 'single' | 'double' =
        data.brandType === 'double' || (brandB.trim() !== '' && brandB !== brandA) ? 'double' : 'single';

    const mappedDests =
        (data.destinations || []).length > 0
            ? data.destinations.map((d) => ({
                  ...d,
                  representativeType: d.representativeType || ('agent' as const),
              }))
            : [{ id: generateUUID(), city: '', representativeName: '', representativeType: 'agent' as const }];

    return {
        loadingLocationState: {
            loadingType,
            originCity1: originA,
            originCity2: loadingType === 'double' ? originB : '',
        },
        brandState: {
            brandType,
            brand1: brandA || 'میهن',
            brand2: brandType === 'double' ? brandB || '' : '',
        },
        destinations: mappedDests,
        originCity1Valid: !!originA.trim(),
        originCity2Valid: loadingType === 'double' ? !!originB.trim() : false,
        destCityValid: mappedDests.reduce(
            (acc, d) => {
                if (d.id) acc[d.id] = !!d.city?.trim();
                return acc;
            },
            {} as Record<string, boolean>
        ),
    };
};

const buildIceCreamFromLegs = (
    routeType: 'single' | 'double',
    legs: [IceCreamLeg, IceCreamLeg]
): {
    originCity: string;
    brand: string;
    destinations: Destination[];
    loadingType: 'single' | 'double';
    originCity1: string;
    originCity2: string | null;
    brandType: 'single' | 'double';
    brand1: string;
    brand2: string | null;
    representativeType: 'agent' | 'distributor' | 'depot';
    representativeName: string;
} | null => {
    const activeLegs = routeType === 'double' ? legs : [legs[0]];
    for (let i = 0; i < activeLegs.length; i++) {
        const leg = activeLegs[i];
        if (!leg.originCity.trim() || !leg.brand.trim() || !leg.destinationCity.trim()) {
            return null;
        }
    }
    const originCity = activeLegs.map((l) => l.originCity.trim()).join(' و ');
    const brand = activeLegs.map((l) => l.brand.trim()).join(' و ');
    const destinations: Destination[] = activeLegs.map((leg) => ({
        id: generateUUID(),
        city: leg.destinationCity.trim(),
        brand: leg.brand.trim() as Destination['brand'],
        representativeName: leg.representativeName.trim(),
        representativeType: leg.representativeType as Destination['representativeType'],
    }));
    const repNames = activeLegs.map((l) => l.representativeName.trim()).filter(Boolean);
    return {
        originCity,
        brand,
        destinations,
        loadingType: routeType,
        originCity1: legs[0].originCity.trim(),
        originCity2: routeType === 'double' ? legs[1].originCity.trim() : null,
        brandType: routeType,
        brand1: legs[0].brand.trim(),
        brand2: routeType === 'double' ? legs[1].brand.trim() : null,
        representativeType: activeLegs[0].representativeType,
        representativeName: repNames.length > 0 ? repNames.join(' و ') : '',
    };
};

const parseIceCreamLegsFromAnnouncement = (
    data: FreightAnnouncement & {
        loadingType?: string;
        originCity1?: string;
        originCity2?: string;
        brandType?: string;
        brand1?: string;
        brand2?: string;
    }
): { routeType: 'single' | 'double'; legs: [IceCreamLeg, IceCreamLeg] } => {
    const dests = data.destinations || [];
    const routeType: 'single' | 'double' =
        data.loadingType === 'double' ||
        data.brandType === 'double' ||
        dests.length >= 2
            ? 'double'
            : 'single';

    const [originA, originB] = data.originCity1
        ? [data.originCity1, data.originCity2 || '']
        : splitCombinedField(data.originCity || '');
    const [brandA, brandB] = data.brand1
        ? [data.brand1, data.brand2 || '']
        : splitCombinedField((data.brand as string) || '');

    const [repNameA, repNameB] = splitCombinedField(data.representativeName || '');
    const annRepType = normalizeIceCreamRepType(data.representativeType as string);

    const leg1: IceCreamLeg = {
        originCity: originA,
        brand: brandA || 'میهن',
        destinationCity: dests[0]?.city?.trim() || '',
        representativeType: dests[0]?.representativeType
            ? normalizeIceCreamRepType(dests[0].representativeType as string)
            : annRepType,
        representativeName: (dests[0]?.representativeName || repNameA || data.representativeName || '').trim(),
    };
    const leg2: IceCreamLeg = {
        originCity: originB,
        brand: brandB || 'میهن',
        destinationCity: dests[1]?.city?.trim() || '',
        representativeType: dests[1]?.representativeType
            ? normalizeIceCreamRepType(dests[1].representativeType as string)
            : annRepType,
        representativeName: (dests[1]?.representativeName || repNameB || '').trim(),
    };

    if (routeType === 'single') {
        if (!leg1.destinationCity && dests[0]?.city) {
            leg1.destinationCity = dests[0].city;
        }
        return { routeType: 'single', legs: [leg1, createInitialIceCreamLeg()] };
    }

    return { routeType: 'double', legs: [leg1, leg2] };
};

const columnsConfig = (props: { 
    currentUser: User, 
    onApprove: (id: string) => void, 
    onReject: (id: string) => void, 
    onEdit: (ann: FreightAnnouncement) => void, 
    onSendForApproval: (ann: FreightAnnouncement) => void, 
    onDelete: (id: string) => void,
    onReAnnounce: (announcementId: string) => void,
    onSwitchQueue?: (id: string, nextQueue: 'company' | 'personal') => void,
    onOpenHistory?: (announcementId: string, announcementCode: string) => void,
    changeRequests?: any[],
    onApproveChangeRequest?: (requestId: string, newAnnouncements?: any[]) => void,
    onRejectChangeRequest?: (requestId: string, reviewNote?: string) => void,
    onArchiveChangeRequest?: (requestId: string) => void,
    selectedIds?: string[],
    onToggleSelect?: (id: string) => void
}) => {
    const { currentUser, onApprove, onReject, onEdit, onSendForApproval, onDelete, onReAnnounce } = props;
    
    return [
        // --- Checkbox column for bulk selection ---
        { header: '', width: '40px', display: () => true, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const { selectedIds = [], onToggleSelect } = props;
            const isSelected = selectedIds.includes(ann.id);
            // Draft، Rejected، Leftover و PendingManagerApproval قابل انتخاب هستند
            // بررسی تطابق با enum و همچنین مقادیر رشته‌ای
            const statusStr = String(ann.status);
            const isDraft = ann.status === FreightAnnouncementStatus.Draft || statusStr === 'پیش‌نویس' || statusStr === 'Draft';
            const isRejected = ann.status === FreightAnnouncementStatus.Rejected || statusStr === 'رد شده' || statusStr === 'Rejected';
            const isLeftover = ann.status === FreightAnnouncementStatus.Leftover || statusStr === 'بار مانده' || statusStr === 'Leftover';
            const isPendingApproval = ann.status === FreightAnnouncementStatus.PendingManagerApproval || statusStr === 'در انتظار تایید مدیر' || statusStr === 'PendingManagerApproval';
            const isSelectable = isDraft || isRejected || isLeftover || isPendingApproval;
            return (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect?.(ann.id)}
                    className="cursor-pointer"
                    disabled={!isSelectable}
                />
            );
        }, accessor: (_: any) => '' },
        { header: 'ترتیب', width: '110px', display: (_vm: string, lt: any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const o = props.iceCreamOrder;
            if (!o?.enabled) return null;
            return (
                <IceCreamDisplayOrderControls
                    announcement={ann}
                    index={idx}
                    total={o.total}
                    disabled={o.disabled}
                    onTogglePin={o.onTogglePin}
                    onMove={o.onMove}
                    onDragStart={o.onDragStart}
                    onDragOver={o.onDragOver}
                    onDrop={o.onDrop}
                    isDragOver={o.dragOverId === ann.id}
                />
            );
        }, accessor: () => '' },
        { header: 'ردیف', width: '70px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'نوع بارگیری', accessor: (ann: FreightAnnouncement) => formatLoadingType(ann.loadingType, ann), width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => formatLoadingType(ann.loadingType, ann) },
        { header: 'نوع نماینده', accessor: (ann: FreightAnnouncement) => ann.representativeType, width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => formatRepresentativeType(ann.representativeType) },
        { header: 'مقصد', accessor: (ann: FreightAnnouncement) => getDestinationCitiesLabel(ann), width: '200px', display: (_:string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="text-blue-600 font-semibold">{getDestinationCitiesLabel(ann)}</span> },
        { header: 'نام نماینده', accessor: (ann: FreightAnnouncement) => getRepresentativeNameLabel(ann), width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => getRepresentativeNameLabel(ann) },
        { header: 'مبدا', accessor: 'originCity', width: '140px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
        { header: 'برند', accessor: 'brand', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.brand || '-' },
        { header: 'محصولات', accessor: (ann: FreightAnnouncement) => ann.products?.join(', '), width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
        { header: 'کارتن', accessor: 'cartonCount', width: '80px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.cartonCount ?? '-' },
        { header: 'پالت', accessor: 'palletCount', width: '80px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.palletCount ?? '-' },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
        { header: 'اولویت', accessor: 'priority', width: '100px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => PRIORITIES[ann.priority || 'normal'] },
        { header: 'کارمند اعلام‌کننده', accessor: (ann: any) => ann.creator_full_name || ann.creator_username || '-', width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: any) => <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span> },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'تاریخ تحویل', accessor: 'deliveryDate', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.deliveryDate || '-' },
        { header: 'توضیحات', accessor: 'notes', width: '200px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.notes || '-' },
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
            const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
            return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
        }},
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
            if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                return desc || '-';
            }
            return ann.rejectionReason || '-';
        }},

        // --- Common Columns (for Dairy & Ambient) - ترتیب صحیح ---
        { header: 'ردیف', width: '70px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && vm === 'full', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
        { header: 'برند', accessor: 'brand', width: '120px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.brand || '-' },
        { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0), width: '150px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && vm === 'full', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
        { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
        { header: 'کارمند اعلام‌کننده', accessor: (ann: any) => ann.creator_full_name || ann.creator_username || '-', width: '150px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: any) => <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span> },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'توضیحات', accessor: 'notes', width: '200px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.notes || '-' },
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
            const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
            return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
        }},
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
            if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                return desc || '-';
            }
            return ann.rejectionReason || '-';
        }},

        // Ambient (Compact): destinations list, show kg with delivery date
        { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '500px', display: (vm: string, lt: any) => vm === 'compact' && lt === FreightLineType.Ambient,
            render: (ann: FreightAnnouncement) => (
                <div className="flex flex-col text-xs space-y-1">
                    {ann.destinations.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-center gap-2 flex-wrap">
                            <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                            <span className="font-semibold text-slate-800">{d.city}</span>
                            <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} kg` : '-'})</span>
                            {d.deliveryDate && <span className="text-green-600">📅 {d.deliveryDate}</span>}
                            {d.unloadTime && <span className="text-blue-600">🕐 {d.unloadTime}</span>}
                            <span className="text-purple-600">{d.representativeType === 'distribution' ? 'پخش' : 'نماینده'}</span>
                        </div>
                    ))}
                </div>
            )
        },
        // Dairy (Compact): exact requested order
        { header: 'ردیف', width: '70px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
        { header: 'برند', accessor: 'brand', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.brand || '-' },
        { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0), width: '150px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
        { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '500px', display: (vm: string, lt: any) => vm === 'compact' && lt === FreightLineType.Dairy,
            render: (ann: FreightAnnouncement) => (
                <div className="flex flex-col text-xs space-y-1">
                    {ann.destinations.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-center gap-2 flex-wrap">
                            <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                            <span className="font-semibold text-slate-800">{d.city}</span>
                            <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} kg` : '-'})</span>
                            {d.deliveryDate && <span className="text-green-600">📅 {d.deliveryDate}</span>}
                            {d.unloadTime && <span className="text-blue-600">🕐 {d.unloadTime}</span>}
                            <span className="text-purple-600">{d.representativeType === 'distribution' ? 'پخش' : 'نماینده'}</span>
                        </div>
                    ))}
                </div>
            )
        },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
        { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'توضیحات', accessor: 'notes', width: '200px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.notes || '-' },
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
            return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
        }},
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
            if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                return desc || '-';
            }
            return ann.rejectionReason || '-';
        }},
        { header: 'عملیات', width: '270px', display: () => true, render: (ann: FreightAnnouncement, idx: number, props: any) => {
            const { currentUser, onApprove, onReject, onEdit, onSendForApproval, onDelete, onReAnnounce } = props;
            
            // Debug: بررسی وضعیت
            if (!currentUser) {
                console.warn('[FreightDashboard] Operations: currentUser is missing', { annId: ann.id, annStatus: ann.status });
            }
            
            // بررسی اینکه آیا کاربر ترابری است و بار به ترابری دیگر ارجاع شده
            const isCompanyUser = currentUser?.role === UserRole.TransportationUser || currentUser?.role === UserRole.Transportation;
            const isPersonalUser = currentUser?.role === UserRole.Transportation_Personal_Vehicle_User;
            const assignmentTypeStr = String(ann.assignmentType || '').toLowerCase().trim();
            const statusStr = String(ann.status || '');
            
            // تشخیص اینکه بار به کدام ترابری ارجاع شده
            // اول از status استفاده می‌کنیم (قابل اعتمادتر است)
            // سپس از assignmentType استفاده می‌کنیم
            const isCompanyAssigned = 
                // بررسی بر اساس status
                ann.status === FreightAnnouncementStatus.PendingCompanyAssignment ||
                statusStr === 'PendingCompanyAssignment' ||
                statusStr === 'در انتظار تخصیص ترابری شرکت' ||
                // بررسی بر اساس assignmentType
                assignmentTypeStr === 'company' || 
                assignmentTypeStr === 'شرکتی' ||
                // برای status‌های Assigned و InTransit، از assignmentType استفاده می‌کنیم
                ((ann.status === FreightAnnouncementStatus.Assigned || ann.status === FreightAnnouncementStatus.InTransit) && 
                 (assignmentTypeStr === 'company' || assignmentTypeStr === 'شرکتی'));
            
            const isPersonalAssigned = 
                // بررسی بر اساس status
                ann.status === FreightAnnouncementStatus.PendingPersonalAssignment ||
                statusStr === 'PendingPersonalAssignment' ||
                statusStr === 'در انتظار تخصیص ترابری شخصی' ||
                // بررسی بر اساس assignmentType
                assignmentTypeStr === 'personal' || 
                assignmentTypeStr === 'شخصی' ||
                // برای status‌های Assigned و InTransit، از assignmentType استفاده می‌کنیم
                ((ann.status === FreightAnnouncementStatus.Assigned || ann.status === FreightAnnouncementStatus.InTransit) && 
                 (assignmentTypeStr === 'personal' || assignmentTypeStr === 'شخصی'));
            
            // اگر کاربر ترابری شرکت است و بار به ترابری شخصی ارجاع شده، یا برعکس، همه اکشن‌ها غیرفعال
            const isAssignedToOtherTransport = (isCompanyUser && isPersonalAssigned) || (isPersonalUser && isCompanyAssigned);
            
            // لاگ برای دیباگ - برای همه بارها (نه فقط ترابری)
            // console.log('🔍 [FreightDashboard] Transport assignment check:', {
            //     annId: ann.id,
            //     annCode: ann.announcementCode,
            //     userRole: currentUser?.role,
            //     assignmentType: ann.assignmentType,
            //     assignmentTypeStr,
            //     status: ann.status,
            //     statusStr,
            //     isCompanyUser,
            //     isPersonalUser,
            //     isCompanyAssigned,
            //     isPersonalAssigned,
            //     isAssignedToOtherTransport,
            //     assignedDriverId: ann.assignedDriverId
            // });
            
            // تشخیص اینکه آیا دکمه تاریخچه نمایش داده بشه - همه پرسنل می‌تونن ببینن
            const showHistory = [
                FreightAnnouncementStatus.Draft,
                FreightAnnouncementStatus.PendingManagerApproval,
                FreightAnnouncementStatus.PendingPersonalAssignment,
                FreightAnnouncementStatus.PendingCompanyAssignment,
                FreightAnnouncementStatus.Assigned,
                FreightAnnouncementStatus.InTransit,
                FreightAnnouncementStatus.Finalized,
                FreightAnnouncementStatus.Rejected,
                FreightAnnouncementStatus.Leftover
            ].includes(ann.status);
            
            // بررسی اینکه آیا Leftover است
            const isLeftover = ann.status === FreightAnnouncementStatus.Leftover;
            
            // اگر بار به ترابری دیگر ارجاع شده، همه اکشن‌ها غیرفعال (قبل از همه چک‌ها)
            // این باید در ابتدای تابع بررسی شود تا همه حالات را پوشش دهد
            if (isAssignedToOtherTransport) {
                console.log('🔍 [FreightDashboard] Bar assigned to other transport:', {
                    annId: ann.id,
                    annCode: ann.announcementCode,
                    userRole: currentUser?.role,
                    assignmentType: ann.assignmentType,
                    status: ann.status,
                    isCompanyUser,
                    isPersonalUser,
                    isCompanyAssigned,
                    isPersonalAssigned
                });
                return <span className="text-xs text-slate-400">-</span>;
            }
            
            // تایید/رد مدیر
            if (currentUser?.role === UserRole.PlanningManager && ann.status === FreightAnnouncementStatus.PendingManagerApproval) {
                return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onApprove?.(ann.id)} className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600">تایید</button>
                        <button onClick={() => onReject?.(ann.id)} className="px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600">رد</button>
                    </div>
                );
            }
            
            // دکمه تاریخچه برای مدیر برنامه‌ریزی (بدون دکمه‌های ارجاع)
            if (currentUser?.role === UserRole.PlanningManager && showHistory) {
                return (
                    <div className="flex justify-center gap-1">
                        <button 
                            onClick={() => props.onOpenHistory && props.onOpenHistory(ann.id, ann.announcementCode)} 
                            className="flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                            title="مشاهده تاریخچه تغییرات"
                        >
                            <HistoryIcon className="w-4 h-4" />
                            <span>تاریخچه</span>
                        </button>
                    </div>
                );
            }
            
            // برای Leftover: اعلام مجدد، ویرایش، حذف، تاریخچه
            if (isLeftover && (currentUser?.role === UserRole.PlanningEmployee || currentUser?.role === UserRole.PlanningManager)) {
                return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onReAnnounce?.(ann.id)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">اعلام مجدد</button>
                        <button onClick={() => onEdit?.(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
                        <button type="button" onClick={() => { try { console.log('🗑️ [FreightDashboard] Delete click:', ann.id); } catch {} try { onDelete && onDelete(ann.id); } catch (e) { console.error('❌ [FreightDashboard] Delete failed:', e); } }} className="px-2 py-1 bg-red-500 text-white rounded-md text-xs">حذف</button>
                        {props.onOpenHistory && (
                            <button 
                                onClick={() => props.onOpenHistory(ann.id, ann.announcementCode)} 
                                className="flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                                title="مشاهده تاریخچه تغییرات"
                            >
                                <HistoryIcon className="w-4 h-4" />
                                <span>تاریخچه</span>
                            </button>
                        )}
                    </div>
                );
            }
            
            // درخواست تغییر: دکمه‌های ویرایش، ارجاع، تاریخچه و خارج کردن از کارتابل برای planner
            if (ann.status === FreightAnnouncementStatus.ChangeRequested) {
                const changeReq = (props?.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
                if (changeReq && (currentUser?.role === UserRole.PlanningEmployee || currentUser?.role === UserRole.PlanningManager)) {
                    return (
                        <div className="flex justify-center gap-1 flex-wrap">
                            <button onClick={() => onEdit?.(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
                            <button onClick={() => onSendForApproval?.(ann)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">ارجاع</button>
                            {props?.onOpenHistory && (
                                <button 
                                    onClick={() => props.onOpenHistory(ann.id, ann.announcementCode)} 
                                    className="flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                                    title="مشاهده تاریخچه تغییرات"
                                >
                                    <HistoryIcon className="w-4 h-4" />
                                    <span>تاریخچه</span>
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (confirm('آیا می‌خواهید این درخواست را از کارتابل خارج کنید؟')) {
                                        props?.onArchiveChangeRequest?.(changeReq.id);
                                    }
                                }}
                                className="px-3 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600"
                            >
                                از کارتابل خارج شود
                            </button>
                        </div>
                    );
                }
                // اگر changeReq پیدا نشد یا کاربر planner نیست، فقط تاریخچه نمایش بده
                if (props?.onOpenHistory) {
                    return (
                        <div className="flex justify-center gap-1">
                            <button 
                                onClick={() => props.onOpenHistory(ann.id, ann.announcementCode)} 
                                className="flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                                title="مشاهده تاریخچه تغییرات"
                            >
                                <HistoryIcon className="w-4 h-4" />
                                <span>تاریخچه</span>
                            </button>
                        </div>
                    );
                }
            }
            
            // ویرایش/حذف (کارمند و مدیر برنامه‌ریزی) - فقط برای Draft و Rejected
            if ((currentUser?.role === UserRole.PlanningEmployee || currentUser?.role === UserRole.PlanningManager) && [FreightAnnouncementStatus.Draft, FreightAnnouncementStatus.Rejected].includes(ann.status)) {
                 return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onEdit?.(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
                        <button onClick={() => onSendForApproval?.(ann)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">ارجاع</button>
                        <button type="button" onClick={() => { try { console.log('🗑️ [FreightDashboard] Delete click:', ann.id); } catch {} try { onDelete && onDelete(ann.id); } catch (e) { console.error('❌ [FreightDashboard] Delete failed:', e); } }} className="px-2 py-1 bg-red-500 text-white rounded-md text-xs">حذف</button>
                    </div>
                 );
            }
            
            // برای Archived: ویرایش و ارجاع (برای بازگرداندن به چرخه)
            if ((currentUser?.role === UserRole.PlanningEmployee || currentUser?.role === UserRole.PlanningManager) && ann.status === FreightAnnouncementStatus.Archived) {
                return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onEdit?.(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
                        <button onClick={() => onSendForApproval?.(ann)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">ارجاع</button>
                        {props?.onOpenHistory && (
                            <button 
                                onClick={() => props.onOpenHistory(ann.id, ann.announcementCode)} 
                                className="flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                                title="مشاهده تاریخچه تغییرات"
                            >
                                <HistoryIcon className="w-4 h-4" />
                                <span>تاریخچه</span>
                            </button>
                        )}
                    </div>
                );
            }
            
            // دکمه تاریخچه برای همه پرسنل (شامل ترابری شرکتی و شخصی) - fallback
            // این باید همیشه نمایش داده شود اگر onOpenHistory موجود باشد
            if (props?.onOpenHistory) {
                return (
                    <div className="flex justify-center gap-1">
                        <button 
                            onClick={() => props.onOpenHistory(ann.id, ann.announcementCode)} 
                            className="flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"
                            title="مشاهده تاریخچه تغییرات"
                        >
                            <HistoryIcon className="w-4 h-4" />
                            <span>تاریخچه</span>
                        </button>
                    </div>
                );
            }
            
            // اگر هیچ دکمه‌ای نمایش داده نشد، یک placeholder نمایش بده
            return <span className="text-xs text-slate-400">-</span>;
        }}
    ];
};

const FreightDashboard: React.FC<FreightDashboardProps> = (props) => {
    const { announcements, onAddAnnouncement, onUpdateAnnouncement, onApprove, onReject, onDelete, onReAnnounce, currentUser, onSendForApproval, changeRequests = [], loadingChangeRequests = false, onFetchChangeRequests, onApproveChangeRequest, onRejectChangeRequest, onArchiveChangeRequest, onUpdateIceCreamDisplayOrder } = props;
    
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelData, setPanelData] = useState<FreightAnnouncement | null>(null); // null for new, object for edit

    const [rejectInfo, setRejectInfo] = useState<{ id: string; reason: string } | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    const [activeTab, setActiveTab] = useState<FreightLineType>(FreightLineType.IceCream);
    const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
    const [filter, setFilter] = useState('');
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});
    const [managerView, setManagerView] = useState<'approval' | 'all'>('approval');
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [historyDialog, setHistoryDialog] = useState<{ isOpen: boolean; announcementId: string; announcementCode: string } | null>(null);
    const [routeQuery, setRouteQuery] = useState('');
    const [routeSuggestions, setRouteSuggestions] = useState<DispatchRouteSuggestion[]>([]);
    const routeSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [iceCreamDragSourceId, setIceCreamDragSourceId] = useState<string | null>(null);
    const [iceCreamDragOverId, setIceCreamDragOverId] = useState<string | null>(null);
    const [iceCreamOrderSaving, setIceCreamOrderSaving] = useState(false);
    
    // مجوزهای کاربر
    const [userPermissions, setUserPermissions] = useState<{ lineType: string; permissionType: 'approval' | 'create' }[]>([]);
    const [allowedLineTypes, setAllowedLineTypes] = useState<FreightLineType[]>([]);
    
    // دریافت مجوزهای کاربر
    useEffect(() => {
        const fetchUserPermissions = async () => {
            if (!currentUser || currentUser.role === UserRole.Admin) {
                // Admin همه مجوزها را دارد
                setAllowedLineTypes([FreightLineType.IceCream, FreightLineType.Dairy, FreightLineType.Ambient]);
                return;
            }
            
            const isManager = currentUser.role === UserRole.PlanningManager || 
                             currentUser.role === 'planner_manager' || 
                             currentUser.role === 'مدیر برنامه‌ریزی';
            const isEmployee = currentUser.role === UserRole.PlanningEmployee || 
                              currentUser.role === 'planner' || 
                              currentUser.role === 'کارمند برنامه‌ریزی';
            
            if (!isManager && !isEmployee) {
                // اگر نه مدیر و نه کارمند، همه مجوزها را دارد
                setAllowedLineTypes([FreightLineType.IceCream, FreightLineType.Dairy, FreightLineType.Ambient]);
                return;
            }
            
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
                };
                
                const res = await fetch(getApiUrl('planning-manager-approval-permissions/permissions'), { headers });
                if (res.ok) {
                    const permissions = await res.json();
                    const userPerms = permissions.filter((p: any) => p.user_id === currentUser.id);
                    setUserPermissions(userPerms);
                    
                    // استخراج لاین‌های مجاز
                    const permissionType = isManager ? 'approval' : 'create';
                    const allowed = userPerms
                        .filter((p: any) => p.permission_type === permissionType)
                        .map((p: any) => {
                            if (p.line_type === 'IceCream') return FreightLineType.IceCream;
                            if (p.line_type === 'Dairy') return FreightLineType.Dairy;
                            if (p.line_type === 'Ambient') return FreightLineType.Ambient;
                            return p.line_type;
                        })
                        .filter((lt: any) => Object.values(FreightLineType).includes(lt));
                    
                    setAllowedLineTypes(allowed.length > 0 ? allowed : [FreightLineType.IceCream, FreightLineType.Dairy, FreightLineType.Ambient]);
                    
                    // اگر تب فعلی مجاز نیست، به اولین تب مجاز برو
                    if (allowed.length > 0 && !allowed.includes(activeTab)) {
                        setActiveTab(allowed[0]);
                    }
                }
            } catch (error) {
                console.error('Error fetching user permissions:', error);
                // در صورت خطا، همه مجوزها را بده
                setAllowedLineTypes([FreightLineType.IceCream, FreightLineType.Dairy, FreightLineType.Ambient]);
            }
        };
        
        fetchUserPermissions();
    }, [currentUser]);


    const handleOpenCreatePanel = useCallback(() => {
        // Create mode: no preset data object to avoid accidental edit-mode
        setPanelData(null);
        setIsPanelOpen(true);
    }, []);

    const handleOpenEditPanel = useCallback((ann: FreightAnnouncement) => {
        setPanelData(ann);
        setIsPanelOpen(true);
    }, []);
    
    const handleClosePanel = useCallback(() => {
        setIsPanelOpen(false);
    }, []);

    const handleOpenHistory = useCallback((announcementId: string, announcementCode: string) => {
        setHistoryDialog({ isOpen: true, announcementId, announcementCode });
    }, []);

    const handleCloseHistory = useCallback(() => {
        setHistoryDialog(null);
    }, []);

    const handleOpenRejectDialog = useCallback((id: string) => setRejectInfo({ id, reason: '' }), []);
    const handleCloseRejectDialog = useCallback(() => setRejectInfo(null), []);
    
    const handleRejectSubmit = useCallback(() => {
        if (rejectInfo && rejectInfo.reason) {
            onReject(rejectInfo.id, rejectInfo.reason);
            handleCloseRejectDialog();
        }
    }, [rejectInfo, onReject, handleCloseRejectDialog]);

    const handleSendForApproval = useCallback((ann: FreightAnnouncement) => {
        // اگر onSendForApproval از props ارسال شده، از آن استفاده می‌کنیم
        if (onSendForApproval) {
            onSendForApproval(ann);
        } else {
            // fallback به onUpdateAnnouncement
            onUpdateAnnouncement({ ...ann, status: FreightAnnouncementStatus.PendingManagerApproval });
        }
    }, [onSendForApproval, onUpdateAnnouncement]);

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) 
                ? prev.filter(selectedId => selectedId !== id)
                : [...prev, id]
        );
    }, []);

    const handleBulkSendForApproval = async () => {
        if (selectedIds.length === 0) {
            alert('لطفاً حداقل یک اعلام بار را انتخاب کنید');
            return;
        }
        if (!confirm(`آیا می‌خواهید ${selectedIds.length} اعلام بار را ارجاع دهید؟`)) {
            return;
        }
        try {
            // فیلتر بر اساس lineType فعلی (پاستوریزه، بستنی، لبنیات-فروتلند)
            const currentLineTypeAnnouncements = announcements.filter(ann => ann.lineType === activeTab);
            console.log('🔍 [handleBulkSendForApproval] Current lineType:', activeTab, 'Total announcements:', currentLineTypeAnnouncements.length);
            
            const selectedAnnouncements = currentLineTypeAnnouncements.filter(ann => {
                if (!selectedIds.includes(ann.id)) return false;
                const statusStr = String(ann.status);
                const isDraft = ann.status === FreightAnnouncementStatus.Draft || statusStr === 'پیش‌نویس' || statusStr === 'Draft';
                const isRejected = ann.status === FreightAnnouncementStatus.Rejected || statusStr === 'رد شده' || statusStr === 'Rejected';
                const isLeftover = ann.status === FreightAnnouncementStatus.Leftover || statusStr === 'بار مانده' || statusStr === 'Leftover';
                const isPendingApproval = ann.status === FreightAnnouncementStatus.PendingManagerApproval || statusStr === 'در انتظار تایید مدیر' || statusStr === 'PendingManagerApproval';
                const isSelectable = isDraft || isRejected || isLeftover || isPendingApproval;
                console.log('🔍 [handleBulkSendForApproval] Announcement:', ann.announcementCode, 'lineType:', ann.lineType, 'status:', ann.status, 'isSelectable:', isSelectable);
                return isSelectable;
            });
            
            console.log('🔍 [handleBulkSendForApproval] Selected announcements:', selectedAnnouncements.length, selectedAnnouncements.map(a => ({ code: a.announcementCode, lineType: a.lineType, status: a.status })));
            
            if (selectedAnnouncements.length === 0) {
                alert('هیچ اعلام باری برای ارجاع یافت نشد. فقط اعلام بارهای پیش‌نویس، رد شده، بار مانده یا در انتظار تایید مدیر قابل انتخاب هستند.');
                setSelectedIds([]);
                return;
            }

            // تقسیم بارها به دو دسته:
            // 1. بارهای PendingManagerApproval: باید تایید شوند (onApprove) تا به ترابری ارجاع شوند
            // 2. بارهای Draft/Rejected/Leftover: باید ارجاع شوند (onSendForApproval) تا به مدیر ارجاع شوند
            const announcementsToApprove = selectedAnnouncements.filter(ann => {
                const statusStr = String(ann.status);
                return ann.status === FreightAnnouncementStatus.PendingManagerApproval || statusStr === 'در انتظار تایید مدیر' || statusStr === 'PendingManagerApproval';
            });
            
            const announcementsToSend = selectedAnnouncements.filter(ann => {
                const statusStr = String(ann.status);
                const isDraft = ann.status === FreightAnnouncementStatus.Draft || statusStr === 'پیش‌نویس' || statusStr === 'Draft';
                const isRejected = ann.status === FreightAnnouncementStatus.Rejected || statusStr === 'رد شده' || statusStr === 'Rejected';
                const isLeftover = ann.status === FreightAnnouncementStatus.Leftover || statusStr === 'بار مانده' || statusStr === 'Leftover';
                return isDraft || isRejected || isLeftover;
            });
            
            // اگر هیچ باری برای ارجاع یا تایید وجود ندارد
            if (announcementsToApprove.length === 0 && announcementsToSend.length === 0) {
                alert('هیچ اعلام باری برای ارجاع یافت نشد.');
                setSelectedIds([]);
                return;
            }
            
            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];
            
            // تایید بارهای PendingManagerApproval (ارجاع به ترابری)
            await Promise.allSettled(announcementsToApprove.map(async (ann) => {
                try {
                    if (onApprove) {
                        await onApprove(ann.id);
                    } else {
                        await onUpdateAnnouncement({ ...ann, status: FreightAnnouncementStatus.PendingCompanyAssignment });
                    }
                    successCount++;
                } catch (error: any) {
                    errorCount++;
                    errors.push(`بار ${ann.announcementCode}: ${error.message || 'خطای نامشخص'}`);
                }
            }));
            
            // ارجاع بارهای Draft/Rejected/Leftover (ارجاع به مدیر)
            await Promise.allSettled(announcementsToSend.map(async (ann) => {
                try {
                    if (onSendForApproval) {
                        // ارسال بدون نمایش نوتیفیکیشن (پارامتر دوم false)
                        await (onSendForApproval as any)(ann, false);
                    } else {
                        await onUpdateAnnouncement({ ...ann, status: FreightAnnouncementStatus.PendingManagerApproval });
                    }
                    successCount++;
                } catch (error: any) {
                    errorCount++;
                    errors.push(`بار ${ann.announcementCode}: ${error.message || 'خطای نامشخص'}`);
                }
            }));
            
            setSelectedIds([]);
            
            // نمایش یک نوتیفیکیشن واحد
            const approveCount = announcementsToApprove.length;
            const sendCount = announcementsToSend.length;
            let message = '';
            
            if (errorCount === 0) {
                if (approveCount > 0 && sendCount > 0) {
                    message = `${approveCount} اعلام بار تایید شد و ${sendCount} اعلام بار ارجاع شد`;
                } else if (approveCount > 0) {
                    message = `${approveCount} اعلام بار با موفقیت تایید شد و به ترابری ارجاع شد`;
                } else if (sendCount > 0) {
                    message = `${sendCount} اعلام بار با موفقیت ارجاع شد`;
                }
                alert(message);
            } else if (successCount > 0) {
                if (approveCount > 0 && sendCount > 0) {
                    message = `${successCount} اعلام بار با موفقیت پردازش شد (${approveCount} تایید، ${sendCount} ارجاع)، ${errorCount} مورد ناموفق بود`;
                } else if (approveCount > 0) {
                    message = `${successCount} اعلام بار با موفقیت تایید شد، ${errorCount} مورد ناموفق بود`;
                } else if (sendCount > 0) {
                    message = `${successCount} اعلام بار با موفقیت ارجاع شد، ${errorCount} مورد ناموفق بود`;
                }
                alert(message);
            } else {
                alert(`خطا در پردازش: ${errors.join('، ')}`);
            }
        } catch (error) {
            console.error('Bulk send for approval failed:', error);
            alert('خطا در ارجاع دسته‌ای');
        }
    };


    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    };

    const isManager = currentUser.role === UserRole.PlanningManager;
    const canCreate = hasAccess([UserRole.PlanningEmployee]);

    const handleColumnFilterChange = (header: string, value: string) => {
        setColumnFilters(prev => ({ ...prev, [header]: value }));
    };

    // حذف leftoverColumns - دیگر نیازی نیست چون در هر تب لاین نمایش داده می‌شوند

    const allColumns = useMemo(() => {
        const cols = columnsConfig({ 
            ...props, 
            onApprove, 
            onReject: handleOpenRejectDialog, 
            onEdit: handleOpenEditPanel, 
            onSendForApproval: handleSendForApproval, 
            onDelete: onDelete,
            changeRequests: changeRequests,
            onReAnnounce: onReAnnounce,
            onOpenHistory: handleOpenHistory,
            onApproveChangeRequest: onApproveChangeRequest,
            onRejectChangeRequest: onRejectChangeRequest,
            onArchiveChangeRequest: onArchiveChangeRequest,
            selectedIds: selectedIds,
            onToggleSelect: handleToggleSelect
        });
        try { console.log('[DBG][FreightDashboard] allColumns headers:', cols.map((c:any)=>c.header)); } catch {}
        return cols;
    }, [props, onApprove, handleOpenRejectDialog, handleOpenEditPanel, handleSendForApproval, onDelete, onReAnnounce, selectedIds]);

    useEffect(() => {
        if (routeSearchTimeout.current) {
            clearTimeout(routeSearchTimeout.current);
        }
        const trimmed = routeQuery.trim();
        routeSearchTimeout.current = setTimeout(async () => {
            try {
                const results = trimmed.length >= 2 ? await props.onSearchRoutes(trimmed) : [];
                setRouteSuggestions(results);
            } catch (error) {
                console.error('[FreightDashboard] Route suggestion fetch failed', error);
                setRouteSuggestions([]);
            }
        }, 300);

        return () => {
            if (routeSearchTimeout.current) {
                clearTimeout(routeSearchTimeout.current);
            }
        };
    }, [routeQuery, props.onSearchRoutes]);

    const uniqueRouteOptions = useMemo(() => {
        const seen = new Set<string>();
        return routeSuggestions.filter((route) => {
            const key = `${route.city}-${route.province}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }, [routeSuggestions]);

    const visibleColumns = useMemo(() => {
        // Enforce exact order for Dairy compact
        if (viewMode === 'compact' && activeTab === FreightLineType.Dairy) {
            const checkboxCol = allColumns.find((c: any) => c.header === '');
            const dairyCompactCols: any[] = checkboxCol ? [checkboxCol] : [];
            dairyCompactCols.push(
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', accessor: 'brand', width: '120px', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '500px', render: (ann: FreightAnnouncement) => (
                    <div className="flex flex-col text-xs space-y-1">
                        {ann.destinations.map((d, i) => (
                            <div key={d.id} className="flex items-center justify-center gap-2 flex-wrap">
                                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span className="font-semibold text-slate-800">{d.city}</span>
                                <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} kg` : '-'})</span>
                                {d.deliveryDate && <span className="text-green-600">📅 {d.deliveryDate}</span>}
                                {d.unloadTime && <span className="text-blue-600">🕐 {d.unloadTime}</span>}
                                <span className="text-purple-600">{d.representativeType === 'distribution' ? 'پخش' : 'نماینده'}</span>
                            </div>
                        ))}
                    </div>
                )},
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
                    return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
                }},
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
                    if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                        const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                        return desc || '-';
                    }
                    return ann.rejectionReason || '-';
                }},
            );
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) dairyCompactCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (dairy-compact):', dairyCompactCols.map((c:any)=>c.header)); } catch {}
            return dairyCompactCols;
        }

        // Enforce exact order for Ambient compact (mirror Dairy compact)
        if (viewMode === 'compact' && activeTab === FreightLineType.Ambient) {
            const checkboxCol = allColumns.find((c: any) => c.header === '');
            const ambientCompactCols: any[] = checkboxCol ? [checkboxCol] : [];
            ambientCompactCols.push(
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', accessor: 'brand', width: '120px', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '400px', render: (ann: FreightAnnouncement) => (
                    <div className="flex flex-col text-xs space-y-1">
                        {ann.destinations.map((d, i) => (
                            <div key={d.id} className="flex items-center justify-center gap-2">
                                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span className="font-semibold text-slate-800">{d.city}</span>
                                <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} کیلوگرم` : ' N/A '})</span>
                            </div>
                        ))}
                    </div>
                )},
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
                    return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
                }},
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
                    if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                        const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                        return desc || '-';
                    }
                    return ann.rejectionReason || '-';
                }},
            );
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) ambientCompactCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (ambient-compact):', ambientCompactCols.map((c:any)=>c.header)); } catch {}
            return ambientCompactCols;
        }

        // Enforce exact order for Dairy full (before grouped destinations)
        if (viewMode === 'full' && activeTab === FreightLineType.Dairy) {
            const checkboxCol = allColumns.find((c: any) => c.header === '');
            const dairyFullCommonCols: any[] = checkboxCol ? [checkboxCol] : [];
            dairyFullCommonCols.push(
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', accessor: 'brand', width: '120px', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
                    return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
                }},
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
                    if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                        const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                        return desc || '-';
                    }
                    return ann.rejectionReason || '-';
                }},
            );
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) dairyFullCommonCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (dairy-full):', dairyFullCommonCols.map((c:any)=>c.header)); } catch {}
            return dairyFullCommonCols;
        }

        // Enforce exact order for Ambient full (mirror Dairy full)
        if (viewMode === 'full' && activeTab === FreightLineType.Ambient) {
            const checkboxCol = allColumns.find((c: any) => c.header === '');
            const ambientFullCommonCols: any[] = checkboxCol ? [checkboxCol] : [];
            ambientFullCommonCols.push(
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', accessor: 'brand', width: '120px', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const status = ann.status === FreightAnnouncementStatus.ChangeRequested ? 'درخواست تغییر' : ann.status;
                    return <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{status}</span>;
                }},
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement, idx: number, props: any) => {
                    const changeReq = (props.changeRequests || []).find((cr: any) => cr.announcement_id === ann.id || cr.freight_announcement_id === ann.id);
                    if (changeReq && ann.status === FreightAnnouncementStatus.ChangeRequested) {
                        const desc = typeof changeReq.payload === 'string' ? (JSON.parse(changeReq.payload || '{}')?.description || changeReq.payload) : (changeReq.payload?.description || '');
                        return desc || '-';
                    }
                    return ann.rejectionReason || '-';
                }},
            );
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) ambientFullCommonCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (ambient-full):', ambientFullCommonCols.map((c:any)=>c.header)); } catch {}
            return ambientFullCommonCols;
        }

        const cols = allColumns.filter(c => c.display(viewMode, activeTab));
        // Deduplicate by header to avoid duplicate React keys
        const seen = new Set<string>();
        const uniqueCols = cols.filter((c: any) => {
            if (seen.has(c.header)) return false;
            seen.add(c.header);
            return true;
        });
        try { console.log('[DBG][FreightDashboard] visibleColumns:', { viewMode, activeTab, headers: uniqueCols.map((c:any)=>c.header) }); } catch {}
        return uniqueCols;
    }, [viewMode, activeTab, allColumns]);

    const filteredAnnouncements = useMemo(() => {
        let data = announcements;

        // فیلتر بر اساس لاین فعلی
        data = data.filter(a => a.lineType === activeTab);
        
        // فیلتر بر اساس مجوزهای کاربر (برای مدیران و کارمندان برنامه‌ریزی)
        if (currentUser && currentUser.role !== UserRole.Admin) {
            const isManager = currentUser.role === UserRole.PlanningManager || 
                             currentUser.role === 'planner_manager' || 
                             currentUser.role === 'مدیر برنامه‌ریزی';
            const isEmployee = currentUser.role === UserRole.PlanningEmployee || 
                              currentUser.role === 'planner' || 
                              currentUser.role === 'کارمند برنامه‌ریزی';
            
            if (isManager || isEmployee) {
                // فقط بارهای لاین‌های مجاز را نمایش بده
                data = data.filter(a => allowedLineTypes.includes(a.lineType as any));
            }
        }
        
        if (isManager && managerView === 'approval') {
            // مدیر در حالت "در انتظار تایید": فقط PendingManagerApproval
            data = data.filter(a => a.status === FreightAnnouncementStatus.PendingManagerApproval);
        } else if (isManager && managerView === 'all') {
            // مدیر در حالت "همه": همه وضعیت‌ها جز Finalized و InTransit (این‌ها در تاریخچه هستند)
            data = data.filter(a => {
                const statusStr = String(a.status);
                const isFinalized = a.status === FreightAnnouncementStatus.Finalized || statusStr === 'Finalized' || statusStr === 'تکمیل شده';
                const isInTransit = a.status === FreightAnnouncementStatus.InTransit || statusStr === 'InTransit' || statusStr === 'در حال حمل';
                const isArchived =
                    a.status === FreightAnnouncementStatus.Archived ||
                    statusStr === 'Archived' ||
                    statusStr === 'بایگانی شده';
                return !isFinalized && !isInTransit && !isArchived;
            });
        } else {
            // برای planner: همه وضعیت‌ها نمایش داده می‌شوند جز Finalized و InTransit
            // بارهایی که تخصیص داده شده‌اند و رفته‌اند به تاریخچه (Finalized یا InTransit) باید از کارتابل خارج شوند
            data = data.filter(a => {
                const statusStr = String(a.status);
                const isFinalized = a.status === FreightAnnouncementStatus.Finalized || statusStr === 'Finalized' || statusStr === 'تکمیل شده';
                const isInTransit = a.status === FreightAnnouncementStatus.InTransit || statusStr === 'InTransit' || statusStr === 'در حال حمل';
                const isArchived =
                    a.status === FreightAnnouncementStatus.Archived ||
                    statusStr === 'Archived' ||
                    statusStr === 'بایگانی شده';
                return !isFinalized && !isInTransit && !isArchived;
            });
        }

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            data = data.filter(a => 
                a.announcementCode.toLowerCase().includes(lowerFilter) || 
                (a.destinations || []).some(d => d.city && String(d.city).toLowerCase().includes(lowerFilter))
            );
        }

        data = data.filter(ann => {
            return Object.entries(columnFilters).every(([header, filterValue]) => {
                if (!filterValue) return true;
                
                const column = allColumns.find(c => c.header === header);
                if (!column || !('accessor' in column) || !column.accessor) return true;

                let cellValue: any;
                if (typeof column.accessor === 'function') {
                    cellValue = column.accessor(ann);
                } else if (typeof column.accessor === 'string') {
                    cellValue = ann[column.accessor as keyof FreightAnnouncement];
                }
                
                // FIX: Explicitly convert cellValue to a string to prevent 'toLowerCase' on a non-string type.
                const valueAsString: string = String(cellValue ?? '');
                const filterString: string = String(filterValue ?? '');
                return valueAsString.toLowerCase().includes(filterString.toLowerCase());
            });
        });

        const sorted =
            activeTab === FreightLineType.IceCream
                ? sortByIceCreamDisplayOrder(data)
                : data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return sorted;
    }, [announcements, isManager, managerView, activeTab, filter, columnFilters, allColumns, allowedLineTypes, currentUser]);

    const canManageIceCreamOrder =
        activeTab === FreightLineType.IceCream && typeof onUpdateIceCreamDisplayOrder === 'function';

    const tableAnnouncements = filteredAnnouncements;

    const persistIceCreamOrder = useCallback(
        async (ordered: FreightAnnouncement[]) => {
            if (!onUpdateIceCreamDisplayOrder) return;
            setIceCreamOrderSaving(true);
            try {
                await onUpdateIceCreamDisplayOrder(buildIceCreamDisplayOrderPayload(ordered));
            } finally {
                setIceCreamOrderSaving(false);
            }
        },
        [onUpdateIceCreamDisplayOrder]
    );

    const handleIceCreamTogglePin = useCallback(
        (id: string) => {
            const list = tableAnnouncements.map((a) => ({ ...a }));
            const idx = list.findIndex((a) => a.id === id);
            if (idx < 0) return;
            const item = { ...list[idx], displayPinned: !list[idx].displayPinned };
            list.splice(idx, 1);
            if (item.displayPinned) {
                list.unshift(item);
            } else {
                const firstUnpinned = list.findIndex((a) => !a.displayPinned);
                list.splice(firstUnpinned === -1 ? list.length : firstUnpinned, 0, item);
            }
            void persistIceCreamOrder(list);
        },
        [tableAnnouncements, persistIceCreamOrder]
    );

    const handleIceCreamMoveRow = useCallback(
        (id: string, direction: 'up' | 'down') => {
            const list = [...tableAnnouncements];
            const idx = list.findIndex((a) => a.id === id);
            const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
            [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
            void persistIceCreamOrder(list);
        },
        [tableAnnouncements, persistIceCreamOrder]
    );

    const handleIceCreamDrop = useCallback(
        (targetId: string) => {
            if (!iceCreamDragSourceId || iceCreamDragSourceId === targetId) return;
            const list = [...tableAnnouncements];
            const fromIdx = list.findIndex((a) => a.id === iceCreamDragSourceId);
            const toIdx = list.findIndex((a) => a.id === targetId);
            if (fromIdx < 0 || toIdx < 0) return;
            const [moved] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, moved);
            void persistIceCreamOrder(list);
            setIceCreamDragSourceId(null);
            setIceCreamDragOverId(null);
        },
        [iceCreamDragSourceId, tableAnnouncements, persistIceCreamOrder]
    );

    const iceCreamOrderProps = useMemo(
        () => ({
            enabled: canManageIceCreamOrder,
            total: tableAnnouncements.length,
            disabled: iceCreamOrderSaving,
            dragOverId: iceCreamDragOverId,
            onTogglePin: handleIceCreamTogglePin,
            onMove: handleIceCreamMoveRow,
            onDragStart: (id: string) => setIceCreamDragSourceId(id),
            onDragOver: (_e: React.DragEvent, id: string) => setIceCreamDragOverId(id),
            onDrop: handleIceCreamDrop,
        }),
        [
            canManageIceCreamOrder,
            tableAnnouncements.length,
            iceCreamOrderSaving,
            iceCreamDragOverId,
            handleIceCreamTogglePin,
            handleIceCreamMoveRow,
            handleIceCreamDrop,
        ]
    );

    const tableCellProps = useMemo(
        () => ({
            changeRequests,
            onApproveChangeRequest,
            onRejectChangeRequest,
            onArchiveChangeRequest,
            onOpenHistory: handleOpenHistory,
            currentUser,
            onEdit: handleOpenEditPanel,
            onSendForApproval: handleSendForApproval,
            onDelete,
            onApprove,
            onReject: handleOpenRejectDialog,
            onReAnnounce,
            selectedIds,
            onToggleSelect: handleToggleSelect,
            iceCreamOrder: iceCreamOrderProps,
        }),
        [
            changeRequests,
            onApproveChangeRequest,
            onRejectChangeRequest,
            onArchiveChangeRequest,
            currentUser,
            onDelete,
            onApprove,
            onReAnnounce,
            selectedIds,
            iceCreamOrderProps,
        ]
    );

    // Helper function to check if an announcement is selectable
    const isAnnouncementSelectable = useCallback((ann: FreightAnnouncement) => {
        const statusStr = String(ann.status);
        const isDraft = ann.status === FreightAnnouncementStatus.Draft || statusStr === 'پیش‌نویس' || statusStr === 'Draft';
        const isRejected = ann.status === FreightAnnouncementStatus.Rejected || statusStr === 'رد شده' || statusStr === 'Rejected';
        const isLeftover = ann.status === FreightAnnouncementStatus.Leftover || statusStr === 'بار مانده' || statusStr === 'Leftover';
        const isPendingApproval = ann.status === FreightAnnouncementStatus.PendingManagerApproval || statusStr === 'در انتظار تایید مدیر' || statusStr === 'PendingManagerApproval';
        return isDraft || isRejected || isLeftover || isPendingApproval;
    }, []);

    const handleSelectAll = useCallback(() => {
        console.log('[handleSelectAll] Total filteredAnnouncements:', filteredAnnouncements.length);
        console.log('[handleSelectAll] All statuses:', filteredAnnouncements.map(a => ({ id: a.id, status: a.status, statusEnum: FreightAnnouncementStatus.Draft, statusMatch: a.status === FreightAnnouncementStatus.Draft || a.status === 'پیش‌نویس' || a.status === 'Draft' })));
        
        // بررسی تطابق با enum و همچنین مقادیر رشته‌ای
        const selectableAnnouncements = filteredAnnouncements.filter(isAnnouncementSelectable);
        
        console.log('[handleSelectAll] Selectable announcements:', selectableAnnouncements.length, selectableAnnouncements.map(a => ({ id: a.id, status: a.status })));
        console.log('[handleSelectAll] Current selectedIds:', selectedIds);
        const allSelected = selectableAnnouncements.length > 0 && selectableAnnouncements.every(ann => selectedIds.includes(ann.id));
        console.log('[handleSelectAll] All selected?', allSelected);
        if (allSelected) {
            setSelectedIds([]);
        } else {
            const newSelectedIds = selectableAnnouncements.map(ann => ann.id);
            console.log('[handleSelectAll] Setting new selectedIds:', newSelectedIds);
            setSelectedIds(newSelectedIds);
        }
    }, [filteredAnnouncements, selectedIds, isAnnouncementSelectable]);

    const exportTableProps = useMemo(
        () => ({ changeRequests }),
        [changeRequests]
    );

    const getExportValue = (ann: FreightAnnouncement, col: any, idx: number) => {
        let value: unknown = '';

        if (col.render) {
            try {
                const rendered = col.render(ann, idx, exportTableProps);
                if (typeof rendered === 'string' || typeof rendered === 'number') {
                    value = rendered;
                } else if (React.isValidElement(rendered)) {
                    const text = extractTextFromReact(rendered);
                    value = text.replace(/[📅🕐]/g, '').trim();
                } else if (rendered != null) {
                    value = String(rendered);
                }
            } catch {
                /* اگر render به props جدول نیاز داشت و خطا داد، از accessor استفاده می‌شود */
            }
        }
        if (value === '' && col.accessor) {
            if (typeof col.accessor === 'function') {
                value = col.accessor(ann, idx);
            } else {
                value = ann[col.accessor as keyof FreightAnnouncement];
            }
        }

        if (Array.isArray(value)) {
            return localizeExcelValue(value.join('؛ '));
        }

        return localizeExcelValue(value ?? '');
    };

    const extractTextFromReact = (element: React.ReactNode): string => {
        if (element == null || typeof element === 'boolean') return '';
        if (typeof element === 'string' || typeof element === 'number') return String(element);
        if (Array.isArray(element)) return element.map(extractTextFromReact).join(' ');
        if (React.isValidElement(element)) {
            const children = (element.props as { children?: React.ReactNode }).children;
            if (children == null) return '';
            if (typeof children === 'string' || typeof children === 'number') return String(children);
            if (Array.isArray(children)) return children.map(extractTextFromReact).join(' ');
            return extractTextFromReact(children);
        }
        return '';
    };

    const [pendingExportMode, setPendingExportMode] = useState<'compact' | 'full' | null>(null);

    const runExcelExport = useCallback(
        async (mode: 'compact' | 'full', cols: typeof visibleColumns) => {
            try {
                const exportCols = cols.filter(
                    c => c.header && c.header !== 'عملیات' && c.header !== ''
                );
                const headers = exportCols.map(c => c.header);
                const rows = filteredAnnouncements.map((ann, idx) =>
                    exportCols.map(col => {
                        const value = getExportValue(ann, col, idx);
                        if (value === null || value === undefined) return '';
                        if (typeof value === 'object') return JSON.stringify(value);
                        return value;
                    })
                );
                const lineName =
                    activeTab === FreightLineType.IceCream
                        ? 'بستنی'
                        : activeTab === FreightLineType.Dairy
                          ? 'پاستوریزه'
                          : 'لبنیات-فروتلند';
                const modeLabel = mode === 'compact' ? 'فشرده' : 'کامل';
                await downloadStyledExcel({
                    sheetName: 'برنامه‌ریزی اعلام بار',
                    fileName: buildExcelFileName('برنامه_ریزی_اعلام_بار', lineName, modeLabel),
                    headers,
                    rows,
                });
            } catch (error) {
                console.error('Failed to export Excel:', error);
                alert('خطا در خروجی اکسل.');
            }
        },
        [activeTab, filteredAnnouncements, getExportValue]
    );

    useEffect(() => {
        if (!pendingExportMode || viewMode !== pendingExportMode) return;
        const cols = visibleColumns.filter(c => c.header !== 'عملیات' && c.header !== '');
        runExcelExport(pendingExportMode, cols);
        setPendingExportMode(null);
    }, [pendingExportMode, viewMode, visibleColumns, runExcelExport]);

    const handleExportExcel = (mode: 'compact' | 'full') => {
        if (viewMode === mode) {
            const cols = visibleColumns.filter(c => c.header !== 'عملیات' && c.header !== '');
            runExcelExport(mode, cols);
        } else {
            setViewMode(mode);
            setPendingExportMode(mode);
        }
    };
    
    // Header rendering logic
    const isFullDairyAmbient = viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeTab as any);
    // فیلتر کردن checkbox و عملیات از commonCols - checkbox جداگانه render می‌شود
    const commonCols = useMemo(() => visibleColumns.filter(c => c.header !== 'عملیات' && c.header !== ''), [visibleColumns]);
    const actionCol = useMemo(() => visibleColumns.find(c => c.header === 'عملیات'), [visibleColumns]);


    return (
        <div className={`relative max-w-screen-2xl mx-auto overflow-hidden print-override-overflow`}>
            <main className={`transition-all duration-300 ease-in-out ${isPanelOpen ? 'lg:pr-[44rem]' : 'pr-0'}`}>
                <div className="max-w-screen-2xl mx-auto space-y-4 print-area">
                    <div className="bg-white p-4 rounded-xl shadow-md">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 print:hidden">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center"><DocumentTextIcon className="w-6 h-6 mr-2 text-sky-600" />برنامه ریزی و اعلام بار</h2>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <input type="text" placeholder="جستجوی کلی..." value={filter} onChange={e => setFilter(e.target.value)} className="input-style w-40"/>
                                {selectedIds.length > 0 && (
                                    <button 
                                        onClick={handleBulkSendForApproval} 
                                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700"
                                    >
                                        ارجاع انتخابی ({selectedIds.length})
                                    </button>
                                )}
                                <button onClick={() => handleExportExcel('compact')} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700">
                                    <DocumentArrowDownIcon className="w-4 h-4" />اکسل فشرده
                                </button>
                                <button onClick={() => handleExportExcel('full')} className="flex items-center gap-1 px-3 py-1.5 bg-green-700 text-white rounded-md text-xs hover:bg-green-800">
                                    <DocumentArrowDownIcon className="w-4 h-4" />اکسل کامل
                                </button>
                                <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                                {isManager && <div className="flex items-center p-1 bg-slate-100 rounded-lg"><button onClick={()=>setManagerView('approval')} className={`px-2 py-1 text-xs rounded ${managerView==='approval'?'bg-sky-600 text-white shadow':'bg-slate-100 hover:bg-slate-200'}`}>در انتظار تایید</button><button onClick={()=>setManagerView('all')} className={`px-2 py-1 text-xs rounded ${managerView==='all'?'bg-sky-600 text-white shadow':'bg-slate-100 hover:bg-slate-200'}`}>همه</button></div>}
                                <div className="flex items-center p-1 bg-slate-200 rounded-lg"><button onClick={()=>setViewMode('compact')} className={`px-2 py-1 text-xs rounded ${viewMode==='compact'?'bg-sky-600 text-white shadow':'bg-slate-200 hover:bg-slate-300'}`}>فشرده</button><button onClick={()=>setViewMode('full')} className={`px-2 py-1 text-xs rounded ${viewMode==='full'?'bg-sky-600 text-white shadow':'bg-slate-200 hover:bg-slate-300'}`}>کامل</button></div>
                                {canCreate && <button onClick={handleOpenCreatePanel} className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700"><PlusCircleIcon className="w-4 h-4"/>اعلام بار جدید</button>}
                            </div>
                        </div>
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg mb-4 print:hidden">
                            {Object.values(FreightLineType)
                                .filter(lt => {
                                    // اگر Admin است یا مجوزی تعریف نشده، همه تب‌ها را نمایش بده
                                    if (currentUser?.role === UserRole.Admin || allowedLineTypes.length === 0 || allowedLineTypes.length === 3) {
                                        return true;
                                    }
                                    // فقط تب‌های مجاز را نمایش بده
                                    return allowedLineTypes.includes(lt as any);
                                })
                                .map(lt => (
                                    <button key={lt} onClick={() => setActiveTab(lt as any)} className={`flex-1 py-1 rounded-md text-sm font-semibold transition-colors ${activeTab === lt ? 'bg-sky-600 text-white shadow' : 'hover:bg-slate-200'}`}>{lt}</button>
                                ))}
                        </div>
                        {canManageIceCreamOrder && iceCreamOrderSaving && (
                            <p className="text-xs text-sky-600 mb-2 print:hidden">در حال ذخیره ترتیب نمایش...</p>
                        )}
                        {(
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase bg-gray-50">
                                     {isFullDairyAmbient ? (
                                        <>
                                            <tr>
                                                    <th rowSpan={2} className="p-2 text-center" style={{ width: '40px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(() => {
                                                                const selectable = filteredAnnouncements.filter(isAnnouncementSelectable);
                                                                return selectable.length > 0 && selectable.every(ann => selectedIds.includes(ann.id));
                                                            })()}
                                                            onChange={handleSelectAll}
                                                            className="cursor-pointer"
                                                        />
                                                    </th>
                                                {commonCols.map(col => <th key={col.header} rowSpan={2} className="p-2 text-center" style={{ width: col.width }}>{col.header}</th>)}
                                                <th colSpan={6} className="p-2 text-center border-x">مقصد اول</th>
                                                <th colSpan={6} className="p-2 text-center border-x">مقصد دوم</th>
                                                <th colSpan={6} className="p-2 text-center border-x">مقصد سوم</th>
                                                <th colSpan={6} className="p-2 text-center border-x">مقصد چهارم</th>
                                                {actionCol && <th key={actionCol.header} rowSpan={2} className="p-2 text-center" style={{ width: actionCol.width }}>{actionCol.header}</th>}
                                            </tr>
                                            <tr>
                                                {[1, 2, 3, 4].map(i => (
                                                    <React.Fragment key={i}>
                                                        <th className="p-2 text-center font-normal border">نماینده</th>
                                                        <th className="p-2 text-center font-normal border">مقصد</th>
                                                        <th className="p-2 text-center font-normal border">تناژ</th>
                                                        <th className="p-2 text-center font-normal border">تاریخ تحویل</th>
                                                        <th className="p-2 text-center font-normal border">ساعت تخلیه</th>
                                                        <th className="p-2 text-center font-normal border">کرایه</th>
                                                    </React.Fragment>
                                                ))}
                                            </tr>
                                        </>
                                    ) : (
                                        <tr>
                                                {visibleColumns.map(col => (
                                                    <th key={col.header} className="p-2 text-center" style={{ width: col.width }}>
                                                        {col.header === '' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={(() => {
                                                                const selectable = filteredAnnouncements.filter(isAnnouncementSelectable);
                                                                return selectable.length > 0 && selectable.every(ann => selectedIds.includes(ann.id));
                                                            })()}
                                                                onChange={handleSelectAll}
                                                                className="cursor-pointer"
                                                            />
                                                        ) : col.header}
                                                    </th>
                                                ))}
                                        </tr>
                                    )}
                                    <tr className="print:hidden">
                                        {visibleColumns.map((col) => (
                                            <th key={`${col.header}-filter`} className="p-1 font-normal">
                                                {'accessor' in col && col.accessor ? (
                                                    <input
                                                    type="text"
                                                    placeholder="فیلتر..."
                                                    className="w-full text-center text-xs p-1 border rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                                                    value={columnFilters[col.header] || ''}
                                                    onChange={(e) => handleColumnFilterChange(col.header, e.target.value)}
                                                    />
                                                ) : null}
                                            </th>
                                        ))}
                                        {isFullDairyAmbient && [...Array(24)].map((_, i) => <th key={`ph-${i}`}></th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableAnnouncements.map((ann, idx) => (
                                        <tr
                                            key={ann.id}
                                            className={`border-b hover:bg-slate-50 ${canManageIceCreamOrder && iceCreamDragOverId === ann.id ? 'bg-sky-50' : ''}`}
                                            onDragOver={
                                                canManageIceCreamOrder
                                                    ? (e) => {
                                                          e.preventDefault();
                                                          setIceCreamDragOverId(ann.id);
                                                      }
                                                    : undefined
                                            }
                                            onDrop={
                                                canManageIceCreamOrder
                                                    ? (e) => {
                                                          e.preventDefault();
                                                          handleIceCreamDrop(ann.id);
                                                      }
                                                    : undefined
                                            }
                                        >
                                             {isFullDairyAmbient ? (
                                                <>
                                                    {/* Checkbox column */}
                                                    <td className="p-2 text-center">
                                                        {isAnnouncementSelectable(ann) && (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIds.includes(ann.id)}
                                                                onChange={() => handleToggleSelect(ann.id)}
                                                                className="cursor-pointer"
                                                            />
                                                        )}
                                                    </td>
                                                    {commonCols.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, { ...props, ...tableCellProps }, activeTab as FreightLineType)}</td>)}
                                                    {[0, 1, 2, 3].map(i => {
                                                        const dest = ann.destinations[i];
                                                        return (
                                                            <React.Fragment key={i}>
                                                                <td className="p-2 text-center border">{dest?.representativeName || '-'}</td>
                                                                <td className="p-2 text-center border">{dest?.city || '-'}</td>
                                                                <td className="p-2 text-center border">{dest?.tonnage || '-'}</td>
                                                                <td className="p-2 text-center border">{dest?.deliveryDate || '-'}</td>
                                                                <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                                <td className="p-2 text-center border font-mono">{formatCurrency(dest?.freightCost)}</td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                        {actionCol && <td className="p-2 text-center">{actionCol.render(ann, idx, { ...props, ...tableCellProps }, activeTab as FreightLineType)}</td>}
                                                </>
                                            ) : (
                                                    visibleColumns.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, { ...props, ...tableCellProps }, activeTab as FreightLineType)}</td>)
                                            )}
                                        </tr>
                                    ))}
                                    {tableAnnouncements.length === 0 && (
                                        <tr><td colSpan={isFullDairyAmbient ? commonCols.length + 25 : visibleColumns.length} className="text-center py-8 text-slate-500">موردی یافت نشد.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        )}
                    </div>
                </div>
            </main>
            
            <AnnouncementPanel
                isOpen={isPanelOpen}
                data={panelData}
                onClose={handleClosePanel}
                onSaveNew={onAddAnnouncement}
                onSaveEdit={onUpdateAnnouncement}
                routeOptions={uniqueRouteOptions}
                onRouteQueryChange={setRouteQuery}
                currentUser={currentUser}
                allowedLineTypes={allowedLineTypes}
            />

            {rejectInfo && <RejectDialog reason={rejectInfo.reason} onReasonChange={(r) => setRejectInfo({...rejectInfo, reason: r})} onClose={handleCloseRejectDialog} onSubmit={handleRejectSubmit} />}
            
            {/* دیالوگ تاریخچه */}
            {historyDialog && (
                <FreightHistoryDialog
                    isOpen={historyDialog.isOpen}
                    onClose={handleCloseHistory}
                    announcementId={historyDialog.announcementId}
                    announcementCode={historyDialog.announcementCode}
                />
            )}
            
            {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.FreightPlanning} userRole={currentUser.role} />
                         <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
             )}
            <style>{`
                .input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } 
                .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }
                @media print {
                    .print-override-overflow { overflow: visible !important; }
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { position: absolute; left: 0; top: 0; width: 100%; }
                    table { font-size: 10px; }
                    th, td { padding: 4px !important; }
                }
            `}</style>
        </div>
    );
};

// --- Dialog Components ---
const RejectDialog: React.FC<{reason: string, onReasonChange: (r: string) => void, onClose: ()=>void, onSubmit:()=>void}> = ({reason, onReasonChange, onClose, onSubmit}) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b"><h3>دلیل رد درخواست</h3></div>
            <div className="p-6"><textarea value={reason} onChange={e=>onReasonChange(e.target.value)} className="input-style w-full" rows={3} placeholder="دلیل خود را وارد کنید..."/></div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2"><button onClick={onClose}>انصراف</button><button onClick={onSubmit} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm">ثبت و رد</button></div>
        </div>
    </div>
);

const AnnouncementPanel: React.FC<{
    isOpen: boolean;
    data: FreightAnnouncement | null;
    onClose: () => void;
    onSaveNew: Function;
    onSaveEdit: (data: FreightAnnouncement) => void;
    routeOptions: DispatchRouteSuggestion[];
    onRouteQueryChange: (value: string) => void;
    currentUser?: User;
    allowedLineTypes?: FreightLineType[];
}> = ({ isOpen, data, onClose, onSaveNew, onSaveEdit, routeOptions, onRouteQueryChange, currentUser, allowedLineTypes = [] }) => {
    const isEditMode = !!(data && data.id);
    
    const initialCommonState = { loadingDate: '', deliveryDate: '', cargoValue: 0, vehicleType: '', notes: '' };
    const initialIceCreamState = { originCity: '', brand: 'میهن', cartonCount: '', palletCount: '', priority: 'normal' as 'low'|'normal'|'high', products: [] as string[] };
    const initialMultiDestState = { platformArrivalTime: '' };
    const initialDestinations = [{ id: generateUUID(), city: '', representativeName: '', representativeType: 'agent' as 'agent' | 'distributor' }];
    const initialLoadingLocationState = { loadingType: 'single' as 'single' | 'double', originCity1: '', originCity2: '' };
    const initialBrandState = { brandType: 'single' as 'single' | 'double', brand1: 'میهن', brand2: '' };

    const [lineType, setLineType] = useState<FreightLineType>(FreightLineType.IceCream);
    const [commonState, setCommonState] = useState(initialCommonState);
    const [iceCreamState, setIceCreamState] = useState(initialIceCreamState);
    const [multiDestState, setMultiDestState] = useState(initialMultiDestState);
    const [loadingLocationState, setLoadingLocationState] = useState(initialLoadingLocationState);
    const [brandState, setBrandState] = useState(initialBrandState);
    const [iceCreamRouteType, setIceCreamRouteType] = useState<'single' | 'double'>('single');
    const [iceCreamLegs, setIceCreamLegs] = useState<[IceCreamLeg, IceCreamLeg]>([
        createInitialIceCreamLeg(),
        createInitialIceCreamLeg(),
    ]);
    // cargoPreview حذف شد - دیگر نیازی به تبدیل نیست
    const [destinations, setDestinations] = useState<Partial<Destination>[]>(initialDestinations);
    const [destCityValid, setDestCityValid] = useState<Record<string, boolean>>({});
    const [iceCreamDestCityValid, setIceCreamDestCityValid] = useState<[boolean, boolean]>([false, false]);
    const [iceCreamOriginCityValid, setIceCreamOriginCityValid] = useState<[boolean, boolean]>([false, false]);
    const [originCity1Valid, setOriginCity1Valid] = useState(false);
    const [originCity2Valid, setOriginCity2Valid] = useState(false);

    const resetForm = () => {
        // Don't reset lineType to allow multiple entries of the same type
        // Don't reset loadingDate to preserve the selected date
        // Don't reset platformArrivalTime to preserve the selected time
        setCommonState(prev => ({ ...initialCommonState, loadingDate: prev.loadingDate }));
        setIceCreamState(initialIceCreamState);
        setIceCreamRouteType('single');
        setIceCreamLegs([createInitialIceCreamLeg(), createInitialIceCreamLeg()]);
        setMultiDestState(prev => ({ ...initialMultiDestState, platformArrivalTime: prev.platformArrivalTime }));
        setDestinations(initialDestinations);
        setDestCityValid({});
        setIceCreamDestCityValid([false, false]);
        setIceCreamOriginCityValid([false, false]);
        setOriginCity1Valid(false);
        setOriginCity2Valid(false);

        // بارگذاری آخرین انتخاب‌های کاربر از localStorage بعد از reset
        const getLastUserChoices = (lineTypeKey: string) => {
            try {
                const stored = localStorage.getItem(`lastFreightChoices_${lineTypeKey}`);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e) {
                console.error('Error loading last user choices:', e);
            }
            return null;
        };
        
        const lineTypeKey = lineType === FreightLineType.IceCream ? 'IceCream' 
            : lineType === FreightLineType.Dairy ? 'Dairy' 
            : 'Ambient';
        
        const lastChoices = getLastUserChoices(lineTypeKey) as LastFreightChoices | null;
        if (lastChoices) {
            applyLastFreightChoices(lastChoices, lineType, {
                setLoadingLocationState,
                setBrandState,
                setCommonState,
                setDestinations,
            });
        } else if (lineType === FreightLineType.Dairy) {
            setLoadingLocationState({ loadingType: 'single', originCity1: 'کارخانه شهر لبنیات', originCity2: '' });
            setBrandState(initialBrandState);
        } else if (lineType === FreightLineType.Ambient) {
            setLoadingLocationState({ loadingType: 'single', originCity1: 'انبار مرکزی', originCity2: '' });
            setBrandState(initialBrandState);
        } else {
            setLoadingLocationState(initialLoadingLocationState);
            setBrandState(initialBrandState);
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (data) { // Edit mode: populate form
                console.log(`📅 [FreightDashboard] Edit Dialog Opened - Received data:`, {
                    id: data.id,
                    loadingDate: data.loadingDate,
                    loadingDateType: typeof data.loadingDate,
                    isDate: data.loadingDate instanceof Date,
                    rawData: data
                });
                setLineType(data.lineType);
                // Check if loadingDate is already in Jalali format or needs conversion
                let loadingDateStr;
                
                if (typeof data.loadingDate === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(data.loadingDate)) {
                    // Already in Jalali format (YYYY/MM/DD or YYYY-MM-DD) - convert `-` to `/`
                    const before = data.loadingDate;
                    loadingDateStr = data.loadingDate.replace(/-/g, '/');
                    console.log(`📅 [FreightDashboard] String date detected: "${before}" → "${loadingDateStr}"`);
                } else if (data.loadingDate instanceof Date) {
                    // If it's a Date object, check if it's valid
                    console.log(`📅 [FreightDashboard] Date object detected:`, data.loadingDate);
                    if (isNaN(data.loadingDate.getTime())) {
                        loadingDateStr = '';
                        console.log(`📅 [FreightDashboard] Invalid Date, setting empty string`);
                    } else {
                        loadingDateStr = formatJalali(data.loadingDate);
                        console.log(`📅 [FreightDashboard] Date converted: "${data.loadingDate.toISOString()}" → "${loadingDateStr}"`);
                    }
                } else {
                    loadingDateStr = '';
                    console.log(`📅 [FreightDashboard] Unknown type, setting empty string:`, {
                        loadingDate: data.loadingDate,
                        type: typeof data.loadingDate
                    });
                }
                console.log(`📅 [FreightDashboard] Final loadingDateStr for form:`, loadingDateStr);
                setCommonState({
                    loadingDate: loadingDateStr,
                    deliveryDate: data.deliveryDate || '',
                    cargoValue: Number(data.cargoValue) || 0,
                    vehicleType: data.vehicleType,
                    notes: data.notes || '',
                });
                
                // بارگذاری داده‌های دو جا بارگیری از data (اگر وجود داشته باشد)
                let loadingLocationData: { loadingType: 'single' | 'double', originCity1: string, originCity2: string };
                if ((data as any).loadingType) {
                    loadingLocationData = {
                        loadingType: (data as any).loadingType || 'single',
                        originCity1: (data as any).originCity1 || data.originCity || '',
                        originCity2: (data as any).originCity2 || ''
                    };
                } else {
                    // اگر originCity شامل "و" باشد، احتمالاً دو مبدا است
                    const originCity = data.originCity || '';
                    const hasDoubleOrigin = originCity.includes(' و ');
                    if (hasDoubleOrigin) {
                        const parts = originCity.split(' و ');
                        loadingLocationData = {
                            loadingType: 'double',
                            originCity1: parts[0]?.trim() || '',
                            originCity2: parts[1]?.trim() || ''
                        };
                    } else {
                        loadingLocationData = {
                            loadingType: 'single',
                            originCity1: originCity,
                            originCity2: ''
                        };
                    }
                }
                setLoadingLocationState(loadingLocationData);
                setOriginCity1Valid(!!loadingLocationData.originCity1?.trim());
                setOriginCity2Valid(!!loadingLocationData.originCity2?.trim());
                
                // بارگذاری داده‌های برند از data
                let brandData: { brandType: 'single' | 'double', brand1: string, brand2: string };
                if ((data as any).brandType) {
                    brandData = {
                        brandType: (data as any).brandType || 'single',
                        brand1: (data as any).brand1 || data.brand || 'میهن',
                        brand2: (data as any).brand2 || ''
                    };
                } else {
                    // اگر brand شامل "و" باشد، احتمالاً دو برند است
                    const brand = data.brand || 'میهن';
                    const hasDoubleBrand = brand.includes(' و ');
                    if (hasDoubleBrand) {
                        const parts = brand.split(' و ');
                        brandData = {
                            brandType: 'double',
                            brand1: parts[0]?.trim() || 'میهن',
                            brand2: parts[1]?.trim() || ''
                        };
                    } else {
                        brandData = {
                            brandType: 'single',
                            brand1: brand,
                            brand2: ''
                        };
                    }
                }
                setBrandState(brandData);
                
                if (data.lineType === FreightLineType.IceCream) {
                    const iceForm = populateIceCreamFormFromAnnouncement(data as any);
                    setLoadingLocationState(iceForm.loadingLocationState);
                    setBrandState(iceForm.brandState);
                    setDestinations(iceForm.destinations);
                    setOriginCity1Valid(iceForm.originCity1Valid);
                    setOriginCity2Valid(iceForm.originCity2Valid);
                    setDestCityValid(iceForm.destCityValid);
                    setIceCreamState({
                        originCity: iceForm.loadingLocationState.originCity1,
                        brand: iceForm.brandState.brand1,
                        cartonCount: String(data.cartonCount || ''),
                        palletCount: String((data as any).palletCount || ''),
                        priority: data.priority || 'normal',
                        products: data.products || [],
                    });
                } else {
                    setMultiDestState({ platformArrivalTime: data.platformArrivalTime || '' });
                    const mappedDests =
                        data.destinations.length > 0
                            ? data.destinations.map((d) => ({
                                  ...d,
                                  representativeType: d.representativeType || ('agent' as const),
                              }))
                            : initialDestinations;
                    setDestinations(mappedDests);
                    const cityValidity: Record<string, boolean> = {};
                    mappedDests.forEach((d) => {
                        if (d.id) cityValidity[d.id] = !!d.city?.trim();
                    });
                    setDestCityValid(cityValidity);
                }
            } else { // Create mode: ensure form is clear
                resetForm();
                // اگر کارمند برنامه‌ریزی است و مجوزها محدود است، به اولین لاین مجاز برو
                if (currentUser && (currentUser.role === UserRole.PlanningEmployee || currentUser.role === 'planner' || currentUser.role === 'کارمند برنامه‌ریزی')) {
                    if (allowedLineTypes.length > 0 && allowedLineTypes.length < 3) {
                        if (!allowedLineTypes.includes(lineType as any)) {
                            setLineType(allowedLineTypes[0]);
                        }
                    }
                }
            }
        }
    }, [data, isOpen, currentUser, allowedLineTypes, lineType]);

    useEffect(() => {
        // Only run for new announcements and when lineType changes
        if (!data) { 
            const today = new Date();
            let targetDate = new Date(today);
            if (lineType === FreightLineType.IceCream) targetDate.setDate(today.getDate() + 1);
            // Set default as Jalali string
            setCommonState(s => ({ ...s, loadingDate: formatJalali(targetDate) }));
            
            // بارگذاری آخرین انتخاب‌های کاربر از localStorage
            const getLastUserChoices = (lineTypeKey: string) => {
                try {
                    const stored = localStorage.getItem(`lastFreightChoices_${lineTypeKey}`);
                    if (stored) {
                        return JSON.parse(stored);
                    }
                } catch (e) {
                    console.error('Error loading last user choices:', e);
                }
                return null;
            };
            
            setMultiDestState(s => ({ ...s, platformArrivalTime: '07:00' }));
            const lineTypeKey =
                lineType === FreightLineType.IceCream
                    ? 'IceCream'
                    : lineType === FreightLineType.Dairy
                      ? 'Dairy'
                      : 'Ambient';
            const lastChoices = getLastUserChoices(lineTypeKey) as LastFreightChoices | null;
            if (lastChoices) {
                applyLastFreightChoices(lastChoices, lineType, {
                    setLoadingLocationState,
                    setBrandState,
                    setCommonState,
                    setDestinations,
                });
            } else if (lineType === FreightLineType.Dairy) {
                setLoadingLocationState({ loadingType: 'single', originCity1: 'کارخانه شهر لبنیات', originCity2: '' });
            } else if (lineType === FreightLineType.Ambient) {
                setLoadingLocationState({ loadingType: 'single', originCity1: 'انبار مرکزی', originCity2: '' });
            }
        }
    }, [lineType, data, isOpen]); // Rerun when panel opens too

    const addDestination = () => {
        if (destinations.length < 4) {
            const id = generateUUID();
            setDestinations([
                ...destinations,
                { id, city: '', representativeName: '', representativeType: 'agent' as 'agent' | 'distributor' },
            ]);
            setDestCityValid((prev) => ({ ...prev, [id]: false }));
        }
    };
    const removeDestination = (id: string) => setDestinations(destinations.filter(d => d.id !== id));
    const handleDestinationChange = (id: string, field: keyof Destination, value: any) => {
        setDestinations(destinations.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
    };

    const handleDestinationCitySelect = (id: string, city: string) => {
        onRouteQueryChange(city);
        setDestinations(destinations.map((d) => (d.id === id ? { ...d, city } : d)));
        setDestCityValid((prev) => ({ ...prev, [id]: true }));
    };
    const handleProductChange = (product: string, checked: boolean) => setIceCreamState(s => ({ ...s, products: checked ? [...s.products, product] : s.products.filter(p => p !== product)}));

    const handleSubmit = (e: React.FormEvent, isDraft: boolean = false) => {
        e.preventDefault();
        const cargoValueInRials = commonState.cargoValue;
        if (!cargoValueInRials || cargoValueInRials <= 0) {
            alert('ارزش بار باید بزرگتر از صفر باشد.');
            return;
        }
        if (!commonState.loadingDate) { alert('تاریخ بارگیری الزامی است.'); return; }

        // Use the string directly instead of converting to Date
        // This will avoid the conversion issues
        const jalaliDate = commonState.loadingDate;
        console.log(`📅 [FreightDashboard] handleSubmit - Form state loadingDate:`, {
            jalaliDate,
            type: typeof jalaliDate,
            isValid: jalaliDate && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(jalaliDate),
            isEditMode
        });
        // بررسی فرمت دقیق تاریخ: YYYY/MM/DD (ماه و روز باید دو رقمی باشند)
        if (!jalaliDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(jalaliDate)) { 
            console.error(`📅 [FreightDashboard] Invalid date format:`, jalaliDate);
            alert('تاریخ نامعتبر است. قالب صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)'); 
            return; 
        }
        
        // بررسی تاریخ تحویل (اگر وارد شده باشد)
        if (commonState.deliveryDate && !/^\d{4}\/\d{2}\/\d{2}$/.test(commonState.deliveryDate)) {
            alert('تاریخ تحویل نامعتبر است. قالب صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)');
            return;
        }
        console.log(`📅 [FreightDashboard] Submitting with loadingDate:`, jalaliDate);

        let iceCreamBuilt: ReturnType<typeof buildIceCreamFromDairyLikeForm> = null;
        if (lineType === FreightLineType.IceCream) {
            if (!loadingLocationState.originCity1.trim() || !originCity1Valid) {
                alert('مبدا بارگیری را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
            if (
                loadingLocationState.loadingType === 'double' &&
                (!loadingLocationState.originCity2.trim() || !originCity2Valid)
            ) {
                alert('مبدا بارگیری دوم را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
            const iceDests = destinations.filter((d) => d.city?.trim());
            if (iceDests.length === 0) {
                alert('حداقل یک مقصد با شهر معتبر الزامی است.');
                return;
            }
            const badIceCity = iceDests.filter((d) => d.id && !destCityValid[d.id]);
            if (badIceCity.length > 0) {
                alert('شهر مقصد را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
            iceCreamBuilt = buildIceCreamFromDairyLikeForm(
                loadingLocationState,
                brandState,
                destinations
            );
            if (!iceCreamBuilt) {
                alert('مبدا بارگیری، برند و مقصد(ها) را کامل کنید.');
                return;
            }
        }

        const finalOriginCity = lineType === FreightLineType.IceCream && iceCreamBuilt
            ? iceCreamBuilt.originCity
            : loadingLocationState.loadingType === 'double'
            ? `${loadingLocationState.originCity1} و ${loadingLocationState.originCity2}`
            : loadingLocationState.originCity1;

        const finalBrand = lineType === FreightLineType.IceCream && iceCreamBuilt
            ? iceCreamBuilt.brand
            : brandState.brandType === 'double'
            ? `${brandState.brand1} و ${brandState.brand2}`
            : brandState.brand1;
        
        // برای Dairy و Ambient: فیلتر کردن مقاصدی که city ندارند و بررسی فیلدهای اجباری
        const validDestinations = lineType !== FreightLineType.IceCream
            ? destinations.filter(d => {
                // بررسی فیلدهای اجباری (به جز unloadTime و representativeName)
                if (!d.city || d.city.trim() === '') return false;
                // بررسی representativeType: باید 'agent' یا 'distributor' باشد
                if (!d.representativeType || (d.representativeType !== 'agent' && d.representativeType !== 'distributor')) return false;
                // representativeName اختیاری است - حذف شد
                if (!d.tonnage || Number(d.tonnage) <= 0) return false;
                if (!d.deliveryDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(d.deliveryDate)) return false;
                return true;
            })
            : [];
        
        // بررسی اینکه حداقل یک مقصد معتبر وجود دارد (برای Dairy و Ambient)
        if (lineType !== FreightLineType.IceCream && validDestinations.length === 0) {
            alert('حداقل یک مقصد با تمام فیلدهای اجباری (شهر، نوع نماینده، تناژ، تاریخ تحویل) الزامی است.');
            return;
        }

        if (lineType !== FreightLineType.IceCream) {
            if (!loadingLocationState.originCity1.trim() || !originCity1Valid) {
                alert('مبدا بارگیری را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
            if (
                loadingLocationState.loadingType === 'double' &&
                (!loadingLocationState.originCity2.trim() || !originCity2Valid)
            ) {
                alert('مبدا بارگیری دوم را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
            const badCity = destinations.filter(
                (d) => d.city?.trim() && d.id && !destCityValid[d.id]
            );
            if (badCity.length > 0) {
                alert('شهر مقصد را از لیست پیشنهادها انتخاب کنید.');
                return;
            }
        }

        // بررسی اینکه تمام مقاصد معتبر هستند (برای Dairy و Ambient)
        if (lineType !== FreightLineType.IceCream && validDestinations.length !== destinations.length) {
            alert('تمام مقاصد باید دارای شهر، نوع نماینده، تناژ و تاریخ تحویل معتبر باشند.');
            return;
        }
        
        // بررسی تاریخ تحویل برای بستنی (اگر وارد شده باشد)
        if (lineType === FreightLineType.IceCream && commonState.deliveryDate && !/^\d{4}\/\d{2}\/\d{2}$/.test(commonState.deliveryDate)) {
            alert('تاریخ تحویل نامعتبر است. قالب صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)');
            return;
        }

        // بررسی مجوز ایجاد اعلام بار برای کارمندان برنامه‌ریزی
        if (!isEditMode && currentUser) {
            const isEmployee = currentUser.role === UserRole.PlanningEmployee || 
                              currentUser.role === 'planner' || 
                              currentUser.role === 'کارمند برنامه‌ریزی';
            
            if (isEmployee && allowedLineTypes.length > 0 && allowedLineTypes.length < 3) {
                if (!allowedLineTypes.includes(lineType as any)) {
                    alert(`شما مجوز ایجاد اعلام بار برای لاین "${lineType}" را ندارید. لطفاً با ادمین تماس بگیرید.`);
                    return;
                }
            }
        }
        
        const announcementData: Omit<FreightAnnouncement, 'id' | 'status' | 'announcementCode' | 'createdAt' | 'history'> = lineType === FreightLineType.IceCream
            ? { 
                loadingDate: jalaliDate, 
                deliveryDate: commonState.deliveryDate || null, // تاریخ تحویل بار
                lineType, 
                cargoValue: cargoValueInRials, 
                vehicleType: commonState.vehicleType, 
                notes: commonState.notes, 
                originCity: finalOriginCity, 
                brand: finalBrand as any, 
                representativeType: iceCreamBuilt!.representativeType as any,
                representativeName: iceCreamBuilt!.representativeName,
                cartonCount: Number(iceCreamState.cartonCount),
                palletCount: iceCreamState.palletCount ? Number(iceCreamState.palletCount) : null,
                priority: iceCreamState.priority, 
                products: iceCreamState.products, 
                destinations: iceCreamBuilt!.destinations,
                loadingType: iceCreamBuilt!.loadingType,
                originCity1: iceCreamBuilt!.originCity1,
                originCity2: iceCreamBuilt!.originCity2,
                brandType: iceCreamBuilt!.brandType,
                brand1: iceCreamBuilt!.brand1,
                brand2: iceCreamBuilt!.brand2,
            } as any
            : { 
                loadingDate: jalaliDate, 
                lineType, 
                cargoValue: cargoValueInRials, 
                vehicleType: commonState.vehicleType, 
                notes: commonState.notes, 
                originCity: finalOriginCity,
                brand: finalBrand as any,
                platformArrivalTime: multiDestState.platformArrivalTime, 
                destinations: validDestinations as Destination[],
                loadingType: loadingLocationState.loadingType,
                originCity1: loadingLocationState.originCity1,
                originCity2: loadingLocationState.originCity2 || null,
                brandType: brandState.brandType,
                brand1: brandState.brand1,
                brand2: brandState.brand2 || null
            } as any;
        
        if (isEditMode) {
            // Extra guard: if somehow id is empty, treat as new to avoid empty PUT
            if (!data?.id) {
                onSaveNew(announcementData, isDraft);
                resetForm();
                return;
            }
            let finalData = { ...data, ...announcementData };
            const originalStatus = data.status;

            // Preserve current status on edit save; do NOT auto-advance to approval
            if (isDraft) {
                finalData.status = FreightAnnouncementStatus.Draft;
            } else {
                finalData.status = originalStatus;
            }
            
            // Only call onSaveEdit if we have a valid ID, otherwise treat as new
            if (finalData.id && finalData.id.trim() !== '') {
                onSaveEdit(finalData);
            } else {
                console.log('🔍 [FreightDashboard] No valid ID found, treating as new announcement');
                onSaveNew(finalData, isDraft);
            }
            onClose();
        } else {
            onSaveNew(announcementData, isDraft);
            
            // ذخیره آخرین انتخاب‌های کاربر در localStorage
            try {
                const lineTypeKey = lineType === FreightLineType.IceCream ? 'IceCream' 
                    : lineType === FreightLineType.Dairy ? 'Dairy' 
                    : 'Ambient';
                const lastChoices: LastFreightChoices = {
                    loadingType: loadingLocationState.loadingType,
                    originCity1: loadingLocationState.originCity1,
                    originCity2: loadingLocationState.originCity2 || '',
                    brandType: brandState.brandType,
                    brand1: brandState.brand1,
                    brand2: brandState.brand2 || '',
                    vehicleType: commonState.vehicleType,
                    representativeType:
                        lineType === FreightLineType.IceCream
                            ? (destinations[0]?.representativeType as 'agent' | 'distributor' | 'depot') || 'agent'
                            : (destinations[0]?.representativeType as 'agent' | 'distributor') || 'agent',
                };
                localStorage.setItem(`lastFreightChoices_${lineTypeKey}`, JSON.stringify(lastChoices));
            } catch (e) {
                console.error('Error saving last user choices:', e);
            }
            
            resetForm();
        }
    };


    return (
        <>
            {isOpen && <div className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity" onClick={onClose} />}
            <aside className={`fixed top-0 right-0 h-full w-full sm:w-[44rem] bg-slate-50 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 border-b bg-white flex justify-between items-center">
                    <h3 className="text-lg font-bold">{isEditMode ? `ویرایش اعلام بار #${data?.announcementCode}` : 'ثبت اعلام بار جدید'}</h3>
                    <button onClick={onClose} className="text-2xl text-slate-500 hover:text-slate-800">&times;</button>
                </div>
                <form id="freight-form" onSubmit={(e) => handleSubmit(e, false)} className="flex-grow overflow-y-auto p-4 space-y-4">
                     <div>
                        <label className="font-semibold text-sm">۱. انتخاب نوع لاین</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {Object.values(FreightLineType)
                                .filter(lt => {
                                    // اگر Admin است یا مجوزی تعریف نشده، همه لاین‌ها را نمایش بده
                                    if (!currentUser || currentUser.role === UserRole.Admin || allowedLineTypes.length === 0 || allowedLineTypes.length === 3) {
                                        return true;
                                    }
                                    // برای کارمندان برنامه‌ریزی: فقط لاین‌های مجاز را نمایش بده
                                    const isEmployee = currentUser.role === UserRole.PlanningEmployee || 
                                                      currentUser.role === 'planner' || 
                                                      currentUser.role === 'کارمند برنامه‌ریزی';
                                    if (isEmployee) {
                                        return allowedLineTypes.includes(lt as any);
                                    }
                                    // برای مدیران و سایر نقش‌ها: همه لاین‌ها را نمایش بده
                                    return true;
                                })
                                .map(lt => {
                                    const isAllowed = !currentUser || 
                                                     currentUser.role === UserRole.Admin || 
                                                     allowedLineTypes.length === 0 || 
                                                     allowedLineTypes.length === 3 ||
                                                     allowedLineTypes.includes(lt as any);
                                    const isEmployee = currentUser && (
                                        currentUser.role === UserRole.PlanningEmployee || 
                                        currentUser.role === 'planner' || 
                                        currentUser.role === 'کارمند برنامه‌ریزی'
                                    );
                                    const isDisabled = isEmployee && !isAllowed;
                                    
                                    return (
                                        <button 
                                            type="button" 
                                            key={lt} 
                                            onClick={() => {
                                                if (!isDisabled) setLineType(lt);
                                            }} 
                                            disabled={isDisabled}
                                            className={`px-4 py-2 rounded-lg text-sm ${
                                                lineType === lt 
                                                    ? 'bg-sky-600 text-white' 
                                                    : isDisabled
                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        : 'bg-slate-200 hover:bg-slate-300'
                                            }`}
                                            title={isDisabled ? 'شما مجوز ایجاد اعلام بار برای این لاین را ندارید' : ''}
                                        >
                                            {lt}
                                        </button>
                                    );
                                })}
                        </div>
                        {currentUser && (currentUser.role === UserRole.PlanningEmployee || currentUser.role === 'planner' || currentUser.role === 'کارمند برنامه‌ریزی') && allowedLineTypes.length > 0 && allowedLineTypes.length < 3 && (
                            <p className="text-xs text-slate-500 mt-1">
                                فقط لاین‌های مجاز برای شما قابل انتخاب هستند
                            </p>
                        )}
                    </div>

                    <fieldset className="p-3 border rounded-lg bg-white">
                        <legend className="font-semibold px-1 text-sm">اطلاعات مشترک</legend>
                            <div className="grid grid-cols-3 gap-3">
                            <RequiredField label="تاریخ بارگیری (جلالی)*" hint="فرمت: 1404/09/18">
                                <input 
                                    type="text" 
                                    placeholder="1404/09/18" 
                                    value={commonState.loadingDate} 
                                    onChange={e => {
                                        let value = e.target.value.replace(/[^\d\/]/g, '');
                                        // اعمال خودکار فرمت YYYY/MM/DD
                                        if (value.length > 4 && !value.includes('/')) {
                                            value = value.slice(0, 4) + '/' + value.slice(4);
                                        }
                                        if (value.length > 7 && value.split('/').length === 2) {
                                            const parts = value.split('/');
                                            if (parts[1].length > 2) {
                                                value = parts[0] + '/' + parts[1].slice(0, 2) + '/' + parts[1].slice(2);
                                            }
                                        }
                                        // محدود کردن به فرمت YYYY/MM/DD
                                        if (value.length <= 10) {
                                            setCommonState(s=>({...s, loadingDate: value}));
                                        }
                                    }} 
                                    onBlur={e => {
                                        // هنگام blur، فرمت را کامل کن (اضافه کردن صفرهای ابتدایی)
                                        const value = e.target.value;
                                        const parts = value.split('/');
                                        if (parts.length === 3) {
                                            const year = parts[0].padStart(4, '0');
                                            const month = parts[1].padStart(2, '0');
                                            const day = parts[2].padStart(2, '0');
                                            if (year.length === 4 && month.length === 2 && day.length === 2) {
                                                setCommonState(s=>({...s, loadingDate: `${year}/${month}/${day}`}));
                                            }
                                        }
                                    }}
                                    className="input-style mt-1" 
                                    pattern="\d{4}\/\d{2}\/\d{2}"
                                    title="فرمت صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)"
                                    required
                                    maxLength={10}
                                />
                            </RequiredField>
                            {lineType === FreightLineType.IceCream && (
                                <div>
                                    <label className="text-xs">تاریخ تحویل بار (جلالی)</label>
                                    <input 
                                        type="text" 
                                        placeholder="1404/09/18" 
                                        value={commonState.deliveryDate || ''} 
                                        onChange={e => {
                                            let value = e.target.value.replace(/[^\d\/]/g, '');
                                            // اعمال خودکار فرمت YYYY/MM/DD
                                            if (value.length > 4 && !value.includes('/')) {
                                                value = value.slice(0, 4) + '/' + value.slice(4);
                                            }
                                            if (value.length > 7 && value.split('/').length === 2) {
                                                const parts = value.split('/');
                                                if (parts[1].length > 2) {
                                                    value = parts[0] + '/' + parts[1].slice(0, 2) + '/' + parts[1].slice(2);
                                                }
                                            }
                                            // محدود کردن به فرمت YYYY/MM/DD
                                            if (value.length <= 10) {
                                                setCommonState(s=>({...s, deliveryDate: value}));
                                            }
                                        }} 
                                        onBlur={e => {
                                            // هنگام blur، فرمت را کامل کن (اضافه کردن صفرهای ابتدایی)
                                            const value = e.target.value;
                                            const parts = value.split('/');
                                            if (parts.length === 3) {
                                                const year = parts[0].padStart(4, '0');
                                                const month = parts[1].padStart(2, '0');
                                                const day = parts[2].padStart(2, '0');
                                                if (year.length === 4 && month.length === 2 && day.length === 2) {
                                                    setCommonState(s=>({...s, deliveryDate: `${year}/${month}/${day}`}));
                                                }
                                            }
                                        }}
                                        className="input-style mt-1" 
                                        pattern="\d{4}\/\d{2}\/\d{2}"
                                        title="فرمت صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)"
                                        maxLength={10}
                                    />
                                    <div className="text-xs text-slate-500 mt-1">فرمت: 1404/09/18 (ماه و روز باید دو رقمی باشند)</div>
                                </div>
                            )}
                            <RequiredField label="نوع خودرو*">
                                <select value={commonState.vehicleType} onChange={e => setCommonState(s=>({...s, vehicleType: e.target.value}))} className="input-style mt-1 w-full" required><option value="">-- انتخاب کنید --</option>{VEHICLE_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}</select>
                            </RequiredField>
                                <RequiredField label="ارزش بار*">
                                    <CargoValueInput
                                        valueRials={commonState.cargoValue}
                                        onChangeRials={(rials) => setCommonState((s) => ({ ...s, cargoValue: rials }))}
                                        resetKey={data?.id ?? 'new'}
                                        required
                                        inputClassName="input-style mt-1"
                                        selectClassName="input-style mt-1 min-w-[140px]"
                                    />
                                </RequiredField>
                        </div>
                    </fieldset>

                    {lineType === FreightLineType.IceCream && (
                        <>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">اطلاعات بارگیری</legend>
                            <div className="mb-3">
                                <label className="text-xs font-semibold mb-2 block">نوع بارگیری</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="iceCreamLoadingType"
                                            value="single"
                                            checked={loadingLocationState.loadingType === 'single'}
                                            onChange={() => {
                                                setLoadingLocationState((s) => ({
                                                    ...s,
                                                    loadingType: 'single',
                                                    originCity2: '',
                                                }));
                                                setOriginCity2Valid(false);
                                            }}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">تک مبدا</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="iceCreamLoadingType"
                                            value="double"
                                            checked={loadingLocationState.loadingType === 'double'}
                                            onChange={() =>
                                                setLoadingLocationState((s) => ({
                                                    ...s,
                                                    loadingType: 'double',
                                                }))
                                            }
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">دو مبدا بارگیری</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                {loadingLocationState.loadingType === 'single' ? (
                                    <RequiredField label="مبدا بارگیری*">
                                        <CityAutocomplete
                                            value={loadingLocationState.originCity1}
                                            onChange={(city) => {
                                                onRouteQueryChange(city);
                                                setLoadingLocationState((s) => ({ ...s, originCity1: city }));
                                            }}
                                            onValidityChange={setOriginCity1Valid}
                                            requireSelection
                                            placeholder="جستجوی مبدا..."
                                            className="input-style mt-1 w-full"
                                            required
                                        />
                                    </RequiredField>
                                ) : (
                                    <>
                                        <RequiredField label="مبدا بارگیری اول*">
                                            <CityAutocomplete
                                                value={loadingLocationState.originCity1}
                                                onChange={(city) => {
                                                    onRouteQueryChange(city);
                                                    setLoadingLocationState((s) => ({ ...s, originCity1: city }));
                                                }}
                                                onValidityChange={setOriginCity1Valid}
                                                requireSelection
                                                placeholder="جستجوی مبدا..."
                                                className="input-style mt-1 w-full"
                                                required
                                            />
                                        </RequiredField>
                                        <RequiredField label="مبدا بارگیری دوم*">
                                            <CityAutocomplete
                                                value={loadingLocationState.originCity2}
                                                onChange={(city) => {
                                                    onRouteQueryChange(city);
                                                    setLoadingLocationState((s) => ({ ...s, originCity2: city }));
                                                }}
                                                onValidityChange={setOriginCity2Valid}
                                                requireSelection
                                                placeholder="جستجوی مبدا..."
                                                className="input-style mt-1 w-full"
                                                required
                                            />
                                        </RequiredField>
                                    </>
                                )}
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">برند محصول</legend>
                            <div className="mb-3">
                                <label className="text-xs font-semibold mb-2 block">نوع برند</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="iceCreamBrandType"
                                            value="single"
                                            checked={brandState.brandType === 'single'}
                                            onChange={() =>
                                                setBrandState((s) => ({
                                                    ...s,
                                                    brandType: 'single',
                                                    brand2: '',
                                                }))
                                            }
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">تک برند</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="iceCreamBrandType"
                                            value="double"
                                            checked={brandState.brandType === 'double'}
                                            onChange={() =>
                                                setBrandState((s) => ({ ...s, brandType: 'double' }))
                                            }
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">دو برند</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {brandState.brandType === 'single' ? (
                                    <div>
                                        <label className="text-xs">برند*</label>
                                        <select
                                            value={brandState.brand1}
                                            onChange={(e) =>
                                                setBrandState((s) => ({ ...s, brand1: e.target.value }))
                                            }
                                            className="input-style mt-1"
                                            required
                                        >
                                            {BRANDS.map((b) => (
                                                <option key={b} value={b}>
                                                    {b}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs">برند اول*</label>
                                            <select
                                                value={brandState.brand1}
                                                onChange={(e) =>
                                                    setBrandState((s) => ({ ...s, brand1: e.target.value }))
                                                }
                                                className="input-style mt-1"
                                                required
                                            >
                                                {BRANDS.map((b) => (
                                                    <option key={b} value={b}>
                                                        {b}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs">برند دوم*</label>
                                            <select
                                                value={brandState.brand2}
                                                onChange={(e) =>
                                                    setBrandState((s) => ({ ...s, brand2: e.target.value }))
                                                }
                                                className="input-style mt-1"
                                                required
                                            >
                                                <option value="">-- انتخاب کنید --</option>
                                                {BRANDS.map((b) => (
                                                    <option key={b} value={b}>
                                                        {b}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">مقاصد</legend>
                            <div className="space-y-2">
                                {destinations.map((dest, index) => (
                                    <div key={dest.id} className="p-2 bg-slate-100 rounded space-y-2 relative">
                                        <span className="absolute top-2 left-2 bg-slate-300 text-slate-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                            {index + 1}
                                        </span>
                                        {destinations.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeDestination(dest.id!)}
                                                className="absolute top-2 right-2 text-red-500 text-xs"
                                            >
                                                حذف
                                            </button>
                                        )}
                                        <div className="grid grid-cols-2 gap-2">
                                            <RequiredField label="شهر مقصد*">
                                                <CityAutocomplete
                                                    value={dest.city || ''}
                                                    onChange={(city) =>
                                                        dest.id && handleDestinationCitySelect(dest.id, city)
                                                    }
                                                    onValidityChange={(valid) => {
                                                        if (dest.id) {
                                                            setDestCityValid((prev) => ({
                                                                ...prev,
                                                                [dest.id!]: valid,
                                                            }));
                                                        }
                                                    }}
                                                    requireSelection
                                                    className="input-style"
                                                    required
                                                />
                                            </RequiredField>
                                            <RequiredField label="نوع نماینده*">
                                                <select
                                                    value={dest.representativeType || 'agent'}
                                                    onChange={(e) =>
                                                        handleDestinationChange(
                                                            dest.id!,
                                                            'representativeType',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="input-style w-full"
                                                    required
                                                >
                                                    <option value="agent">نماینده</option>
                                                    <option value="distributor">پخش</option>
                                                    <option value="depot">دپو</option>
                                                </select>
                                            </RequiredField>
                                            <div>
                                                <label className="text-xs">نام نماینده/پخش/دپو</label>
                                                <input
                                                    value={dest.representativeName || ''}
                                                    onChange={(e) =>
                                                        handleDestinationChange(
                                                            dest.id!,
                                                            'representativeName',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="input-style"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {destinations.length < 4 && (
                                <button
                                    type="button"
                                    onClick={addDestination}
                                    className="mt-2 text-xs text-sky-600 hover:underline"
                                >
                                    + افزودن مقصد
                                </button>
                            )}
                            <div className="grid grid-cols-2 gap-3 max-w-md mt-3">
                                <div>
                                    <label className="text-xs">تعداد کارتن*</label>
                                    <input
                                        type="number"
                                        value={iceCreamState.cartonCount}
                                        onChange={(e) =>
                                            setIceCreamState((s) => ({ ...s, cartonCount: e.target.value }))
                                        }
                                        className="input-style mt-1"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs">تعداد پالت</label>
                                    <input
                                        type="number"
                                        value={iceCreamState.palletCount}
                                        onChange={(e) =>
                                            setIceCreamState((s) => ({ ...s, palletCount: e.target.value }))
                                        }
                                        className="input-style mt-1"
                                        min={0}
                                    />
                                </div>
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">اولویت و محصول (مشترک برای کل بار)</legend>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs">اولویت*</label><select value={iceCreamState.priority} onChange={e=>setIceCreamState(s=>({...s, priority: e.target.value as any}))} className="input-style mt-1">{Object.entries(PRIORITIES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
                                <div className="col-span-2"><label className="text-xs">محصولات</label><div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">{ICE_CREAM_PRODUCTS.map(p => <label key={p} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={iceCreamState.products.includes(p)} onChange={e => handleProductChange(p, e.target.checked)} />{p}</label>)}</div></div>
                            </div>
                        </fieldset>
                        </>
                    )}

                    {[FreightLineType.Dairy, FreightLineType.Ambient].includes(lineType) && (
                        <>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">اطلاعات بارگیری</legend>
                            <div className="mb-3">
                                <label className="text-xs font-semibold mb-2 block">نوع بارگیری</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="loadingType"
                                            value="single"
                                            checked={loadingLocationState.loadingType === 'single'}
                                            onChange={() => {
                                                setLoadingLocationState(s => ({
                                                    ...s,
                                                    loadingType: 'single' as 'single' | 'double',
                                                    originCity2: '',
                                                }));
                                                setOriginCity2Valid(false);
                                            }}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">تک مبدا</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="loadingType"
                                            value="double"
                                            checked={loadingLocationState.loadingType === 'double'}
                                            onChange={(e) => setLoadingLocationState(s => ({ ...s, loadingType: 'double' as 'single' | 'double' }))}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">دو مبدا بارگیری</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                {loadingLocationState.loadingType === 'single' ? (
                                    <RequiredField label="مبدا بارگیری*">
                                        <CityAutocomplete
                                            value={loadingLocationState.originCity1}
                                            onChange={(city) => {
                                                onRouteQueryChange(city);
                                                setLoadingLocationState(s => ({ ...s, originCity1: city }));
                                            }}
                                            onValidityChange={setOriginCity1Valid}
                                            requireSelection
                                            placeholder="جستجوی مبدا..."
                                            className="input-style mt-1 w-full"
                                            required
                                        />
                                    </RequiredField>
                                ) : (
                                    <>
                                        <RequiredField label="مبدا بارگیری اول*">
                                            <CityAutocomplete
                                                value={loadingLocationState.originCity1}
                                                onChange={(city) => {
                                                    onRouteQueryChange(city);
                                                    setLoadingLocationState(s => ({ ...s, originCity1: city }));
                                                }}
                                                onValidityChange={setOriginCity1Valid}
                                                requireSelection
                                                placeholder="جستجوی مبدا..."
                                                className="input-style mt-1 w-full"
                                                required
                                            />
                                        </RequiredField>
                                        <RequiredField label="مبدا بارگیری دوم*">
                                            <CityAutocomplete
                                                value={loadingLocationState.originCity2}
                                                onChange={(city) => {
                                                    onRouteQueryChange(city);
                                                    setLoadingLocationState(s => ({ ...s, originCity2: city }));
                                                }}
                                                onValidityChange={setOriginCity2Valid}
                                                requireSelection
                                                placeholder="جستجوی مبدا..."
                                                className="input-style mt-1 w-full"
                                                required
                                            />
                                        </RequiredField>
                                    </>
                                )}
                            </div>
                            <div><label className="text-xs">ساعت حضور در سکو</label>
                                <select value={multiDestState.platformArrivalTime} onChange={e=>setMultiDestState(s=>({...s, platformArrivalTime: e.target.value}))} className="input-style mt-1">
                                    <option value="">-- انتخاب کنید --</option>
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}:00</option>
                                    ))}
                                </select>
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">برند محصول</legend>
                            <div className="mb-3">
                                <label className="text-xs font-semibold mb-2 block">نوع برند</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="brandType"
                                            value="single"
                                            checked={brandState.brandType === 'single'}
                                            onChange={(e) => setBrandState(s => ({ ...s, brandType: 'single' as 'single' | 'double', brand2: '' }))}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">تک برند</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="brandType"
                                            value="double"
                                            checked={brandState.brandType === 'double'}
                                            onChange={(e) => setBrandState(s => ({ ...s, brandType: 'double' as 'single' | 'double' }))}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-xs">دو برند</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {brandState.brandType === 'single' ? (
                                    <div>
                                        <label className="text-xs">برند*</label>
                                        <select 
                                            value={brandState.brand1} 
                                            onChange={e=>setBrandState(s=>({...s, brand1: e.target.value}))} 
                                            className="input-style mt-1"
                                            required
                                        >
                                            {BRANDS.map(b=><option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs">برند اول*</label>
                                            <select 
                                                value={brandState.brand1} 
                                                onChange={e=>setBrandState(s=>({...s, brand1: e.target.value}))} 
                                                className="input-style mt-1"
                                                required
                                            >
                                                {BRANDS.map(b=><option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs">برند دوم*</label>
                                            <select 
                                                value={brandState.brand2} 
                                                onChange={e=>setBrandState(s=>({...s, brand2: e.target.value}))} 
                                                className="input-style mt-1"
                                                required
                                            >
                                                <option value="">-- انتخاب کنید --</option>
                                                {BRANDS.map(b=><option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">مقاصد</legend>
                            <div className="space-y-2">
                                {destinations.map((dest, index) => (
                                    <div key={dest.id} className="p-2 bg-slate-100 rounded space-y-2 relative">
                                        <span className="absolute top-2 left-2 bg-slate-300 text-slate-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{index + 1}</span>
                                        {destinations.length > 1 && <button type="button" onClick={() => removeDestination(dest.id!)} className="absolute top-2 right-2 text-red-500 text-xs">حذف</button>}
                                        <div className="grid grid-cols-2 gap-2">
                                            <RequiredField label="شهر مقصد*">
                                                <CityAutocomplete
                                                    value={dest.city || ''}
                                                    onChange={(city) =>
                                                        dest.id && handleDestinationCitySelect(dest.id, city)
                                                    }
                                                    onValidityChange={(valid) => {
                                                        if (dest.id) {
                                                            setDestCityValid((prev) => ({
                                                                ...prev,
                                                                [dest.id!]: valid,
                                                            }));
                                                        }
                                                    }}
                                                    requireSelection
                                                    className="input-style"
                                                    required
                                                />
                                            </RequiredField>
                                            <RequiredField label="نوع نماینده*">
                                                <select value={dest.representativeType || 'agent'} onChange={e => handleDestinationChange(dest.id!, 'representativeType', e.target.value)} className="input-style w-full" required>
                                                    <option value="agent">نماینده</option>
                                                    <option value="distributor">پخش</option>
                                                </select>
                                            </RequiredField>
                                            <div><label className="text-xs">نام نماینده</label><input value={dest.representativeName || ''} onChange={e => handleDestinationChange(dest.id!, 'representativeName', e.target.value)} className="input-style" /></div>
                                            <RequiredField label="تناژ (کیلوگرم)*">
                                                <input type="number" value={dest.tonnage || ''} onChange={e => handleDestinationChange(dest.id!, 'tonnage', Number(e.target.value))} className="input-style w-full" required min="0" step="0.01"/>
                                            </RequiredField>
                                            <div><label className="text-xs">تاریخ تحویل*</label><input type="text" value={dest.deliveryDate || ''} onChange={e => {
                                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                                // اعمال خودکار فرمت YYYY/MM/DD
                                                if (value.length > 4 && !value.includes('/')) {
                                                    value = value.slice(0, 4) + '/' + value.slice(4);
                                                }
                                                if (value.length > 7 && value.split('/').length === 2) {
                                                    const parts = value.split('/');
                                                    if (parts[1].length > 2) {
                                                        value = parts[0] + '/' + parts[1].slice(0, 2) + '/' + parts[1].slice(2);
                                                    }
                                                }
                                                // محدود کردن به فرمت YYYY/MM/DD
                                                if (value.length <= 10) {
                                                    handleDestinationChange(dest.id!, 'deliveryDate', value);
                                                }
                                            }} onBlur={e => {
                                                // هنگام blur، فرمت را کامل کن (اضافه کردن صفرهای ابتدایی)
                                                const value = e.target.value;
                                                const parts = value.split('/');
                                                if (parts.length === 3) {
                                                    const year = parts[0].padStart(4, '0');
                                                    const month = parts[1].padStart(2, '0');
                                                    const day = parts[2].padStart(2, '0');
                                                    if (year.length === 4 && month.length === 2 && day.length === 2) {
                                                        handleDestinationChange(dest.id!, 'deliveryDate', `${year}/${month}/${day}`);
                                                    }
                                                }
                                            }} className="input-style" placeholder="1404/09/18" dir="ltr" pattern="\d{4}\/\d{2}\/\d{2}" title="فرمت صحیح: 1404/09/18 (ماه و روز باید دو رقمی باشند)" required maxLength={10}/></div>
                                            <div><label className="text-xs">ساعت تخلیه</label>
                                                <select value={dest.unloadTime || ''} onChange={e => handleDestinationChange(dest.id!, 'unloadTime', e.target.value)} className="input-style">
                                                    <option value="">-- انتخاب کنید --</option>
                                                    {Array.from({ length: 24 }, (_, i) => (
                                                        <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}:00</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {destinations.length < 4 && <button type="button" onClick={addDestination} className="text-sm text-sky-600 hover:underline mt-2">+ افزودن مقصد</button>}
                            </div>
                        </fieldset>
                        </>
                    )}

                    <fieldset className="p-3 border rounded-lg bg-white">
                        <legend className="font-semibold px-1 text-sm">یادداشت</legend>
                        <textarea value={commonState.notes} onChange={e => setCommonState(s=>({...s, notes: e.target.value}))} placeholder="..." className="input-style w-full" rows={2}/>
                    </fieldset>
                </form>
                 <div className="p-4 bg-white border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    {!isEditMode && <button type="button" onClick={(e) => handleSubmit(e, true)} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm">ذخیره پیش‌نویس</button>}
                    <button type="submit" form="freight-form" className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">{isEditMode ? 'ذخیره تغییرات' : 'ثبت و ارجاع'}</button>
                </div>
                <datalist id="cities">
                    {routeOptions.map(route => (
                        <option
                            key={`${route.id}-${route.city}-${route.province}`}
                            value={route.city}
                        >
                            {route.city}{route.province ? ` - ${route.province}` : ''}{route.roundTripKm ? ` (${route.roundTripKm} کیلومتر رفت و برگشت)` : ''}
                        </option>
                    ))}
                </datalist>
            </aside>
        </>
    );
}

// Memoize the component to prevent unnecessary re-renders
export default React.memo(FreightDashboard);