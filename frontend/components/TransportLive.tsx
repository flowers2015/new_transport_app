// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View, PersonalDriver, PersonalVehicle } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import IranianPlateInput, {
    DEFAULT_PLATE_LETTER,
    formatIranianPlateString,
    type IranianPlateParts,
} from './IranianPlateInput';
import {
    getDestinationCitiesLabel,
    getAssignedDriverDisplayName,
    getAssignedDriverContact,
    getAssignedVehiclePlate,
    formatCompanyVehiclePlate,
    checkVehicleMatchesAnnouncement,
    getVehicleOperationalType,
    PENDING_BILL_OF_LADING_TAB,
    TransportLiveTab,
    isPendingBillOfLadingTab,
    isPendingBillOfLading,
    matchesFreightLine,
    lineTypeFromAnnouncement,
    parseNumericField,
    formatTonnageKg,
    formatTotalTonnageFromDestinations,
    sumDestinationTonnageKg,
    formatPersianGroupedNumber,
    formatRepresentativeType,
    localizeExcelValue,
} from '../utils/freightDisplay';
import { getApiUrl } from '../utils/apiConfig';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

interface TransportLiveProps {
    announcements: FreightAnnouncement[];
    vehicles: Vehicle[];
    drivers: Driver[];
    personalDrivers: PersonalDriver[];
    personalVehicles: PersonalVehicle[];
    onUpdateAssignment: (announcementId: string, assignment: { 
        assignmentType: 'company' | 'personal';
        driverId?: string; 
        vehicleId?: string; 
        billOfLadingNumber?: string;
        totalFreightCost?: number;
        // Personal driver info
        nationalId?: string;
        driverName?: string;
        driverContact?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        destinations?: Destination[];
        assignedDriverName?: string;
        assignedDriverContact?: string;
        assignedVehiclePlate?: string;
    }) => void;
    onFinalize: (announcementIds: string[], lineTypeForBackend?: string) => void | Promise<void>;
    finalizePermissions?: Record<string, boolean>;
    onTransferDestination: (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => void;
    onForward: (announcementId: string) => void;
    onCancel: (announcementId: string) => void;
    onChangeRequest: (announcementId: string, body: { type: 'change' | 'split' | 'merge', targetQueue?: 'company' | 'personal', description?: string, payload?: any }) => void;
    onChangeVehicleType: (announcementId: string, vehicleType: string) => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
    onOpenAssignmentDialog?: (announcement: FreightAnnouncement) => void;
    currentUser: User;
    activeLine: TransportLiveTab;
    setActiveLine: (line: TransportLiveTab) => void;
}

// Move helper functions inside component to ensure proper re-rendering
const formatCurrency = (amount?: number | string | null) => {
    if (amount === null || amount === undefined || amount === '') {
        return '-';
    }
    // تبدیل به number اگر string است
    const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/,/g, '')) : Number(amount);
    if (isNaN(numAmount)) {
        return '-';
    }
    // استفاده از Intl.NumberFormat برای فرمت فارسی با جداکننده
    return new Intl.NumberFormat('fa-IR', {
        maximumFractionDigits: 0,
        useGrouping: true
    }).format(numAmount) + ' تومان';
};

const TOTAL_FREIGHT_HEADER = 'کرایه کل (ریال)';

/** عدد کرایه — واحد فقط در هدر ستون */
const formatFreightAmount = (amount?: number | string | null): string => {
    const numAmount = parseNumericField(amount);
    if (numAmount <= 0) return '-';
    return formatPersianGroupedNumber(Math.round(numAmount), 0);
};

const formatTotalFreightCost = formatFreightAmount;
const formatDestinationFreightCost = formatFreightAmount;

const isToday = (someDate: any) => {
    if (!someDate) return false;
    const d = typeof someDate === 'string' ? new Date(someDate) : someDate;
    if (!(d instanceof Date) || isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
}

// Helper function to convert Persian digits to English
const toEnglishDigits = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let result = String(str);
    for (let i = 0; i < 10; i++) {
        result = result.replace(new RegExp(persianDigits[i], 'g'), String(i));
        result = result.replace(new RegExp(arabicDigits[i], 'g'), String(i));
    }
    return result;
};

// Helper function to escape CSV values
const escapeCSV = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

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
};



const VEHICLE_TYPES = ['تریلی', 'مینی تریلی', 'ده چرخ', 'تک', 'مینی تک', 'خاور'];

