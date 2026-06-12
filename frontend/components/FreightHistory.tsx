// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View, PersonalDriver, PersonalVehicle } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import {
    getDestinationCitiesLabel,
    getAssignedDriverDisplayName,
    getAssignedDriverContact,
    getAssignedVehiclePlate,
    TOTAL_FREIGHT_HEADER,
    formatFreightAmountCell,
    formatRepresentativeType,
    localizeExcelValue,
} from '../utils/freightDisplay';
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
    onSearch: () => void;
    onClearFilters: () => void;
    onOpenHistory?: (announcementId: string, announcementCode: string) => void;
    currentPage?: number;
    itemsPerPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    onItemsPerPageChange?: (limit: number) => void;
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
    const { announcements, vehicles, drivers, personalDrivers, personalVehicles, currentUser, activeLine, setActiveLine, filterDate, setFilterDate, filterDestination, setFilterDestination, filterBillOfLading, setFilterBillOfLading, filterDriverName, setFilterDriverName, onSearch, onClearFilters, onOpenHistory, currentPage = 1, itemsPerPage = 50, totalCount = 0, totalPages = 1, onPageChange, onItemsPerPageChange } = props;
    
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
            { header: TOTAL_FREIGHT_HEADER, display: () => true, render: (ann: FreightAnnouncement) => formatFreightAmountCell(ann.totalFreightCost) },
            
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
    
    // استفاده از props برای pagination (اگر موجود باشد) یا fallback به local state
    const paginatedAnnouncements = filteredAnnouncements; // Backend pagination handles this

    // Initialize visible columns on mount - همه ستون‌ها به صورت پیش‌فرض نمایش داده می‌شوند
    useEffect(() => {
        if (visibleColumnHeaders.size === 0) {
            // ستون‌ها بعداً با استفاده از visibleColumns تنظیم می‌شوند
        }
    }, []);

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

    // Function to generate Excel export based on filtered data
    const generateExcelExport = (mode: 'compact' | 'full' = viewMode) => {
        // استفاده از visibleColumns برای حفظ ترتیب دقیق جدول frontend
        // اما باید مطمئن شویم که viewMode درست است
        // اگر mode با viewMode متفاوت است، باید از columnsConfig استفاده کنیم
        let cols: any[] = [];
        
        if (mode === viewMode) {
            // اگر mode با viewMode یکسان است، از visibleColumns استفاده می‌کنیم
            cols = visibleColumns;
        } else {
            // اگر mode متفاوت است، از columnsConfig استفاده می‌کنیم
            cols = columnsConfig(mode);
        }
        
        const isFullDairyAmbientMode = mode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine);
        
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
                headers.push(`مقصد ${i} - نماینده`, `مقصد ${i} - شهر`, `مقصد ${i} - تناژ`, `مقصد ${i} - تاریخ تحویل`, `مقصد ${i} - ساعت تخلیه`, `مقصد ${i} - کرایه`);
            }
        }
        
        // ایجاد workbook و worksheet
        const wb = XLSX.utils.book_new();
        const wsData: any[][] = [];
        
        // اضافه کردن headers
        wsData.push(headers);
        
        // Generate rows from filtered announcements
        filteredAnnouncements.forEach((ann, idx) => {
            const row: any[] = [];
            
            // Helper to get value for a column header - دقیقاً مطابق با ترتیب headers
            const getValueForHeader = (header: string): any => {
                // بررسی اینکه آیا این ستون عددی است
                const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', TOTAL_FREIGHT_HEADER, 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه', 'کارتن'];
                const isNumericColumn = numericHeaders.some(h => header.includes(h));
                
                // Handle special columns directly - اولویت با اینهاست
                if (header === TOTAL_FREIGHT_HEADER || header === 'کرایه کل') {
                    const value = ann.totalFreightCost || 0;
                    return typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d]/g, '')) || 0;
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
                if (!header.startsWith('مقصد')) {
                    row.push(getValueForHeader(header));
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
            const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', TOTAL_FREIGHT_HEADER, 'تعداد کارتن', 'مبلغ کرایه', 'کل تناژ'].some(h => header.includes(h));
            if (isNumericColumn) {
                for (let row = 1; row <= filteredAnnouncements.length; row++) {
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
    const downloadExcel = async (mode: 'compact' | 'full' = viewMode) => {
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
                const cols = mode === viewMode ? visibleColumns : columnsConfig(mode);
                const isFullDairyAmbientMode = mode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine);
                
                const headers: string[] = [];
                const seenHeaders = new Set<string>();
                
                cols.forEach(col => {
                    if (!seenHeaders.has(col.header) && col.header !== 'عملیات') {
                        headers.push(col.header);
                        seenHeaders.add(col.header);
                    }
                });
                
                if (!seenHeaders.has(TOTAL_FREIGHT_HEADER) && !seenHeaders.has('کرایه کل')) {
                    headers.push(TOTAL_FREIGHT_HEADER);
                }
                if (!seenHeaders.has('ارزش بار') && !seenHeaders.has('ارزش بار (ریال)')) {
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
                
                // Helper to get value for header
                const getValueForHeader = (header: string, ann: FreightAnnouncement, idx: number): any => {
                    const numericHeaders = ['تناژ', 'کرایه', 'ارزش بار', TOTAL_FREIGHT_HEADER, 'کرایه کل', 'تعداد کارتن', 'مبلغ کرایه', 'کارتن'];
                    const isNumericColumn = numericHeaders.some(h => header.includes(h));
                    
                    if (header === TOTAL_FREIGHT_HEADER || header === 'کرایه کل') {
                        return ann.totalFreightCost || 0;
                    }
                    if (header === 'ارزش بار' || header === 'ارزش بار (ریال)') {
                        return ann.cargoValue || 0;
                    }
                    if (header === 'اولویت') {
                        const priorityMap: { [key: string]: string } = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };
                        return priorityMap[ann.priority || 'normal'] || ann.priority || 'عادی';
                    }
                    if (header === 'کل تناژ (کیلوگرم)') {
                        return ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0);
                    }
                    
                    const col = cols.find(c => c.header === header);
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
                    headers.forEach(header => {
                        if (header === 'ردیف') return;
                        if (!header.startsWith('مقصد')) {
                            rowData.push(getValueForHeader(header, ann, idx));
                        }
                    });
                    
                    if (isFullDairyAmbientMode) {
                    for (let i = 0; i < 4; i++) {
                        const dest = ann.destinations[i];
                        if (dest) {
                            // منطق تشخیص نوع نماینده - بهبود یافته
                            let repType = '';
                            const repTypeValue = (dest as any).representativeType;
                            const repName = (dest.representativeName || '').toString().trim();
                            
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
                        const isNumericColumn = ['تناژ', 'کرایه', 'ارزش بار', 'کرایه کل', TOTAL_FREIGHT_HEADER, 'تعداد کارتن', 'مبلغ کرایه', 'کل تناژ'].some(h => header.includes(h));
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

    const visibleColumns = useMemo(() => {
        // Extra transport columns (for both modes, position differs)
        const extraCols = [
            { header: 'نام راننده', render: (ann: FreightAnnouncement) => getAssignedDriverDisplayName(ann, props.drivers, props.personalDrivers) },
            { header: 'تماس راننده', render: (ann: FreightAnnouncement) => <span className="font-mono">{getAssignedDriverContact(ann, props.drivers, props.personalDrivers)}</span> },
            { header: 'پلاک خودرو', render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{getAssignedVehiclePlate(ann, props.vehicles, props.personalVehicles)}</span> },
            { header: 'شماره بارنامه', render: (ann: FreightAnnouncement) => ann.billOfLadingNumber || '-' },
            { header: TOTAL_FREIGHT_HEADER, render: (ann: FreightAnnouncement) => formatFreightAmountCell(ann.totalFreightCost) },
        ];

        // Ice Cream: mirror planner order, then extras
        if (activeLine === FreightLineType.IceCream) {
            const base = [
                { header: 'ردیف', render: (_: any, idx: number) => idx + 1 },
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
                        <button onClick={() => downloadExcel('compact')} className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600 whitespace-nowrap">
                            اکسل فشرده
                        </button>
                        <button onClick={() => downloadExcel('full')} className="px-3 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 whitespace-nowrap">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
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
                                        return <th key={col.header} className="p-2 text-center align-middle">
                                            <span>{col.header}</span>
                                        </th>;
                                    })}
              </tr>
                             )}
            </thead>
            <tbody>
                            {paginatedAnnouncements.map((ann, idx) => {
                                const rowColorClass = isFinanceRejectedAnn(ann as any)
                                    ? 'bg-red-50 hover:bg-red-100'
                                    : 'bg-teal-50 hover:bg-teal-100';

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
                                                        <td className="p-2 text-center border">{formatFreightAmountCell(dest?.freightCost)}</td>
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
                                            return <td key={col.header} className="p-2 text-center align-middle">{col.render(ann, idx, props)}</td>;
                                        })
                                    )}

                </tr>
                                );
                            })}
            </tbody>
          </table>
        </div>
        
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
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; } `}</style>
    </div>
  );
};

// --- Dialog Components حذف شده - برای تاریخچه نیاز نیست ---

// DestinationTransferDialog حذف شده - برای تاریخچه نیاز نیست


export default FreightHistory;