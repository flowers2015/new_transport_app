// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View, PersonalDriver, PersonalVehicle } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber, splitJalaliDateTime, parseJalaliDateString } from '../utils/jalali';
import {
    getDestinationCitiesLabel,
    getAnnouncementRepDisplayLabel,
    getDestinationRepTypesColumnLabel,
    getDestinationRepNamesColumnLabel,
    getAssignedDriverDisplayName,
    getAssignedDriverContact,
    getAssignedVehiclePlate,
    getCarrierName,
    TOTAL_FREIGHT_HEADER,
    formatFreightAmountCell,
    formatRepresentativeType,
    resolveDestinationRepTypeLabel,
    localizeExcelValue,
    isFreightDestinationDetailHeader,
    formatTotalTonnageFromDestinations,
    formatDestinationBrandLabel,
    formatDestinationProductsLabel,
    formatAnnouncementDestinationProductsLabel,
    formatDestinationRepCompactSegment,
    formatDairyCompactDestinationsText,
    formatTonnageKgFromRaw,
    matchesFreightLine,
    isDairyOrAmbientLineType,
    parseNumericField,
    formatTonnageKg,
    buildTariffFreightColumns,
    isPersonalTransportViewerRole,
    TARIFF_FREIGHT_HEADER,
    TARIFF_DIFF_HEADER,
    getAnnouncementAssignedAt,
} from '../utils/freightDisplay';

const renderAnnouncementDateTimeCell = (createdAt: Date | string | null | undefined) => {
    const parts = splitJalaliDateTime(createdAt);
    if (!parts) {
        return <span className="text-xs">{formatJalaliDateTime(createdAt)}</span>;
    }
    return (
        <div className="flex flex-col items-center justify-center leading-tight gap-0.5 min-w-[4.75rem] py-0.5">
            <span className="text-xs whitespace-nowrap">{parts.date}</span>
            <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">{parts.time}</span>
        </div>
    );
};

const renderAssignmentDateCell = (ann: FreightAnnouncement) => {
    const raw = getAnnouncementAssignedAt(ann);
    if (!raw) return <span className="text-xs text-slate-400">-</span>;
    return renderAnnouncementDateTimeCell(raw);
};

const ASSIGNMENT_DATE_COLUMN = {
    header: 'تاریخ تخصیص',
    render: (ann: FreightAnnouncement) => renderAssignmentDateCell(ann),
};

const DAIRY_COMPACT_COLUMN_CLASSES: Record<string, string> = {
    ردیف: 'col-row',
    'کارمند اعلام‌کننده': 'col-creator',
    'نوع خودرو': 'col-vehicle-type',
    'مبدا بارگیری': 'col-origin',
    'کل تناژ (کیلوگرم)': 'col-tonnage',
    مقاصد: 'col-destinations',
    'ارزش بار (ریال)': 'col-cargo-value',
    'ساعت حضور': 'col-platform-time',
    'تاریخ اعلام بار': 'col-created-at',
    'تاریخ تخصیص': 'col-assigned-at',
    باربری: 'col-carrier',
    'نام راننده': 'col-driver',
    'تماس راننده': 'col-driver-contact',
    'کد خودرو': 'col-vehicle-code',
    'پلاک خودرو': 'col-plate',
    'شماره بارنامه': 'col-bol',
    [TOTAL_FREIGHT_HEADER]: 'col-freight',
    [TARIFF_FREIGHT_HEADER]: 'col-tariff',
    [TARIFF_DIFF_HEADER]: 'col-tariff-diff',
    توضیحات: 'col-notes',
};

const renderDairyCompactText = (text: string) => (
    <span className="text-slate-700 text-[10px] sm:text-xs leading-snug break-words">{text}</span>
);