const TransportLive: React.FC<TransportLiveProps> = (props) => {
    const { announcements, vehicles, drivers, personalDrivers, personalVehicles, onUpdateAssignment, onFinalize, currentUser, onCancel, onForward, onTransferDestination, onChangeRequest, onChangeVehicleType, onOpenHistory, onOpenAssignmentDialog, onRefresh, activeLine, setActiveLine, finalizePermissions = {} } = props;
    
    // Debug logging for re-renders
    // console.log('🔄 [TransportLive] Component re-rendered with:', {
    //     announcementsCount: announcements.length,
    //     driversCount: drivers.length,
    //     vehiclesCount: vehicles.length,
    //     timestamp: new Date().toISOString()
    // });
    const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // حذف dateView - همه اعلام‌بارها نمایش داده می‌شوند
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [editingVehicleTypeId, setEditingVehicleTypeId] = useState<string | null>(null);
    
    const [dialog, setDialog] = useState<'assign' | 'transfer' | 'change' | 'vehicle-type' | null>(null);
    
    // Helper functions memoized with useCallback for performance
    const getDriverName = useCallback((id: string | undefined, drivers: Driver[], personalDrivers: any[] = []) => {
        if (!id) return '-';
        // First search in company drivers
        let driver = drivers.find(d => d.id === id);
        // If not found, search in personal drivers
        if (!driver) {
            driver = personalDrivers.find(d => d.id === id);
        }
        return driver?.name || '-';
    }, [drivers, personalDrivers]);
    
    const getDriverContact = useCallback((id: string | undefined, drivers: Driver[], personalDrivers: any[] = []) => {
        if (!id) return '-';
        // First search in company drivers
        let driver = drivers.find(d => d.id === id);
        // If not found, search in personal drivers
        if (!driver) {
            driver = personalDrivers.find(d => d.id === id);
        }
        return driver?.mobile || '-';
    }, [drivers, personalDrivers]);
    
    const getVehicleIdentifier = useCallback((id: string | undefined, vehicles: Vehicle[], personalVehicles: any[] = []) => {
        if (!id) return '-';
        // First search in company vehicles
        let v = vehicles.find(v => v.id === id);
        // If not found, search in personal vehicles
        if (!v) {
            const personalV = personalVehicles.find(v => v.id === id);
            if (personalV) {
                // Format personal vehicle plate
                const plate = `${personalV.platePart1}${personalV.plateLetter}${personalV.platePart2}-${personalV.plateCityCode}`;
                return plate;
            }
        }
        
        if (!v) return 'نامشخص';
        
        const result = v.plateNumber ? formatPlateNumber(v.plateNumber) : v.serialNumber || 'نامشخص';
        return result;
    }, [vehicles, personalVehicles]);

    // Helper functions for personal drivers and vehicles
    const getPersonalDriverName = useCallback((driverId: string | undefined, personalDrivers: PersonalDriver[]) => {
        if (!driverId) return '-';
        const driver = personalDrivers.find(d => d.id === driverId);
        return driver?.name || '-';
    }, [personalDrivers]);
    
    const getPersonalDriverContact = useCallback((driverId: string | undefined, personalDrivers: PersonalDriver[]) => {
        if (!driverId) return '-';
        const driver = personalDrivers.find(d => d.id === driverId);
        return driver?.mobile || '-';
    }, [personalDrivers]);
    
    const getPersonalVehicleIdentifier = useCallback((vehicleId: string | undefined, personalVehicles: PersonalVehicle[]) => {
        if (!vehicleId) return '-';
        const v = personalVehicles.find(v => v.id === vehicleId);
        if (!v) return 'نامشخص';
        
        const result = v.formattedPlate || 'نامشخص';
        return result;
    }, [personalVehicles]);
    
    const hasAccess = useCallback((allowedRoles: UserRole[]): boolean => {
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    }, [currentUser.role]);

    const canPerformActions = useMemo(() => hasAccess([UserRole.Transportation, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User]), [hasAccess]);

    // Helper function to check if user can edit announcement - memoized
    const canEditAnnouncement = useCallback((ann: FreightAnnouncement): { canEdit: boolean; canTakeAction: boolean; isAssignedByOther: boolean } => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const loadingDate = new Date(ann.loadingDate);
        loadingDate.setHours(0, 0, 0, 0);
        const isAnnLeftover = loadingDate < today;

        let canTakeAction = false;
        const isCompanyAssigned = ann.assignmentType === 'company' || ann.assignmentType === 'شرکتی' || ann.status === FreightAnnouncementStatus.PendingCompanyAssignment;
        const isPersonalAssigned = ann.assignmentType === 'personal' || ann.assignmentType === 'شخصی' || ann.status === FreightAnnouncementStatus.PendingPersonalAssignment;

        if (currentUser.role === UserRole.TransportationUser) {
            if (ann.lineType === FreightLineType.IceCream || ann.lineType === 'IceCream' || ann.lineType === 'بستنی') {
                canTakeAction = !isAnnLeftover && isCompanyAssigned;
            } else if ((ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه') || (ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند')) {
                canTakeAction = !isAnnLeftover && isCompanyAssigned;
            }
        } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
            if ((ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه') || (ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند')) {
                canTakeAction = !isAnnLeftover && isPersonalAssigned;
            } else if (ann.lineType === FreightLineType.IceCream || ann.lineType === 'IceCream' || ann.lineType === 'بستنی') {
                canTakeAction = !isAnnLeftover && isPersonalAssigned;
            }
        } else {
            canTakeAction = !isAnnLeftover;
        }

        const isAssignedToOtherTransport = 
            (currentUser.role === UserRole.TransportationUser && isPersonalAssigned) ||
            (currentUser.role === UserRole.Transportation_Personal_Vehicle_User && isCompanyAssigned);
        
        const isAssignedByOther = isAssignedToOtherTransport;
        const canEdit = canPerformActions && canTakeAction && !isAssignedByOther;

        return { canEdit, canTakeAction, isAssignedByOther };
    }, [currentUser.role, canPerformActions]);
    
    // Memoize columnsConfig to prevent unnecessary recalculations
    const columnsConfig = useCallback((viewMode: 'compact' | 'full') => {
        const { drivers, vehicles, personalDrivers, personalVehicles } = props;
        let columns = [
            // Common Columns
            { header: 'ردیف', align: 'center', display: () => viewMode === 'full', render: (_: any, idx: number) => idx + 1 },
            { header: 'کد اعلام بار', align: 'center', display: () => true, render: (ann: FreightAnnouncement) => ann.announcementCode },
            // { header: 'وضعیت', display: () => true, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
            { header: 'کارمند اعلام‌کننده', display: () => true, render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
            { header: 'تاریخ بارگیری', display: () => true, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
            { header: 'مبدا بارگیری', display: () => true, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
            { header: 'برند', display: () => true, render: (ann: FreightAnnouncement) => ann.brand || '-' },
            { header: 'نوع خودرو', display: () => true, render: (ann: FreightAnnouncement) => {
                // برای پاستوریزه (Dairy) و لبنیات (Ambient) قابل ویرایش است
                const isDairyOrAmbient = ann.lineType === FreightLineType.Dairy || ann.lineType === FreightLineType.Ambient || 
                                        ann.lineType === 'پاستوریزه' || ann.lineType === 'لبنیات-فروتلند' ||
                                        ann.lineType === 'Dairy' || ann.lineType === 'Ambient';
                const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                const isEditing = editingVehicleTypeId === ann.id;
                
                console.log('🔍 [VehicleType Column] Render check:', {
                    announcementId: ann.id,
                    lineType: ann.lineType,
                    isDairyOrAmbient,
                    canEdit,
                    canTakeAction,
                    isAssignedByOther,
                    canPerformActions,
                    isEditing,
                    vehicleType: ann.vehicleType,
                    assignmentType: ann.assignmentType,
                    currentUserRole: currentUser.role
                });
                
                // برای پاستوریزه و لبنیات، سلول قابل کلیک است
                // برای تغییر نوع خودرو، فقط نیاز به isDairyOrAmbient داریم، نه canEdit
                if (isDairyOrAmbient) {
                    if (isEditing) {
                        return (
                            <select
                                value={ann.vehicleType || ''}
                                onChange={(e) => {
                                    if (e.target.value && e.target.value !== ann.vehicleType) {
                                        onChangeVehicleType(ann.id, e.target.value);
                                        setEditingVehicleTypeId(null);
                                    }
                                }}
                                onBlur={() => setEditingVehicleTypeId(null)}
                                autoFocus
                                className="px-2 py-1 text-sm border border-sky-500 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                                autoComplete="off"
                            >
                                <option value="">-- انتخاب --</option>
                                {VEHICLE_TYPES.map(vt => (
                                    <option key={vt} value={vt}>{vt}</option>
                                ))}
                            </select>
                        );
                    } else {
                        return (
                            <div
                                onClick={() => {
                                    console.log('🖱️ [VehicleType Column] Clicked on cell:', ann.id, ann.vehicleType);
                                    setEditingVehicleTypeId(ann.id);
                                }}
                                className="px-2 py-1 text-sm border border-transparent rounded-md hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors min-w-[80px]"
                                title="کلیک برای تغییر نوع خودرو"
                            >
                                {ann.vehicleType || '-'}
                            </div>
                        );
                    }
                }
                console.log('⚠️ [VehicleType Column] Not editable:', {
                    announcementId: ann.id,
                    isDairyOrAmbient,
                    canEdit,
                    canTakeAction,
                    isAssignedByOther,
                    canPerformActions,
                    reason: !isDairyOrAmbient ? 'Not Dairy/Ambient' : !canEdit ? 'Cannot edit' : 'Unknown',
                    breakdown: {
                        isDairyOrAmbient,
                        canPerformActions,
                        canTakeAction,
                        isAssignedByOther,
                        finalCanEdit: canEdit
                    }
                });
                return <span>{ann.vehicleType || '-'}</span>;
            }},
            
            // Destinations Summary (for all compact views)
            { header: 'مقاصد', display: () => viewMode === 'compact', render: (ann: FreightAnnouncement) => {
                // بررسی نوع نماینده - ابتدا از announcement
                let repType = '';
                const repTypeValue = ann.representativeType;
                if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
                    repType = 'پخش';
                } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
                    repType = 'نماینده';
                }
                
                // اگر در announcement نبود، از representativeName در announcement استفاده کن
                if (!repType && ann.representativeName) {
                    const repName = ann.representativeName.toLowerCase();
                    if (repName.includes('پخش') || repName.includes('distributor')) {
                        repType = 'پخش';
                    } else if (repName.includes('نماینده') || repName.includes('representative')) {
                        repType = 'نماینده';
                    }
                }
                
                return ann.destinations.map((d, idx) => {
                    // اگر در announcement نبود، از destination بررسی کن
                    let destRepType = repType;
                    if (!destRepType && (d as any).representativeType) {
                        const destRep = (d as any).representativeType;
                        if (destRep === 'distributor' || destRep === 'agent' || destRep === 'پخش') {
                            destRepType = 'پخش';
                        } else if (destRep === 'representative' || destRep === 'نماینده') {
                            destRepType = 'نماینده';
                        }
                    }
                    // اگر هنوز پیدا نشد، از representativeName در destination استفاده کن
                    if (!destRepType && d.representativeName) {
                        const repName = d.representativeName.toLowerCase();
                        if (repName.includes('پخش') || repName.includes('distributor')) {
                            destRepType = 'پخش';
                        } else if (repName.includes('نماینده') || repName.includes('representative')) {
                            destRepType = 'نماینده';
                        }
                    }
                    const tonnage = d.tonnage ? formatTonnageKg(parseNumericField(d.tonnage)) : '';
                    const deliveryDate = (d as any).deliveryDate;
                    const unloadTime = d.unloadTime;
                    return (
                        <span key={d.id} className="inline-block">
                            {destRepType ? `(${destRepType}) ` : ''}
                            <span className="font-bold text-blue-700">{d.city}</span>
                            {tonnage ? ` (${tonnage})` : ''}
                            {deliveryDate && <span className="text-green-600 mr-1">📅{deliveryDate}</span>}
                            {unloadTime && <span className="text-orange-600 mr-1">🕐{unloadTime}</span>}
                            {idx < ann.destinations.length - 1 && '، '}
                        </span>
                    );
                });
            }},

            // Assignment Info (for all views)
            { header: 'نام راننده', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = getAssignedDriverDisplayName(ann, drivers, props.personalDrivers);
                // console.log('🔍 [Render] Driver name for', ann.id, ':', result);
                return result;
            }},
            { header: 'تماس راننده', display: () => viewMode === 'full' || viewMode === 'compact', render: (ann: FreightAnnouncement) => {
                const result = getAssignedDriverContact(ann, drivers, props.personalDrivers);
                return <span className="font-mono">{result}</span>;
            }},
            { header: 'پلاک خودرو', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = getAssignedVehiclePlate(ann, vehicles, props.personalVehicles);
                // console.log('🔍 [Render] Vehicle plate for', ann.id, ':', result);
                return <span className="font-mono whitespace-nowrap">{result}</span>;
            }},
            { header: 'شماره بارنامه', display: () => true, render: (ann: FreightAnnouncement) => {
                const result = ann.billOfLadingNumber || '-';
                // console.log('🔍 [Render] Bill of lading for', ann.id, ':', result);
                return result;
            }},
            { header: TOTAL_FREIGHT_HEADER, display: () => true, render: (ann: FreightAnnouncement) => formatTotalFreightCost(ann.totalFreightCost) },
            
            // Full View Specific - Ice Cream
            { header: 'تعداد کارتن', align: 'center', display: (lt:any) => viewMode === 'full' && lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.cartonCount },
            { header: 'محصولات', display: (lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
            // Full View Specific - Dairy/Ambient
            { header: 'ساعت حضور', display: (lt: any) => viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(lt), render: (ann: FreightAnnouncement) => ann.platformArrivalTime },
            { header: 'ارزش بار', align: 'center', display: () => viewMode === 'full', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
            
            // Operations Column
            { header: 'عملیات', display: () => true, render: (ann: FreightAnnouncement) => {
                const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                const disabledClasses = (!canTakeAction || isAssignedByOther) ? 'opacity-50 cursor-not-allowed' : '';
                return (
                    <div className="flex gap-1 flex-wrap">
                        {canPerformActions && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('assign', ann)} className={`flex items-center gap-1 px-3 py-1 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 ${disabledClasses}`}><PencilIcon className="w-3 h-3"/>{[FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status) ? 'تخصیص' : 'ویرایش'}</button>}
                        {canPerformActions && (ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه' || ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند') && ann.destinations.length >= 1 && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('transfer', ann)} title="جابجایی مقصد" className={`p-1 bg-yellow-500 text-white rounded-md text-xs hover:bg-yellow-600 ${disabledClasses}`}><SwitchHorizontalIcon className="w-4 h-4"/></button>}
                </div>
                );
            } },
        ];

        return columns;
    }, [editingVehicleTypeId, canEditAnnouncement, canPerformActions, currentUser.role, onChangeVehicleType, getDriverName, getPersonalDriverName, getDriverContact, getPersonalDriverContact, getVehicleIdentifier, getPersonalVehicleIdentifier, drivers, vehicles, personalDrivers, personalVehicles, props]);
    
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<FreightAnnouncement | null>(null);

    const handleOpenDialog = useCallback((type: 'assign' | 'transfer' | 'change', ann: FreightAnnouncement) => {
        setSelectedAnnouncement(ann);
        setDialog(type);
        // اگر dialog assignment باز می‌شود، personal resources را لود کن (اگر نیاز باشد)
        if (type === 'assign' && onOpenAssignmentDialog) {
            onOpenAssignmentDialog(ann);
        }
    }, [onOpenAssignmentDialog]);
    
    const handleCloseDialog = useCallback(() => {
        setSelectedAnnouncement(null);
        setDialog(null);
    }, [])

    const liveAnnouncements = useMemo(() => {
        const filtered = announcements.filter(a => {
            // همه اعلام‌بارها نمایش داده می‌شوند (فیلتر تاریخ حذف شد)
            // توجه: راننده و خودرو تا زمانی که مجدد در نوبت قرار بگیرند در تابلو اعلام بار می‌مانند
            // (نه تا اتمام تخصیص)

            if (currentUser.role === UserRole.TransportationUser) {
                // ترابری شرکت: بر اساس قانون ارجاع خودکار
                // بستنی: ابتدا به ترابری شرکت، در صورت عدم پوشش به ترابری شخصی
                // پاستوریزه و لبنیات: ابتدا به ترابری شخصی، در صورت عدم پوشش به ترابری شرکت
                
                // Exclude cancelled freight
                if (a.status === FreightAnnouncementStatus.Cancelled) {
                    return false;
                }
                
                // Exclude finalized freight (که تخصیص نهایی شده)
                if (a.status === FreightAnnouncementStatus.Finalized) {
                    return false;
                }
                
                const allowedStatuses = [
                    FreightAnnouncementStatus.PendingCompanyAssignment,
                    FreightAnnouncementStatus.PendingPersonalAssignment,
                    FreightAnnouncementStatus.Assigned,
                    FreightAnnouncementStatus.InTransit,
                ];
                // Also check for English status values (for backward compatibility)
                const englishStatuses = ['Assigned', 'InTransit'];
                const isAllowed = allowedStatuses.includes(a.status) || englishStatuses.includes(a.status);
                
                // قانون ارجاع خودکار: ترابری شرکت باید بستنی را ببیند و بتواند روی آن عمل کند
                if (isAllowed && (a.lineType === FreightLineType.IceCream || a.lineType === 'IceCream' || a.lineType === 'بستنی')) {
                    // بستنی: ترابری شرکت اولویت دارد - همیشه نمایش داده می‌شود
                    return true;
                } else if (isAllowed && ((a.lineType === FreightLineType.Dairy || a.lineType === 'Dairy' || a.lineType === 'پاستوریزه') || (a.lineType === FreightLineType.Ambient || a.lineType === 'Ambient' || a.lineType === 'لبنیات-فروتلند'))) {
                    // پاستوریزه و لبنیات: ترابری شرکت باید ببیند اما عملیات غیرفعال باشد تا زمانی که ارجاع داده شود
                    return true; // همیشه نمایش داده می‌شود
                }
                
                // همچنین اعلام‌بارهای در انتظار تایید هم باید نمایش داده شوند (برای مشاهده)
                if (a.status === FreightAnnouncementStatus.PendingApproval) {
                    return (a.lineType === FreightLineType.IceCream || a.lineType === 'IceCream' || a.lineType === 'بستنی') ||
                           (a.lineType === FreightLineType.Dairy || a.lineType === 'Dairy' || a.lineType === 'پاستوریزه') ||
                           (a.lineType === FreightLineType.Ambient || a.lineType === 'Ambient' || a.lineType === 'لبنیات-فروتلند');
                }
                
                return false;
            }
            if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
                // ترابری شخصی: بر اساس قانون ارجاع خودکار
                // پاستوریزه و لبنیات: ابتدا به ترابری شخصی، در صورت عدم پوشش به ترابری شرکت
                // بستنی: ابتدا به ترابری شرکت، در صورت عدم پوشش به ترابری شخصی
                
                const allowedStatuses = [
                    FreightAnnouncementStatus.PendingCompanyAssignment,
                    FreightAnnouncementStatus.PendingPersonalAssignment,
                    FreightAnnouncementStatus.Assigned,
                    FreightAnnouncementStatus.InTransit,
                    FreightAnnouncementStatus.Finalized,
                ];
                // Also check for English status values (for backward compatibility)
                const englishStatuses = ['Assigned', 'InTransit', 'Finalized'];
                const isAllowed = allowedStatuses.includes(a.status) || englishStatuses.includes(a.status);
                
                // Exclude cancelled freight
                if (a.status === FreightAnnouncementStatus.Cancelled) {
                    return false;
                }
                
                // قانون ارجاع خودکار: ترابری شخصی باید پاستوریزه و لبنیات را ببیند و بتواند روی آن عمل کند
                if (isAllowed && ((a.lineType === FreightLineType.Dairy || a.lineType === 'Dairy' || a.lineType === 'پاستوریزه') || (a.lineType === FreightLineType.Ambient || a.lineType === 'Ambient' || a.lineType === 'لبنیات-فروتلند'))) {
                    // پاستوریزه و لبنیات: ترابری شخصی اولویت دارد - همیشه نمایش داده می‌شود
                    return true;
                } else if (isAllowed && (a.lineType === FreightLineType.IceCream || a.lineType === 'IceCream' || a.lineType === 'بستنی')) {
                    // بستنی: ترابری شخصی باید ببیند اما عملیات غیرفعال باشد تا زمانی که ارجاع داده شود
                    return true; // همیشه نمایش داده می‌شود
                }
                
                return false;
            }
            if (currentUser.role === UserRole.BranchFinance && currentUser.branchCity) {
                 return a.destinations.some(d => d.city === currentUser.branchCity) && a.status === FreightAnnouncementStatus.Assigned;
            }
            // Other roles like planners see everything that's live (but not Finalized, Leftover, or Cancelled)
            const liveStatuses = [
                FreightAnnouncementStatus.PendingCompanyAssignment, 
                FreightAnnouncementStatus.PendingPersonalAssignment, 
                FreightAnnouncementStatus.Assigned,
                FreightAnnouncementStatus.InTransit
            ];
            return liveStatuses.includes(a.status) && 
                   a.status !== FreightAnnouncementStatus.Finalized && 
                   a.status !== FreightAnnouncementStatus.Leftover &&
                   a.status !== FreightAnnouncementStatus.Cancelled;
        });
        
        return filtered.sort((a,b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
    }, [announcements, currentUser]);

    const tabCounts = useMemo(() => {
        const pendingBill = liveAnnouncements.filter(isPendingBillOfLading).length;
        const byLine = Object.values(FreightLineType).reduce(
            (acc, line) => {
                acc[line] = liveAnnouncements.filter(
                    (a) => matchesFreightLine(a, line) && !isPendingBillOfLading(a)
                ).length;
                return acc;
            },
            {} as Record<FreightLineType, number>
        );
        return { pendingBill, byLine };
    }, [liveAnnouncements]);

    const filteredAnnouncements = useMemo(() => {
        if (isPendingBillOfLadingTab(activeLine)) {
            return liveAnnouncements.filter(isPendingBillOfLading);
        }
        return liveAnnouncements.filter(
            (a) => matchesFreightLine(a, activeLine as FreightLineType) && !isPendingBillOfLading(a)
        );
    }, [liveAnnouncements, activeLine]);

    const canFinalizeCurrentTab = useMemo(() => {
        if (currentUser.role === 'ادمین' || currentUser.role === 'Admin') return true;
        if (isPendingBillOfLadingTab(activeLine)) {
            return Object.values(finalizePermissions).some(Boolean);
        }
        return Boolean(finalizePermissions[activeLine as FreightLineType]);
    }, [activeLine, currentUser.role, finalizePermissions]);

    const handleFinalizeClick = useCallback(
        (idsToFinalize: string[]) => {
            if (idsToFinalize.length === 0) {
                alert('اعلام باری برای اتمام تخصیص انتخاب نشده است.');
                return;
            }
            const groups = new Map<string, string[]>();
            for (const id of idsToFinalize) {
                const ann = announcements.find((a) => a.id === id);
                if (!ann) continue;
                const backendLine = lineTypeFromAnnouncement(ann);
                if (!groups.has(backendLine)) groups.set(backendLine, []);
                groups.get(backendLine)!.push(id);
            }
            if (groups.size <= 1) {
                const onlyLine = groups.keys().next().value;
                onFinalize(idsToFinalize, onlyLine);
                setSelectedIds(new Set());
                return;
            }
            void (async () => {
                for (const [backendLine, ids] of groups) {
                    await onFinalize(ids, backendLine);
                }
                setSelectedIds(new Set());
            })();
        },
        [announcements, onFinalize]
    );
    
    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };


    const visibleColumns = useMemo(() => {
        const lineForColumns = isPendingBillOfLadingTab(activeLine)
            ? FreightLineType.Dairy
            : (activeLine as FreightLineType);

        // Extra transport columns (for both modes, position differs)
        const extraCols = [
            { header: 'نام راننده', render: (ann: FreightAnnouncement) => getAssignedDriverDisplayName(ann, props.drivers, props.personalDrivers) },
            { header: 'تماس راننده', render: (ann: FreightAnnouncement) => <span className="font-mono">{getAssignedDriverContact(ann, props.drivers, props.personalDrivers)}</span> },
            { header: 'پلاک خودرو', render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{getAssignedVehiclePlate(ann, props.vehicles, props.personalVehicles)}</span> },
            { header: 'شماره بارنامه', render: (ann: FreightAnnouncement) => (ann.billOfLadingNumber || '').trim() || '-' },
            { header: TOTAL_FREIGHT_HEADER, render: (ann: FreightAnnouncement) => formatTotalFreightCost(ann.totalFreightCost) },
            { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
        ];

        // تب «در انتظار بارنامه»: همه خطوط — ستون‌های فشرده + خط
        if (isPendingBillOfLadingTab(activeLine)) {
            const pendingBase = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'خط', render: (ann: FreightAnnouncement) => <span className="font-medium">{ann.lineType}</span> },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                {
                    header: 'مقاصد',
                    render: (ann: FreightAnnouncement) => (
                        <div className="flex flex-col text-xs space-y-1">
                            {ann.destinations.map((d, i) => (
                                <div key={d.id || i} className="flex items-center justify-center gap-2 flex-wrap">
                                    <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                    <span className="font-semibold text-slate-800">{d.city}</span>
                                </div>
                            ))}
                        </div>
                    ),
                },
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
            ];
            return [...pendingBase, ...extraCols];
        }

        // Ice Cream: mirror planner order, then extras
        if (activeLine === FreightLineType.IceCream) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'نماینده (پخش/نماینده)', render: (ann: FreightAnnouncement) => formatRepresentativeType(ann.representativeType) },
                { header: 'مقصد', render: (ann: FreightAnnouncement) => <span className="text-blue-600 font-semibold">{getDestinationCitiesLabel(ann)}</span> },
                { header: 'مبدا', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'محصولات', render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
                { header: 'کارتن', render: (ann: FreightAnnouncement) => ann.cartonCount ?? '-' },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'اولویت', render: (ann: FreightAnnouncement) => ({ low: 'کم اهمیت', normal: 'عادی', high: 'فوری' } as any)[ann.priority || 'normal'] },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'تاریخ تحویل بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap text-green-600">{(ann as any).deliveryDate || '-'}</span> },
                // { header: 'وضعیت', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Dairy compact: mirror planner (kg), then extras
        if (lineForColumns === FreightLineType.Dairy && viewMode === 'compact' && activeLine === FreightLineType.Dairy) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => {
                    const isDairyOrAmbient = ann.lineType === FreightLineType.Dairy || ann.lineType === FreightLineType.Ambient || 
                                            ann.lineType === 'پاستوریزه' || ann.lineType === 'لبنیات-فروتلند' ||
                                            ann.lineType === 'Dairy' || ann.lineType === 'Ambient';
                    const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                    const isEditing = editingVehicleTypeId === ann.id;
                    
                    // برای تغییر نوع خودرو، فقط نیاز به isDairyOrAmbient داریم، نه canEdit
                    if (isDairyOrAmbient) {
                        if (isEditing) {
                            return (
                        <select
                            value={ann.vehicleType || ''}
                            onChange={(e) => {
                                        if (e.target.value && e.target.value !== ann.vehicleType) {
                                    onChangeVehicleType(ann.id, e.target.value);
                                            setEditingVehicleTypeId(null);
                                }
                            }}
                                    onBlur={() => setEditingVehicleTypeId(null)}
                                    autoFocus
                                    className="px-2 py-1 text-sm border border-sky-500 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                            autoComplete="off"
                        >
                                    <option value="">-- انتخاب --</option>
                            {VEHICLE_TYPES.map(vt => (
                                <option key={vt} value={vt}>{vt}</option>
                            ))}
                        </select>
                            );
                        } else {
                            return (
                                <div
                                    onClick={() => {
                                        console.log('🖱️ [VehicleType Column - Compact] Clicked on cell:', ann.id, ann.vehicleType);
                                        setEditingVehicleTypeId(ann.id);
                                    }}
                                    className="px-2 py-1 text-sm border border-transparent rounded-md hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors min-w-[80px]"
                                    title="کلیک برای تغییر نوع خودرو"
                                >
                                    {ann.vehicleType || '-'}
                                </div>
                            );
                        }
                    }
                    return <span>{ann.vehicleType || '-'}</span>;
                }},
                { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                { header: 'مقاصد', render: (ann: FreightAnnouncement) => {
                    // بررسی نوع نماینده - ابتدا از announcement
                    let repType = '';
                    const repTypeValue = ann.representativeType;
                    if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
                        repType = 'پخش';
                    } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
                        repType = 'نماینده';
                    }
                    
                    // اگر در announcement نبود، از representativeName در announcement استفاده کن
                    if (!repType && ann.representativeName) {
                        const repName = ann.representativeName.toLowerCase();
                        if (repName.includes('پخش') || repName.includes('distributor')) {
                            repType = 'پخش';
                        } else if (repName.includes('نماینده') || repName.includes('representative')) {
                            repType = 'نماینده';
                        }
                    }
                    
                    return ann.destinations.map((d, idx) => {
                        // اگر در announcement نبود، از destination بررسی کن
                        let destRepType = repType;
                        if (!destRepType && (d as any).representativeType) {
                            const destRep = (d as any).representativeType;
                            if (destRep === 'distributor' || destRep === 'agent' || destRep === 'پخش') {
                                destRepType = 'پخش';
                            } else if (destRep === 'representative' || destRep === 'نماینده') {
                                destRepType = 'نماینده';
                            }
                        }
                        // اگر هنوز پیدا نشد، از representativeName در destination استفاده کن
                        if (!destRepType && d.representativeName) {
                            const repName = d.representativeName.toLowerCase();
                            if (repName.includes('پخش') || repName.includes('distributor')) {
                                destRepType = 'پخش';
                            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                                destRepType = 'نماینده';
                            }
                        }
                        const tonnage = d.tonnage ? formatTonnageKg(parseNumericField(d.tonnage)) : '';
                        const deliveryDate = (d as any).deliveryDate;
                        const unloadTime = d.unloadTime;
                        return (
                            <span key={d.id} className="inline-block">
                                {destRepType ? `(${destRepType}) ` : ''}
                                <span className="font-bold text-blue-700">{d.city}</span>
                                {tonnage ? ` (${tonnage})` : ''}
                                {deliveryDate && <span className="text-green-600 mr-1">📅{deliveryDate}</span>}
                                {unloadTime && <span className="text-orange-600 mr-1">🕐{unloadTime}</span>}
                                {idx < ann.destinations.length - 1 && '، '}
                            </span>
                        );
                    });
                } },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                // { header: 'وضعیت', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Ambient compact: mirror Dairy compact order, then extras
        if (activeLine === FreightLineType.Ambient && viewMode === 'compact') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => {
                    const isDairyOrAmbient = ann.lineType === FreightLineType.Dairy || ann.lineType === FreightLineType.Ambient || 
                                            ann.lineType === 'پاستوریزه' || ann.lineType === 'لبنیات-فروتلند' ||
                                            ann.lineType === 'Dairy' || ann.lineType === 'Ambient';
                    const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                    const isEditing = editingVehicleTypeId === ann.id;
                    
                    // برای تغییر نوع خودرو، فقط نیاز به isDairyOrAmbient داریم، نه canEdit
                    if (isDairyOrAmbient) {
                        if (isEditing) {
                            return (
                        <select
                            value={ann.vehicleType || ''}
                            onChange={(e) => {
                                        if (e.target.value && e.target.value !== ann.vehicleType) {
                                    onChangeVehicleType(ann.id, e.target.value);
                                            setEditingVehicleTypeId(null);
                                }
                            }}
                                    onBlur={() => setEditingVehicleTypeId(null)}
                                    autoFocus
                                    className="px-2 py-1 text-sm border border-sky-500 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                            autoComplete="off"
                        >
                                    <option value="">-- انتخاب --</option>
                            {VEHICLE_TYPES.map(vt => (
                                <option key={vt} value={vt}>{vt}</option>
                            ))}
                        </select>
                            );
                        } else {
                            return (
                                <div
                                    onClick={() => {
                                        console.log('🖱️ [VehicleType Column - Compact] Clicked on cell:', ann.id, ann.vehicleType);
                                        setEditingVehicleTypeId(ann.id);
                                    }}
                                    className="px-2 py-1 text-sm border border-transparent rounded-md hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors min-w-[80px]"
                                    title="کلیک برای تغییر نوع خودرو"
                                >
                                    {ann.vehicleType || '-'}
                                </div>
                            );
                        }
                    }
                    return <span>{ann.vehicleType || '-'}</span>;
                }},
                { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                { header: 'مقاصد', render: (ann: FreightAnnouncement) => {
                    // بررسی نوع نماینده - ابتدا از announcement
                    let repType = '';
                    const repTypeValue = ann.representativeType;
                    if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
                        repType = 'پخش';
                    } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
                        repType = 'نماینده';
                    }
                    
                    // اگر در announcement نبود، از representativeName در announcement استفاده کن
                    if (!repType && ann.representativeName) {
                        const repName = ann.representativeName.toLowerCase();
                        if (repName.includes('پخش') || repName.includes('distributor')) {
                            repType = 'پخش';
                        } else if (repName.includes('نماینده') || repName.includes('representative')) {
                            repType = 'نماینده';
                        }
                    }
                    
                    return ann.destinations.map((d, idx) => {
                        // اگر در announcement نبود، از destination بررسی کن
                        let destRepType = repType;
                        if (!destRepType && (d as any).representativeType) {
                            const destRep = (d as any).representativeType;
                            if (destRep === 'distributor' || destRep === 'agent' || destRep === 'پخش') {
                                destRepType = 'پخش';
                            } else if (destRep === 'representative' || destRep === 'نماینده') {
                                destRepType = 'نماینده';
                            }
                        }
                        // اگر هنوز پیدا نشد، از representativeName در destination استفاده کن
                        if (!destRepType && d.representativeName) {
                            const repName = d.representativeName.toLowerCase();
                            if (repName.includes('پخش') || repName.includes('distributor')) {
                                destRepType = 'پخش';
                            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                                destRepType = 'نماینده';
                            }
                        }
                        const tonnage = d.tonnage ? formatTonnageKg(parseNumericField(d.tonnage)) : '';
                        const deliveryDate = (d as any).deliveryDate;
                        const unloadTime = d.unloadTime;
                        return (
                            <span key={d.id} className="inline-block">
                                {destRepType ? `(${destRepType}) ` : ''}
                                <span className="font-bold text-blue-700">{d.city}</span>
                                {tonnage ? ` (${tonnage})` : ''}
                                {deliveryDate && <span className="text-green-600 mr-1">📅{deliveryDate}</span>}
                                {unloadTime && <span className="text-orange-600 mr-1">🕐{unloadTime}</span>}
                                {idx < ann.destinations.length - 1 && '، '}
                            </span>
                        );
                    });
                } },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                // { header: 'وضعیت', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Dairy full: common columns order then extras; destinations are rendered separately
        if (activeLine === FreightLineType.Dairy && viewMode === 'full') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => {
                    const isDairyOrAmbient = ann.lineType === FreightLineType.Dairy || ann.lineType === FreightLineType.Ambient || 
                                            ann.lineType === 'پاستوریزه' || ann.lineType === 'لبنیات-فروتلند' ||
                                            ann.lineType === 'Dairy' || ann.lineType === 'Ambient';
                    const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                    const isEditing = editingVehicleTypeId === ann.id;
                    
                    // برای تغییر نوع خودرو، فقط نیاز به isDairyOrAmbient داریم، نه canEdit
                    if (isDairyOrAmbient) {
                        if (isEditing) {
                            return (
                        <select
                            value={ann.vehicleType || ''}
                            onChange={(e) => {
                                        if (e.target.value && e.target.value !== ann.vehicleType) {
                                    onChangeVehicleType(ann.id, e.target.value);
                                            setEditingVehicleTypeId(null);
                                }
                            }}
                                    onBlur={() => setEditingVehicleTypeId(null)}
                                    autoFocus
                                    className="px-2 py-1 text-sm border border-sky-500 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                            autoComplete="off"
                        >
                                    <option value="">-- انتخاب --</option>
                            {VEHICLE_TYPES.map(vt => (
                                <option key={vt} value={vt}>{vt}</option>
                            ))}
                        </select>
                            );
                        } else {
                            return (
                                <div
                                    onClick={() => {
                                        console.log('🖱️ [VehicleType Column - Compact] Clicked on cell:', ann.id, ann.vehicleType);
                                        setEditingVehicleTypeId(ann.id);
                                    }}
                                    className="px-2 py-1 text-sm border border-transparent rounded-md hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors min-w-[80px]"
                                    title="کلیک برای تغییر نوع خودرو"
                                >
                                    {ann.vehicleType || '-'}
                                </div>
                            );
                        }
                    }
                    return <span>{ann.vehicleType || '-'}</span>;
                }},
                { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                // { header: 'وضعیت', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Ambient full: mirror Dairy full
        if (activeLine === FreightLineType.Ambient && viewMode === 'full') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => {
                    const isDairyOrAmbient = ann.lineType === FreightLineType.Dairy || ann.lineType === FreightLineType.Ambient || 
                                            ann.lineType === 'پاستوریزه' || ann.lineType === 'لبنیات-فروتلند' ||
                                            ann.lineType === 'Dairy' || ann.lineType === 'Ambient';
                    const { canEdit, canTakeAction, isAssignedByOther } = canEditAnnouncement(ann);
                    const isEditing = editingVehicleTypeId === ann.id;
                    
                    // برای تغییر نوع خودرو، فقط نیاز به isDairyOrAmbient داریم، نه canEdit
                    if (isDairyOrAmbient) {
                        if (isEditing) {
                            return (
                        <select
                            value={ann.vehicleType || ''}
                            onChange={(e) => {
                                        if (e.target.value && e.target.value !== ann.vehicleType) {
                                    onChangeVehicleType(ann.id, e.target.value);
                                            setEditingVehicleTypeId(null);
                                }
                            }}
                                    onBlur={() => setEditingVehicleTypeId(null)}
                                    autoFocus
                                    className="px-2 py-1 text-sm border border-sky-500 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                            autoComplete="off"
                        >
                                    <option value="">-- انتخاب --</option>
                            {VEHICLE_TYPES.map(vt => (
                                <option key={vt} value={vt}>{vt}</option>
                            ))}
                        </select>
                            );
                        } else {
                            return (
                                <div
                                    onClick={() => {
                                        console.log('🖱️ [VehicleType Column - Compact] Clicked on cell:', ann.id, ann.vehicleType);
                                        setEditingVehicleTypeId(ann.id);
                                    }}
                                    className="px-2 py-1 text-sm border border-transparent rounded-md hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors min-w-[80px]"
                                    title="کلیک برای تغییر نوع خودرو"
                                >
                                    {ann.vehicleType || '-'}
                                </div>
                            );
                        }
                    }
                    return <span>{ann.vehicleType || '-'}</span>;
                }},
                { header: 'مبدا بارگیری', render: (ann: FreightAnnouncement) => ann.originCity || '-' },
                { header: 'برند', render: (ann: FreightAnnouncement) => ann.brand || '-' },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => formatTotalTonnageFromDestinations(ann.destinations) },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                // { header: 'وضعیت', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Default fallback
        const colsAll = columnsConfig(viewMode);
        const cols = colsAll.filter(c => c.display(lineForColumns)).filter(c => c.header !== 'کد اعلام بار');
        return [...cols, ...extraCols];
    }, [viewMode, activeLine, props, columnsConfig, editingVehicleTypeId, props.drivers, props.personalDrivers, props.vehicles, props.personalVehicles]);

    const isFullDairyAmbient =
        viewMode === 'full' &&
        !isPendingBillOfLadingTab(activeLine) &&
        [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine as FreightLineType);
    /** جدول کامل پاستوریزه/لبنیات (۴ مقصد) یا سایر خطوط در حالت کامل — نیاز به اسکرول افقی */
    const tableNeedsHorizontalScroll =
        isFullDairyAmbient ||
        (viewMode === 'full' && !isPendingBillOfLadingTab(activeLine));
    const commonCols = useMemo(() => visibleColumns, [visibleColumns]);

    // Function to generate Excel export - دقیقاً مطابق جدول frontend با فرمت
    const generateExcelExport = (mode: 'compact' | 'full') => {
        const cols = columnsConfig(mode);
        const lineForExport = isPendingBillOfLadingTab(activeLine) ? FreightLineType.Dairy : (activeLine as FreightLineType);
        const visibleCols = isPendingBillOfLadingTab(activeLine)
            ? visibleColumns
            : cols.filter(c => c.display(lineForExport));
        const isFullDairyAmbientMode =
            mode === 'full' &&
            !isPendingBillOfLadingTab(activeLine) &&
            [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine as FreightLineType);
        
        // Get headers - دقیقاً همان ترتیب frontend
        const headers: string[] = [];
        if (canPerformActions) {
            headers.push('انتخاب');
        }
        
        // اضافه کردن headers به ترتیب دقیق frontend
        visibleCols.forEach(col => {
            if (col.header !== 'عملیات') {
                headers.push(col.header);
            }
        });
        
        // برای Full Dairy/Ambient، headers مقاصد را اضافه می‌کنیم
        if (isFullDairyAmbientMode) {
            for (let i = 1; i <= 4; i++) {
                headers.push(`مقصد ${i} - نماینده`, `مقصد ${i} - شهر`, `مقصد ${i} - تناژ`, `مقصد ${i} - تاریخ تحویل`, `مقصد ${i} - ساعت تخلیه`, `مقصد ${i} - کرایه`);
            }
        }
        
        // ایجاد workbook و worksheet
        const wb = XLSX.utils.book_new();
        const wsData: any[][] = [];
        
        // اضافه کردن headers
        wsData.push(headers);
        
        // Generate rows - دقیقاً همان ترتیب و محتوای frontend
        filteredAnnouncements.forEach((ann, idx) => {
            const row: any[] = [];
            
            if (canPerformActions) {
                row.push(''); // Checkbox column
            }
            
            // استفاده از render functions برای استخراج دقیق داده‌ها
            visibleCols.forEach(col => {
                if (col.header !== 'عملیات') {
                    let value: any = '';
                    
                    // بررسی اینکه آیا این ستون عددی است (مثل تناژ، کرایه، ارزش بار)
                    const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه'];
                    const isNumericColumn = numericHeaders.some(h => col.header.includes(h));
                    
                    if (col.render) {
                        const rendered = col.render(ann, idx);
                        if (typeof rendered === 'string') {
                            value = rendered;
                        } else if (typeof rendered === 'number') {
                            value = rendered; // عدد را به صورت عدد نگه دار
                        } else if (React.isValidElement(rendered)) {
                            // Extract text from React element - دقیق‌تر
                            value = extractTextFromElement(rendered);
                            // حذف emojis و کاراکترهای خاص
                            value = value.replace(/[📅🕐]/g, '').trim();
                        } else if (Array.isArray(rendered)) {
                            // Handle array of elements (like destinations)
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
                    
                    // Clean up: فقط HTML tags و emojis را حذف کن
                    if (typeof value === 'string') {
                        value = value.replace(/<[^>]*>/g, '').trim();
                    }
                    
                    // برای ستون‌های عددی، مقدار عددی را استخراج کن
                    if (isNumericColumn) {
                        if (typeof value === 'number') {
                            // اگر قبلاً عدد است، نگه دار
                            value = value;
                        } else if (typeof value === 'string') {
                            // حذف واحدها (تومان، ریال) و جداکننده‌ها و کاراکترهای فارسی
                            // همچنین حذف جداکننده‌های فارسی (،) و انگلیسی (,)
                            const cleaned = value.replace(/[^\d]/g, '');
                            const numValue = parseFloat(cleaned);
                            if (!isNaN(numValue) && numValue > 0) {
                                // مقدار عددی را نگه دار (Excel خودش فرمت می‌کند)
                                value = numValue;
                            } else {
                                value = '';
                            }
                        } else {
                            value = '';
                        }
                    }
                    
                    row.push(value);
                }
            });
            
            // برای Full Dairy/Ambient، مقاصد را اضافه می‌کنیم
            if (isFullDairyAmbientMode) {
                for (let i = 0; i < 4; i++) {
                    const dest = ann.destinations[i];
                    if (dest) {
                        const repType = (dest as any).representativeType === 'distributor' || (dest as any).representativeType === 'پخش' ? 'پخش' : 
                                       (dest as any).representativeType === 'representative' || (dest as any).representativeType === 'نماینده' ? 'نماینده' : 
                                       (dest.representativeName || '').includes('پخش') ? 'پخش' : 
                                       (dest.representativeName || '').includes('نماینده') ? 'نماینده' : '';
                        const tonnage = dest.tonnage ? Number(dest.tonnage) : '';
                        const deliveryDate = (dest as any).deliveryDate || '';
                        const unloadTime = dest.unloadTime || '';
                        // برای کرایه، مقدار عددی را نگه دار (Excel خودش فرمت می‌کند)
                        const freightCost = dest.freightCost ? Number(dest.freightCost) : '';
                        row.push(
                            repType,
                            dest.city || '',
                            tonnage,
                            deliveryDate,
                            unloadTime,
                            freightCost
                        );
                    } else {
                        row.push('', '', '', '', '', '');
                    }
                }
            }
            
            wsData.push(row);
        });
        
        // ایجاد worksheet از data
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // تنظیم عرض ستون‌ها
        const colWidths = headers.map((header, idx) => {
            // محاسبه عرض بر اساس طول header و محتوای ستون
            let maxLength = header.length;
            wsData.forEach((row, rowIdx) => {
                if (rowIdx > 0 && row[idx] !== undefined) {
                    const cellValue = String(row[idx] || '');
                    maxLength = Math.max(maxLength, cellValue.length);
                }
            });
            return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }; // حداقل 10، حداکثر 50
        });
        ws['!cols'] = colWidths;
        
        // xlsx استایل‌های محدودی دارد، اما می‌توانیم فرمت اعداد را حفظ کنیم
        // تنظیم فرمت اعداد برای ستون‌های عددی
        const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        headers.forEach((header, colIdx) => {
            const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه'].some(h => header.includes(h));
            if (isNumericColumn) {
                // برای تمام ردیف‌های داده، فرمت عددی تنظیم می‌کنیم
                for (let row = 1; row <= filteredAnnouncements.length; row++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIdx });
                    if (ws[cellAddress] && ws[cellAddress].v) {
                        // اگر مقدار عددی است، به صورت عدد نگه دار (Excel خودش فرمت می‌کند)
                        const cellValue = ws[cellAddress].v;
                        if (typeof cellValue === 'string' && /^[\d,]+$/.test(cellValue.replace(/,/g, ''))) {
                            const numValue = parseFloat(cellValue.replace(/,/g, ''));
                            if (!isNaN(numValue)) {
                                ws[cellAddress].v = numValue;
                                ws[cellAddress].t = 'n'; // number type
                                // فرمت عددی با جداکننده هزارگان
                                ws[cellAddress].z = '#,##0';
                            }
                        }
                    }
                }
            }
        });
        
        // اضافه کردن worksheet به workbook
        XLSX.utils.book_append_sheet(wb, ws, 'اعلام بار');
        
        return wb;
    };

    // Helper function to extract text from React element - بهبود یافته برای استخراج دقیق
    const extractTextFromElement = (element: React.ReactElement | React.ReactNode): string => {
        if (typeof element === 'string') return element;
        if (typeof element === 'number') return String(element);
        if (element === null || element === undefined) return '';
        if (!React.isValidElement(element)) return String(element || '');
        
        // اگر element یک span یا div است، children را استخراج کن
        if (element.props && element.props.children !== undefined) {
            const children = element.props.children;
            
            if (typeof children === 'string') {
                return children;
            }
            if (typeof children === 'number') {
                return String(children);
            }
            if (Array.isArray(children)) {
                return children.map((child: any) => extractTextFromElement(child)).join('').trim();
            }
            // اگر children یک element دیگر است، بازگشتی استخراج کن
            return extractTextFromElement(children);
        }
        
        // اگر props.value وجود دارد (مثل input)
        if (element.props && element.props.value !== undefined) {
            return String(element.props.value || '');
        }
        
        return '';
    };

    // Function to download Excel with styling
    const downloadExcel = async (mode: 'compact' | 'full') => {
        const lineTypeName = isPendingBillOfLadingTab(activeLine)
            ? 'در_انتظار_بارنامه'
            : activeLine === FreightLineType.IceCream
              ? 'بستنی'
              : activeLine === FreightLineType.Dairy
                ? 'پاستوریزه'
                : 'لبنیات-فروتلند';
        const modeName = mode === 'compact' ? 'فشرده' : 'کامل';
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `پیگیری_اعلام_بار_${lineTypeName}_${modeName}_${dateStr}.xlsx`;
        
        // استفاده از ExcelJS برای استایل‌ها
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('اعلام بار');
            
            // Get headers and data - استفاده از همان منطق generateExcelExport
            const cols = columnsConfig(mode);
            const lineForExport = isPendingBillOfLadingTab(activeLine) ? FreightLineType.Dairy : (activeLine as FreightLineType);
            const visibleCols = isPendingBillOfLadingTab(activeLine)
                ? visibleColumns
                : cols.filter((c: any) => c.display(lineForExport));
            const isFullDairyAmbientMode =
                mode === 'full' &&
                !isPendingBillOfLadingTab(activeLine) &&
                [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine as FreightLineType);
            
            const headers: string[] = [];
            if (canPerformActions) {
                headers.push('انتخاب');
            }
            
            visibleCols.forEach((col: any) => {
                if (col.header !== 'عملیات') {
                    headers.push(col.header);
                }
            });
            
            // اطمینان از وجود "کرایه کل" و "ارزش بار" در headers
            if (!headers.includes(TOTAL_FREIGHT_HEADER) && !headers.some(h => h.includes('کرایه کل'))) {
                headers.push(TOTAL_FREIGHT_HEADER);
            }
            if (mode === 'full' && !headers.includes('ارزش بار') && !headers.includes('ارزش بار (ریال)') && !headers.some(h => h.includes('ارزش بار'))) {
                headers.push('ارزش بار');
            }
            
            if (isFullDairyAmbientMode) {
                for (let i = 1; i <= 4; i++) {
                    headers.push(`مقصد ${i} - نماینده`, `مقصد ${i} - شهر`, `مقصد ${i} - تناژ`, `مقصد ${i} - تاریخ تحویل`, `مقصد ${i} - ساعت تخلیه`, `مقصد ${i} - کرایه`);
                }
            }

            if (!headers.includes('ردیف')) {
                headers.unshift('ردیف');
            }
            
            // Add headers with styling
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell: any, colNumber: number) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF4472C4' } // آبی تیره
                };
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF000000' } },
                    bottom: { style: 'thin', color: { argb: 'FF000000' } },
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };
            });
            
            // Helper to get value for header - استفاده از همان منطق generateExcelExport
            const getValueForHeader = (header: string, ann: FreightAnnouncement, idx: number): any => {
                const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه'];
                const isNumericColumn = numericHeaders.some(h => header.includes(h));
                
                if (header === 'انتخاب') {
                    return '';
                }
                
                // Handle special columns directly - اولویت با اینهاست
                if (header === TOTAL_FREIGHT_HEADER || header === 'کرایه کل') {
                    const value = ann.totalFreightCost || 0;
                    if (typeof value === 'number') {
                        return value;
                    }
                    // اگر string است، باید به عدد تبدیل شود بدون استفاده از parseFloat که ممکن است به صورت علمی تبدیل کند
                    const strValue = String(value).replace(/[^\d]/g, '');
                    if (strValue === '') return 0;
                    // استفاده از parseInt برای اعداد بزرگ یا Number برای اطمینان
                    const numValue = Number(strValue);
                    return isNaN(numValue) ? 0 : numValue;
                }
                if (header === 'ارزش بار' || header === 'ارزش بار (ریال)') {
                    const value = ann.cargoValue || 0;
                    return typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d]/g, '')) || 0;
                }
                
                const col = visibleCols.find((c: any) => c.header === header);
                if (!col) return '';
                
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
                
                if (typeof value === 'string') {
                    value = value.replace(/<[^>]*>/g, '').trim();
                    value = localizeExcelValue(value);
                }
                
                if (isNumericColumn && typeof value === 'string') {
                    const cleaned = value.replace(/[^\d]/g, '');
                    const numValue = parseFloat(cleaned);
                    if (!isNaN(numValue) && numValue > 0) {
                        value = numValue;
                    } else {
                        value = '';
                    }
                }
                
                return value;
            };
            
            // Add data rows with zebra striping
            filteredAnnouncements.forEach((ann, idx) => {
                const rowData: any[] = [idx + 1];
                
                // اضافه کردن ستون انتخاب اگر وجود دارد
                if (canPerformActions) {
                    rowData.push('');
                }
                
                headers.forEach(header => {
                    if (header === 'ردیف' || header === 'انتخاب' || header.startsWith('مقصد')) {
                        return;
                    }
                    rowData.push(getValueForHeader(header, ann, idx));
                });
                
                if (isFullDairyAmbientMode) {
                    for (let i = 0; i < 4; i++) {
                        const dest = ann.destinations[i];
                        if (dest) {
                            // منطق تشخیص نوع نماینده - بهبود یافته
                            let repType = '';
                            const repTypeValue = (dest as any).representativeType;
                            const repName = (dest.representativeName || '').toString().trim();
                            
                            // اول از representativeType بررسی کن
                            repType = formatRepresentativeType(repTypeValue);
                            if (repType === '-' && repName) {
                                // اگر representativeType نبود، از representativeName استفاده کن
                                const repNameLower = repName.toLowerCase();
                                if (repNameLower.includes('پخش') || repNameLower === 'پخش') {
                                    repType = 'پخش';
                                } else if (repNameLower.includes('نماینده') || repNameLower === 'نماینده') {
                                    repType = 'نماینده';
                                } else if (repName && repName.trim() !== '') {
                                    // اگر نام وجود دارد اما پخش یا نماینده نیست، همان نام را نمایش بده
                                    repType = repName;
                                }
                            }
                            
                            const tonnage = dest.tonnage ? Number(dest.tonnage) : '';
                            const deliveryDate = (dest as any).deliveryDate || '';
                            const unloadTime = dest.unloadTime || '';
                            const freightCost = dest.freightCost ? Number(dest.freightCost) : '';
                            rowData.push(repType, dest.city || '', tonnage, deliveryDate, unloadTime, freightCost);
                        } else {
                            rowData.push('', '', '', '', '', '');
                        }
                    }
                }
                
                const row = worksheet.addRow(rowData);
                const isEvenRow = (idx + 1) % 2 === 0;
                const rowColor = isEvenRow ? 'FFF2F2F2' : 'FFFFFFFF';
                
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
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    
                    // Format numbers
                    const header = headers[colNumber - 1];
                    const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه'].some(h => header.includes(h));
                    if (isNumericColumn && typeof cell.value === 'number') {
                        // برای اطمینان از نمایش صحیح اعداد بزرگ بدون نماد علمی
                        // استفاده از فرمت عددی با جداکننده هزارگان
                        cell.numFmt = '#,##0';
                        // برای اطمینان از اینکه Excel عدد را به صورت علمی نمایش نمی‌دهد
                        if (Math.abs(cell.value) >= 1e15) {
                            // برای اعداد خیلی بزرگ، از فرمت رشته استفاده می‌کنیم
                            cell.value = cell.value.toString();
                            cell.numFmt = '@'; // Text format
                        }
                    }
                });
            });
            
            // Set column widths
            headers.forEach((header, idx) => {
                let maxLength = header.length;
                filteredAnnouncements.forEach(ann => {
                    const value = getValueForHeader(header, ann, 0);
                    const cellValue = String(value || '');
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
        const wb = generateExcelExport(mode);
        XLSX.writeFile(wb, fileName);
    };

    return (
        <div className="w-full max-w-none space-y-4">
            <div className="bg-white p-3 sm:p-4 rounded-xl shadow-md w-full">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center whitespace-nowrap shrink-0">
                            <TruckIcon className="w-6 h-6 ml-2 text-sky-600" />
                            پیگیری اعلام بار زنده و تخصیص
                        </h2>
                        {onRefresh && (
                            <button
                                onClick={() => onRefresh()}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 transition-colors shrink-0"
                                title="به‌روزرسانی دستی اطلاعات"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                به‌روزرسانی
                            </button>
                        )}
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg flex-nowrap gap-1 overflow-x-auto min-w-0">
                            <button
                                key={PENDING_BILL_OF_LADING_TAB}
                                onClick={() => setActiveLine(PENDING_BILL_OF_LADING_TAB)}
                                className={`shrink-0 px-3 py-1 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${activeLine === PENDING_BILL_OF_LADING_TAB ? 'bg-amber-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}
                            >
                                در انتظار بارنامه ({tabCounts.pendingBill.toLocaleString('fa-IR')})
                            </button>
                            {Object.values(FreightLineType).map(lt => (
                                <button
                                    key={lt}
                                    onClick={() => setActiveLine(lt)}
                                    className={`shrink-0 px-2.5 py-1 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${activeLine === lt ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {lt} ({tabCounts.byLine[lt].toLocaleString('fa-IR')})
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                        {canPerformActions && filteredAnnouncements.length > 0 && canFinalizeCurrentTab && (
                            <button 
                                onClick={() => {
                                    let idsToFinalize: string[];
                                    
                                    if (selectedIds.size > 0) {
                                        const filteredIds = filteredAnnouncements
                                            .filter(a => selectedIds.has(a.id))
                                            .map(a => a.id);
                                        
                                        if (filteredIds.length === 0) {
                                            alert('هیچ اعلام باری از تب فعلی انتخاب نشده است');
                                            return;
                                        }
                                        
                                        idsToFinalize = filteredIds;
                                    } else {
                                        idsToFinalize = filteredAnnouncements.map(a => a.id);
                                    }
                                    
                                    handleFinalizeClick(idsToFinalize);
                                }} 
                                className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600"
                                title={
                                    selectedIds.size > 0 
                                        ? `اتمام تخصیص برای ${selectedIds.size} اعلام بار انتخاب شده`
                                        : `اتمام تخصیص برای تمام ${filteredAnnouncements.length} اعلام بار این تب`
                                }
                            >
                                <CheckCircleIcon className="w-4 h-4" />
                                اتمام تخصیص {selectedIds.size > 0 ? `(${selectedIds.size} انتخاب شده)` : `(${filteredAnnouncements.length})`}
                            </button>
                        )}
                        <div className="flex items-center p-1 bg-slate-200 rounded-lg">
                            <button onClick={()=>setViewMode('compact')} className={`px-2 py-1 text-xs rounded ${viewMode==='compact'?'bg-white shadow':''}`}>فشرده</button>
                            <button onClick={()=>setViewMode('full')} className={`px-2 py-1 text-xs rounded ${viewMode==='full'?'bg-white shadow':''}`}>کامل</button>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => downloadExcel('compact')} 
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 transition-colors"
                                title="خروجی اکسل - حالت فشرده"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                اکسل فشرده
                            </button>
                            <button 
                                onClick={() => downloadExcel('full')} 
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 transition-colors"
                                title="خروجی اکسل - حالت کامل"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                اکسل کامل
                            </button>
                        </div>
                        <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                    </div>
                </div>
                <div
                    className={`w-full ${tableNeedsHorizontalScroll ? 'overflow-x-auto overscroll-x-contain' : ''}`}
                    style={tableNeedsHorizontalScroll ? { WebkitOverflowScrolling: 'touch' } : undefined}
                >
                    <table
                        className={`text-xs sm:text-sm text-center border-collapse [&_th]:px-1.5 [&_th]:py-2 [&_td]:px-1.5 [&_td]:py-2 ${
                            isFullDairyAmbient
                                ? 'min-w-[2800px] w-max'
                                : tableNeedsHorizontalScroll
                                  ? 'min-w-[1400px] w-max'
                                  : 'w-full'
                        }`}
                    >
                         <thead className="text-xs uppercase bg-gray-50">
                             {isFullDairyAmbient ? (
                                <>
                                    <tr>
                                        {canPerformActions && <th rowSpan={2} className="p-2 text-center align-middle sticky left-0 bg-gray-50 z-10"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? new Set(filteredAnnouncements.map(a=>a.id)) : new Set())}/></th>}
                                        {commonCols.map(col => <th key={col.header} rowSpan={2} className="p-2 text-center">{col.header}</th>)}
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد اول</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد دوم</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد سوم</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد چهارم</th>
                                        <th rowSpan={2} className="p-2 text-center align-middle sticky -left-px bg-gray-50 z-10" style={{width: '180px'}}>عملیات</th>
                                    </tr>
                                    <tr>
                                        {[1, 2, 3, 4].map(i => (
                                            <React.Fragment key={i}>
                                                <th className="p-2 text-center font-normal border">نماینده</th>
                                                <th className="p-2 text-center font-normal border">مقصد</th>
                                                <th className="p-2 text-center font-normal border">تناژ</th>
                                                <th className="p-2 text-center font-normal border">تاریخ تحویل</th>
                                                <th className="p-2 text-center font-normal border">ساعت تخلیه</th>
                                                <th className="p-2 text-center font-normal border">کرایه (ریال)</th>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </>
                             ) : (
                                <tr>
                                    {canPerformActions && <th className="p-2 text-center align-middle sticky left-0 bg-gray-50 z-10"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? new Set(filteredAnnouncements.map(a=>a.id)) : new Set())}/></th>}
                                    {visibleColumns.map(col => <th key={col.header} className="p-2 text-center align-middle whitespace-nowrap">{col.header}</th>)}
                                    <th className="p-2 text-center align-middle sticky -left-px bg-gray-50 z-10 whitespace-nowrap" style={{width: '180px'}}>عملیات</th>
                                </tr>
                             )}
                        </thead>
                        <tbody>
                            {filteredAnnouncements.map((ann, idx) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const loadingDate = new Date(ann.loadingDate);
                                loadingDate.setHours(0, 0, 0, 0);
                                
                                // یک اعلام بار "leftover" است اگر:
                                // 1. تاریخ بارگیری آن قبل از امروز باشد
                                // 2. وضعیت آن PendingCompanyAssignment یا PendingPersonalAssignment باشد
                                // موقتاً leftover check را غیرفعال می‌کنیم تا ببینیم آیا مشکل حل می‌شود
                                const isAnnLeftover = false; // loadingDate < today && [FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status);
                                const isTransportRole = hasAccess([UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User]);
                                // ========================================================================
                                // قواعد فعال/غیرفعال بودن عملیات (تخصیص و ارجاع) - قانون ارجاع خودکار
                                // ========================================================================
                                // 
                                // ترابری شرکت (TransportationUser):
                                //   - بستنی: فعال است وقتی assignmentType = 'company' باشد (در صف شرکت)
                                //   - پاستوریزه/لبنیات: فعال است وقتی assignmentType = 'company' باشد (ارجاع شده از شخصی)
                                // 
                                // ترابری شخصی (Transportation_Personal_Vehicle_User):
                                //   - پاستوریزه/لبنیات: فعال است وقتی assignmentType = 'personal' باشد (در صف شخصی)
                                //   - بستنی: فعال است وقتی assignmentType = 'personal' باشد (ارجاع شده از شرکت)
                                // 
                                // مهم: دکمه‌های "تخصیص" و "ارجاع" باید همیشه با هم فعال یا غیرفعال باشند
                                // ========================================================================
                                let canTakeAction = false;
                                
                                // Check action permissions
                                
                                // Normalize assignmentType - هم English و هم Farsi را بررسی می‌کند
                                const isCompanyAssigned = ann.assignmentType === 'company' || ann.assignmentType === 'شرکتی' || ann.status === FreightAnnouncementStatus.PendingCompanyAssignment;
                                const isPersonalAssigned = ann.assignmentType === 'personal' || ann.assignmentType === 'شخصی' || ann.status === FreightAnnouncementStatus.PendingPersonalAssignment;
                                
                                if (currentUser.role === UserRole.TransportationUser) {
                                    // ترابری شرکت
                                    if (ann.lineType === FreightLineType.IceCream || ann.lineType === 'IceCream' || ann.lineType === 'بستنی') {
                                        // بستنی: فعال است اگر assignmentType = 'company' باشد (در صف شرکت)
                                        canTakeAction = !isAnnLeftover && isCompanyAssigned;
                                    } else if ((ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه') || (ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند')) {
                                        // پاستوریزه/لبنیات: فعال است اگر assignmentType = 'company' باشد (ارجاع شده از ترابری شخصی به شرکت)
                                        // در غیر این صورت (assignmentType = 'personal') فقط مشاهده می‌شود، عملیات غیرفعال است
                                        canTakeAction = !isAnnLeftover && isCompanyAssigned;
                                    }
                                } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
                                    // ترابری شخصی
                                    if ((ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه') || (ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند')) {
                                        // پاستوریزه/لبنیات: فعال است اگر assignmentType = 'personal' باشد (در صف شخصی)
                                        canTakeAction = !isAnnLeftover && isPersonalAssigned;
                                    } else if (ann.lineType === FreightLineType.IceCream || ann.lineType === 'IceCream' || ann.lineType === 'بستنی') {
                                        // بستنی: فعال است اگر assignmentType = 'personal' باشد (ارجاع شده از ترابری شرکت به شخصی)
                                        // در غیر این صورت (assignmentType = 'company') فقط مشاهده می‌شود، عملیات غیرفعال است
                                        canTakeAction = !isAnnLeftover && isPersonalAssigned;
                                    }
                                } else {
                                    // سایر نقش‌ها
                                    canTakeAction = !isAnnLeftover;
                                }

                                // بررسی اینکه آیا بار به ترابری دیگر ارجاع شده است
                                // این باید برای همه status‌ها کار کند (PendingPersonalAssignment, PendingCompanyAssignment, Assigned, InTransit)
                                const isAssignedToOtherTransport = 
                                    (currentUser.role === UserRole.TransportationUser && isPersonalAssigned) ||
                                    (currentUser.role === UserRole.Transportation_Personal_Vehicle_User && isCompanyAssigned);
                                
                                // برای backward compatibility
                                const isAssignedByOther = isAssignedToOtherTransport;
                                
                                const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-400";

                                // دکمه ارجاع: باید همیشه با دکمه تخصیص همگام باشد
                                // اگر کاربر می‌تواند تخصیص دهد و اعلام بار در وضعیت Pending است، می‌تواند ارجاع هم دهد
                                let canForward = false;
                                
                                // ارجاع فقط برای اعلام بارهایی که هنوز تخصیص داده نشده‌اند (Pending) امکان‌پذیر است
                                const isPendingStatus = [
                                    FreightAnnouncementStatus.PendingCompanyAssignment,
                                    FreightAnnouncementStatus.PendingPersonalAssignment,
                                ].includes(ann.status);
                                
                                // دکمه ارجاع باید دقیقاً همان منطق دکمه تخصیص را داشته باشد
                                // یعنی اگر canTakeAction فعال است و وضعیت Pending است، ارجاع هم فعال است
                                // قانون: دکمه‌های تخصیص و ارجاع باید همیشه با هم فعال یا غیرفعال باشند
                                if (currentUser.role === UserRole.TransportationUser) {
                                    // ترابری شرکت: 
                                    // - برای بستنی: اگر در صف شرکت باشد (canTakeAction فعال) و Pending باشد، می‌تواند ارجاع دهد
                                    // - برای پاستوریزه/لبنیات: اگر در صف شرکت باشد (ارجاع شده از شخصی) و Pending باشد، می‌تواند ارجاع دهد
                                    canForward = canTakeAction && isPendingStatus;
                                } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
                                    // ترابری شخصی:
                                    // - برای پاستوریزه/لبنیات: اگر در صف شخصی باشد (canTakeAction فعال) و Pending باشد، می‌تواند ارجاع دهد
                                    // - برای بستنی: اگر در صف شخصی باشد (ارجاع شده از شرکت) و Pending باشد، می‌تواند ارجاع دهد
                                    canForward = canTakeAction && isPendingStatus;
                                } else {
                                    // سایر نقش‌ها: اگر canTakeAction فعال است و Pending است، می‌تواند ارجاع دهد
                                    canForward = canTakeAction && isPendingStatus;
                                }

                                // Determine row color based on assignment status
                                const isAssigned = ann.status === FreightAnnouncementStatus.Assigned || ann.status === 'Assigned';
                                const rowColorClass = isAssigned ? 'bg-green-50 hover:bg-green-100' : 'bg-yellow-50 hover:bg-yellow-100';

                                return (
                                <tr key={ann.id} className={`border-b ${selectedIds.has(ann.id) ? 'bg-sky-50' : rowColorClass}`}>
                                    {canPerformActions && <td className="p-2 text-center align-middle sticky left-0 z-10" style={{backgroundColor: selectedIds.has(ann.id) ? '#f0f9ff' : 'white'}}><input type="checkbox" checked={selectedIds.has(ann.id)} onChange={() => handleSelectRow(ann.id)}/></td>}
                                    
                                     {isFullDairyAmbient ? (
                                        <>
                                            {commonCols.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, props)}</td>)}
                                            {[0, 1, 2, 3].map(i => {
                                                const dest = ann.destinations[i];
                                                return (
                                                    <React.Fragment key={i}>
                                                        <td className="p-2 text-center border">{dest?.representativeName || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.city || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.tonnage != null ? formatTonnageKg(parseNumericField(dest.tonnage)) : '-'}</td>
                                                        <td className="p-2 text-center border">{(dest as any)?.deliveryDate || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                        <td className="p-2 text-center border">{formatDestinationFreightCost(dest?.freightCost)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        visibleColumns.map(col => <td key={col.header} className="p-2 text-center align-middle">{col.render(ann, idx, props)}</td>)
                                    )}

                                    <td className="p-1.5 text-center align-middle sticky -left-px z-10" style={{width: '220px', backgroundColor: selectedIds.has(ann.id) ? '#f0f9ff' : 'white'}}>
                                        <div className="flex gap-1 flex-wrap justify-center">
                                            {canPerformActions && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('assign', ann)} className={`flex items-center gap-1 px-3 py-1 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 ${disabledClasses}`}><PencilIcon className="w-3 h-3"/>{[FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status) ? 'تخصیص' : 'ویرایش'}</button>}
                                            {canPerformActions && (ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه' || ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند') && ann.destinations.length >= 1 && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('transfer', ann)} title="جابجایی مقصد" className={`p-1 bg-yellow-500 text-white rounded-md text-xs hover:bg-yellow-600 ${disabledClasses}`}><SwitchHorizontalIcon className="w-4 h-4"/></button>}
                                            {canPerformActions && <button disabled={!canForward} onClick={() => onForward(ann.id)} title="ارجاع به ترابری دیگر" className={`px-3 py-1 bg-purple-500 text-white rounded-md text-xs hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed`}>ارجاع</button>}
                                            {canPerformActions && ann.status !== FreightAnnouncementStatus.Cancelled && ann.status !== FreightAnnouncementStatus.Finalized && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => onCancel(ann.id)} title="لغو تخصیص (راننده و خودرو پاک می‌شود)" className={`px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 ${disabledClasses}`}>لغو</button>}
                                            {canPerformActions && <button disabled={isAssignedToOtherTransport} onClick={() => handleOpenDialog('change', ann)} title="درخواست تغییر/تقسیم" className={`px-3 py-1 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700 ${disabledClasses}`}>درخواست تغییر</button>}
                                            {onOpenHistory && <button onClick={() => onOpenHistory(ann.id, ann.announcementCode)} title="مشاهده تاریخچه تغییرات" className="flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-md text-xs hover:bg-sky-200"><HistoryIcon className="w-4 h-4"/><span>تاریخچه</span></button>}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
             {selectedAnnouncement && dialog === 'assign' && <AssignmentDialog announcement={selectedAnnouncement} drivers={drivers} vehicles={vehicles} personalDrivers={personalDrivers} personalVehicles={personalVehicles} onUpdateAssignment={onUpdateAssignment} currentUser={currentUser} onChangeRequest={onChangeRequest} onChangeVehicleType={onChangeVehicleType} onOpenHistory={onOpenHistory} onOpenAssignmentDialog={onOpenAssignmentDialog} activeLine={activeLine} setActiveLine={setActiveLine} finalizePermissions={finalizePermissions} onClose={handleCloseDialog} />}
             {selectedAnnouncement && dialog === 'transfer' && <DestinationTransferDialog allAnnouncements={liveAnnouncements} sourceAnnouncement={selectedAnnouncement} activeLine={activeLine} onClose={handleCloseDialog} onSave={props.onTransferDestination} />}
             {selectedAnnouncement && dialog === 'change' && <ChangeRequestDialog announcement={selectedAnnouncement} onClose={handleCloseDialog} onSubmit={props.onChangeRequest} />}
             {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.TransportLive} userRole={currentUser.role} />
                         <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
             )}
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; } .input-compact { display: block; width: 11rem; max-width: 100%; padding: 0.4rem 0.6rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-compact:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-compact-w36 { width: 9rem; } .input-compact-w32 { width: 8rem; } .input-compact-w28 { width: 7rem; } `}</style>
        </div>
    );
};

// --- Dialog Components ---
const AssignmentDialog: React.FC<Omit<TransportLiveProps, 'announcements' | 'onFinalize' | 'onTransferDestination' | 'onForward' | 'onCancel'> & { announcement: FreightAnnouncement, onClose: () => void }> =
(props) => {
    const { announcement, drivers, vehicles, personalDrivers, personalVehicles, onClose, onUpdateAssignment, currentUser, onChangeRequest, onChangeVehicleType } = props;
    
    // Helper function for vehicle identifier
    const getVehicleIdentifier = (id: string | undefined, vehicles: Vehicle[]) => {
        if (!id) return '-';
        const v = vehicles.find(v => v.id === id);
        if (!v) return 'نامشخص';
        
        const result = v.plateNumber ? formatPlateNumber(v.plateNumber) : v.serialNumber || 'نامشخص';
        return result;
    };

    // --- Company User State ---
    const [driverEmployeeId, setDriverEmployeeId] = useState('');
    const [foundCompanyDriver, setFoundCompanyDriver] = useState<Driver | null>(null);
    const [vehicleInternalId, setVehicleInternalId] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    
    // --- Personal User State ---
    const [nationalId, setNationalId] = useState('');
    const [foundPersonalDriver, setFoundPersonalDriver] = useState<any | null | 'not_found'>(null);
    const [personalDriverDetails, setPersonalDriverDetails] = useState({ name: '', mobile: '', driverSmartId: '' });
    const [personalVehicleDetails, setPersonalVehicleDetails] = useState({ type: '', plate: '', truckSmartId: '' });
    const [plateParts, setPlateParts] = useState<IranianPlateParts>({
        part1: '',
        letter: DEFAULT_PLATE_LETTER,
        part2: '',
        cityCode: '',
    });

    const isIceCreamAnnouncement =
        announcement.lineType === FreightLineType.IceCream ||
        announcement.lineType === 'IceCream' ||
        announcement.lineType === 'بستنی';

    const handlePlatePartsChange = (next: IranianPlateParts) => {
        setPlateParts(next);
        setPersonalVehicleDetails((s) => ({ ...s, plate: formatIranianPlateString(next) }));
    };
    const [foundPersonalVehicle, setFoundPersonalVehicle] = useState<any | null | 'not_found'>(null);
    const [personalFormMode, setPersonalFormMode] = useState<'simple' | 'detailed'>('simple');
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [costMode, setCostMode] = useState<'manual' | 'auto'>('auto'); // پیش‌فرض: خودکار
    const [autoTotalCost, setAutoTotalCost] = useState(''); // فقط string با فرمت (مثل "1,234,567")
    const [displayFreightCosts, setDisplayFreightCosts] = useState<{ [key: string]: string }>({});
    
    // States for search results
    const [searchDriverResults, setSearchDriverResults] = useState<any[]>([]);
    const [searchVehicleResults, setSearchVehicleResults] = useState<any[]>([]);
    const [showDriverDropdown, setShowDriverDropdown] = useState(false);
    const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
    
    // States for company driver search results
    const [searchCompanyDriverResults, setSearchCompanyDriverResults] = useState<any[]>([]);
    const [showCompanyDriverDropdown, setShowCompanyDriverDropdown] = useState(false);
    const [companyDriverSearching, setCompanyDriverSearching] = useState(false);
    
    // --- Common State ---
    const [blNumber, setBlNumber] = useState(announcement.billOfLadingNumber || '');
    const [notes, setNotes] = useState(announcement.notes || '');

    useEffect(() => {
        if (announcement.assignmentType === 'company') {
            const driver = drivers.find(d => d.id === announcement.assignedDriverId);
            const vehicle = vehicles.find(v => v.id === announcement.assignedVehicleId);
            if (driver) { setDriverEmployeeId(driver.employeeId); setFoundCompanyDriver(driver); }
            if (vehicle) { 
                // استفاده از vehicleCode اگر موجود باشد، وگرنه id
                setVehicleInternalId(vehicle.vehicleCode || vehicle.id); 
                setFoundVehicle(vehicle); 
            }
        } else if (announcement.assignmentType === 'personal') {
            const driver = personalDrivers.find(d => d.id === announcement.assignedDriverId);
            if(driver) {
                setNationalId(driver.nationalId);
                setFoundPersonalDriver(driver);
                setPersonalDriverDetails({ name: driver.name, mobile: driver.mobile, driverSmartId: driver.driverSmartId || '' });
                // پیش‌فرض ویرایش: فرم ساده (کاربر در صورت نیاز تفصیلی را انتخاب می‌کند)
                setPersonalFormMode('simple');
            } else if (announcement.vehicleType) {
                setPersonalVehicleDetails(s => ({
                    ...s,
                    type: s.type || announcement.vehicleType || '',
                }));
            }
            
            // Set vehicle details if assigned
            if (announcement.assignedVehicleId) {
                const vehicle = personalVehicles.find(v => v.id === announcement.assignedVehicleId);
                if(vehicle) {
                    setPersonalVehicleDetails({ 
                        truckSmartId: vehicle.truckSmartId,
                        type: vehicle.vehicleType, 
                        plate: `${vehicle.platePart1}${vehicle.plateLetter}${vehicle.platePart2}-${vehicle.plateCityCode}`
                    });
                    setPlateParts({
                        part1: vehicle.platePart1 || '',
                        letter: vehicle.plateLetter || 'ع',
                        part2: vehicle.platePart2 || '',
                        cityCode: vehicle.plateCityCode || ''
                    });
                    setFoundPersonalVehicle(vehicle);
                }
            }
        }
        const destsCopy = JSON.parse(JSON.stringify(announcement.destinations)); // Deep copy
        setDestinations(destsCopy);
        setBlNumber(announcement.billOfLadingNumber || '');
        setNotes(announcement.notes || '');
        
        // مقداردهی اولیه displayFreightCosts با فرمت (کاما مثل فیلد کرایه کل)
        const initialDisplayCosts: { [key: string]: string } = {};
        destsCopy.forEach((dest: any) => {
            if (dest.freightCost && dest.freightCost > 0) {
                const value = String(dest.freightCost);
                initialDisplayCosts[dest.id] = value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            }
        });
        setDisplayFreightCosts(initialDisplayCosts);
        
        // اگر تخصیص شخصی است، کرایه‌ها را مدیریت کن
        if (announcement.assignmentType === 'personal' && destsCopy.length > 0) {
            const existingTotalCost = destsCopy.reduce((sum: number, d: any) => sum + (Number(d.freightCost) || 0), 0);
            const totalTonnage = sumDestinationTonnageKg(destsCopy);
            
            if (existingTotalCost > 0) {
                // اگر کرایه قبلاً ثبت شده، از آن استفاده کن و حالت خودکار را فعال کن
                // فرمت با کاما (مثل فیلد ارزش بار)
                const formatted = existingTotalCost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                setAutoTotalCost(formatted);
                setCostMode('auto');
                // کرایه‌های مقاصد قبلاً در destsCopy هستند، نیازی به محاسبه مجدد نیست
            } else {
                // اگر کرایه ثبت نشده، هیچ مقدار پیش‌فرضی تنظیم نکن
                // کاربر باید خودش کرایه را وارد کند
                setCostMode('manual');
                setAutoTotalCost('');
                // همه کرایه‌ها را صفر کن
                const updatedDests = destsCopy.map((dest: any) => ({...dest, freightCost: 0}));
                setDestinations(updatedDests);
            }
        } else if (announcement.assignmentType !== 'personal') {
            // برای تخصیص شرکت، حالت دستی را فعال کن
            setCostMode('manual');
            setAutoTotalCost('');
        }
    }, [announcement, drivers, vehicles]);
    
    // محاسبه خودکار کرایه هر مقصد بر اساس کرایه کل و تناژ (در حالت auto)
    useEffect(() => {
        if(costMode === 'auto' && destinations.length > 0 && autoTotalCost) {
            // تبدیل autoTotalCost از string با کاما به number
            const cleanedCost = autoTotalCost.replace(/,/g, '');
            const totalCost = cleanedCost ? Number(cleanedCost) : 0;
            if(totalCost > 0) {
                const totalTonnage = sumDestinationTonnageKg(destinations);
                if(totalTonnage > 0) {
                    // محاسبه کرایه هر مقصد بر اساس نسبت تناژ
                    setDestinations(prevDests => {
                        // بررسی اینکه آیا کرایه‌ها قبلاً محاسبه شده‌اند یا نه (برای جلوگیری از حلقه)
                        const currentTotal = prevDests.reduce((sum, d) => sum + (Number(d.freightCost) || 0), 0);
                        const expectedTotal = totalCost;
                        // اگر تفاوت کمتر از 1 ریال است، نیازی به محاسبه مجدد نیست
                        if(Math.abs(currentTotal - expectedTotal) < 1) {
                            return prevDests;
                        }
                        
                        const updatedDests = prevDests.map(dest => {
                            const tonnageRatio = parseNumericField(dest.tonnage) / totalTonnage;
                            return {...dest, freightCost: Math.round(totalCost * tonnageRatio)};
                        });
                        
                        // به‌روزرسانی displayFreightCosts با فرمت کاما (مثل فیلد کرایه کل)
                        const newDisplayCosts: { [key: string]: string } = {};
                        updatedDests.forEach((dest: any) => {
                            if (dest.freightCost && dest.freightCost > 0) {
                                const value = String(dest.freightCost);
                                newDisplayCosts[dest.id] = value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                            } else {
                                newDisplayCosts[dest.id] = '';
                            }
                        });
                        setDisplayFreightCosts(newDisplayCosts);
                        return updatedDests;
                    });
                }
            }
        }
    }, [autoTotalCost, costMode]);

    // محاسبه مجموع کرایه‌های مقاصد (برای استفاده در حالت دستی)
    const manualTotalCost = useMemo(() => {
        if(costMode === 'manual' && destinations.length > 0) {
            return destinations.reduce((sum, d) => sum + (Number(d.freightCost) || 0), 0);
        }
        return 0;
    }, [destinations, costMode]);

    // به‌روزرسانی کرایه کل وقتی در حالت دستی کرایه‌های مقاصد تغییر می‌کنند
    useEffect(() => {
        if(costMode === 'manual' && destinations.length > 0) {
            if(manualTotalCost > 0) {
                // فرمت با کاما (مثل فیلد کرایه کل)
                const formatted = manualTotalCost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                // فقط اگر مقدار تغییر کرده باشد، به‌روزرسانی کن (برای جلوگیری از حلقه)
                const currentFormatted = autoTotalCost.replace(/,/g, '');
                if(currentFormatted !== manualTotalCost.toString()) {
                    setAutoTotalCost(formatted);
                }
            } else {
                setAutoTotalCost('');
            }
        }
    }, [manualTotalCost, costMode]);

    const handleCompanyDriverLookup = async () => {
        const query = driverEmployeeId.trim();
        if (query.length < 2) {
            alert('لطفاً حداقل 2 کاراکتر وارد کنید.');
            return;
        }
        
        setCompanyDriverSearching(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`dispatch/search/drivers?q=${encodeURIComponent(query)}`), {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (response.ok) {
                const drivers = await response.json();
                setSearchCompanyDriverResults(drivers);
                
                if (drivers.length === 0) {
                    setFoundCompanyDriver(null);
                    setShowCompanyDriverDropdown(false);
                    alert('راننده با این کد پرسنلی یا نام یافت نشد.');
                } else {
                    // همیشه dropdown نمایش بده تا کاربر انتخاب کند
                    setShowCompanyDriverDropdown(true);
                    setFoundCompanyDriver(null);
                }
            } else {
                setFoundCompanyDriver(null);
                setShowCompanyDriverDropdown(false);
                alert('خطا در جستجوی راننده.');
            }
        } catch (error) {
            console.error('Error searching company driver:', error);
            setFoundCompanyDriver(null);
            setShowCompanyDriverDropdown(false);
            alert('خطا در جستجوی راننده.');
        } finally {
            setCompanyDriverSearching(false);
        }
    };
    
    const handleCompanyDriverSelection = (driver: any) => {
        setDriverEmployeeId(driver.employeeId || driver.name || '');
        setFoundCompanyDriver(driver);
        setShowCompanyDriverDropdown(false);
        setSearchCompanyDriverResults([]);
    };

    const handleVehicleLookup = () => {
        // Search by vehicleCode first, then by id
        const vehicle = vehicles.find(v => 
            (v.vehicleCode && v.vehicleCode.toLowerCase() === vehicleInternalId.toLowerCase()) ||
            v.id.toLowerCase() === vehicleInternalId.toLowerCase()
        );
        setFoundVehicle(vehicle || null);
        if (!vehicle) alert('خودرو با این کد یافت نشد.');
    };
    
    const handlePersonalDriverLookup = async () => {
        try {
            const token = localStorage.getItem('token');
            // console.log('🔍 [handlePersonalDriverLookup] Token:', token ? 'exists' : 'missing');
            // console.log('🔍 [handlePersonalDriverLookup] Searching for nationalId:', nationalId);
            
            const response = await fetch(getApiUrl(`personal-drivers/search?query=${nationalId}`), {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            // console.log('🔍 [handlePersonalDriverLookup] Response status:', response.status);
            
            if (response.ok) {
                const drivers = await response.json();
                // console.log('🔍 [handlePersonalDriverLookup] Found drivers:', drivers);
                setSearchDriverResults(drivers);
                
                if (drivers.length === 0) {
                    // console.log('🔍 [handlePersonalDriverLookup] No drivers found');
            setFoundPersonalDriver('not_found');
                    setPersonalDriverDetails({ name: '', mobile: '', driverSmartId: '' });
                    setPersonalVehicleDetails({ type: '', plate: '', truckSmartId: '' });
                    setShowDriverDropdown(false);
            alert('راننده با این کدملی یافت نشد. لطفاً اطلاعات راننده جدید را وارد نمایید.');
                } else {
                    // همیشه dropdown نمایش بده تا کاربر انتخاب کند
                    // console.log('🔍 [handlePersonalDriverLookup] Drivers found, showing dropdown');
                    setShowDriverDropdown(true);
                    setFoundPersonalDriver(null);
                }
            } else {
                setFoundPersonalDriver('not_found');
                setPersonalDriverDetails({ name: '', mobile: '', driverSmartId: '' });
                setPersonalVehicleDetails({ type: '', plate: '', truckSmartId: '' });
                setShowDriverDropdown(false);
                alert('خطا در جستجوی راننده.');
            }
        } catch (error) {
            console.error('Error searching personal driver:', error);
            setFoundPersonalDriver('not_found');
            setPersonalDriverDetails({ name: '', mobile: '', driverSmartId: '' });
            setPersonalVehicleDetails({ type: '', plate: '', truckSmartId: '' });
            setShowDriverDropdown(false);
            alert('خطا در جستجوی راننده.');
        }
    };

    const handleDriverSelection = (driver: any) => {
        // console.log('🔍 [handleDriverSelection] Selected driver:', driver);
        setNationalId(driver.nationalId); // Update nationalId with the selected driver's actual national ID
        setFoundPersonalDriver(driver);
        setPersonalDriverDetails({ 
            name: driver.name, 
            mobile: driver.mobile || '', // اگر خالی بود، فیلد editable می‌شود
            driverSmartId: driver.driverSmartId || '' // اگر خالی بود، فیلد editable می‌شود
        });
        setShowDriverDropdown(false);
    };

    const handleVehicleSelection = (vehicle: any) => {
        // console.log('🔍 [handleVehicleSelection] Selected vehicle:', vehicle);
        setPersonalVehicleDetails(prev => ({
            ...prev,
            truckSmartId: vehicle.truckSmartId,
            type: vehicle.vehicleType,
            plate: `${vehicle.platePart1}${vehicle.plateLetter}${vehicle.platePart2}-${vehicle.plateCityCode}`
        }));
        setPlateParts({
            part1: vehicle.platePart1 || '',
            letter: vehicle.plateLetter || 'ع',
            part2: vehicle.platePart2 || '',
            cityCode: vehicle.plateCityCode || ''
        });
        setFoundPersonalVehicle(vehicle);
        setShowVehicleDropdown(false);
    };

    const handlePersonalVehicleLookup = async () => {
        try {
            const token = localStorage.getItem('token');
            // console.log('🔍 [handlePersonalVehicleLookup] Token:', token ? 'exists' : 'missing');
            // console.log('🔍 [handlePersonalVehicleLookup] Searching for truckSmartId:', personalVehicleDetails.truckSmartId);
            
            const response = await fetch(getApiUrl(`personal-vehicles/search?query=${personalVehicleDetails.truckSmartId}`), {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            // console.log('🔍 [handlePersonalVehicleLookup] Response status:', response.status);
            
            if (response.ok) {
                const vehicles = await response.json();
                // console.log('🔍 [handlePersonalVehicleLookup] Found vehicles:', vehicles);
                setSearchVehicleResults(vehicles);
                
                if (vehicles.length === 0) {
                    // console.log('🔍 [handlePersonalVehicleLookup] No vehicles found');
                    setFoundPersonalVehicle('not_found');
                    setPersonalVehicleDetails(prev => ({ ...prev, type: '', plate: '' }));
                    setShowVehicleDropdown(false);
                    alert('خودرو با این هوشمند کامیون یافت نشد. لطفاً اطلاعات خودرو جدید را وارد نمایید.');
                } else if (vehicles.length === 1) {
                    // اگر فقط یک نتیجه باشد، مستقیماً انتخاب کن
                    const vehicle = vehicles[0];
                    // console.log('🔍 [handlePersonalVehicleLookup] Auto-selecting single vehicle:', vehicle);
                    setFoundPersonalVehicle(vehicle);
                    setPersonalVehicleDetails(prev => ({
                        ...prev,
                        type: vehicle.vehicleType,
                        plate: `${vehicle.platePart1}${vehicle.plateLetter}${vehicle.platePart2}-${vehicle.plateCityCode}`
                    }));
                    setShowVehicleDropdown(false);
                } else {
                    // اگر چندین نتیجه باشد، dropdown نمایش بده
                    // console.log('🔍 [handlePersonalVehicleLookup] Multiple vehicles found, showing dropdown');
                    setShowVehicleDropdown(true);
                    setFoundPersonalVehicle(null);
                }
            } else {
                setFoundPersonalVehicle('not_found');
                setPersonalVehicleDetails(prev => ({ ...prev, type: '', plate: '' }));
                alert('خطا در جستجوی خودرو.');
            }
        } catch (error) {
            console.error('Error searching personal vehicle:', error);
            alert('خطا در جستجوی خودرو.');
        }
    };
    
    const totalPersonalCost = useMemo(() => {
        const total = destinations.reduce((sum, d) => {
            const cost = typeof d.freightCost === 'string' ? Number(d.freightCost) : (d.freightCost || 0);
            return sum + cost;
        }, 0);
        return total;
    }, [destinations]);

    const handleSave = async () => {
        if (currentUser.role === UserRole.TransportationUser) {
            if (!foundCompanyDriver || !foundVehicle) { alert('لطفا راننده و خودروی شرکتی را با جستجو مشخص کنید.'); return; }
            const vehicleCheck = checkVehicleMatchesAnnouncement(announcement.vehicleType, foundVehicle as any);
            if (!vehicleCheck.ok) {
                alert(vehicleCheck.message);
                return;
            }
            const bl = blNumber.trim();
            // برای کاربر ترابری شرکت، کرایه وجود ندارد (null)
            onUpdateAssignment(announcement.id, {
                driverId: foundCompanyDriver.id, 
                vehicleId: foundVehicle.id, 
                billOfLadingNumber: bl || undefined, 
                assignmentType: 'company',
                totalFreightCost: null, // برای شرکت کرایه نداریم - null می‌فرستیم تا backend آن را ignore کند
                destinations: destinations.length > 0 ? destinations : undefined,
                notes: notes,
                assignedDriverName: foundCompanyDriver.name,
                assignedDriverContact: foundCompanyDriver.mobile,
                assignedVehiclePlate: formatCompanyVehiclePlate(foundVehicle),
            });
        } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
            if (!personalDriverDetails.name?.trim() || !personalDriverDetails.mobile?.trim() || !personalVehicleDetails.type?.trim()) {
                alert('نام راننده، شماره تماس و نوع خودرو الزامی است.');
                return;
            }
            if (personalFormMode === 'detailed') {
                if (!nationalId?.trim() || !personalDriverDetails.driverSmartId?.trim() || !personalVehicleDetails.truckSmartId?.trim()) {
                    alert('در فرم تفصیلی، کد ملی، هوشمند راننده و هوشمند کامیون الزامی است.');
                    return;
                }
            }
            
            // اگر راننده پیدا شده بود و موبایل یا کد هوشمند تغییر کرده، در دیتابیس به‌روزرسانی کن (فقط فرم تفصیلی)
            if (
                personalFormMode === 'detailed' &&
                foundPersonalDriver && foundPersonalDriver.id && typeof foundPersonalDriver === 'object' && foundPersonalDriver !== 'not_found'
            ) {
                const originalDriver = foundPersonalDriver;
                const mobileChanged = originalDriver.mobile !== personalDriverDetails.mobile;
                const driverSmartIdChanged = originalDriver.driverSmartId !== personalDriverDetails.driverSmartId;
                
                if (mobileChanged || driverSmartIdChanged) {
                    try {
                        const token = localStorage.getItem('token');
                        const updateResponse = await fetch(getApiUrl(`personal-drivers/${foundPersonalDriver.id}`), {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                mobile: personalDriverDetails.mobile,
                                driverSmartId: personalDriverDetails.driverSmartId
                            })
                        });
                        
                        if (!updateResponse.ok) {
                            const errorData = await updateResponse.json();
                            alert(`خطا در به‌روزرسانی اطلاعات راننده: ${errorData.message || 'خطای نامشخص'}`);
                            return;
                        }
                    } catch (error) {
                        console.error('Error updating personal driver:', error);
                        alert('خطا در به‌روزرسانی اطلاعات راننده');
                        return;
                    }
                }
            }
            
            // Format plate number for backend (ensure Iranian format)
            // Build plate from parts: 12ع345-67 (two digits, Persian letter, three digits, dash, two digits)
            const formattedPlate = formatIranianPlateString(plateParts);
            
            // Validate plate format: must match Iranian plate format (12ع345-67)
            if (!plateParts.part1 || plateParts.part1.length !== 2 || 
                !plateParts.letter || 
                !plateParts.part2 || plateParts.part2.length !== 3 || 
                !plateParts.cityCode || plateParts.cityCode.length !== 2) {
                alert('لطفاً تمام قسمت‌های پلاک خودرو را به درستی وارد کنید (دو رقم - حرف - سه رقم - دو رقم)');
                return;
            }
            
            // محاسبه totalFreightCost برای personal user
            let personalTotalCost = 0;
            if (costMode === 'auto' && autoTotalCost) {
                // تبدیل string به number - حذف کاماها (مثل فیلد ارزش بار)
                const cleanedCost = autoTotalCost.replace(/,/g, '');
                personalTotalCost = cleanedCost ? Number(cleanedCost) : 0;
            } else {
                personalTotalCost = totalPersonalCost;
            }
            
            if (personalTotalCost <= 0) {
                alert('لطفاً کرایه را وارد کنید.');
                return;
            }
            onUpdateAssignment(announcement.id, {
                driverId: foundPersonalDriver?.id,
                vehicleId: foundPersonalVehicle?.id,
                assignmentFormMode: personalFormMode,
                nationalId: personalFormMode === 'detailed' ? nationalId : undefined,
                driverName: personalDriverDetails.name.trim(),
                driverContact: personalDriverDetails.mobile.trim(),
                driverSmartId: personalFormMode === 'detailed' ? personalDriverDetails.driverSmartId : undefined,
                vehicleType: personalVehicleDetails.type.trim(),
                vehiclePlate: formattedPlate,
                truckSmartId: personalFormMode === 'detailed' ? personalVehicleDetails.truckSmartId : undefined,
                destinations,
                totalFreightCost: personalTotalCost,
                billOfLadingNumber: blNumber,
                assignmentType: 'personal',
                notes: notes,
                assignedDriverName: personalDriverDetails.name.trim(),
                assignedDriverContact: personalDriverDetails.mobile.trim(),
                assignedVehiclePlate: formattedPlate,
            });
        }
        onClose();
    };

    const isCompanyUser = currentUser.role === UserRole.TransportationUser;
    const isPersonalUser = currentUser.role === UserRole.Transportation_Personal_Vehicle_User;
    
    const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-bold">تخصیص به اعلام بار #{announcement.announcementCode}</h3>
                    <button 
                        onClick={() => setIsRulesDialogOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm hover:bg-blue-100 transition-colors"
                    >
                        <BookOpenIcon className="w-5 h-5" />
                        <span>قوانین تخصیص</span>
                    </button>
                </div>
                
                {/* دیالوگ قوانین */}
                {isRulesDialogOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[60] p-4" onClick={() => setIsRulesDialogOpen(false)}>
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BookOpenIcon className="w-5 h-5 text-blue-600" />
                                    <h4 className="text-lg font-bold text-blue-800">قوانین تخصیص</h4>
                                </div>
                                <button 
                                    onClick={() => setIsRulesDialogOpen(false)}
                                    className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="p-6 space-y-4 text-sm text-slate-700">
                                {isCompanyUser ? (
                                    <>
                                        <div>
                                            <strong className="text-slate-800">فیلدهای اجباری:</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>راننده شرکتی: باید از طریق جستجو انتخاب شود</li>
                                                <li>خودرو شرکتی: باید از طریق جستجو انتخاب شود</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <strong className="text-slate-800">فیلدهای اختیاری:</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>شماره بارنامه</li>
                                                <li>توضیحات</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <strong className="text-slate-800">نکات مهم:</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>برای بارهای شرکت، کرایه ثبت نمی‌شود (محاسبه توسط سیستم انجام می‌شود)</li>
                                                <li>پس از ذخیره، تخصیص به‌صورت خودکار در سیستم ثبت می‌شود</li>
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <strong className="text-slate-800">فرم ساده (پیش‌فرض):</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>نام و نام خانوادگی، شماره تماس، نوع خودرو، پلاک</li>
                                                <li>کرایه (اجباری) — شماره بارنامه و توضیحات اختیاری</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <strong className="text-slate-800">فرم تفصیلی:</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>همه فیلدهای فرم ساده به‌علاوه کد ملی، هوشمند راننده و هوشمند کامیون</li>
                                                <li>جستجو بر اساس کد ملی / هوشمند و نمایش وضعیت راننده/خودرو در سیستم</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <strong className="text-slate-800">نکات مهم:</strong>
                                            <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                                <li>در فرم ساده، در صورت تکراری بودن موبایل یا پلاک، رکورد موجود به‌روزرسانی می‌شود</li>
                                                <li>کرایه می‌تواند «خودکار» (یک مبلغ کل) یا «دستی» (برای هر مقصد) باشد</li>
                                            </ul>
                                        </div>
                                    </>
                                )}
                                <div className="pt-3 border-t border-blue-200">
                                    <strong className="text-slate-800">قوانین اتمام تخصیص:</strong>
                                    <ul className="list-disc list-inside mr-4 mt-2 space-y-1">
                                        <li>عمل می‌کند: پس از تخصیص موفق همه بارها، می‌توانید با انتخاب چندین بار از دکمه «اتمام تخصیص» استفاده کنید</li>
                                        <li>عمل نمی‌کند: در صورت عدم تخصیص کامل یا وجود خطا در اطلاعات وارد شده</li>
                                        <li>پس از اتمام تخصیص، بارها به مرحله «در حال حمل» منتقل می‌شوند</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t flex justify-end">
                                <button 
                                    onClick={() => setIsRulesDialogOpen(false)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                                >
                                    بستن
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {isCompanyUser && (
                    <div className="p-6 space-y-4">
                        <div className="p-2 border rounded-md bg-slate-50 relative">
                            <label className="text-sm font-medium">راننده شرکتی*</label>
                            <div className="flex items-end gap-2 mt-1">
                                <input 
                                    placeholder="کد پرسنلی یا نام راننده..." 
                                    value={driverEmployeeId} 
                                    onChange={e => {
                                        setDriverEmployeeId(e.target.value);
                                        if (e.target.value !== driverEmployeeId) {
                                            setFoundCompanyDriver(null);
                                            setShowCompanyDriverDropdown(false);
                                        }
                                    }}
                                    className="input-style flex-grow"
                                />
                                <button 
                                    onClick={handleCompanyDriverLookup} 
                                    disabled={companyDriverSearching}
                                    className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 disabled:opacity-60"
                                >
                                    {companyDriverSearching ? 'در حال جستجو...' : 'جستجو'}
                                </button>
                            </div>
                            
                            {/* Dropdown for multiple driver results */}
                            {showCompanyDriverDropdown && searchCompanyDriverResults.length > 0 && (
                                <div className="mt-2 p-3 border rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto absolute z-10 w-full">
                                    <div className="text-sm font-medium text-gray-700 mb-2">
                                        {searchCompanyDriverResults.length} راننده یافت شد. یکی را انتخاب کنید:
                                    </div>
                                    {searchCompanyDriverResults.map((driver) => (
                                        <div 
                                            key={driver.id}
                                            onClick={() => handleCompanyDriverSelection(driver)}
                                            className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="font-medium text-gray-900">{driver.name || 'راننده'}</div>
                                            <div className="text-sm text-gray-600">
                                                {driver.employeeId ? `کد پرسنلی: ${driver.employeeId}` : ''}
                                                {driver.employeeId && driver.mobile ? ' | ' : ''}
                                                {driver.mobile ? `تماس: ${driver.mobile}` : ''}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {foundCompanyDriver && (
                                <div className="mt-2 p-2 bg-green-50 text-green-800 text-sm rounded">
                                    <strong>راننده:</strong> {foundCompanyDriver.name} | <strong>تماس:</strong> {foundCompanyDriver.mobile || 'ندارد'}
                                </div>
                            )}
                        </div>
                        <div className="p-2 border rounded-md bg-slate-50">
                            <label className="text-sm font-medium">خودرو شرکتی*</label>
                            <div className="flex items-end gap-2 mt-1">
                                <input placeholder="کد خودرو یا شناسه خودرو..." value={vehicleInternalId} onChange={e => setVehicleInternalId(e.target.value)} className="input-style flex-grow"/>
                                <button onClick={handleVehicleLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundVehicle && (() => {
                                const opType = getVehicleOperationalType(foundVehicle as any);
                                const compat = checkVehicleMatchesAnnouncement(announcement.vehicleType, foundVehicle as any);
                                return (
                                    <div className={`mt-2 p-2 text-sm rounded ${compat.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                                        <strong>خودرو:</strong> {getVehicleIdentifier(foundVehicle.id, vehicles)} | <strong>کد:</strong> {foundVehicle.vehicleCode || 'ندارد'} | <strong>نوع عملیاتی:</strong> {opType || foundVehicle.type || 'نامشخص'}
                                        {!compat.ok && <p className="mt-1 text-xs font-medium">{compat.message}</p>}
                                    </div>
                                );
                            })()}
                        </div>
                        {/* برای کاربر ترابری شرکت، فیلد کرایه نمایش داده نمی‌شود */}
                         <div><label className="text-sm">شماره بارنامه</label><input value={blNumber} onChange={e => setBlNumber(e.target.value)} className="input-style mt-1" /></div>
                         <div><label className="text-sm">توضیحات</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-style mt-1 min-h-[80px]" placeholder="توضیحات اختیاری..." /></div>
                    </div>
                )}

                {isPersonalUser && (
                     <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
                            <span className="text-sm font-semibold text-slate-700">نوع فرم:</span>
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name="personalFormMode"
                                    checked={personalFormMode === 'simple'}
                                    onChange={() => setPersonalFormMode('simple')}
                                />
                                فرم ساده
                            </label>
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name="personalFormMode"
                                    checked={personalFormMode === 'detailed'}
                                    onChange={() => setPersonalFormMode('detailed')}
                                />
                                فرم تفصیلی
                            </label>
                        </div>
                        <fieldset className="p-3 border rounded-lg bg-slate-50 space-y-2">
                             <legend className="font-semibold px-1 text-sm">۱. اطلاعات راننده و خودرو</legend>
                             {personalFormMode === 'detailed' && (
                             <>
                             <div className="flex items-end gap-2">
                                <div className="flex-grow"><label className="text-xs">کد ملی راننده*</label><input placeholder="کدملی..." value={nationalId} onChange={e => {setNationalId(e.target.value); if(e.target.value !== nationalId) {setFoundPersonalDriver(null); setShowDriverDropdown(false);}}} className="input-style"/></div>
                                <button onClick={handlePersonalDriverLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            
                            {/* Dropdown for multiple driver results */}
                            {showDriverDropdown && searchDriverResults.length > 0 && (
                                <div className="mt-2 p-3 border rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
                                    <div className="text-sm font-medium text-gray-700 mb-2">
                                        {searchDriverResults.length} راننده یافت شد. یکی را انتخاب کنید:
                                    </div>
                                    {searchDriverResults.map((driver, index) => (
                                        <div 
                                            key={driver.id}
                                            onClick={() => handleDriverSelection(driver)}
                                            className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="font-medium text-gray-900">{driver.name}</div>
                                            <div className="text-sm text-gray-600">
                                                کد ملی: {driver.nationalId} | تماس: {driver.mobile} | هوشمند: {driver.driverSmartId}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Status and Info Box for Driver */}
                            {foundPersonalDriver && (
                                <div className="mt-2 space-y-2">
                                    {foundPersonalDriver === 'not_found' ? (
                                        <div className="p-3 border-2 border-blue-300 rounded-lg bg-blue-50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">🆕</span>
                                                <span className="font-semibold text-blue-900">وضعیت: راننده جدید</span>
                                            </div>
                                            <div className="text-sm text-blue-800 space-y-1">
                                                <div className="font-medium">📋 اطلاعات راننده (الزامی):</div>
                                                <div className="text-xs mt-1">💡 توجه: پس از ذخیره، راننده جدید به‌صورت خودکار در سیستم ثبت می‌شود.</div>
                                            </div>
                                        </div>
                                    ) : typeof foundPersonalDriver === 'object' && foundPersonalDriver !== null ? (
                                        (() => {
                                            const hasName = foundPersonalDriver.name && foundPersonalDriver.name.trim() !== '';
                                            const hasMobile = foundPersonalDriver.mobile && foundPersonalDriver.mobile.trim() !== '';
                                            const hasSmartId = foundPersonalDriver.driverSmartId && foundPersonalDriver.driverSmartId.trim() !== '';
                                            const isComplete = hasName && hasMobile && hasSmartId;
                                            
                                            return isComplete ? (
                                                <div className="p-3 border-2 border-green-300 rounded-lg bg-green-50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">✅</span>
                                                        <span className="font-semibold text-green-900">وضعیت: راننده موجود (کامل)</span>
                                                    </div>
                                                    <div className="text-sm text-green-800 space-y-1">
                                                        <div className="font-medium">📊 اطلاعات راننده:</div>
                                                        <div className="text-xs space-y-0.5">
                                                            <div>• نام: {foundPersonalDriver.name}</div>
                                                            <div>• موبایل: {foundPersonalDriver.mobile}</div>
                                                            <div>• هوشمند: {foundPersonalDriver.driverSmartId}</div>
                                                        </div>
                                                        <div className="text-xs mt-2 text-green-700">💡 اطلاعات کامل است. می‌توانید اطلاعات را ویرایش کنید یا برای ادامه به قسمت خودرو بروید.</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-3 border-2 border-amber-300 rounded-lg bg-amber-50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">✅</span>
                                                        <span className="font-semibold text-amber-900">وضعیت: راننده موجود (اطلاعات ناقص)</span>
                                                    </div>
                                                    <div className="text-sm text-amber-800 space-y-1">
                                                        <div className="font-medium">📊 اطلاعات موجود:</div>
                                                        <div className="text-xs space-y-0.5">
                                                            <div>• نام: {hasName ? foundPersonalDriver.name : '❌ ندارد'}</div>
                                                            <div>• موبایل: {hasMobile ? foundPersonalDriver.mobile : '❌ ندارد'}</div>
                                                            <div>• هوشمند: {hasSmartId ? foundPersonalDriver.driverSmartId : '❌ ندارد'}</div>
                                                        </div>
                                                        <div className="font-medium mt-2">📝 تکمیل/ویرایش اطلاعات:</div>
                                                        <div className="text-xs mt-1 text-amber-700">💡 توجه: پس از ذخیره، اطلاعات راننده به‌روزرسانی می‌شود.</div>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    ) : null}
                                </div>
                            )}
                            </>
                            )}
                            {personalFormMode === 'simple' && (
                                <p className="text-xs text-slate-600 pb-1">
                                    ثبت سریع: نام، تماس، نوع خودرو و پلاک کافی است. کد ملی و کدهای هوشمند در پس‌زمینه ساخته می‌شوند.
                                </p>
                            )}
                            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 pt-2">
                                <div className="w-fit max-w-full">
                                    <label className="text-xs block mb-0.5">نام و نام خانوادگی*</label>
                                    <input
                                        value={personalDriverDetails.name || ''}
                                        onChange={(e) => setPersonalDriverDetails((s) => ({ ...s, name: e.target.value }))}
                                        className="input-compact"
                                    />
                                </div>
                                <div className="w-fit max-w-full">
                                    <label className="text-xs block mb-0.5">شماره تماس*</label>
                                    <input
                                        value={personalDriverDetails.mobile || ''}
                                        onChange={(e) => setPersonalDriverDetails((s) => ({ ...s, mobile: e.target.value }))}
                                        className="input-compact input-compact-w36"
                                        dir="ltr"
                                    />
                                </div>
                                {personalFormMode === 'detailed' && (
                                    <div className="w-fit max-w-full">
                                        <label className="text-xs block mb-0.5">هوشمند راننده*</label>
                                        <input
                                            placeholder="DRV001"
                                            value={personalDriverDetails.driverSmartId || ''}
                                            onChange={(e) => setPersonalDriverDetails((s) => ({ ...s, driverSmartId: e.target.value }))}
                                            className="input-compact input-compact-w32"
                                            dir="ltr"
                                        />
                                    </div>
                                )}
                            </div>
                            {personalFormMode === 'detailed' && (
                            <div className="flex flex-wrap items-end gap-2 mt-3">
                                <div className="w-fit max-w-full">
                                    <label className="text-xs block mb-0.5">هوشمند کامیون*</label>
                                    <input
                                        placeholder="TRK001"
                                        value={personalVehicleDetails.truckSmartId}
                                        onChange={(e) => setPersonalVehicleDetails((s) => ({ ...s, truckSmartId: e.target.value }))}
                                        className="input-compact input-compact-w36"
                                        dir="ltr"
                                    />
                                </div>
                                <button onClick={handlePersonalVehicleLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 shrink-0">جستجو</button>
                            </div>
                            )}
                            
                            {personalFormMode === 'detailed' && (
                            <>
                            {/* Dropdown for multiple vehicle results */}
                            {showVehicleDropdown && searchVehicleResults.length > 0 && (
                                <div className="mt-2 p-3 border rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
                                    <div className="text-sm font-medium text-gray-700 mb-2">
                                        {searchVehicleResults.length} خودرو یافت شد. یکی را انتخاب کنید:
                                    </div>
                                    {searchVehicleResults.map((vehicle, index) => (
                                        <div 
                                            key={vehicle.id}
                                            onClick={() => handleVehicleSelection(vehicle)}
                                            className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="font-medium text-gray-900">{vehicle.vehicleType}</div>
                                            <div className="text-sm text-gray-600">
                                                هوشمند: {vehicle.truckSmartId} | پلاک: {vehicle.platePart1} {vehicle.plateLetter} {vehicle.platePart2} - {vehicle.plateCityCode}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Status and Info Box for Vehicle */}
                            {foundPersonalVehicle && (
                                <div className="mt-2 space-y-2">
                                    {foundPersonalVehicle === 'not_found' ? (
                                        <div className="p-3 border-2 border-blue-300 rounded-lg bg-blue-50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">🆕</span>
                                                <span className="font-semibold text-blue-900">وضعیت: خودرو جدید</span>
                                            </div>
                                            <div className="text-sm text-blue-800 space-y-1">
                                                <div className="font-medium">📋 اطلاعات خودرو (الزامی):</div>
                                                <div className="text-xs mt-1">💡 توجه: پس از ذخیره، خودرو جدید به‌صورت خودکار در سیستم ثبت می‌شود.</div>
                                            </div>
                                        </div>
                                    ) : typeof foundPersonalVehicle === 'object' && foundPersonalVehicle !== null ? (
                                        (() => {
                                            const vehicleType = foundPersonalVehicle.vehicleType || '';
                                            const platePart1 = foundPersonalVehicle.platePart1 || '';
                                            const plateLetter = foundPersonalVehicle.plateLetter || '';
                                            const platePart2 = foundPersonalVehicle.platePart2 || '';
                                            const plateCityCode = foundPersonalVehicle.plateCityCode || '';
                                            const hasType = vehicleType && vehicleType.trim() !== '';
                                            const hasPlate = platePart1 && plateLetter && platePart2 && plateCityCode;
                                            const isComplete = hasType && hasPlate;
                                            const formattedPlate = hasPlate ? `${platePart1}${plateLetter}${platePart2}-${plateCityCode}` : '';
                                            
                                            return isComplete ? (
                                                <div className="p-3 border-2 border-green-300 rounded-lg bg-green-50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">✅</span>
                                                        <span className="font-semibold text-green-900">وضعیت: خودرو موجود (کامل)</span>
                                                    </div>
                                                    <div className="text-sm text-green-800 space-y-1">
                                                        <div className="font-medium">📊 اطلاعات خودرو:</div>
                                                        <div className="text-xs space-y-0.5">
                                                            <div>• نوع خودرو: {vehicleType}</div>
                                                            <div>• پلاک: {formattedPlate}</div>
                                                        </div>
                                                        <div className="text-xs mt-2 text-green-700">💡 اطلاعات کامل است. می‌توانید اطلاعات را ویرایش کنید یا برای ادامه به قسمت کرایه بروید.</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-3 border-2 border-amber-300 rounded-lg bg-amber-50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">✅</span>
                                                        <span className="font-semibold text-amber-900">وضعیت: خودرو موجود (اطلاعات ناقص)</span>
                                                    </div>
                                                    <div className="text-sm text-amber-800 space-y-1">
                                                        <div className="font-medium">📊 اطلاعات موجود:</div>
                                                        <div className="text-xs space-y-0.5">
                                                            <div>• نوع خودرو: {hasType ? vehicleType : '❌ ندارد'}</div>
                                                            <div>• پلاک: {hasPlate ? formattedPlate : '❌ ندارد'}</div>
                                                        </div>
                                                        <div className="font-medium mt-2">📝 تکمیل/ویرایش اطلاعات:</div>
                                                        <div className="text-xs mt-1 text-amber-700">💡 توجه: پس از ذخیره، اطلاعات خودرو به‌روزرسانی می‌شود.</div>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    ) : null}
                                </div>
                            )}
                            </>
                            )}
                            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 pt-1">
                                <div className="w-fit max-w-full">
                                    <label className="text-xs block mb-0.5">نوع خودرو*</label>
                                    <input
                                        type="text"
                                        value={personalVehicleDetails.type}
                                        onChange={(e) => setPersonalVehicleDetails((s) => ({ ...s, type: e.target.value }))}
                                        className="input-compact input-compact-w28"
                                        autoComplete="off"
                                        placeholder={announcement.vehicleType || ''}
                                    />
                                </div>
                                <div className="w-fit max-w-full">
                                    <label className="text-xs block mb-0.5">شماره پلاک*</label>
                                    <IranianPlateInput value={plateParts} onChange={handlePlatePartsChange} />
                                </div>
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-slate-50 space-y-2">
                            <legend className="font-semibold px-1 text-sm">۲. تخصیص کرایه</legend>
                            <div className="flex items-center gap-4"><label><input type="radio" value="manual" checked={costMode==='manual'} onChange={e=>setCostMode(e.target.value as any)}/> دستی</label><label><input type="radio" value="auto" checked={costMode==='auto'} onChange={e=>setCostMode(e.target.value as any)}/> خودکار</label></div>
                            {costMode === 'auto' && <div className="flex items-center gap-2"><label className="text-sm">کرایه کل (ریال):</label><input 
                                type="text" 
                                value={autoTotalCost || ''}
                                onChange={e => {
                                    // فقط اعداد و کاما را بپذیر (مثل فیلد ارزش بار)
                                    let value = e.target.value.replace(/[^\d,]/g, '');
                                    // حذف کاماها برای محاسبه
                                    const numValue = value.replace(/,/g, '');
                                    // اگر خالی است، مقدار خالی بگذار
                                    if (numValue === '') {
                                        setAutoTotalCost('');
                                        return;
                                    }
                                    // اگر عدد معتبر است، فرمت سه رقم سه رقم اعمال کن
                                    if (/^\d+$/.test(numValue)) {
                                        const formatted = numValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                        setAutoTotalCost(formatted);
                                    }
                                }}
                                onKeyPress={e => {
                                    // فقط اعداد را بپذیر
                                    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                                        e.preventDefault();
                                    }
                                }}
                                className="input-style flex-grow" 
                                autoComplete="off" 
                                dir="ltr"
                                placeholder="1,000,000"
                            /></div>}
                            <div className="space-y-2">
                                {destinations.map((dest, i) => (
                                    <div key={dest.id} className="grid grid-cols-5 gap-2 items-center text-sm p-1">
                                        <div className="col-span-2">
                                            <strong>مقصد {i + 1}:</strong> {dest.city}{' '}
                                            (
                                            {isIceCreamAnnouncement
                                                ? `${announcement.cartonCount != null ? Number(announcement.cartonCount).toLocaleString('fa-IR') : '-'} کارتن`
                                                : `${dest.tonnage ? formatTonnageKg(parseNumericField(dest.tonnage)) : 0} کیلوگرم`}
                                            )
                                        </div>
                                        <div className="col-span-3 flex items-center gap-2"><label>کرایه:</label><input 
                                            type="text" 
                                            value={(() => {
                                                // اگر displayFreightCosts مقدار دارد (یعنی در حال تایپ یا focus شده)، همان را نشان بده
                                                if (displayFreightCosts[dest.id] !== undefined) {
                                                    return displayFreightCosts[dest.id];
                                                }
                                                // در غیر این صورت، مقدار از destinations را بگیر
                                                const currentDest = destinations.find(d => d.id === dest.id);
                                                if (currentDest?.freightCost && currentDest.freightCost > 0) {
                                                    // فرمت با کاما (مثل فیلد کرایه کل)
                                                    const value = String(currentDest.freightCost);
                                                    if (/^\d+$/.test(value)) {
                                                        return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                                    }
                                                    return value;
                                                }
                                                return '';
                                            })()} 
                                            onChange={e => {
                                                // فقط اعداد و کاما را بپذیر (مثل فیلد کرایه کل)
                                                let value = e.target.value.replace(/[^\d,]/g, '');
                                                const numValue = value.replace(/,/g, '');
                                                if (numValue === '') {
                                                    setDestinations(dests => dests.map(d => d.id === dest.id ? {...d, freightCost: 0}: d));
                                                    setDisplayFreightCosts(prev => ({ ...prev, [dest.id]: '' }));
                                                    return;
                                                }
                                                if (/^\d+$/.test(numValue)) {
                                                    const num = Number(numValue);
                                                    setDestinations(dests => dests.map(d => d.id === dest.id ? {...d, freightCost: num}: d));
                                                    const formatted = numValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                                    setDisplayFreightCosts(prev => ({ ...prev, [dest.id]: formatted }));
                                                }
                                            }}
                                            onKeyPress={e => {
                                                if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                                                    e.preventDefault();
                                                }
                                            }} 
                                            className="input-style" 
                                            autoComplete="off" 
                                            dir="ltr" 
                                        /><span className="text-xs">ریال</span></div>
                                    </div>
                                ))}
                            </div>
                             <div className="text-right font-bold pt-2 border-t">کرایه کل: {typeof totalPersonalCost === 'number' ? totalPersonalCost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(totalPersonalCost)} ریال</div>
                        </fieldset>
                        <div><label className="text-sm">شماره بارنامه</label><input value={blNumber} onChange={e => setBlNumber(e.target.value)} className="input-style mt-1" /></div>
                        <div><label className="text-sm">توضیحات</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-style mt-1 min-h-[80px]" placeholder="توضیحات اختیاری..." /></div>
                    </div>
                )}
                
                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">انصراف</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">ذخیره</button>
                </div>
            </div>
        </div>
    );
};

const DestinationTransferDialog: React.FC<{sourceAnnouncement: FreightAnnouncement, allAnnouncements: FreightAnnouncement[], activeLine: TransportLiveTab, onClose: ()=>void, onSave: TransportLiveProps['onTransferDestination']}> = 
({ sourceAnnouncement, allAnnouncements, activeLine, onClose, onSave }) => {
    const sourceLine = useMemo(() => {
        const backend = lineTypeFromAnnouncement(sourceAnnouncement);
        if (backend === 'IceCream') return FreightLineType.IceCream;
        if (backend === 'Dairy') return FreightLineType.Dairy;
        return FreightLineType.Ambient;
    }, [sourceAnnouncement]);

    const sameLineAnnouncements = useMemo(
        () => allAnnouncements.filter((a) => matchesFreightLine(a, sourceLine)),
        [allAnnouncements, sourceLine]
    );
    const [destinationId, setDestinationId] = useState('');
    const [targetAnnouncementId, setTargetAnnouncementId] = useState('');
    const [newPosition, setNewPosition] = useState(1);
    
    // محاسبه تعداد مقاصد موجود در بار هدف برای تعیین موقعیت‌های ممکن
    const targetAnnouncement = allAnnouncements.find(a => a.id === targetAnnouncementId);
    // اگر همان ردیف انتخاب شده، باید مقاصد فعلی را در نظر بگیریم (منهای مقصدی که می‌خواهیم جابجا کنیم)
    const isSameRow = targetAnnouncementId === sourceAnnouncement.id;
    const currentDestCount = targetAnnouncement ? targetAnnouncement.destinations.length : 0;
    const maxPosition = isSameRow && destinationId 
        ? currentDestCount // اگر همان ردیف است، موقعیت‌ها برابر با تعداد مقاصد فعلی است
        : currentDestCount + 1; // اگر ردیف دیگر است، می‌توانیم به آخر اضافه کنیم
    const availablePositions = Array.from({ length: maxPosition }, (_, i) => i + 1);
    
    // Reset position when target changes
    useEffect(() => {
        if (targetAnnouncementId && targetAnnouncement) {
            setNewPosition(1); // Reset to first position when target changes
        }
    }, [targetAnnouncementId, targetAnnouncement]);
    
    const handleSave = () => {
        console.log('🔄 [DestinationTransferDialog] Save clicked:', {
            sourceAnnouncementId: sourceAnnouncement.id,
            sourceAnnouncementCode: sourceAnnouncement.announcementCode,
            destinationId,
            targetAnnouncementId,
            newPosition,
            targetDestinationsCount: targetAnnouncement?.destinations.length || 0,
            sourceDestinations: sourceAnnouncement.destinations,
            selectedDestination: sourceAnnouncement.destinations.find(d => d.id === destinationId),
            timestamp: new Date().toISOString()
        });
        
        if(!destinationId || !targetAnnouncementId) { 
            console.warn('⚠️ [DestinationTransferDialog] Missing required fields:', { destinationId, targetAnnouncementId });
            alert('لطفا مقصد و بار هدف را انتخاب کنید.'); 
            return; 
        }
        
        console.log('✅ [DestinationTransferDialog] Calling onSave with:', {
            sourceAnnouncementId: sourceAnnouncement.id,
            destinationId,
            targetAnnouncementId,
            newPosition
        });
        
        onSave(sourceAnnouncement.id, destinationId, targetAnnouncementId, newPosition);
        onClose();
    }
    
    // پیدا کردن شماره ردیف برای هر اعلام بار (فقط در لاین فعلی)
    const getRowNumber = (announcementId: string): number => {
        const index = sameLineAnnouncements.findIndex(a => a.id === announcementId);
        return index >= 0 ? index + 1 : 0;
    };
    
    // تابع برای فرمت کردن نمایش مقصد مبدا: "ردیف X - (پخش/نماینده) شهر (تناژ)"
    const formatSourceDestination = (dest: Destination, destIndex: number) => {
        // بررسی نوع نماینده - ابتدا از announcement
        let repType = '';
        const repTypeValue = sourceAnnouncement.representativeType;
        // بررسی نوع نماینده از representativeType
        if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
            repType = 'پخش';
        } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
            repType = 'نماینده';
        }
        
        // اگر در announcement نبود، از representativeName در announcement استفاده کن
        if (!repType && sourceAnnouncement.representativeName) {
            const repName = sourceAnnouncement.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        // اگر در announcement نبود، از destination بررسی کن
        if (!repType && (dest as any).representativeType) {
            const destRepType = (dest as any).representativeType;
            if (destRepType === 'distributor' || destRepType === 'agent' || destRepType === 'پخش') {
                repType = 'پخش';
            } else if (destRepType === 'representative' || destRepType === 'نماینده') {
                repType = 'نماینده';
            }
        }
        
        // اگر هنوز پیدا نشد، از representativeName در destination استفاده کن
        if (!repType && dest.representativeName) {
            const repName = dest.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        const tonnage = dest.tonnage ? formatTonnageKg(parseNumericField(dest.tonnage)) : '';
        const rowNum = getRowNumber(sourceAnnouncement.id);
        // برای استفاده در dropdown، باید string برگردانیم
        return `ردیف ${rowNum} - ${destIndex + 1}-${repType ? `(${repType}) ` : ''}${dest.city}${tonnage ? ` (${tonnage})` : ''}`;
    };
    
    // تابع جداگانه برای نمایش در dropdown با HTML
    const formatSourceDestinationHTML = (dest: Destination, destIndex: number) => {
        let repType = '';
        const repTypeValue = sourceAnnouncement.representativeType;
        if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
            repType = 'پخش';
        } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
            repType = 'نماینده';
        }
        
        if (!repType && sourceAnnouncement.representativeName) {
            const repName = sourceAnnouncement.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        if (!repType && (dest as any).representativeType) {
            const destRepType = (dest as any).representativeType;
            if (destRepType === 'distributor' || destRepType === 'agent' || destRepType === 'پخش') {
                repType = 'پخش';
            } else if (destRepType === 'representative' || destRepType === 'نماینده') {
                repType = 'نماینده';
            }
        }
        
        if (!repType && dest.representativeName) {
            const repName = dest.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        const tonnage = dest.tonnage ? formatTonnageKg(parseNumericField(dest.tonnage)) : '';
        const rowNum = getRowNumber(sourceAnnouncement.id);
        const city = dest.city;
        return `ردیف ${rowNum} - ${destIndex + 1}-${repType ? `(${repType}) ` : ''}<strong style="font-weight: bold; color: #1e40af;">${city}</strong>${tonnage ? ` (${tonnage})` : ''}`;
    };
    
    // تابع برای فرمت کردن نمایش بار هدف: "ردیف X - 1-(پخش/نماینده) شهر (تناژ)-..."
    const formatTargetAnnouncement = (ann: FreightAnnouncement) => {
        // بررسی نوع نماینده - ابتدا از announcement
        let repType = '';
        const repTypeValue = ann.representativeType;
        if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
            repType = 'پخش';
        } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
            repType = 'نماینده';
        }
        
        // اگر در announcement نبود، از representativeName در announcement استفاده کن
        if (!repType && ann.representativeName) {
            const repName = ann.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        const rowNum = getRowNumber(ann.id);
        const destinationsStr = ann.destinations
            .map((d, idx) => {
                // اگر در announcement نبود، از destination بررسی کن
                let destRepType = repType;
                if (!destRepType && (d as any).representativeType) {
                    const destRep = (d as any).representativeType;
                    if (destRep === 'distributor' || destRep === 'agent' || destRep === 'پخش') {
                        destRepType = 'پخش';
                    } else if (destRep === 'representative' || destRep === 'نماینده') {
                        destRepType = 'نماینده';
                    }
                }
                // اگر هنوز پیدا نشد، از representativeName در destination استفاده کن
                if (!destRepType && d.representativeName) {
                    const repName = d.representativeName.toLowerCase();
                    if (repName.includes('پخش') || repName.includes('distributor')) {
                        destRepType = 'پخش';
                    } else if (repName.includes('نماینده') || repName.includes('representative')) {
                        destRepType = 'نماینده';
                    }
                }
                const tonnage = d.tonnage ? formatTonnageKg(parseNumericField(d.tonnage)) : '';
                // برای استفاده در dropdown، باید string برگردانیم
                return `${idx + 1}-${destRepType ? `(${destRepType}) ` : ''}${d.city}${tonnage ? ` (${tonnage})` : ''}`;
            })
            .join('-');
        return `ردیف ${rowNum} - ${destinationsStr}`;
    };
    
    // تابع جداگانه برای نمایش در dropdown با HTML
    const formatTargetAnnouncementHTML = (ann: FreightAnnouncement) => {
        let repType = '';
        const repTypeValue = ann.representativeType;
        if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') {
            repType = 'پخش';
        } else if (repTypeValue === 'representative' || repTypeValue === 'نماینده') {
            repType = 'نماینده';
        }
        
        if (!repType && ann.representativeName) {
            const repName = ann.representativeName.toLowerCase();
            if (repName.includes('پخش') || repName.includes('distributor')) {
                repType = 'پخش';
            } else if (repName.includes('نماینده') || repName.includes('representative')) {
                repType = 'نماینده';
            }
        }
        
        const rowNum = getRowNumber(ann.id);
        const destinationsStr = ann.destinations
            .map((d, idx) => {
                let destRepType = repType;
                if (!destRepType && (d as any).representativeType) {
                    const destRep = (d as any).representativeType;
                    if (destRep === 'distributor' || destRep === 'agent' || destRep === 'پخش') {
                        destRepType = 'پخش';
                    } else if (destRep === 'representative' || destRep === 'نماینده') {
                        destRepType = 'نماینده';
                    }
                }
                if (!destRepType && d.representativeName) {
                    const repName = d.representativeName.toLowerCase();
                    if (repName.includes('پخش') || repName.includes('distributor')) {
                        destRepType = 'پخش';
                    } else if (repName.includes('نماینده') || repName.includes('representative')) {
                        destRepType = 'نماینده';
                    }
                }
                const tonnage = d.tonnage ? formatTonnageKg(parseNumericField(d.tonnage)) : '';
                const city = d.city;
                return `${idx + 1}-${destRepType ? `(${destRepType}) ` : ''}<strong style="font-weight: bold; color: #1e40af;">${city}</strong>${tonnage ? ` (${tonnage})` : ''}`;
            })
            .join('-');
        return `ردیف ${rowNum} - ${destinationsStr}`;
    };
    
    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b"><h3 className="text-lg font-bold">انتقال مقصد از بار #{sourceAnnouncement.announcementCode}</h3></div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label>۱. انتخاب بار مورد نظر</label>
                        <select value={targetAnnouncementId} onChange={e=>setTargetAnnouncementId(e.target.value)} className="input-style mt-1 font-medium" autoComplete="off" style={{fontFamily: 'inherit', fontWeight: '500'}}>
                            <option value="">-- انتخاب بار --</option>
                            <option value={sourceAnnouncement.id} className="font-semibold bg-blue-50" style={{fontWeight: '600'}}>
                                ردیف {getRowNumber(sourceAnnouncement.id)} (همان ردیف - تغییر ترتیب)
                            </option>
                            {sameLineAnnouncements.filter(a => a.id !== sourceAnnouncement.id).map(a=>
                                <option key={a.id} value={a.id} style={{fontWeight: '600'}}>
                                    {formatTargetAnnouncement(a)}
                                </option>
                            )}
                        </select>
                    </div>
                    <div>
                        <label>۲. انتخاب ردیف انتقالی</label>
                        <select value={destinationId} onChange={e=>setDestinationId(e.target.value)} className="input-style mt-1 font-medium" autoComplete="off" style={{fontFamily: 'inherit', fontWeight: '500'}}>
                            <option value="">-- انتخاب مقصد --</option>
                            {sourceAnnouncement.destinations.map((d, idx)=>
                                <option key={d.id} value={d.id} style={{fontWeight: '600'}}>
                                    {formatSourceDestination(d, idx)}
                                </option>
                            )}
                        </select>
                    </div>
                    <div>
                        <label>۳. موقعیت جدید</label>
                        <select value={newPosition} onChange={e=>setNewPosition(Number(e.target.value))} className="input-style mt-1" autoComplete="off" disabled={!targetAnnouncementId}>
                            {availablePositions.map(n=><option key={n} value={n}>مقصد {n}</option>)}
                        </select>
                        {targetAnnouncement && (
                            <div className="text-xs text-slate-500 mt-1">
                                {targetAnnouncement.destinations.length > 0 
                                    ? `بار هدف ${targetAnnouncement.destinations.length} مقصد دارد`
                                    : 'بار هدف فعلاً مقصدی ندارد'}
                            </div>
                        )}
                    </div>
                </div>
                 <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">انصراف</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">انتقال</button>
                </div>
             </div>
         </div>
    )
}

const VehicleTypeChangeDialog: React.FC<{ announcement: FreightAnnouncement, onClose: ()=>void, onSave: TransportLiveProps['onChangeVehicleType'] }> = ({ announcement, onClose, onSave }) => {
    const [vehicleType, setVehicleType] = useState(announcement.vehicleType || '');
    const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVehicleTypes = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(getApiUrl('freight-announcements/vehicle-types'), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setVehicleTypes(data.vehicleTypes || []);
                }
            } catch (error) {
                console.error('Failed to fetch vehicle types:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchVehicleTypes();
    }, []);

    const handleSave = () => {
        if (!vehicleType || vehicleType.trim() === '') {
            alert('لطفا نوع خودرو را انتخاب کنید.');
            return;
        }
        if (vehicleType === announcement.vehicleType) {
            alert('نوع خودرو تغییر نکرده است.');
            return;
        }
        onSave(announcement.id, vehicleType);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b">
                    <h3 className="text-lg font-bold">تغییر نوع خودرو - بار #{announcement.announcementCode}</h3>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block">نوع خودرو فعلی</label>
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">{announcement.vehicleType || '-'}</div>
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-2 block">نوع خودرو جدید</label>
                        {loading ? (
                            <div className="p-2 bg-slate-100 rounded-md text-slate-500">در حال بارگذاری...</div>
                        ) : (
                            <select 
                                value={vehicleType} 
                                onChange={e=>setVehicleType(e.target.value)} 
                                className="input-style mt-1"
                                autoComplete="off"
                            >
                                <option value="">-- انتخاب نوع خودرو --</option>
                                {vehicleTypes.map(vt => (
                                    <option key={vt} value={vt}>{vt}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">انصراف</button>
                    <button onClick={handleSave} disabled={loading || !vehicleType || vehicleType === announcement.vehicleType} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed">ذخیره</button>
                </div>
            </div>
        </div>
    );
};

const ChangeRequestDialog: React.FC<{ announcement: FreightAnnouncement, onClose: ()=>void, onSubmit: TransportLiveProps['onChangeRequest'] }> = ({ announcement, onClose, onSubmit }) => {
    const [type, setType] = useState<'change' | 'split' | 'merge'>('change');
    const [targetQueue, setTargetQueue] = useState<'company' | 'personal' | ''>('');
    const [description, setDescription] = useState('');

    const handleSubmit = () => {
        if (!description.trim()) { alert('توضیحات برای کارشناس الزامی است.'); return; }
        onSubmit(announcement.id, {
            type,
            targetQueue: (targetQueue || undefined) as any,
            description,
            payload: { description }
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end items-stretch z-50" onClick={onClose}>
            <div className="bg-white h-full w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b"><h3 className="text-lg font-bold">درخواست تغییر/تقسیم برای #{announcement.announcementCode}</h3></div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-sm font-medium">نوع درخواست</label>
                        <div className="mt-2 flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={type==='change'} onChange={()=>setType('change')}/> تغییر نوع خودرو (مثلاً: تریلی → مینی‌تریلی یا تغییر تناژ/ارزش بار)</label>
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={type==='split'} onChange={()=>setType('split')}/> تقسیم (تبدیل یک بار به چند بار)</label>
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={type==='merge'} onChange={()=>setType('merge')}/> تجمیع (ادغام با بار دیگر)</label>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">صف مقصد پس از اعمال تغییر (اختیاری)</label>
                        <select className="input-style mt-1" value={targetQueue} onChange={e=>setTargetQueue(e.target.value as any)}>
                            <option value="">— انتخاب نشده —</option>
                            <option value="company">شرکتی</option>
                            <option value="personal">شخصی</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">توضیحات برای کارشناس (اجباری)</label>
                        <textarea className="input-style mt-1" rows={6} placeholder="مثلاً: تریلی → ۳ مینی‌تریلی، هرکدام ~۶t؛ لطفاً اعلام‌بار جدید ساخته شود. یا: نوع خودرو را به ده‌چرخ تغییر دهید." value={description} onChange={e=>setDescription(e.target.value)} />
                    </div>
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">انصراف</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">ثبت درخواست</button>
                </div>
            </div>
        </div>
    );
};


// Memoize the component to prevent unnecessary re-renders
export default React.memo(TransportLive);