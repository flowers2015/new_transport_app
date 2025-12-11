// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View, PersonalDriver, PersonalVehicle } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

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
    }) => void;
    onFinalize: (announcementIds: string[]) => void;
    finalizePermissions?: Record<string, boolean>;
    onTransferDestination: (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => void;
    onForward: (announcementId: string) => void;
    onCancel: (announcementId: string) => void;
    onChangeRequest: (announcementId: string, body: { type: 'change' | 'split' | 'merge', targetQueue?: 'company' | 'personal', description?: string, payload?: any }) => void;
    onChangeVehicleType: (announcementId: string, vehicleType: string) => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
    onOpenAssignmentDialog?: (announcement: FreightAnnouncement) => void;
    currentUser: User;
    activeLine: FreightLineType;
    setActiveLine: (line: FreightLineType) => void;
}

// Move helper functions inside component to ensure proper re-rendering
const formatCurrency = (amount?: number) => amount ? `${amount.toLocaleString('fa-IR')} تومان` : '-';

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
};



const VEHICLE_TYPES = ['تریلی', 'مینی تریلی', 'ده چرخ', 'تک', 'مینی تک', 'خاور'];

const TransportLive: React.FC<TransportLiveProps> = (props) => {
    const { announcements, vehicles, drivers, personalDrivers, personalVehicles, onUpdateAssignment, onFinalize, currentUser, onCancel, onForward, onTransferDestination, onChangeVehicleType, onOpenHistory, onOpenAssignmentDialog, onRefresh, activeLine, setActiveLine, finalizePermissions = {} } = props;
    
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
                    const tonnage = d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')}` : '';
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
                const result = ann.assignmentType === 'company' 
                    ? getDriverName(ann.assignedDriverId, drivers, props.personalDrivers)
                    : getPersonalDriverName(ann.assignedDriverId, props.personalDrivers);
                // console.log('🔍 [Render] Driver name for', ann.id, ':', result);
                return result;
            }},
            { header: 'تماس راننده', display: () => viewMode === 'full' || viewMode === 'compact', render: (ann: FreightAnnouncement) => {
                const result = ann.assignmentType === 'company' 
                    ? getDriverContact(ann.assignedDriverId, drivers, props.personalDrivers)
                    : getPersonalDriverContact(ann.assignedDriverId, props.personalDrivers);
                return <span className="font-mono">{result}</span>;
            }},
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
            { header: 'کرایه کل', display: () => true, render: (ann: FreightAnnouncement) => <span className="font-mono">{formatCurrency(ann.totalFreightCost)}</span> },
            
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

            // اگر تخصیص نهایی شده است (assignment_finalized_at وجود دارد)، از پیگیری اعلام بار زنده خارج می‌شود
            if (a.assignmentFinalizedAt) {
                return false;
            }

            if (currentUser.role === UserRole.TransportationUser) {
                // ترابری شرکت: بر اساس قانون ارجاع خودکار
                // بستنی: ابتدا به ترابری شرکت، در صورت عدم پوشش به ترابری شخصی
                // پاستوریزه و لبنیات: ابتدا به ترابری شخصی، در صورت عدم پوشش به ترابری شرکت
                
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
                
                // قانون ارجاع خودکار: ترابری شرکت باید بستنی را ببیند و بتواند روی آن عمل کند
                if (isAllowed && (a.lineType === FreightLineType.IceCream || a.lineType === 'IceCream' || a.lineType === 'بستنی')) {
                    // بستنی: ترابری شرکت اولویت دارد - همیشه نمایش داده می‌شود
                    return true;
                } else if (isAllowed && ((a.lineType === FreightLineType.Dairy || a.lineType === 'Dairy' || a.lineType === 'پاستوریزه') || (a.lineType === FreightLineType.Ambient || a.lineType === 'Ambient' || a.lineType === 'لبنیات-فروتلند'))) {
                    // پاستوریزه و لبنیات: ترابری شرکت باید ببیند اما عملیات غیرفعال باشد تا زمانی که ارجاع داده شود
                    return true; // همیشه نمایش داده می‌شود
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

    const filteredAnnouncements = useMemo(() => {
        const filtered = liveAnnouncements.filter(a => a.lineType === activeLine);
        return filtered;
    }, [liveAnnouncements, activeLine]);
    
    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };


    const visibleColumns = useMemo(() => {
        // Extra transport columns (for both modes, position differs)
        const extraCols = [
            { header: 'نام راننده', render: (ann: FreightAnnouncement) => getDriverName(ann.assignedDriverId, props.drivers, props.personalDrivers) },
            { header: 'تماس راننده', render: (ann: FreightAnnouncement) => <span className="font-mono">{getDriverContact(ann.assignedDriverId, props.drivers, props.personalDrivers)}</span> },
            { header: 'پلاک خودرو', render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{ann.assignmentType === 'company' ? getVehicleIdentifier(ann.assignedVehicleId, props.vehicles, props.personalVehicles) : getVehicleIdentifier(ann.assignedVehicleId, props.vehicles, props.personalVehicles)}</span> },
            { header: 'شماره بارنامه', render: (ann: FreightAnnouncement) => ann.billOfLadingNumber || '-' },
            { header: 'کرایه کل', render: (ann: FreightAnnouncement) => <span className="font-mono">{formatCurrency(ann.totalFreightCost)}</span> },
            { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
        ];

        // Ice Cream: mirror planner order, then extras
        if (activeLine === FreightLineType.IceCream) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'کارمند اعلام‌کننده', render: (ann: any) => <span className="text-slate-700">{(ann.creator_full_name || ann.creator_username || '-')}</span> },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'نماینده (پخش/نماینده)', render: (ann: FreightAnnouncement) => (ann.representativeType === 'distributor' ? 'پخش' : 'نماینده') },
                { header: 'مقصد', render: (ann: FreightAnnouncement) => <span className="text-blue-600 font-semibold">{ann.destinations[0]?.city || '-'}</span> },
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
        if (activeLine === FreightLineType.Dairy && viewMode === 'compact') {
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
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
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
                        const tonnage = d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')}` : '';
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
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
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
                        const tonnage = d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')}` : '';
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
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
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
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
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
        const cols = colsAll.filter(c => c.display(activeLine)).filter(c => c.header !== 'کد اعلام بار');
        return [...cols, ...extraCols];
    }, [viewMode, activeLine, props, columnsConfig, editingVehicleTypeId]);

    const isFullDairyAmbient = viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine);
    const commonCols = useMemo(() => visibleColumns, [visibleColumns]);

    return (
        <div className="max-w-screen-2xl mx-auto space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-md">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center"><TruckIcon className="w-6 h-6 mr-2 text-sky-600" />پیگیری اعلام بار زنده و تخصیص</h2>
                        {onRefresh && (
                            <button
                                onClick={() => onRefresh()}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 transition-colors"
                                title="به‌روزرسانی دستی اطلاعات"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                به‌روزرسانی
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {canPerformActions && filteredAnnouncements.length > 0 && (currentUser.role === 'ادمین' || currentUser.role === 'Admin' || finalizePermissions[activeLine]) && (
                            <button 
                                onClick={() => {
                                    // اگر اعلام بار انتخاب شده باشد، فقط همان‌ها را نهایی می‌کند
                                    // اما فقط IDهایی که در filteredAnnouncements هستند (یعنی لاین فعلی)
                                    // در غیر این صورت، همه اعلام بارهای لاین فعلی را نهایی می‌کند
                                    let idsToFinalize: string[];
                                    
                                    if (selectedIds.size > 0) {
                                        // فقط IDهایی که در filteredAnnouncements هستند را بگیر
                                        const filteredIds = filteredAnnouncements
                                            .filter(a => selectedIds.has(a.id))
                                            .map(a => a.id);
                                        
                                        if (filteredIds.length === 0) {
                                            alert('هیچ اعلام باری از لاین فعلی انتخاب نشده است');
                                            return;
                                        }
                                        
                                        idsToFinalize = filteredIds;
                                    } else {
                                        idsToFinalize = filteredAnnouncements.map(a => a.id);
                                    }
                                    
                                    console.log('🔍 [TransportLive] Finalizing:', {
                                        selectedIdsCount: selectedIds.size,
                                        filteredIdsCount: idsToFinalize.length,
                                        idsToFinalize,
                                        activeLine
                                    });
                                    
                                    onFinalize(idsToFinalize);
                                    setSelectedIds(new Set()); // پاک کردن انتخاب‌ها بعد از نهایی‌سازی
                                }} 
                                className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600"
                                title={
                                    selectedIds.size > 0 
                                        ? `اتمام تخصیص برای ${selectedIds.size} اعلام بار انتخاب شده`
                                        : `اتمام تخصیص برای تمام ${filteredAnnouncements.length} اعلام بار ${activeLine}`
                                }
                            >
                                <CheckCircleIcon className="w-4 h-4" />
                                اتمام تخصیص {selectedIds.size > 0 ? `(${selectedIds.size} انتخاب شده)` : `(${filteredAnnouncements.length})`}
                            </button>
                        )}
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                        </div>
                        <div className="flex items-center p-1 bg-slate-200 rounded-lg"><button onClick={()=>setViewMode('compact')} className={`px-2 py-1 text-xs rounded ${viewMode==='compact'?'bg-white shadow':''}`}>فشرده</button><button onClick={()=>setViewMode('full')} className={`px-2 py-1 text-xs rounded ${viewMode==='full'?'bg-white shadow':''}`}>کامل</button></div>
                        <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                            {Object.values(FreightLineType).map(lt => (
                                <button key={lt} onClick={() => setActiveLine(lt)} className={`flex-1 px-3 py-1 rounded-md text-sm font-semibold transition-colors ${activeLine === lt ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}>{lt}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                         <thead className="text-xs uppercase bg-gray-50">
                             {isFullDairyAmbient ? (
                                <>
                                    <tr>
                                        {canPerformActions && <th rowSpan={2} className="p-2 sticky left-0 bg-gray-50 z-10"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? new Set(filteredAnnouncements.map(a=>a.id)) : new Set())}/></th>}
                                        {commonCols.map(col => <th key={col.header} rowSpan={2} className="p-2 text-center">{col.header}</th>)}
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد اول</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد دوم</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد سوم</th>
                                        <th colSpan={6} className="p-2 text-center border-x">مقصد چهارم</th>
                                        <th rowSpan={2} className="p-2 sticky -left-px bg-gray-50 z-10" style={{width: '180px'}}>عملیات</th>
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
                                    {canPerformActions && <th className="p-2 sticky left-0 bg-gray-50 z-10"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? new Set(filteredAnnouncements.map(a=>a.id)) : new Set())}/></th>}
                                    {visibleColumns.map(col => <th key={col.header} className="p-2" style={{ textAlign: (col.align || 'right') as any }}>{col.header}</th>)}
                                    <th className="p-2 sticky -left-px bg-gray-50 z-10" style={{width: '180px'}}>عملیات</th>
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
                                    {canPerformActions && <td className="p-2 sticky left-0 z-10" style={{backgroundColor: selectedIds.has(ann.id) ? '#f0f9ff' : 'white'}}><input type="checkbox" checked={selectedIds.has(ann.id)} onChange={() => handleSelectRow(ann.id)}/></td>}
                                    
                                     {isFullDairyAmbient ? (
                                        <>
                                            {commonCols.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, props)}</td>)}
                                            {[0, 1, 2, 3].map(i => {
                                                const dest = ann.destinations[i];
                                                return (
                                                    <React.Fragment key={i}>
                                                        <td className="p-2 text-center border">{dest?.representativeName || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.city || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.tonnage || '-'}</td>
                                                        <td className="p-2 text-center border">{(dest as any)?.deliveryDate || '-'}</td>
                                                        <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                        <td className="p-2 text-center border font-mono">{formatCurrency(dest?.freightCost)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        visibleColumns.map(col => <td key={col.header} className="p-2" style={{textAlign: (col.align || 'right') as any}}>{col.render(ann, idx, props)}</td>)
                                    )}

                                    <td className="p-2 sticky -left-px z-10" style={{width: '260px', backgroundColor: selectedIds.has(ann.id) ? '#f0f9ff' : 'white'}}>
                                        <div className="flex gap-1 flex-wrap">
                                            {canPerformActions && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('assign', ann)} className={`flex items-center gap-1 px-3 py-1 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 ${disabledClasses}`}><PencilIcon className="w-3 h-3"/>{[FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status) ? 'تخصیص' : 'ویرایش'}</button>}
                                            {canPerformActions && (ann.lineType === FreightLineType.Dairy || ann.lineType === 'Dairy' || ann.lineType === 'پاستوریزه' || ann.lineType === FreightLineType.Ambient || ann.lineType === 'Ambient' || ann.lineType === 'لبنیات-فروتلند') && ann.destinations.length >= 1 && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('transfer', ann)} title="جابجایی مقصد" className={`p-1 bg-yellow-500 text-white rounded-md text-xs hover:bg-yellow-600 ${disabledClasses}`}><SwitchHorizontalIcon className="w-4 h-4"/></button>}
                                            {canPerformActions && <button disabled={!canForward} onClick={() => onForward(ann.id)} title="ارجاع به ترابری دیگر" className={`px-3 py-1 bg-purple-500 text-white rounded-md text-xs hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed`}>ارجاع</button>}
                                            {canPerformActions && ann.status !== FreightAnnouncementStatus.Cancelled && ann.status !== FreightAnnouncementStatus.Finalized && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => onCancel(ann.id)} title="لغو اعلام بار" className={`px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 ${disabledClasses}`}>لغو</button>}
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
             {selectedAnnouncement && dialog === 'assign' && <AssignmentDialog {...props} announcement={selectedAnnouncement} onClose={handleCloseDialog} />}
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
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; } `}</style>
        </div>
    );
};

// --- Dialog Components ---
const AssignmentDialog: React.FC<Omit<TransportLiveProps, 'announcements' | 'onFinalize' | 'onTransferDestination' | 'onForward' | 'onCancel'> & { announcement: FreightAnnouncement, onClose: () => void }> =
(props) => {
    const { announcement, drivers, vehicles, personalDrivers, personalVehicles, onClose, onUpdateAssignment, currentUser } = props;
    
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
    const [foundPersonalVehicle, setFoundPersonalVehicle] = useState<any | null | 'not_found'>(null);
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [costMode, setCostMode] = useState<'manual' | 'auto'>('auto'); // پیش‌فرض: خودکار
    const [autoTotalCost, setAutoTotalCost] = useState(''); // فقط string با فرمت (مثل "1,234,567")
    const [displayFreightCosts, setDisplayFreightCosts] = useState<{ [key: string]: string }>({});
    
    // States for search results
    const [searchDriverResults, setSearchDriverResults] = useState<any[]>([]);
    const [searchVehicleResults, setSearchVehicleResults] = useState<any[]>([]);
    const [showDriverDropdown, setShowDriverDropdown] = useState(false);
    const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
    
    // --- Common State ---
    const [blNumber, setBlNumber] = useState(announcement.billOfLadingNumber || '');
    const [notes, setNotes] = useState(announcement.notes || '');

    useEffect(() => {
        if (announcement.assignmentType === 'company') {
            const driver = drivers.find(d => d.id === announcement.assignedDriverId);
            const vehicle = vehicles.find(v => v.id === announcement.assignedVehicleId);
            if (driver) { setDriverEmployeeId(driver.employeeId); setFoundCompanyDriver(driver); }
            if (vehicle) { setVehicleInternalId(vehicle.id); setFoundVehicle(vehicle); }
        } else if (announcement.assignmentType === 'personal') {
            const driver = personalDrivers.find(d => d.id === announcement.assignedDriverId);
            if(driver) {
                setNationalId(driver.nationalId);
                setFoundPersonalDriver(driver);
                setPersonalDriverDetails({ name: driver.name, mobile: driver.mobile, driverSmartId: driver.driverSmartId || '' });
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
            const totalTonnage = destsCopy.reduce((sum: number, d: any) => sum + (Number(d.tonnage) || 0), 0);
            
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
                const totalTonnage = destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0);
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
                            const tonnageRatio = (Number(dest.tonnage) || 0) / totalTonnage;
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

    const handleCompanyDriverLookup = () => {
        // Search by employeeId first, then by name (partial match)
        const driver = drivers.find(d => 
            d.employeeId.toLowerCase() === driverEmployeeId.toLowerCase() ||
            d.name.toLowerCase().includes(driverEmployeeId.toLowerCase())
        );
        setFoundCompanyDriver(driver || null);
        if (!driver) alert('راننده با این کد پرسنلی یا نام یافت نشد.');
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
            // برای کاربر ترابری شرکت، کرایه وجود ندارد (null)
            onUpdateAssignment(announcement.id, {
                driverId: foundCompanyDriver.id, 
                vehicleId: foundVehicle.id, 
                billOfLadingNumber: blNumber, 
                assignmentType: 'company',
                totalFreightCost: null, // برای شرکت کرایه نداریم - null می‌فرستیم تا backend آن را ignore کند
                destinations: destinations.length > 0 ? destinations : undefined,
                notes: notes,
            });
        } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
            // موبایل و کد هوشمند راننده اگر خالی باشند، باید از کاربر گرفته شوند
            if (!nationalId || !personalDriverDetails.name || !personalDriverDetails.mobile || !personalDriverDetails.driverSmartId || !personalVehicleDetails.type || !personalVehicleDetails.plate || !personalVehicleDetails.truckSmartId) {
                alert('کد ملی، نام راننده، شماره تماس، هوشمند راننده، نوع خودرو، پلاک خودرو و هوشمند کامیون الزامی است.');
                return;
            }
            
            // اگر راننده پیدا شده بود و موبایل یا کد هوشمند تغییر کرده، در دیتابیس به‌روزرسانی کن
            if (foundPersonalDriver && foundPersonalDriver.id && typeof foundPersonalDriver === 'object' && foundPersonalDriver !== 'not_found') {
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
            const formattedPlate = personalVehicleDetails.plate.replace(/\s/g, '').toLowerCase();
            
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
                nationalId,
                driverName: personalDriverDetails.name,
                driverContact: personalDriverDetails.mobile,
                driverSmartId: personalDriverDetails.driverSmartId,
                vehicleType: personalVehicleDetails.type,
                vehiclePlate: formattedPlate,
                truckSmartId: personalVehicleDetails.truckSmartId,
                destinations,
                totalFreightCost: personalTotalCost,
                billOfLadingNumber: blNumber,
                assignmentType: 'personal',
                notes: notes,
            });
        }
        onClose();
    };

    const isCompanyUser = currentUser.role === UserRole.TransportationUser;
    const isPersonalUser = currentUser.role === UserRole.Transportation_Personal_Vehicle_User;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b"><h3 className="text-lg font-bold">تخصیص به اعلام بار #{announcement.announcementCode}</h3></div>
                
                {isCompanyUser && (
                    <div className="p-6 space-y-4">
                        <div className="p-2 border rounded-md bg-slate-50">
                            <label className="text-sm font-medium">راننده شرکتی*</label>
                            <div className="flex items-end gap-2 mt-1">
                                <input placeholder="کد پرسنلی یا نام راننده..." value={driverEmployeeId} onChange={e => setDriverEmployeeId(e.target.value)} className="input-style flex-grow"/>
                                <button onClick={handleCompanyDriverLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundCompanyDriver && <div className="mt-2 p-2 bg-green-50 text-green-800 text-sm rounded"><strong>راننده:</strong> {foundCompanyDriver.name} | <strong>تماس:</strong> {foundCompanyDriver.mobile}</div>}
                        </div>
                        <div className="p-2 border rounded-md bg-slate-50">
                            <label className="text-sm font-medium">خودرو شرکتی*</label>
                            <div className="flex items-end gap-2 mt-1">
                                <input placeholder="کد خودرو یا شناسه خودرو..." value={vehicleInternalId} onChange={e => setVehicleInternalId(e.target.value)} className="input-style flex-grow"/>
                                <button onClick={handleVehicleLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundVehicle && <div className="mt-2 p-2 bg-green-50 text-green-800 text-sm rounded"><strong>خودرو:</strong> {getVehicleIdentifier(foundVehicle.id, vehicles)} | <strong>کد:</strong> {foundVehicle.vehicleCode || 'ندارد'} | <strong>نوع:</strong> {foundVehicle.type}</div>}
                        </div>
                        {/* برای کاربر ترابری شرکت، فیلد کرایه نمایش داده نمی‌شود */}
                         <div><label className="text-sm">شماره بارنامه</label><input value={blNumber} onChange={e => setBlNumber(e.target.value)} className="input-style mt-1" /></div>
                         <div><label className="text-sm">توضیحات</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-style mt-1 min-h-[80px]" placeholder="توضیحات اختیاری..." /></div>
                    </div>
                )}

                {isPersonalUser && (
                     <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <fieldset className="p-3 border rounded-lg bg-slate-50 space-y-2">
                             <legend className="font-semibold px-1 text-sm">۱. اطلاعات راننده و خودرو</legend>
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
                            
                            {foundPersonalDriver && <div className={`mt-2 p-2 text-sm rounded ${foundPersonalDriver === 'not_found' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{foundPersonalDriver === 'not_found' ? 'راننده جدید. اطلاعات را وارد کنید.' : 'راننده یافت شد. می‌توانید اطلاعات را ویرایش کنید.'}</div>}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                <div><label className="text-xs">نام و نام خانوادگی*</label><input value={personalDriverDetails.name || ''} onChange={e => setPersonalDriverDetails(s=>({...s, name: e.target.value}))} className="input-style"/></div>
                                <div><label className="text-xs">شماره تماس*</label><input value={personalDriverDetails.mobile || ''} onChange={e => setPersonalDriverDetails(s=>({...s, mobile: e.target.value}))} className="input-style"/></div>
                                <div><label className="text-xs">هوشمند راننده*</label><input placeholder="DRV001" value={personalDriverDetails.driverSmartId || ''} onChange={e => setPersonalDriverDetails(s=>({...s, driverSmartId: e.target.value}))} className="input-style"/></div>
                            </div>
                            <div className="flex items-end gap-2 mt-3">
                                <div className="flex-grow"><label className="text-xs">هوشمند کامیون*</label><input placeholder="TRK001" value={personalVehicleDetails.truckSmartId} onChange={e => setPersonalVehicleDetails(s=>({...s, truckSmartId: e.target.value}))} className="input-style"/></div>
                                <button onClick={handlePersonalVehicleLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            
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
                            
                            {foundPersonalVehicle && <div className={`mt-2 p-2 text-sm rounded ${foundPersonalVehicle === 'not_found' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{foundPersonalVehicle === 'not_found' ? 'خودرو جدید. اطلاعات را وارد کنید.' : 'خودرو یافت شد. می‌توانید اطلاعات را ویرایش کنید.'}</div>}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                <div><label className="text-xs">نوع خودرو*</label><input type="text" value={personalVehicleDetails.type} onChange={e => setPersonalVehicleDetails(s=>({...s, type: e.target.value}))} className="input-style" autoComplete="off"/></div>
                                <div><label className="text-xs">شماره پلاک*</label><input type="text" placeholder="12ع345-67" value={personalVehicleDetails.plate} onChange={e => setPersonalVehicleDetails(s=>({...s, plate: e.target.value}))} className="input-style" autoComplete="off"/></div>
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
                                        <div className="col-span-2"><strong>مقصد {i+1}:</strong> {dest.city} ({dest.tonnage ? Number(dest.tonnage).toLocaleString('fa-IR') : 0} کیلوگرم)</div>
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

const DestinationTransferDialog: React.FC<{sourceAnnouncement: FreightAnnouncement, allAnnouncements: FreightAnnouncement[], activeLine: FreightLineType, onClose: ()=>void, onSave: TransportLiveProps['onTransferDestination']}> = 
({ sourceAnnouncement, allAnnouncements, activeLine, onClose, onSave }) => {
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
        const filteredAnnouncements = allAnnouncements.filter(a => a.lineType === activeLine);
        const index = filteredAnnouncements.findIndex(a => a.id === announcementId);
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
        
        const tonnage = dest.tonnage ? `${Number(dest.tonnage).toLocaleString('fa-IR')}` : '';
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
        
        const tonnage = dest.tonnage ? `${Number(dest.tonnage).toLocaleString('fa-IR')}` : '';
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
                const tonnage = d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')}` : '';
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
                const tonnage = d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')}` : '';
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
                            {allAnnouncements.filter(a => a.id !== sourceAnnouncement.id && a.lineType === activeLine).map(a=>
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