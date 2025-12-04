// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View, PersonalDriver, PersonalVehicle } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

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
    onSearch: () => void;
    onClearFilters: () => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
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
};



const FreightHistory: React.FC<FreightHistoryProps> = (props) => {
    const { announcements, vehicles, drivers, personalDrivers, personalVehicles, currentUser, activeLine, setActiveLine, filterDate, setFilterDate, filterDestination, setFilterDestination, filterBillOfLading, setFilterBillOfLading, filterDriverName, setFilterDriverName, onSearch, onClearFilters, onOpenHistory } = props;
    
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
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    // فیلتر ستون‌ها - هر ستونی که در این Set باشد، نمایش داده می‌شود
    const [visibleColumnHeaders, setVisibleColumnHeaders] = useState<Set<string>>(new Set());
    
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
            { header: 'کد اعلام بار', align: 'center', display: () => true, render: (ann: FreightAnnouncement) => ann.announcementCode },
            // { header: 'وضعیت', display: () => true, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
            { header: 'تاریخ بارگیری', display: () => true, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
            { header: 'مبدا بارگیری', display: () => true, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
            { header: 'برند', display: () => true, render: (ann: FreightAnnouncement) => ann.brand || '-' },
            { header: 'نوع خودرو', display: () => true, render: (ann: FreightAnnouncement) => ann.vehicleType },
            
            // Destinations Summary (for all compact views)
            { header: 'مقاصد', display: () => viewMode === 'compact', render: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، ') },

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
            { header: 'توضیحات', display: () => true, render: (ann: FreightAnnouncement) => ann.notes || '-' },
            
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
        const filtered = liveAnnouncements.filter(a => a.lineType === activeLine);
        return filtered;
    }, [liveAnnouncements, activeLine]);
    
    // محاسبه صفحه‌بندی
    const totalPages = Math.ceil(filteredAnnouncements.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, endIndex);
    
    // وقتی activeLine تغییر می‌کند، به صفحه اول برگرد
    useEffect(() => {
        setCurrentPage(1);
    }, [activeLine]);

    // Initialize visible columns on mount - همه ستون‌ها به صورت پیش‌فرض نمایش داده می‌شوند
    useEffect(() => {
        if (visibleColumnHeaders.size === 0) {
            // ستون‌ها بعداً با استفاده از visibleColumns تنظیم می‌شوند
        }
    }, []);

    const visibleColumns = useMemo(() => {
        // Extra transport columns (for both modes, position differs)
        const extraCols = [
            { header: 'نام راننده', render: (ann: FreightAnnouncement) => getDriverName(ann.assignedDriverId, props.drivers, props.personalDrivers) },
            { header: 'تماس راننده', render: (ann: FreightAnnouncement) => <span className="font-mono">{getDriverContact(ann.assignedDriverId, props.drivers, props.personalDrivers)}</span> },
            { header: 'پلاک خودرو', render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{ann.assignmentType === 'company' ? getVehicleIdentifier(ann.assignedVehicleId, props.vehicles, props.personalVehicles) : getVehicleIdentifier(ann.assignedVehicleId, props.vehicles, props.personalVehicles)}</span> },
            { header: 'شماره بارنامه', render: (ann: FreightAnnouncement) => ann.billOfLadingNumber || '-' },
            { header: 'کرایه کل', render: (ann: FreightAnnouncement) => <span className="font-mono">{formatCurrency(ann.totalFreightCost)}</span> },
        ];

        // Ice Cream: mirror planner order, then extras
        if (activeLine === FreightLineType.IceCream) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
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
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
                { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Dairy compact: mirror planner (kg), then extras
        if (activeLine === FreightLineType.Dairy && viewMode === 'compact') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'مقاصد', render: (ann: FreightAnnouncement) => (
                    <div className="flex flex-col text-xs space-y-1">
                        {ann.destinations.map((d, i) => (
                            <div key={d.id} className="flex items-center justify-center gap-2">
                                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span className="font-semibold text-slate-800">{d.city}</span>
                                <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} کیلوگرم` : ' N/A '})</span>
                            </div>
                        ))}
                    </div>
                ) },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
                { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Ambient compact: mirror Dairy compact order, then extras
        if (activeLine === FreightLineType.Ambient && viewMode === 'compact') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'مقاصد', render: (ann: FreightAnnouncement) => (
                    <div className="flex flex-col text-xs space-y-1">
                        {ann.destinations.map((d, i) => (
                            <div key={d.id} className="flex items-center justify-center gap-2">
                                <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span className="font-semibold text-slate-800">{d.city}</span>
                                <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} کیلوگرم` : ' N/A '})</span>
                            </div>
                        ))}
                    </div>
                ) },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
                { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Dairy full: common columns order then extras; destinations are rendered separately
        if (activeLine === FreightLineType.Dairy && viewMode === 'full') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
                { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Ambient full: mirror Dairy full
        if (activeLine === FreightLineType.Ambient && viewMode === 'full') {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
                { header: 'نوع خودرو', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'تاریخ بارگیری', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
                { header: 'توضیحات', render: (ann: FreightAnnouncement) => ann.notes || '-' },
            ];
            return [...base, ...extraCols];
        }

        // Default fallback
        const colsAll = columnsConfig(viewMode);
        const cols = colsAll.filter(c => c.display(activeLine)).filter(c => c.header !== 'کد اعلام بار');
        return [...cols, ...extraCols];
    }, [viewMode, activeLine, props]);

    const isFullDairyAmbient = viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine);
    const commonCols = useMemo(() => visibleColumns, [visibleColumns]);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center"><TruckIcon className="w-6 h-6 mr-2 text-sky-600" />تاریخچه اعلام بار</h2>
          <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* فیلتر تاریخ شمسی بارگیری */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                            <label className="text-xs whitespace-nowrap">تاریخ شمسی بارگیری:</label>
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
                        <button onClick={onSearch} className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600">جستجو</button>
                        <button onClick={onClearFilters} className="px-3 py-1 bg-gray-500 text-white rounded-md text-xs hover:bg-gray-600">پاک کردن</button>
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
                                        {commonCols.map(col => {
                                            // فیلتر ستون‌ها
                                            if (visibleColumnHeaders.size > 0 && !visibleColumnHeaders.has(col.header)) {
                                                return null;
                                            }
                                            return <th key={col.header} rowSpan={2} className="p-2 text-center">
                                                <span>{col.header}</span>
                                            </th>;
                                        })}
                                        <th colSpan={5} className="p-2 text-center border-x">مقصد اول</th>
                                        <th colSpan={5} className="p-2 text-center border-x">مقصد دوم</th>
                                        <th colSpan={5} className="p-2 text-center border-x">مقصد سوم</th>
                                        <th colSpan={5} className="p-2 text-center border-x">مقصد چهارم</th>
                                        <th rowSpan={2} className="p-2 sticky -left-px bg-gray-50 z-10" style={{width: '180px'}}>عملیات</th>
                                    </tr>
                                    <tr>
                                        {[1, 2, 3, 4].map(i => (
                                            <React.Fragment key={i}>
                                                <th className="p-2 text-center font-normal border">نماینده</th>
                                                <th className="p-2 text-center font-normal border">مقصد</th>
                                                <th className="p-2 text-center font-normal border">تناژ</th>
                                                <th className="p-2 text-center font-normal border">ساعت تخلیه</th>
                                                <th className="p-2 text-center font-normal border">کرایه</th>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </>
                             ) : (
                                <tr>
                                    {visibleColumns.map(col => {
                                        // فیلتر ستون‌ها: اگر visibleColumnHeaders خالی است، همه را نمایش بده
                                        if (visibleColumnHeaders.size > 0 && !visibleColumnHeaders.has(col.header)) {
                                            return null;
                                        }
                                        return <th key={col.header} className="p-2" style={{ textAlign: (col.align || 'right') as any }}>
                                            <span>{col.header}</span>
                                        </th>;
                                    })}
              </tr>
                             )}
            </thead>
            <tbody>
                            {paginatedAnnouncements.map((ann, idx) => {
                                // برای تاریخچه، همه ردیف‌ها Finalized هستند - رنگ سبز
                                const rowColorClass = 'bg-teal-50 hover:bg-teal-100';

                                return (
                                <tr key={ann.id} className={`border-b ${rowColorClass}`}>
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
                                                        <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                        <td className="p-2 text-center border font-mono">{formatCurrency(dest?.freightCost)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        visibleColumns.map(col => {
                                            // فیلتر ستون‌ها: اگر visibleColumnHeaders خالی است، همه را نمایش بده، وگرنه فقط ستون‌های انتخاب شده
                                            if (visibleColumnHeaders.size > 0 && !visibleColumnHeaders.has(col.header)) {
                                                return null;
                                            }
                                            return <td key={col.header} className="p-2" style={{textAlign: (col.align || 'right') as any}}>{col.render(ann, idx, props)}</td>;
                                        })
                                    )}

                </tr>
                                );
                            })}
            </tbody>
          </table>
        </div>
        
        {/* صفحه‌بندی */}
        <div className="flex items-center justify-between mt-4 px-4 py-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
                <label className="text-sm text-slate-700">تعداد در هر صفحه:</label>
                <select 
                    value={itemsPerPage} 
                    onChange={e => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
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
                    صفحه {currentPage} از {totalPages} ({filteredAnnouncements.length} ردیف)
                </span>
                <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    قبلی
                </button>
                <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    بعدی
                </button>
            </div>
        </div>
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
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; } `}</style>
    </div>
  );
};

// --- Dialog Components حذف شده - برای تاریخچه نیاز نیست ---

// DestinationTransferDialog حذف شده - برای تاریخچه نیاز نیست


export default FreightHistory;