/** مقاصد فشرده پاستوریزه — مطابق پیگیری اعلام بار زنده */
const renderDairyCompactDestinations = (ann: FreightAnnouncement) => {
    if (!ann.destinations?.length) return <span>-</span>;
    return (
        <div className="dest-compact-list text-[9px] sm:text-[10px] leading-snug text-right w-full min-w-0">
            {ann.destinations.map((d, idx) => {
                const products = formatDestinationProductsLabel(d);
                return (
                    <div key={d.id || idx} className="dest-compact-line">
                        <span className="dest-compact-num">{idx + 1}</span>
                        <div className="dest-compact-body">
                            <span className="dest-compact-city">{(d.city || '').trim() || '-'}</span>
                            {d.tonnage ? (
                                <span className="dest-compact-tonnage">({formatTonnageKgFromRaw(d.tonnage)})</span>
                            ) : null}
                            <span className="dest-compact-dot">·</span>
                            <span className="dest-compact-rep">{formatDestinationRepCompactSegment(ann, d)}</span>
                            <span className="dest-compact-dot">·</span>
                            <span className="dest-compact-brand">{formatDestinationBrandLabel(d)}</span>
                            <span className="dest-compact-dot">·</span>
                            <span className="dest-compact-lis">{d.lisCode?.trim() || '-'}</span>
                            {products !== '-' ? (
                                <>
                                    <span className="dest-compact-dot">·</span>
                                    <span className="dest-compact-products">{products}</span>
                                </>
                            ) : null}
                            <span className="dest-compact-dot">·</span>
                            <span className="dest-compact-date">{d.deliveryDate || '-'}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
import {
    ColumnFiltersState,
    SortDirection,
    applyTransportLiveFilters,
    applyTransportLiveSort,
    countActiveFilters,
    loadTransportLiveFilterPrefs,
    saveTransportLiveFilterPrefs,
    freightHistoryFilterStorageKey,
    freightHistoryColumnStorageKey,
    loadFreightHistoryHiddenColumns,
    saveTransportLiveHiddenColumns,
} from '../utils/transportLiveFilters';
import { getAssignedVehicleCode, shouldShowVehicleCodeColumn } from '../utils/transportLiveViewUtils';
import { getFinanceRejectType, getFinanceRejectTypeLabel, isFinanceRejectedAnn } from '../utils/financeRejection';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import * as XLSX from 'xlsx';
// برای استایل‌ها، از ExcelJS استفاده می‌کنیم
import ExcelJS from 'exceljs';

interface FreightHistoryProps {
    announcements: FreightAnnouncement[];
    vehicles: Vehicle[];
    drivers: Driver[];
    personalDrivers: PersonalDriver[];
    personalVehicles: PersonalVehicle[];
  currentUser: User;
    activeLine: FreightLineType;
    setActiveLine: (line: FreightLineType) => void;
    filterDate: string;
    setFilterDate: (date: string) => void;
    filterDestination: string;
    setFilterDestination: (destination: string) => void;
    filterBillOfLading: string;
    setFilterBillOfLading: (billOfLading: string) => void;
    filterDriverName: string;
    setFilterDriverName: (driverName: string) => void;
    filterCreatorName: string;
    setFilterCreatorName: (creatorName: string) => void;
    onSearch: () => void;
    onClearFilters: () => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
    currentPage?: number;
    itemsPerPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    onItemsPerPageChange?: (limit: number) => void;
    onFetchForExcelExport?: (opts: {
        dateFrom: string;
        dateTo: string;
    }) => Promise<FreightAnnouncement[]>;
}

// Move helper functions inside component to ensure proper re-rendering
const formatCurrency = (amount?: number | string) => {
    if (!amount) return '-';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '-';
    // تبدیل به عدد صحیح و جدا کردن 3 رقم 3 رقم
    const roundedAmount = Math.round(numAmount);
    return `${roundedAmount.toLocaleString('fa-IR')} ریال`;
};

const isToday = (someDate: any) => {
    if (!someDate) return false;
    const d = typeof someDate === 'string' ? new Date(someDate) : someDate;
    if (!(d instanceof Date) || isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
}

const statusStyles: { [key in FreightAnnouncementStatus]: string } = {
    [FreightAnnouncementStatus.Draft]: 'bg-gray-100 text-gray-800',
    [FreightAnnouncementStatus.PendingManagerApproval]: 'bg-yellow-100 text-yellow-800',
    [FreightAnnouncementStatus.Rejected]: 'bg-red-100 text-red-800',
    [FreightAnnouncementStatus.PendingPersonalAssignment]: 'bg-orange-100 text-orange-800',
    [FreightAnnouncementStatus.PendingCompanyAssignment]: 'bg-orange-100 text-orange-800',
    [FreightAnnouncementStatus.Assigned]: 'bg-green-100 text-green-800',
    [FreightAnnouncementStatus.InTransit]: 'bg-purple-100 text-purple-800',
    [FreightAnnouncementStatus.Finalized]: 'bg-teal-100 text-teal-800',
    [FreightAnnouncementStatus.Cancelled]: 'bg-slate-100 text-slate-800',
    [FreightAnnouncementStatus.ReAnnounced]: 'bg-gray-400 text-white',
    [FreightAnnouncementStatus.Leftover]: 'bg-red-200 text-red-900',
    [FreightAnnouncementStatus.ReturnedToCreator]: 'bg-amber-100 text-amber-900',
    [FreightAnnouncementStatus.ChangeRequested]: 'bg-orange-200 text-orange-900',
    [FreightAnnouncementStatus.Archived]: 'bg-slate-300 text-slate-800',
};



const FreightHistory: React.FC<FreightHistoryProps> = (props) => {
    const { announcements, vehicles, drivers, personalDrivers, personalVehicles, currentUser, activeLine, setActiveLine, filterDate, setFilterDate, filterDestination, setFilterDestination, filterBillOfLading, setFilterBillOfLading, filterDriverName, setFilterDriverName, filterCreatorName, setFilterCreatorName, onSearch, onClearFilters, onOpenHistory, currentPage = 1, itemsPerPage = 50, totalCount = 0, totalPages = 1, onPageChange, onItemsPerPageChange, onFetchForExcelExport } = props;
    
    // Debug logging for re-renders
    // console.log('🔄 [TransportLive] Component re-rendered with:', {
    //     announcementsCount: announcements.length,
    //     driversCount: drivers.length,
    //     vehiclesCount: vehicles.length,
    //     timestamp: new Date().toISOString()
    // });
    // حفظ viewMode در localStorage تا بعد از سرچ حفظ شود
    const [viewMode, setViewMode] = useState<'compact' | 'full'>(() => {
        const saved = localStorage.getItem('freightHistoryViewMode');
        return (saved === 'compact' || saved === 'full') ? saved : 'compact';
    });
    
    // ذخیره viewMode در localStorage وقتی تغییر می‌کند
    useEffect(() => {
        localStorage.setItem('freightHistoryViewMode', viewMode);
    }, [viewMode]);

    const filterStorageKey = useMemo(
        () => freightHistoryFilterStorageKey(currentUser.id, activeLine, viewMode),
        [currentUser.id, activeLine, viewMode]
    );
    const columnStorageKey = useMemo(
        () => freightHistoryColumnStorageKey(currentUser.id, activeLine, viewMode),
        [currentUser.id, activeLine, viewMode]
    );
    const isPersonalTransportUser = isPersonalTransportViewerRole(currentUser.role);
    const personalTariffColumns = useMemo(
        () => (isPersonalTransportUser ? buildTariffFreightColumns() : []),
        [isPersonalTransportUser]
    );
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [hiddenColumnHeaders, setHiddenColumnHeaders] = useState<Set<string>>(() => new Set());
    const [columnPickerOpen, setColumnPickerOpen] = useState(false);
    const columnPickerRef = React.useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const prefs = loadTransportLiveFilterPrefs(filterStorageKey);
        setColumnFilters(prefs.columnFilters);
        setSortColumn(prefs.sortColumn ?? null);
        setSortDirection(prefs.sortDirection ?? 'asc');
    }, [filterStorageKey]);

    useEffect(() => {
        setHiddenColumnHeaders(loadFreightHistoryHiddenColumns(columnStorageKey, activeLine));
        setColumnPickerOpen(false);
    }, [columnStorageKey, activeLine]);

    useEffect(() => {
        saveTransportLiveFilterPrefs(filterStorageKey, {
            columnFilters,
            quickSearch: '',
            sortColumn,
            sortDirection,
        });
    }, [filterStorageKey, columnFilters, sortColumn, sortDirection]);

    useEffect(() => {
        saveTransportLiveHiddenColumns(columnStorageKey, hiddenColumnHeaders);
    }, [columnStorageKey, hiddenColumnHeaders]);

    useEffect(() => {
        if (!columnPickerOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (!columnPickerRef.current?.contains(e.target as Node)) {
                setColumnPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [columnPickerOpen]);

    const toggleColumnVisibility = useCallback((header: string) => {
        setHiddenColumnHeaders((prev) => {
            const next = new Set(prev);
            if (next.has(header)) next.delete(header);
            else next.add(header);
            return next;
        });
    }, []);

    const resetColumnVisibility = useCallback(() => {
        setHiddenColumnHeaders(new Set());
    }, []);

    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [excelExportDialog, setExcelExportDialog] = useState<{
        mode: 'compact' | 'full';
    } | null>(null);
    const [excelDateFrom, setExcelDateFrom] = useState('');
    const [excelDateTo, setExcelDateTo] = useState('');
    const [excelExporting, setExcelExporting] = useState(false);
    
    // Helper functions inside component to ensure proper re-rendering
    const getDriverName = (id: string | undefined, drivers: Driver[], personalDrivers: any[] = []) => {
        if (!id) return '-';
        // First search in company drivers
        let driver = drivers.find(d => d.id === id);
        // If not found, search in personal drivers
        if (!driver) {
            driver = personalDrivers.find(d => d.id === id);
        }
        // console.log('🔍 [getDriverName] Looking for driver:', id, 'Found:', driver?.name);
        return driver?.name || '-';
    };
    
    const getDriverContact = (id: string | undefined, drivers: Driver[], personalDrivers: any[] = []) => {
        if (!id) return '-';
        // First search in company drivers
        let driver = drivers.find(d => d.id === id);
        // If not found, search in personal drivers
        if (!driver) {
            driver = personalDrivers.find(d => d.id === id);
        }
        // console.log('🔍 [getDriverContact] Looking for driver:', id, 'Found:', driver?.mobile);
        return driver?.mobile || '-';
    };
    
    const getVehicleIdentifier = (id: string | undefined, vehicles: Vehicle[], personalVehicles: any[] = []) => {
        if (!id) return '-';
        // First search in company vehicles
        let v = vehicles.find(v => v.id === id);
        // If not found, search in personal vehicles
        if (!v) {
            const personalV = personalVehicles.find(v => v.id === id);
            if (personalV) {
                // Format personal vehicle plate
                const plate = `${personalV.platePart1}${personalV.plateLetter}${personalV.platePart2}-${personalV.plateCityCode}`;
                // console.log('🔍 [getVehicleIdentifier] Looking for vehicle:', id, 'Found personal vehicle:', personalV.vehicleType, 'Plate:', plate);
                return plate;
            }
        }
        
        if (!v) return 'نامشخص';
        
        const result = v.plateNumber ? formatPlateNumber(v.plateNumber) : v.serialNumber || 'نامشخص';
        // console.log('🔍 [getVehicleIdentifier] Looking for vehicle:', id, 'Found vehicle:', v.model, 'Plate:', v.plateNumber, 'Serial:', v.serialNumber, 'Result:', result);
        return result;
    };

    // Helper functions for personal drivers and vehicles
    const getPersonalDriverName = (driverId: string | undefined, personalDrivers: PersonalDriver[]) => {
        if (!driverId) return '-';
        const driver = personalDrivers.find(d => d.id === driverId);
        // console.log('🔍 [getPersonalDriverName] Looking for driver:', driverId, 'Found:', driver?.name);
        return driver?.name || '-';
    };
    
    const getPersonalDriverContact = (driverId: string | undefined, personalDrivers: PersonalDriver[]) => {
        if (!driverId) return '-';
        const driver = personalDrivers.find(d => d.id === driverId);
        // console.log('🔍 [getPersonalDriverContact] Looking for driver:', driverId, 'Found:', driver?.mobile);
        return driver?.mobile || '-';
    };
    
    const getPersonalVehicleIdentifier = (vehicleId: string | undefined, personalVehicles: PersonalVehicle[]) => {
        if (!vehicleId) return '-';
        const v = personalVehicles.find(v => v.id === vehicleId);
        if (!v) return 'نامشخص';
        
        const result = v.formattedPlate || 'نامشخص';
        // console.log('🔍 [getPersonalVehicleIdentifier] Looking for vehicle:', vehicleId, 'Found vehicle:', v.vehicleType, 'Plate:', v.formattedPlate, 'Result:', result);
        return result;
    };
    
    // Move columnsConfig inside component to ensure proper re-rendering
    const columnsConfig = (viewMode: 'compact' | 'full') => {
        let columns = [
            // Common Columns
            { header: 'ردیف', align: 'center', display: () => viewMode === 'full', render: (_: any, idx: number) => idx + 1 },
            {
                header: 'کد اعلام بار',
                align: 'center',
                display: () => true,
                render: (ann: FreightAnnouncement) => {
                    const raw = ann as any;
                    if (!isFinanceRejectedAnn(raw)) {
                        return ann.announcementCode;
                    }
                    const label = getFinanceRejectTypeLabel(getFinanceRejectType(raw));
                    return (
                        <div className="flex flex-col items-center gap-1">
                            <span>{ann.announcementCode}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold whitespace-nowrap">
                                {label}
                            </span>
                        </div>
                    );
                },
            },
            // { header: 'وضعیت', display: () => true, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
            { header: 'کارمند اعلام‌کننده', display: () => true, render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
            { header: 'مبدا بارگیری', display: () => true, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
            { header: 'برند', display: () => true, render: (ann: FreightAnnouncement) => ann.brand || '-' },
            { header: 'نوع خودرو', display: () => true, render: (ann: FreightAnnouncement) => ann.vehicleType },
            
            // Destinations Summary (for all compact views)
            { header: 'مقاصد', display: () => viewMode === 'compact', render: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، ') },

            // Assignment Info (for all views)
            { header: 'باربری', display: (lt: any) => lt === FreightLineType.Dairy || lt === FreightLineType.Ambient, render: (ann: FreightAnnouncement) => getCarrierName(ann, props.personalDrivers) },
            { header: 'نام راننده', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = getAssignedDriverDisplayName(ann, drivers, props.personalDrivers);
                // console.log('🔍 [Render] Driver name for', ann.id, ':', result);
                return result;
            }},
            { header: 'تماس راننده', display: () => viewMode === 'full' || viewMode === 'compact', render: (ann: FreightAnnouncement) => {
                const result = getAssignedDriverContact(ann, drivers, props.personalDrivers);
                return <span className="font-mono">{result}</span>;
            }},
            { header: 'کد خودرو', display: (lt: any) => lt === FreightLineType.IceCream || lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => (
                <span className="font-mono whitespace-nowrap">{getAssignedVehicleCode(ann, vehicles)}</span>
            )},
            { header: 'پلاک خودرو', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = ann.assignmentType === 'company' 
                    ? getVehicleIdentifier(ann.assignedVehicleId, vehicles, props.personalVehicles)
                    : getPersonalVehicleIdentifier(ann.assignedVehicleId, props.personalVehicles);
                // console.log('🔍 [Render] Vehicle plate for', ann.id, ':', result);
                return <span className="font-mono whitespace-nowrap">{result}</span>;
            }},
            { header: 'شماره بارنامه', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = ann.billOfLadingNumber || '-';
                // console.log('🔍 [Render] Bill of lading for', ann.id, ':', result);
                return result;
            }},
            { header: TOTAL_FREIGHT_HEADER, display: () => true, render: (ann: FreightAnnouncement) => formatFreightAmountCell(ann.totalFreightCost) },
            ...personalTariffColumns.map((col) => ({ ...col, display: () => true })),
            
            // Ice Cream (فشرده و کامل)
            { header: 'نوع نماینده', display: (lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => formatRepresentativeType(ann.representativeType) },
            { header: 'کارتن', align: 'center', display: (lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.cartonCount ?? '-' },
            { header: 'پالت', align: 'center', display: (lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.palletCount ?? '-' },
            { header: 'محصولات', display: (lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
            
            // Full View Specific - Dairy/Ambient
            { header: 'ساعت حضور', display: (lt: any) => viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(lt), render: (ann: FreightAnnouncement) => ann.platformArrivalTime },
            { header: 'ارزش بار', align: 'center', display: () => viewMode === 'full', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
            
            // حذف ستون عملیات
        ];

        return columns;
    };
    // selectedAnnouncement و dialog برای تاریخچه نیاز نیست

    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    };

    // برای تاریخچه، همه اعلام‌بارها Finalized هستند، پس نیازی به فیلتر پیچیده نداریم
    const liveAnnouncements = useMemo(() => {
        // همه اعلام‌بارها در تاریخچه Finalized هستند (از endpoint گرفته شده)
        return announcements;
    }, [announcements]);

    const filteredAnnouncements = useMemo(() => {
        return liveAnnouncements.filter((a) => matchesFreightLine(a, activeLine));
    }, [liveAnnouncements, activeLine]);

    const isDairyOrAmbientTab = isDairyOrAmbientLineType(activeLine);

    const dairyFullBase = useMemo(
        () => [
            { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
            {
                header: 'کارمند اعلام‌کننده',
                render: (ann: any) => (
                    <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span>
                ),
            },
            { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType || '-' },
            { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
            {
                header: 'کل تناژ (کیلوگرم)',
                render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations),
            },
            {
                header: 'ارزش بار (ریال)',
                render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR'),
            },
            { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
            {
                header: 'تاریخ اعلام بار',
                render: (ann: FreightAnnouncement) => renderAnnouncementDateTimeCell(ann.createdAt),
            },
            ASSIGNMENT_DATE_COLUMN,
        ],
        []
    );

    const dairyAmbientFullBase = useMemo(
        () => [
            { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
            {
                header: 'کارمند اعلام‌کننده',
                render: (ann: any) => (
                    <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span>
                ),
            },
            {
                header: 'محصولات',
                render: (ann: FreightAnnouncement) => (
                    <span className="text-xs text-slate-700 whitespace-normal">
                        {formatAnnouncementDestinationProductsLabel(ann)}
                    </span>
                ),
            },
            { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType || '-' },
            { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
            { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
            {
                header: 'کل تناژ (کیلوگرم)',
                render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations),
            },
            {
                header: 'ارزش بار (ریال)',
                render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR'),
            },
            { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
            {
                header: 'تاریخ اعلام بار',
                render: (ann: FreightAnnouncement) => renderAnnouncementDateTimeCell(ann.createdAt),
            },
            ASSIGNMENT_DATE_COLUMN,
        ],
        []
    );

    const AMBIENT_DEST_SUB_HEADERS = ['نماینده', 'مقصد', 'تناژ', 'تاریخ تحویل', 'ساعت تخلیه', 'کرایه (ریال)'] as const;
    const DAIRY_DEST_SUB_HEADERS = ['نوع برند', 'کد LIS', 'محصولات', 'نماینده', 'مقصد', 'تناژ', 'تاریخ تحویل', 'ساعت تخلیه', 'کرایه (ریال)'] as const;

    // Helper function to extract text from React element
    const extractTextFromElement = (element: React.ReactElement | React.ReactNode): string => {
        if (typeof element === 'string') return element;
        if (typeof element === 'number') return String(element);
        if (element === null || element === undefined) return '';
        if (!React.isValidElement(element)) return String(element || '');
        
        if (element.props && element.props.children !== undefined) {
            const children = element.props.children;
            
            if (typeof children === 'string') {
                return children;
            }
            if (typeof children === 'number') {
                return String(children);
            }
            if (Array.isArray(children)) {
                return children.map(child => extractTextFromElement(child)).join(' ');
            }
            if (React.isValidElement(children)) {
                return extractTextFromElement(children);
            }
        }
        
        if (element.props && element.props.value !== undefined) {
            return String(element.props.value);
        }
        
        return '';
    };

    const buildVisibleColumns = (columnMode: 'compact' | 'full') => {
        const showVehicleCode = shouldShowVehicleCodeColumn(activeLine);
        const showCarrierColumn =
            activeLine === FreightLineType.Dairy || activeLine === FreightLineType.Ambient;
        const extraCols = [
            ...(showCarrierColumn
                ? [{ header: 'باربری', render: (ann: FreightAnnouncement) => getCarrierName(ann, props.personalDrivers) }]
                : []),
            { header: 'نام راننده', render: (ann: FreightAnnouncement) => getAssignedDriverDisplayName(ann, props.drivers, props.personalDrivers) },
            { header: 'تماس راننده', render: (ann: FreightAnnouncement) => <span className="font-mono">{getAssignedDriverContact(ann, props.drivers, props.personalDrivers)}</span> },
            ...(showVehicleCode
                ? [{
                    header: 'کد خودرو',
                    render: (ann: FreightAnnouncement) => (
                        <span className="font-mono whitespace-nowrap">
                            {getAssignedVehicleCode(ann, props.vehicles)}
                        </span>
                    ),
                }]
                : []),
            { header: 'پلاک خودرو', render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{getAssignedVehiclePlate(ann, props.vehicles, props.personalVehicles)}</span> },
            { header: 'شماره بارنامه', render: (ann: FreightAnnouncement) => ann.billOfLadingNumber || '-' },
            { header: TOTAL_FREIGHT_HEADER, render: (ann: FreightAnnouncement) => formatFreightAmountCell(ann.totalFreightCost) },
            ...personalTariffColumns,
            { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
        ];

        if (activeLine === FreightLineType.IceCream) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'نوع نماینده', render: (ann: FreightAnnouncement) => formatRepresentativeType(ann.representativeType) },
                { header: 'مقصد', render: (ann: FreightAnnouncement) => <span className="text-blue-600 font-semibold">{getDestinationCitiesLabel(ann)}</span> },
                { header: 'نام نماینده', render: (ann: FreightAnnouncement) => getAnnouncementRepDisplayLabel(ann) },
                { header: 'مبدا', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'محصولات', render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
                { header: 'کارتن', render: (ann: FreightAnnouncement) => ann.cartonCount ?? '-' },
                { header: 'پالت', render: (ann: FreightAnnouncement) => ann.palletCount ?? '-' },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'اولویت', render: (ann: FreightAnnouncement) => ({ low: 'کم اهمیت', normal: 'عادی', high: 'فوری' } as any)[ann.priority || 'normal'] },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => renderAnnouncementDateTimeCell(ann.createdAt) },
                ASSIGNMENT_DATE_COLUMN,
            ];
            return [...base, ...extraCols];
        }

        const dairyAmbientCompactRepCols = [
            {
                header: 'نوع نماینده',
                render: (ann: FreightAnnouncement) => getDestinationRepTypesColumnLabel(ann),
            },
            {
                header: 'نام نماینده',
                render: (ann: FreightAnnouncement) => getDestinationRepNamesColumnLabel(ann),
            },
        ];

        if (activeLine === FreightLineType.Dairy && columnMode === 'compact') {
            // مطابق پیگیری اعلام بار زنده (پاستوریزه فشرده)
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                {
                    header: 'کارمند اعلام‌کننده',
                    render: (ann: any) =>
                        renderDairyCompactText(ann.creator_full_name || ann.creator_username || '-'),
                },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType || '-' },
                {
                    header: 'مبدا بارگیری',
                    render: (ann: FreightAnnouncement) => renderDairyCompactText(ann.originCity || '-'),
                },
                {
                    header: 'کل تناژ (کیلوگرم)',
                    render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations),
                },
                {
                    header: 'مقاصد',
                    render: (ann: FreightAnnouncement) => renderDairyCompactDestinations(ann),
                },
                {
                    header: 'ارزش بار (ریال)',
                    render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR'),
                },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                {
                    header: 'تاریخ اعلام بار',
                    render: (ann: FreightAnnouncement) => renderAnnouncementDateTimeCell(ann.createdAt),
                },
                ASSIGNMENT_DATE_COLUMN,
            ];
            return [...base, ...extraCols];
        }

        if (activeLine === FreightLineType.Ambient && columnMode === 'compact') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                {
                    header: 'کارمند اعلام‌کننده',
                    render: (ann: any) => (
                        <span className="text-slate-700">{ann.creator_full_name || ann.creator_username || '-'}</span>
                    ),
                },
                {
                    header: 'محصولات',
                    render: (ann: FreightAnnouncement) => (
                        <span className="text-xs text-slate-700 whitespace-normal">
                            {formatAnnouncementDestinationProductsLabel(ann)}
                        </span>
                    ),
                },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                ...dairyAmbientCompactRepCols,
                { header: 'مقاصد', render: (ann: FreightAnnouncement) => (
                    <div className="flex flex-col text-xs space-y-1">
                        {ann.destinations.map((d, i) => (
                            <div key={d.id || i} className="flex items-center justify-center gap-2 flex-wrap">
                                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span className="font-semibold text-slate-800">{d.city}</span>
                            </div>
                        ))}
                    </div>
                ) },
                { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => renderAnnouncementDateTimeCell(ann.createdAt) },
                ASSIGNMENT_DATE_COLUMN,
            ];
            return [...base, ...extraCols];
        }

        if (activeLine === FreightLineType.Dairy && columnMode === 'full') {
            return [...dairyFullBase, ...extraCols];
        }

        if (activeLine === FreightLineType.Ambient && columnMode === 'full') {
            return [...dairyAmbientFullBase, ...extraCols];
        }

        if (isDairyOrAmbientTab && columnMode === 'full') {
            return [...dairyAmbientFullBase, ...extraCols];
        }

        const colsAll = columnsConfig(columnMode);
        const cols = colsAll.filter(c => c.display(activeLine)).filter(c => c.header !== 'کد اعلام بار');
        return [...cols, ...extraCols];
    };

    const resolveExportColumns = (mode: 'compact' | 'full') => buildVisibleColumns(mode);

    // Function to generate Excel export based on filtered data
    const generateExcelExport = (
        mode: 'compact' | 'full' = viewMode,
        rowsToExport: FreightAnnouncement[] = filteredAnnouncements
    ) => {
        const cols = resolveExportColumns(mode);
        
        const isFullDairyAmbientMode = mode === 'full' && isDairyOrAmbientLineType(activeLine);
        const isFullDairyMode = isFullDairyAmbientMode && activeLine === FreightLineType.Dairy;
        
        // Get headers - دقیقاً مطابق با ترتیب cols
        const headers: string[] = [];
        const seenHeaders = new Set<string>();
        
        cols.forEach(col => {
            // جلوگیری از تکرار headerها و حذف ستون عملیات
            if (!seenHeaders.has(col.header) && col.header !== 'عملیات') {
                headers.push(col.header);
                seenHeaders.add(col.header);
            }
        });
        
        // برای Full Dairy/Ambient، headers مقاصد را اضافه می‌کنیم
        if (isFullDairyAmbientMode) {
            for (let i = 1; i <= 4; i++) {
                if (isFullDairyMode) {
                    headers.push(
                        `مقصد ${i} - نوع برند`,
                        `مقصد ${i} - کد LIS`,
                        `مقصد ${i} - محصولات`,
                        `مقصد ${i} - نماینده`,
                        `مقصد ${i} - شهر`,
                        `مقصد ${i} - تناژ`,
                        `مقصد ${i} - تاریخ تحویل`,
                        `مقصد ${i} - ساعت تخلیه`,
                        `مقصد ${i} - کرایه`
                    );
                } else {
                    headers.push(`مقصد ${i} - نماینده`, `مقصد ${i} - شهر`, `مقصد ${i} - تناژ`, `مقصد ${i} - تاریخ تحویل`, `مقصد ${i} - ساعت تخلیه`, `مقصد ${i} - کرایه`);
                }
            }
        }
        
        // ایجاد workbook و worksheet
        const wb = XLSX.utils.book_new();
        const wsData: any[][] = [];
        
        // اضافه کردن headers
        wsData.push(headers);
        
        // Generate rows from export data
        rowsToExport.forEach((ann, idx) => {
            const row: any[] = [];
            
            // Helper to get value for a column header - دقیقاً مطابق با ترتیب headers
            const getValueForHeader = (header: string): any => {
                // بررسی اینکه آیا این ستون عددی است
                const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', TOTAL_FREIGHT_HEADER, 'کرایه کل', 'کرایه تعرفه', 'اختلاف کرایه', 'تعداد کارتن', 'تعداد پالت', 'مبلغ کرایه', 'کارتن', 'پالت'];
                const isNumericColumn = numericHeaders.some(h => header.includes(h));
                
                // Handle special columns directly - اولویت با اینهاست
                if (header === TOTAL_FREIGHT_HEADER || header === 'کرایه کل') {
                    const value = ann.totalFreightCost || 0;
                    return typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d]/g, '')) || 0;
                }
                if (header === TARIFF_FREIGHT_HEADER || header.includes('کرایه تعرفه')) {
                    return ann.tariffFreightCost || 0;
                }
                if (header === TARIFF_DIFF_HEADER || header.includes('اختلاف کرایه')) {
                    const reg = Number(ann.totalFreightCost) || 0;
                    const tar = Number(ann.tariffFreightCost) || 0;
                    if (reg <= 0 && tar <= 0) return '';
                    return reg - tar;
                }
                if (header === 'ارزش بار' || header === 'ارزش بار (ریال)') {
                    const value = ann.cargoValue || 0;
                    return typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d]/g, '')) || 0;
                }
                
                // Handle other special cases
                if (header === 'اولویت') {
                    const priorityMap: { [key: string]: string } = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };
                    return priorityMap[ann.priority || 'normal'] || ann.priority || 'عادی';
                }
                if (header === 'کل تناژ (کیلوگرم)') {
                    const totalTonnage = ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0);
                    return totalTonnage;
                }
                if (header === 'مقاصد' && mode === 'compact' && activeLine === FreightLineType.Dairy) {
                    return formatDairyCompactDestinationsText(ann);
                }
                if (header === 'نوع نماینده') {
                    return getDestinationRepTypesColumnLabel(ann);
                }
                if (header === 'نام نماینده') {
                    return getDestinationRepNamesColumnLabel(ann);
                }
                if (header === 'توضیحات') {
                    return ann.notes || '';
                }
                
                // Find column definition - دقیقاً همان header را پیدا کن
                const col = cols.find(c => c.header === header);
                if (!col) {
                    // اگر ستون پیدا نشد، از announcement مستقیماً بگیر
                    const directValue = (ann as any)[header];
                    if (directValue !== undefined) {
                        return directValue;
                    }
                    return '';
                }
                
                let value: any = '';
                
                if (col.render) {
                    const rendered = col.render(ann, idx);
                    if (typeof rendered === 'string') {
                        value = rendered;
                    } else if (typeof rendered === 'number') {
                        value = rendered;
                    } else if (React.isValidElement(rendered)) {
                        value = extractTextFromElement(rendered);
                        value = value.replace(/[📅🕐]/g, '').trim();
                    } else if (Array.isArray(rendered)) {
                        value = rendered.map((item: any) => {
                            if (React.isValidElement(item)) {
                                let text = extractTextFromElement(item);
                                text = text.replace(/[📅🕐]/g, '').trim();
                                return text;
                            }
                            return String(item || '');
                        }).join('، ');
                    } else {
                        value = String(rendered || '');
                    }
                } else {
                    value = (ann as any)[col.header] || '';
                }
                
                // Clean up
                if (typeof value === 'string') {
                    value = value.replace(/<[^>]*>/g, '').trim();
                }
                
                // برای ستون‌های عددی، مقدار عددی را استخراج کن
                if (isNumericColumn) {
                    if (typeof value === 'number') {
                        value = value;
                    } else if (typeof value === 'string') {
                        const cleaned = value.replace(/[^\d]/g, '');
                        const numValue = parseFloat(cleaned);
                        if (!isNaN(numValue) && numValue > 0) {
                            value = numValue;
                        } else {
                            value = '';
                        }
                    } else {
                        value = '';
                    }
                }
                
                return value;
            };
            
            // Process columns in header order - دقیقاً همان ترتیب headers
            headers.forEach(header => {
                if (!isFreightDestinationDetailHeader(header)) {
                    row.push(getValueForHeader(header));
                }
            });
            
            // برای Full Dairy/Ambient، مقاصد را اضافه می‌کنیم
            if (isFullDairyAmbientMode) {
                for (let i = 0; i < 4; i++) {
                    const dest = ann.destinations[i];
                    if (dest) {
                        const repType = resolveDestinationRepTypeLabel(ann, dest);
                        const tonnage = dest.tonnage ? Number(dest.tonnage) : '';
                        const deliveryDate = (dest as any).deliveryDate || '';
                        const unloadTime = dest.unloadTime || '';
                        const freightCost = dest.freightCost ? Number(dest.freightCost) : '';
                        if (isFullDairyMode) {
                            row.push(
                                formatDestinationBrandLabel(dest),
                                dest.lisCode || '',
                                formatDestinationProductsLabel(dest),
                                repType,
                                dest.city || '',
                                tonnage,
                                deliveryDate,
                                unloadTime,
                                freightCost
                            );
                        } else {
                            row.push(
                                repType,
                                dest.city || '',
                                tonnage,
                                deliveryDate,
                                unloadTime,
                                freightCost
                            );
                        }
                    } else {
                        row.push(...Array(isFullDairyMode ? 9 : 6).fill(''));
                    }
                }
            }
            
            wsData.push(row);
        });
        
        // ایجاد worksheet از data
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // تنظیم عرض ستون‌ها
        const colWidths = headers.map((header, idx) => {
            let maxLength = header.length;
            wsData.forEach((row, rowIdx) => {
                if (rowIdx > 0 && row[idx] !== undefined) {
                    const cellValue = String(row[idx] || '');
                    maxLength = Math.max(maxLength, cellValue.length);
                }
            });
            return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
        });
        ws['!cols'] = colWidths;
        
        // تنظیم فرمت اعداد برای ستون‌های عددی
        headers.forEach((header, colIdx) => {
            const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', TOTAL_FREIGHT_HEADER, 'تعداد کارتن', 'تعداد پالت', 'مبلغ کرایه', 'کل تناژ', 'کارتن', 'پالت'].some(h => header.includes(h));
            if (isNumericColumn) {
                for (let row = 1; row <= rowsToExport.length; row++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIdx });
                    if (ws[cellAddress] && ws[cellAddress].v) {
                        const cellValue = ws[cellAddress].v;
                        if (typeof cellValue === 'string' && /^[\d,]+$/.test(cellValue.replace(/,/g, ''))) {
                            const numValue = parseFloat(cellValue.replace(/,/g, ''));
                            if (!isNaN(numValue)) {
                                ws[cellAddress].v = numValue;
                                ws[cellAddress].t = 'n';
                                ws[cellAddress].z = '#,##0';
                            }
                        }
                    }
                }
            }
        });
        
        // اضافه کردن worksheet به workbook
        XLSX.utils.book_append_sheet(wb, ws, 'تاریخچه اعلام بار');
        
        return wb;
    };

    // Function to download Excel with styling
    const downloadExcel = async (
        mode: 'compact' | 'full' = viewMode,
        rowsToExport: FreightAnnouncement[] = filteredAnnouncements
    ) => {
        const lineTypeName = activeLine === FreightLineType.IceCream ? 'بستنی' : 
                            activeLine === FreightLineType.Dairy ? 'پاستوریزه' : 
                            'لبنیات-فروتلند';
        const modeName = mode === 'compact' ? 'فشرده' : 'کامل';
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `تاریخچه_${lineTypeName}_${modeName}_${dateStr}.xlsx`;
        
        // استفاده از ExcelJS برای استایل‌ها
        try {
            const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('تاریخچه اعلام بار');
                
                // Get headers and data
                const cols = resolveExportColumns(mode);
                const isFullDairyAmbientMode = mode === 'full' && isDairyOrAmbientLineType(activeLine);
                const isFullDairyMode = isFullDairyAmbientMode && activeLine === FreightLineType.Dairy;
                
                const headers: string[] = [];
                const seenHeaders = new Set<string>();
                
                cols.forEach(col => {
                    if (!seenHeaders.has(col.header) && col.header !== 'عملیات') {
                        headers.push(col.header);
                        seenHeaders.add(col.header);
                    }
                });
                
                if (isFullDairyAmbientMode) {
                    for (let i = 1; i <= 4; i++) {
                        if (isFullDairyMode) {
                            headers.push(
                                `مقصد ${i} - نوع برند`,
                                `مقصد ${i} - کد LIS`,
                                `مقصد ${i} - محصولات`,
                                `مقصد ${i} - نماینده`,
                                `مقصد ${i} - شهر`,
                                `مقصد ${i} - تناژ`,
                                `مقصد ${i} - تاریخ تحویل`,
                                `مقصد ${i} - ساعت تخلیه`,
                                `مقصد ${i} - کرایه`
                            );
                        } else {
                            headers.push(`مقصد ${i} - نماینده`, `مقصد ${i} - شهر`, `مقصد ${i} - تناژ`, `مقصد ${i} - تاریخ تحویل`, `مقصد ${i} - ساعت تخلیه`, `مقصد ${i} - کرایه`);
                        }
                    }
                }

                const headerRow = worksheet.addRow(headers);
                headerRow.eachCell((cell: any) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF4472C4' },
                    };
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } },
                    };
                });

                const getValueForHeader = (header: string, ann: FreightAnnouncement, idx: number): any => {
                    const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', TOTAL_FREIGHT_HEADER, 'کرایه کل', 'کرایه تعرفه', 'اختلاف کرایه', 'تعداد کارتن', 'تعداد پالت', 'مبلغ کرایه', 'کارتن', 'پالت'];
                    const isNumericColumn = numericHeaders.some((h) => header.includes(h));

                    if (header === TOTAL_FREIGHT_HEADER || header === 'کرایه کل') {
                        return ann.totalFreightCost || 0;
                    }
                    if (header === TARIFF_FREIGHT_HEADER || header.includes('کرایه تعرفه')) {
                        return ann.tariffFreightCost || 0;
                    }
                    if (header === TARIFF_DIFF_HEADER || header.includes('اختلاف کرایه')) {
                        const reg = Number(ann.totalFreightCost) || 0;
                        const tar = Number(ann.tariffFreightCost) || 0;
                        if (reg <= 0 && tar <= 0) return '';
                        return reg - tar;
                    }
                    if (header === 'ارزش بار' || header === 'ارزش بار (ریال)') {
                        return ann.cargoValue || 0;
                    }
                    if (header === 'اولویت') {
                        const priorityMap: Record<string, string> = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };
                        return priorityMap[ann.priority || 'normal'] || ann.priority || 'عادی';
                    }
                    if (header === 'کل تناژ (کیلوگرم)') {
                        return ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0);
                    }
                    if (header === 'مقاصد' && mode === 'compact' && activeLine === FreightLineType.Dairy) {
                        return formatDairyCompactDestinationsText(ann);
                    }
                    if (header === 'نوع نماینده') {
                        return getDestinationRepTypesColumnLabel(ann);
                    }
                    if (header === 'نام نماینده') {
                        return getDestinationRepNamesColumnLabel(ann);
                    }
                    if (header === 'توضیحات') {
                        return ann.notes || '';
                    }

                    const col = cols.find((c) => c.header === header);
                    if (!col) return '';

                    let value: any = '';
                    if (col.render) {
                        const rendered = col.render(ann, idx);
                        if (typeof rendered === 'string' || typeof rendered === 'number') {
                            value = rendered;
                        } else if (React.isValidElement(rendered)) {
                            value = extractTextFromElement(rendered).replace(/[📅🕐]/g, '').trim();
                        } else if (Array.isArray(rendered)) {
                            value = rendered
                                .map((item: any) =>
                                    React.isValidElement(item)
                                        ? extractTextFromElement(item).replace(/[📅🕐]/g, '').trim()
                                        : String(item || '')
                                )
                                .join('، ');
                        } else {
                            value = String(rendered || '');
                        }
                    } else {
                        value = (ann as any)[col.header] || '';
                    }

                    if (typeof value === 'string') {
                        value = value.replace(/<[^>]*>/g, '').trim();
                        value = localizeExcelValue(value);
                    }

                    if (isNumericColumn && typeof value === 'string') {
                        const cleaned = value.replace(/[^\d]/g, '');
                        const numValue = parseFloat(cleaned);
                        value = !isNaN(numValue) && numValue > 0 ? numValue : '';
                    }

                    return value;
                };

                // Add data rows with zebra striping
                rowsToExport.forEach((ann, idx) => {
                    const rowData: any[] = [];
                    headers.forEach((header) => {
                        if (isFreightDestinationDetailHeader(header)) return;
                        rowData.push(header === 'ردیف' ? idx + 1 : getValueForHeader(header, ann, idx));
                    });
                    
                    if (isFullDairyAmbientMode) {
                    for (let i = 0; i < 4; i++) {
                        const dest = ann.destinations[i];
                        if (dest) {
                            const repType = resolveDestinationRepTypeLabel(ann, dest);
                            const tonnage = dest.tonnage ? Number(dest.tonnage) : '';
                            const deliveryDate = (dest as any).deliveryDate || '';
                            const unloadTime = dest.unloadTime || '';
                            const freightCost = dest.freightCost ? Number(dest.freightCost) : '';
                            if (isFullDairyMode) {
                                rowData.push(
                                    formatDestinationBrandLabel(dest),
                                    dest.lisCode || '',
                                    formatDestinationProductsLabel(dest),
                                    repType,
                                    dest.city || '',
                                    tonnage,
                                    deliveryDate,
                                    unloadTime,
                                    freightCost
                                );
                            } else {
                                rowData.push(repType, dest.city || '', tonnage, deliveryDate, unloadTime, freightCost);
                            }
                        } else {
                            rowData.push(...Array(isFullDairyMode ? 9 : 6).fill(''));
                        }
                    }
                    }
                    
                    const row = worksheet.addRow(rowData);
                    const isEvenRow = (idx + 1) % 2 === 0;
                    const rowColor = isEvenRow ? 'FFF2F2F2' : 'FFFFFFFF';
                    const destCount = Math.max(1, (ann.destinations || []).length);
                    
                    row.eachCell((cell: any, colNumber: number) => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: rowColor }
                        };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                        };
                        const header = headers[colNumber - 1];
                        const isDestCol = header === 'مقاصد' || header === 'مقصد';
                        cell.alignment = {
                            horizontal: 'right',
                            vertical: isDestCol ? 'top' : 'middle',
                            wrapText: isDestCol || String(cell.value || '').includes('\n'),
                        };
                        
                        // Format numbers
                        const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', TOTAL_FREIGHT_HEADER, 'تعداد کارتن', 'تعداد پالت', 'مبلغ کرایه', 'کل تناژ', 'کارتن', 'پالت'].some(h => header.includes(h));
                        if (isNumericColumn && typeof cell.value === 'number') {
                            // برای اعداد بزرگ، از فرمت عددی بدون نماد علمی استفاده می‌کنیم
                            if (cell.value > 1e15) {
                                // برای اعداد خیلی بزرگ، از فرمت رشته استفاده می‌کنیم
                                cell.value = cell.value.toString();
                                cell.numFmt = '@'; // Text format
                            } else {
                                cell.numFmt = '#,##0';
                            }
                        }
                    });
                    if (mode === 'compact' && destCount > 1) {
                        row.height = Math.min(18 + destCount * 14, 90);
                    }
                });
                
                // Set column widths
                headers.forEach((header, idx) => {
                    if (header === 'مقاصد') {
                        worksheet.getColumn(idx + 1).width = 55;
                        return;
                    }
                    let maxLength = header.length;
                    rowsToExport.forEach(ann => {
                        const value = getValueForHeader(header, ann, 0);
                        const cellValue = String(value || '').split('\n')[0] || '';
                        maxLength = Math.max(maxLength, cellValue.length);
                    });
                    worksheet.getColumn(idx + 1).width = Math.min(Math.max(maxLength + 2, 10), 50);
                });                
                // Set page setup for right-to-left
                worksheet.views = [{
                    rightToLeft: true
                }];
                
                // Download
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
                window.URL.revokeObjectURL(url);
                return;
        } catch (error) {
            console.error('Error creating Excel with ExcelJS:', error);
            // Fallback to basic xlsx
        }
        
        // Fallback: استفاده از xlsx بدون استایل
        const wb = generateExcelExport(mode, rowsToExport);
        XLSX.writeFile(wb, fileName);
    };

    const openExcelExportDialog = (mode: 'compact' | 'full') => {
        const to = new Date();
        const from = new Date();
        from.setMonth(from.getMonth() - 1);
        setExcelDateFrom(formatJalali(from));
        setExcelDateTo(formatJalali(to));
        setExcelExportDialog({ mode });
    };

    const confirmExcelExport = async () => {
        if (!excelExportDialog) return;
        const fromNorm = excelDateFrom.trim().replace(/-/g, '/');
        const toNorm = excelDateTo.trim().replace(/-/g, '/');
        if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(fromNorm) || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(toNorm)) {
            alert('تاریخ را به صورت ۱۴۰۴/۰۱/۰۱ وارد کنید.');
            return;
        }
        const fromDate = parseJalaliDateString(fromNorm);
        const toDate = parseJalaliDateString(toNorm);
        if (!fromDate || !toDate) {
            alert('تاریخ نامعتبر است.');
            return;
        }
        if (fromDate.getTime() > toDate.getTime()) {
            alert('تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.');
            return;
        }
        if (!onFetchForExcelExport) {
            await downloadExcel(excelExportDialog.mode, filteredAnnouncements);
            setExcelExportDialog(null);
            return;
        }
        setExcelExporting(true);
        try {
            const rows = await onFetchForExcelExport({ dateFrom: fromNorm, dateTo: toNorm });
            if (!rows.length) {
                alert('در این بازهٔ تاریخ اعلام بار، رکوردی یافت نشد.');
                return;
            }
            if (rows.length >= 5000) {
                alert('خروجی به ۵۰۰۰ ردیف محدود شد. بازه را کوچک‌تر کنید.');
            }
            await downloadExcel(excelExportDialog.mode, rows);
            setExcelExportDialog(null);
        } catch (e: any) {
            console.error('❌ [FreightHistory] Excel export failed:', e);
            alert(e?.message || 'خطا در تهیه خروجی اکسل');
        } finally {
            setExcelExporting(false);
        }
    };

    const allColumns = useMemo(
        () => buildVisibleColumns(viewMode),
        [viewMode, activeLine, props, dairyAmbientFullBase, dairyFullBase, isDairyOrAmbientTab, personalTariffColumns]
    );

    const visibleColumns = useMemo(
        () => allColumns.filter((col) => !hiddenColumnHeaders.has(col.header)),
        [allColumns, hiddenColumnHeaders]
    );

    const isFullDairyAmbient = viewMode === 'full' && isDairyOrAmbientTab;
    const isFullDairy = isFullDairyAmbient && activeLine === FreightLineType.Dairy;
    const isDairyCompactTable = viewMode === 'compact' && activeLine === FreightLineType.Dairy;
    const fullDestSubColCount = isFullDairy ? DAIRY_DEST_SUB_HEADERS.length : AMBIENT_DEST_SUB_HEADERS.length;
    const fullDestSubHeaders = isFullDairy ? DAIRY_DEST_SUB_HEADERS : AMBIENT_DEST_SUB_HEADERS;
    const fullDestTotalCols = fullDestSubColCount * 4;
    const commonCols = useMemo(() => visibleColumns, [visibleColumns]);

    const displayAnnouncements = useMemo(() => {
        const filtered = applyTransportLiveFilters(filteredAnnouncements, {
            columnFilters,
            quickSearch: '',
            columns: visibleColumns,
        });
        return applyTransportLiveSort(filtered, {
            sortColumn,
            sortDirection,
            columns: visibleColumns,
        });
    }, [
        filteredAnnouncements,
        columnFilters,
        visibleColumns,
        sortColumn,
        sortDirection,
    ]);

    const handleSort = useCallback((header: string) => {
        setSortColumn((prev) => {
            if (prev === header) {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                return header;
            }
            setSortDirection('asc');
            return header;
        });
    }, []);

    const renderSortableHeader = useCallback(
        (header: string) => (
            <button
                type="button"
                onClick={() => handleSort(header)}
                className="inline-flex items-center justify-center gap-0.5 w-full hover:text-sky-700 focus:outline-none focus:text-sky-700"
                title="مرتب‌سازی"
            >
                <span>{header}</span>
                {sortColumn === header ? (
                    <span className="text-sky-600 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                    <span className="text-slate-300 text-[10px]">⇅</span>
                )}
            </button>
        ),
        [handleSort, sortColumn, sortDirection]
    );

    const activeColumnFilterCount = useMemo(
        () => countActiveFilters({ columnFilters, quickSearch: '' }),
        [columnFilters]
    );

    const clearColumnFilters = () => {
        setColumnFilters({});
        setSortColumn(null);
        setSortDirection('asc');
    };

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center"><TruckIcon className="w-6 h-6 mr-2 text-sky-600" />تاریخچه اعلام بار</h2>
          <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* فیلتر تاریخ اعلام بار */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">تاریخ اعلام بار:</label>
          <input
            type="text"
                                placeholder="1404-05-01" 
                                value={filterDate}
                                onChange={e => setFilterDate(e.target.value)}
                                className="px-2 py-1 text-xs rounded border w-32"
          />
        </div>
                        {/* فیلتر مقصد */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">مقصد:</label>
          <input
                                type="text" 
                                placeholder="جستجوی مقصد..." 
                                value={filterDestination}
                                onChange={e => {
                                    // فوراً state را به‌روز کن - بدون debounce
                                    setFilterDestination(e.target.value);
                                }}
                                onKeyDown={e => {
                                    // جلوگیری از از دست رفتن focus
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (onSearch) onSearch();
                                    }
                                }}
                                className="px-2 py-1 text-xs rounded border w-28"
                                autoComplete="off"
          />
        </div>
                        {/* فیلتر شماره بارنامه */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">شماره بارنامه:</label>
          <input
                                type="text" 
                                placeholder="جستجوی بارنامه..." 
                                value={filterBillOfLading}
                                onChange={e => setFilterBillOfLading(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (onSearch) onSearch();
                                    }
                                }}
                                className="px-2 py-1 text-xs rounded border w-28"
                                autoComplete="off"
          />
        </div>
                        {/* فیلتر نام راننده */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">نام راننده:</label>
          <input
                                type="text" 
                                placeholder="جستجوی راننده..." 
                                value={filterDriverName}
                                onChange={e => setFilterDriverName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (onSearch) onSearch();
                                    }
                                }}
                                className="px-2 py-1 text-xs rounded border w-28"
                                autoComplete="off"
          />
        </div>
                        {/* فیلتر کارمند اعلام‌کننده */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">کارمند اعلام‌کننده:</label>
          <input
                                type="text" 
                                placeholder="جستجوی کارمند..." 
                                value={filterCreatorName}
                                onChange={e => setFilterCreatorName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (onSearch) onSearch();
                                    }
                                }}
                                className="px-2 py-1 text-xs rounded border w-28"
                                autoComplete="off"
          />
        </div>
                        <button onClick={onSearch} className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600">جستجو</button>
                        <button onClick={onClearFilters} className="px-3 py-1 bg-gray-500 text-white rounded-md text-xs hover:bg-gray-600">پاک کردن</button>
                        <div className="flex items-center p-1 bg-slate-200 rounded-lg"><button onClick={()=>setViewMode('compact')} className={`px-2 py-1 text-xs rounded ${viewMode==='compact'?'bg-white shadow':''}`}>فشرده</button><button onClick={()=>setViewMode('full')} className={`px-2 py-1 text-xs rounded ${viewMode==='full'?'bg-white shadow':''}`}>کامل</button></div>
                        <div className="relative" ref={columnPickerRef}>
                            <button
                                type="button"
                                onClick={() => setColumnPickerOpen((o) => !o)}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${
                                    hiddenColumnHeaders.size > 0
                                        ? 'border-sky-400 bg-sky-50 text-sky-800'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                                title="نمایش یا پنهان کردن ستون‌ها — تنظیمات برای هر تب و هر کاربر ذخیره می‌شود"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                ستون‌ها
                                {hiddenColumnHeaders.size > 0 && (
                                    <span className="bg-sky-600 text-white rounded-full px-1 min-w-[1rem] text-[10px]">
                                        {hiddenColumnHeaders.size.toLocaleString('fa-IR')}
                                    </span>
                                )}
                            </button>
                            {columnPickerOpen && (
                                <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-right">
                                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                                        <span className="text-xs font-semibold text-slate-700">ستون‌های جدول</span>
                                        <button
                                            type="button"
                                            onClick={resetColumnVisibility}
                                            className="text-[10px] text-sky-700 hover:underline"
                                        >
                                            همه
                                        </button>
                                    </div>
                                    {allColumns.map((col) => (
                                        <label
                                            key={col.header}
                                            className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!hiddenColumnHeaders.has(col.header)}
                                                onChange={() => toggleColumnVisibility(col.header)}
                                            />
                                            <span>{col.header}</span>
                                        </label>
                                    ))}
                                    <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                                        انتخاب شما برای این تب و حالت نمایش ذخیره می‌شود.
                                    </p>
                                </div>
                            )}
                        </div>
                        <button onClick={() => openExcelExportDialog('compact')} className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600 whitespace-nowrap">
                            اکسل فشرده
                        </button>
                        <button onClick={() => openExcelExportDialog('full')} className="px-3 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 whitespace-nowrap">
                            اکسل کامل
                        </button>
                        <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                            {Object.values(FreightLineType).map(lt => (
                                <button key={lt} onClick={() => setActiveLine(lt)} className={`flex-1 px-3 py-1 rounded-md text-sm font-semibold transition-colors ${activeLine === lt ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}>{lt}</button>
                            ))}
                        </div>
                    </div>
        </div>
                <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
                    {activeColumnFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearColumnFilters}
                            className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                        >
                            پاک فیلتر ستون‌ها ({activeColumnFilterCount.toLocaleString('fa-IR')})
                        </button>
                    )}
                    <span className="text-xs text-slate-500 mr-auto">
                        {displayAnnouncements.length.toLocaleString('fa-IR')} / {filteredAnnouncements.length.toLocaleString('fa-IR')} ردیف
                    </span>
                </div>
        <div
          className={`w-full max-w-full min-w-0 border border-slate-200 rounded-lg freight-sticky-table-wrap${
              isDairyCompactTable ? ' transport-history-dairy-compact-wrap' : ''
          }`}
          data-sticky-rows={isFullDairyAmbient ? 'full' : 'compact'}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <table className={`text-[10px] sm:text-xs text-center border-collapse [&_th]:px-1 [&_th]:py-1 [&_td]:px-1 [&_td]:py-1.5 ${
              isFullDairyAmbient
                  ? 'table-auto w-max min-w-[2800px]'
                    : isDairyCompactTable
                    ? 'table-auto w-max min-w-[2000px] transport-history-dairy-compact'
                    : 'w-full table-fixed transport-live-fit-table'
          }`}>
            <thead className="text-xs uppercase bg-gray-50">
                             {isFullDairyAmbient ? (
                                <>
                                    <tr>
                                        {commonCols.map(col => (
                                            <th key={col.header} rowSpan={2} className="p-2 text-center align-top">
                                                <div className="mb-1">{renderSortableHeader(col.header)}</div>
                                                <input
                                                    type="search"
                                                    value={columnFilters[col.header] || ''}
                                                    onChange={(e) =>
                                                        setColumnFilters((prev) => ({
                                                            ...prev,
                                                            [col.header]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="فیلتر..."
                                                    className="w-full min-w-[72px] max-w-[120px] px-1 py-0.5 text-[10px] border border-slate-300 rounded bg-white font-normal"
                                                />
                                            </th>
                                        ))}
                                        <th colSpan={fullDestSubColCount} className="p-2 text-center border-x">مقصد اول</th>
                                        <th colSpan={fullDestSubColCount} className="p-2 text-center border-x">مقصد دوم</th>
                                        <th colSpan={fullDestSubColCount} className="p-2 text-center border-x">مقصد سوم</th>
                                        <th colSpan={fullDestSubColCount} className="p-2 text-center border-x">مقصد چهارم</th>
                                    </tr>
                                    <tr>
                                        {[1, 2, 3, 4].map(i => (
                                            <React.Fragment key={i}>
                                                {fullDestSubHeaders.map((sub) => {
                                                    const key = `مقصد${i}-${sub}`;
                                                    return (
                                                        <th key={key} className="p-1 text-center font-normal border align-top">
                                                            <div className="text-[10px] mb-0.5">{sub}</div>
                                                            <input
                                                                type="search"
                                                                value={columnFilters[key] || ''}
                                                                onChange={(e) =>
                                                                    setColumnFilters((prev) => ({
                                                                        ...prev,
                                                                        [key]: e.target.value,
                                                                    }))
                                                                }
                                                                placeholder="..."
                                                                className="w-full min-w-[52px] px-1 py-0.5 text-[10px] border border-slate-300 rounded bg-white"
                                                            />
                                                        </th>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </>
                             ) : (
                                <>
                                <tr>
                                    {visibleColumns.map(col => (
                                        <th
                                            key={col.header}
                                            className={`p-1 text-center align-bottom whitespace-normal leading-tight font-semibold break-words ${
                                                isDairyCompactTable ? DAIRY_COMPACT_COLUMN_CLASSES[col.header] || '' : ''
                                            }`}
                                        >
                                            {renderSortableHeader(col.header)}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-slate-100/80">
                                    {visibleColumns.map(col => (
                                        <th
                                            key={`filter-${col.header}`}
                                            className={`p-1 font-normal ${
                                                isDairyCompactTable ? DAIRY_COMPACT_COLUMN_CLASSES[col.header] || '' : ''
                                            }`}
                                        >
                                            <input
                                                type="search"
                                                value={columnFilters[col.header] || ''}
                                                onChange={(e) =>
                                                    setColumnFilters((prev) => ({
                                                        ...prev,
                                                        [col.header]: e.target.value,
                                                    }))
                                                }
                                                placeholder="فیلتر..."
                                                className="w-full min-w-0 px-1 py-0.5 text-[10px] border border-slate-300 rounded bg-white"
                                            />
                                        </th>
                                    ))}
                                </tr>
                                </>
                             )}
            </thead>
            <tbody>
                            {displayAnnouncements.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={
                                            isFullDairyAmbient
                                                ? commonCols.length + fullDestTotalCols
                                                : Math.max(visibleColumns.length, 1)
                                        }
                                        className="p-8 text-center text-slate-500"
                                    >
                                        موردی یافت نشد.
                                    </td>
                                </tr>
                            ) : displayAnnouncements.map((ann, idx) => {
                                const rowColorClass = isFinanceRejectedAnn(ann as any)
                                    ? 'bg-red-50 hover:bg-red-100'
                                    : 'bg-teal-50 hover:bg-teal-100';

                                return (
                                <tr key={ann.id} className={`border-b ${rowColorClass}`}>
                                     {isFullDairyAmbient ? (
                                        <>
                                            {commonCols.map(col => (
                                                <td key={col.header} className="p-2 text-center whitespace-normal break-words">
                                                    {col.render(ann, idx)}
                                                </td>
                                            ))}
                                            {[0, 1, 2, 3].map(i => {
                                                const dest = ann.destinations[i];
                                                if (isFullDairy) {
                                                    return (
                                                        <React.Fragment key={i}>
                                                            <td className="p-2 text-center border whitespace-normal">{formatDestinationBrandLabel(dest)}</td>
                                                            <td className="p-2 text-center border whitespace-normal">{dest?.lisCode || '-'}</td>
                                                            <td className="p-2 text-center border whitespace-normal">{formatDestinationProductsLabel(dest)}</td>
                                                            <td className="p-2 text-center border whitespace-normal">{dest ? resolveDestinationRepTypeLabel(ann, dest) : '-'}</td>
                                                            <td className="p-2 text-center border whitespace-normal">{dest?.city || '-'}</td>
                                                            <td className="p-2 text-center border">
                                                                {dest?.tonnage != null
                                                                    ? formatTonnageKg(parseNumericField(dest.tonnage))
                                                                    : '-'}
                                                            </td>
                                                            <td className="p-2 text-center border whitespace-normal">{dest?.deliveryDate || '-'}</td>
                                                            <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                            <td className="p-2 text-center border">{formatFreightAmountCell(dest?.freightCost)}</td>
                                                        </React.Fragment>
                                                    );
                                                }
                                                return (
                                                    <React.Fragment key={i}>
                                                        <td className="p-2 text-center border whitespace-normal">{dest ? resolveDestinationRepTypeLabel(ann, dest) : '-'}</td>
                                                        <td className="p-2 text-center border whitespace-normal">{dest?.city || '-'}</td>
                                                        <td className="p-2 text-center border">
                                                            {dest?.tonnage != null
                                                                ? formatTonnageKg(parseNumericField(dest.tonnage))
                                                                : '-'}
                                                        </td>
                                                        <td className="p-2 text-center border whitespace-normal">{dest?.deliveryDate || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                        <td className="p-2 text-center border">{formatFreightAmountCell(dest?.freightCost)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        visibleColumns.map(col => (
                                            <td
                                                key={col.header}
                                                className={`p-1 text-center align-middle whitespace-normal break-words ${
                                                    isDairyCompactTable ? DAIRY_COMPACT_COLUMN_CLASSES[col.header] || '' : ''
                                                }`}
                                            >
                                                {col.render(ann, idx)}
                                            </td>
                                        ))
                                    )}

                </tr>
                                );
                            })}
            </tbody>
          </table>
        </div>
        <style>{`
                .transport-live-fit-table th,
                .transport-live-fit-table td {
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                    line-height: 1.25;
                    vertical-align: middle;
                }
                .transport-history-dairy-compact th,
                .transport-history-dairy-compact td {
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    line-height: 1.3;
                    vertical-align: middle;
                    border: 1px solid #e2e8f0;
                    padding: 0.35rem 0.45rem !important;
                }
                .transport-history-dairy-compact thead th {
                    background: #f8fafc;
                    font-size: 0.7rem;
                    line-height: 1.25;
                    vertical-align: bottom;
                    white-space: normal;
                    writing-mode: horizontal-tb;
                    transform: none;
                }
                .transport-history-dairy-compact .col-freight,
                .transport-history-dairy-compact .col-tariff,
                .transport-history-dairy-compact .col-tariff-diff,
                .transport-history-dairy-compact .col-bol,
                .transport-history-dairy-compact .col-plate,
                .transport-history-dairy-compact .col-vehicle-code,
                .transport-history-dairy-compact .col-driver-contact,
                .transport-history-dairy-compact .col-cargo-value,
                .transport-history-dairy-compact .col-tonnage {
                    font-variant-numeric: tabular-nums;
                }
                .transport-history-dairy-compact .col-row { min-width: 2.5rem; width: 2.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-creator { min-width: 7.5rem; }
                .transport-history-dairy-compact .col-vehicle-type { min-width: 5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-origin { min-width: 7rem; }
                .transport-history-dairy-compact .col-tonnage { min-width: 5.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-destinations { min-width: 18rem; max-width: 26rem; vertical-align: top; }
                .transport-history-dairy-compact .col-cargo-value { min-width: 6.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-platform-time { min-width: 4rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-created-at { min-width: 5.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-carrier { min-width: 6rem; }
                .transport-history-dairy-compact .col-driver { min-width: 7rem; }
                .transport-history-dairy-compact .col-driver-contact { min-width: 7.5rem; white-space: nowrap; font-family: ui-monospace, monospace; }
                .transport-history-dairy-compact .col-vehicle-code { min-width: 4.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-plate { min-width: 7rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-bol { min-width: 6rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-freight { min-width: 6.5rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-tariff { min-width: 6rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-tariff-diff { min-width: 6rem; white-space: nowrap; }
                .transport-history-dairy-compact .col-notes { min-width: 8rem; max-width: 12rem; }
                .dest-compact-list { display: flex; flex-direction: column; gap: 0.2rem; width: 100%; min-width: 0; }
                .dest-compact-line {
                    display: flex; align-items: flex-start; gap: 0.25rem;
                    border-bottom: 1px solid #f1f5f9; padding-bottom: 0.15rem;
                }
                .dest-compact-line:last-child { border-bottom: none; padding-bottom: 0; }
                .dest-compact-num {
                    flex-shrink: 0; width: 1rem; height: 1rem; border-radius: 9999px;
                    background: #e2e8f0; color: #334155; font-weight: 700; font-size: 0.65rem;
                    display: inline-flex; align-items: center; justify-content: center; margin-top: 0.1rem;
                }
                .dest-compact-body {
                    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.15rem 0.25rem; min-width: 0;
                    text-align: right;
                }
                .dest-compact-city { font-weight: 600; color: #1e40af; }
                .dest-compact-tonnage { color: #64748b; font-size: 0.95em; }
                .dest-compact-dot { color: #cbd5e1; user-select: none; }
                .dest-compact-rep { color: #7e22ce; }
                .dest-compact-brand { color: #334155; }
                .dest-compact-lis { color: #4338ca; font-family: ui-monospace, monospace; font-size: 0.9em; }
                .dest-compact-products { color: #047857; }
                .dest-compact-date { color: #15803d; white-space: nowrap; }
            `}</style>
        
        {/* صفحه‌بندی */}
        {onPageChange && onItemsPerPageChange && (
            <div className="flex items-center justify-between mt-4 px-4 py-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-700">تعداد در هر صفحه:</label>
                    <select 
                        value={itemsPerPage} 
                        onChange={e => {
                            onItemsPerPageChange(Number(e.target.value));
                        }}
                        className="px-2 py-1 text-sm border rounded"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                    </select>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">
                        صفحه {currentPage} از {totalPages} ({totalCount} ردیف)
                    </span>
                    <button
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        قبلی
                    </button>
                    <button
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        بعدی
                    </button>
                </div>
            </div>
        )}
            </div>
             {/* دیالوگ‌های تخصیص و انتقال در تاریخچه نیازی نیست */}
             {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.FreightHistory} userRole={currentUser.role} />
                         <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
          </div>
        )}
             {excelExportDialog && (
                <div
                    className="fixed inset-0 bg-black/50 flex justify-center items-center z-50"
                    onClick={() => !excelExporting && setExcelExportDialog(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
                        dir="rtl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-slate-800">
                            بازه تاریخ اعلام بار برای اکسل{' '}
                            {excelExportDialog.mode === 'compact' ? '(فشرده)' : '(کامل)'}
                        </h3>
                        <p className="text-xs text-slate-600">
                            پیش‌فرض یک ماه اخیر است. همهٔ ردیف‌های همین تب و فیلترهای فعلی در بازه انتخابی خروجی گرفته می‌شود (نه فقط صفحه جاری).
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">از تاریخ</label>
                                <input
                                    type="text"
                                    value={excelDateFrom}
                                    onChange={(e) => setExcelDateFrom(e.target.value)}
                                    placeholder="1404/01/01"
                                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                                    dir="ltr"
                                    disabled={excelExporting}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">تا تاریخ</label>
                                <input
                                    type="text"
                                    value={excelDateTo}
                                    onChange={(e) => setExcelDateTo(e.target.value)}
                                    placeholder="1404/01/31"
                                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                                    dir="ltr"
                                    disabled={excelExporting}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                disabled={excelExporting}
                                onClick={() => setExcelExportDialog(null)}
                                className="px-3 py-1.5 text-sm rounded-md border bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                disabled={excelExporting}
                                onClick={() => void confirmExcelExport()}
                                className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                            >
                                {excelExporting ? 'در حال تهیه...' : 'دانلود اکسل'}
                            </button>
                        </div>
                    </div>
                </div>
             )}
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; } `}</style>
    </div>
  );
};

// --- Dialog Components حذف شده - برای تاریخچه نیاز نیست ---

// DestinationTransferDialog حذف شده - برای تاریخچه نیاز نیست


export default FreightHistory;