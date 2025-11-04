// This is a new file: components/FreightDashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, FreightLineType, Destination, FreightAnnouncementStatus, UserRole, User, View } from '../types';
import { formatJalaliDateTime, formatJalali, parseJalaliDateString } from '../utils/jalali';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { PrinterIcon } from './icons/PrinterIcon';
import { DocumentArrowDownIcon } from './icons/DocumentArrowDownIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import FreightHistoryDialog from './FreightHistoryDialog';

// --- Constants from user request ---
const BRANDS = ['میهن', 'پاندا', 'برنارد', 'میلکوم', 'پانلا', 'آلینوس'];
const VEHICLE_TYPES = ['تریلی', 'مینی تریلی', 'ده چرخ', 'تک', 'مینی تک', 'خاور'];
const PRIORITIES = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };
const ICE_CREAM_PRODUCTS = ['کره', 'کترینگ', 'پنیر پیتزا', 'خامه قنادی'];
const mockCities = ["تهران", "اصفهان", "شیراز", "مشهد", "تبریز", "کرج", "اهواز", "کرمانشاه", "رشت", "زاهدان", "اسلامشهر"];


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
};

const formatCurrency = (amount?: number) => amount ? `${amount.toLocaleString('fa-IR')}` : '-';


const columnsConfig = (props: { 
    currentUser: User, 
    onApprove: (id: string) => void, 
    onReject: (id: string) => void, 
    onEdit: (ann: FreightAnnouncement) => void, 
    onSendForApproval: (ann: FreightAnnouncement) => void, 
    onDelete: (id: string) => void,
    onReAnnounce: (announcementId: string) => void,
    onSwitchQueue?: (id: string, nextQueue: 'company' | 'personal') => void,
    onOpenHistory?: (announcementId: string, announcementCode: string) => void
}) => {
    const { currentUser, onApprove, onReject, onEdit, onSendForApproval, onDelete, onReAnnounce } = props;
    
    return [
        // --- Ice Cream (بستنی) desired order in both compact/full ---
        { header: 'ردیف', width: '70px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'نماینده (پخش/نماینده)', accessor: (ann: FreightAnnouncement) => ann.representativeType, width: '140px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => (ann.representativeType === 'distributor' ? 'پخش' : 'نماینده') },
        { header: 'مقصد', accessor: (ann: FreightAnnouncement) => ann.destinations[0]?.city, width: '150px', display: (_:string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="text-blue-600 font-semibold">{ann.destinations[0]?.city || '-'}</span> },
        { header: 'مبدا', accessor: 'originCity', width: '140px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.originCity || '-' },
        { header: 'برند', accessor: 'brand', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.brand || '-' },
        { header: 'محصولات', accessor: (ann: FreightAnnouncement) => ann.products?.join(', '), width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.products?.join(', ') || '-' },
        { header: 'کارتن', accessor: 'cartonCount', width: '90px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.cartonCount ?? '-' },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
        { header: 'اولویت', accessor: 'priority', width: '100px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => PRIORITIES[ann.priority || 'normal'] },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'توضیحات', accessor: 'notes', width: '200px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.notes || '-' },
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (_vm: string, lt:any) => lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },

        // --- Common Columns (for Dairy & Ambient) ---
        { header: 'ردیف', width: '70px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && vm === 'full', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        // Announcement code removed across all tabs per request → not displayed anywhere
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'مبدا بارگیری', accessor: 'originCity', width: '140px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && !(vm === 'compact' && lt === FreightLineType.Dairy), render: (ann: FreightAnnouncement) => ann.originCity || '-' },
        { header: 'برند', accessor: 'brand', width: '120px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && !(vm === 'compact' && lt === FreightLineType.Dairy), render: (ann: FreightAnnouncement) => ann.brand || '-' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (_:string, lt:any) => lt !== FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (vm: string, lt:any) => lt !== FreightLineType.IceCream && vm === 'full', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },

        // Ambient (Compact): destinations list, show kg
        { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '400px', display: (vm: string, lt: any) => vm === 'compact' && lt === FreightLineType.Ambient,
            render: (ann: FreightAnnouncement) => (
                <div className="flex flex-col text-xs space-y-1">
                    {ann.destinations.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-center gap-2">
                            <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                            <span className="font-semibold text-slate-800">{d.city}</span>
                            <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} کیلوگرم` : ' N/A '})</span>
                        </div>
                    ))}
                </div>
            )
        },
        // Dairy (Compact): exact requested order
        { header: 'ردیف', width: '70px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
        { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.vehicleType },
        { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0), width: '150px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
        { header: 'مقاصد', accessor: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، '), width: '400px', display: (vm: string, lt: any) => vm === 'compact' && lt === FreightLineType.Dairy,
            render: (ann: FreightAnnouncement) => (
                <div className="flex flex-col text-xs space-y-1">
                    {ann.destinations.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-center gap-2">
                            <span className="bg-slate-200 text-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                            <span className="font-semibold text-slate-800">{d.city}</span>
                            <span className="text-slate-500">({d.tonnage ? `${Number(d.tonnage).toLocaleString('fa-IR')} کیلوگرم` : ' N/A '})</span>
                        </div>
                    ))}
                </div>
            )
        },
        { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
        { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
        { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
        { header: 'توضیحات', accessor: 'notes', width: '200px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.notes || '-' },
        { header: 'وضعیت', accessor: 'status', width: '120px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
        { header: 'علت رد', accessor: 'rejectionReason', width: '200px', display: (vm: string, lt:any) => vm === 'compact' && lt === FreightLineType.Dairy, render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
        { header: 'عملیات', width: '270px', display: () => true, render: (ann: FreightAnnouncement) => {
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
            const isLeftover = ann.status === FreightAnnouncementStatus.Leftover || ann.status === 'Leftover';
            
            // تایید/رد مدیر
            if (currentUser.role === UserRole.PlanningManager && ann.status === FreightAnnouncementStatus.PendingManagerApproval) {
                return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onApprove(ann.id)} className="px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600">تایید</button>
                        <button onClick={() => onReject(ann.id)} className="px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600">رد</button>
                    </div>
                );
            }
            
            // دکمه تاریخچه برای مدیر برنامه‌ریزی (بدون دکمه‌های ارجاع)
            if (currentUser.role === UserRole.PlanningManager && showHistory) {
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
            if (isLeftover && (currentUser.role === UserRole.PlanningEmployee || currentUser.role === UserRole.PlanningManager)) {
                return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onReAnnounce && onReAnnounce(ann.id)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">اعلام مجدد</button>
                        <button onClick={() => onEdit(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
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
            
            // ویرایش/حذف (کارمند و مدیر برنامه‌ریزی) - فقط برای Draft و Rejected
            if ((currentUser.role === UserRole.PlanningEmployee || currentUser.role === UserRole.PlanningManager) && [FreightAnnouncementStatus.Draft, FreightAnnouncementStatus.Rejected].includes(ann.status)) {
                 return (
                    <div className="flex justify-center gap-1">
                        <button onClick={() => onEdit(ann)} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs">ویرایش</button>
                        <button onClick={() => onSendForApproval(ann)} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs">ارجاع</button>
                        <button type="button" onClick={() => { try { console.log('🗑️ [FreightDashboard] Delete click:', ann.id); } catch {} try { onDelete && onDelete(ann.id); } catch (e) { console.error('❌ [FreightDashboard] Delete failed:', e); } }} className="px-2 py-1 bg-red-500 text-white rounded-md text-xs">حذف</button>
                    </div>
                 );
            }
            
            // دکمه تاریخچه برای همه پرسنل (شامل ترابری شرکتی و شخصی)
            if (props.onOpenHistory) {
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
            
            return <span className="text-xs text-slate-400">-</span>;
        }}
    ];
};

const FreightDashboard: React.FC<FreightDashboardProps> = (props) => {
    const { announcements, onAddAnnouncement, onUpdateAnnouncement, onApprove, onReject, onDelete, onReAnnounce, currentUser, onSendForApproval } = props;
    
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelData, setPanelData] = useState<FreightAnnouncement | null>(null); // null for new, object for edit

    const [rejectInfo, setRejectInfo] = useState<{ id: string; reason: string } | null>(null);
    
    const [activeTab, setActiveTab] = useState<FreightLineType>(FreightLineType.IceCream);
    const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
    const [filter, setFilter] = useState('');
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});
    const [managerView, setManagerView] = useState<'approval' | 'all'>('approval');
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [historyDialog, setHistoryDialog] = useState<{ isOpen: boolean; announcementId: string; announcementCode: string } | null>(null);


    const handleOpenCreatePanel = () => {
        // Create mode: no preset data object to avoid accidental edit-mode
        setPanelData(null);
        setIsPanelOpen(true);
    };

    const handleOpenEditPanel = (ann: FreightAnnouncement) => {
        setPanelData(ann);
        setIsPanelOpen(true);
    };
    
    const handleClosePanel = () => {
        setIsPanelOpen(false);
    };

    const handleOpenHistory = (announcementId: string, announcementCode: string) => {
        setHistoryDialog({ isOpen: true, announcementId, announcementCode });
    };

    const handleCloseHistory = () => {
        setHistoryDialog(null);
    };

    const handleOpenRejectDialog = (id: string) => setRejectInfo({ id, reason: '' });
    const handleCloseRejectDialog = () => setRejectInfo(null);
    
    const handleRejectSubmit = () => {
        if (rejectInfo && rejectInfo.reason) {
            onReject(rejectInfo.id, rejectInfo.reason);
            handleCloseRejectDialog();
        }
    };
    
    const handleSendForApproval = (ann: FreightAnnouncement) => {
        // اگر onSendForApproval از props ارسال شده، از آن استفاده می‌کنیم
        if (onSendForApproval) {
            onSendForApproval(ann);
        } else {
            // fallback به onUpdateAnnouncement
            onUpdateAnnouncement({ ...ann, status: FreightAnnouncementStatus.PendingManagerApproval });
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
            onReAnnounce: onReAnnounce,
            onOpenHistory: handleOpenHistory 
        });
        try { console.log('[DBG][FreightDashboard] allColumns headers:', cols.map((c:any)=>c.header)); } catch {}
        return cols;
    }, [props, onApprove, handleOpenRejectDialog, handleOpenEditPanel, handleSendForApproval, onDelete, onReAnnounce]);

    const visibleColumns = useMemo(() => {
        // Enforce exact order for Dairy compact
        if (viewMode === 'compact' && activeTab === FreightLineType.Dairy) {
            const dairyCompactCols: any[] = [
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
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
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) dairyCompactCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (dairy-compact):', dairyCompactCols.map((c:any)=>c.header)); } catch {}
            return dairyCompactCols;
        }

        // Enforce exact order for Ambient compact (mirror Dairy compact)
        if (viewMode === 'compact' && activeTab === FreightLineType.Ambient) {
            const ambientCompactCols: any[] = [
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
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
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) ambientCompactCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (ambient-compact):', ambientCompactCols.map((c:any)=>c.header)); } catch {}
            return ambientCompactCols;
        }

        // Enforce exact order for Dairy full (before grouped destinations)
        if (viewMode === 'full' && activeTab === FreightLineType.Dairy) {
            const dairyFullCommonCols: any[] = [
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
            const action = allColumns.find((c: any) => c.header === 'عملیات');
            if (action) dairyFullCommonCols.push(action);
            try { console.log('[DBG][FreightDashboard] visibleColumns (dairy-full):', dairyFullCommonCols.map((c:any)=>c.header)); } catch {}
            return dairyFullCommonCols;
        }

        // Enforce exact order for Ambient full (mirror Dairy full)
        if (viewMode === 'full' && activeTab === FreightLineType.Ambient) {
            const ambientFullCommonCols: any[] = [
                { header: 'ردیف', width: '70px', render: (_: any, idx: number) => idx + 1, accessor: (_: any) => '' },
                { header: 'نوع خودرو', accessor: 'vehicleType', width: '120px', render: (ann: FreightAnnouncement) => ann.vehicleType },
                { header: 'کل تناژ (کیلوگرم)', accessor: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0), width: '150px', render: (ann: FreightAnnouncement) => ann.destinations.reduce((s, d) => s + (Number(d.tonnage) || 0), 0).toLocaleString('fa-IR') },
                { header: 'ارزش بار (ریال)', accessor: 'cargoValue', width: '150px', render: (ann: FreightAnnouncement) => (ann.cargoValue ?? 0).toLocaleString('fa-IR') },
                { header: 'ساعت حضور', accessor: 'platformArrivalTime', width: '120px', render: (ann: FreightAnnouncement) => ann.platformArrivalTime || '-' },
                { header: 'تاریخ اعلام بار', accessor: (ann: FreightAnnouncement) => formatJalaliDateTime(ann.createdAt), width: '130px', render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalaliDateTime(ann.createdAt)}</span> },
                { header: 'توضیحات', accessor: 'notes', width: '200px', render: (ann: FreightAnnouncement) => ann.notes || '-' },
                { header: 'وضعیت', accessor: 'status', width: '120px', render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
                { header: 'علت رد', accessor: 'rejectionReason', width: '200px', render: (ann: FreightAnnouncement) => ann.rejectionReason || '-' },
            ];
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
        
        if (isManager && managerView === 'approval') {
            // مدیر در حالت "در انتظار تایید": فقط PendingManagerApproval
            data = data.filter(a => a.status === FreightAnnouncementStatus.PendingManagerApproval);
        } else if (isManager && managerView === 'all') {
            // مدیر در حالت "همه": همه وضعیت‌ها جز Finalized (Finalized در تاریخچه است)
            data = data.filter(a => a.status !== FreightAnnouncementStatus.Finalized && a.status !== 'Finalized');
        } else {
            // برای planner: همه وضعیت‌ها نمایش داده می‌شوند جز Finalized
            // planner باید بتواند روند اعلام بار را رصد کند تا زمانی که Finalized شود
            data = data.filter(a => {
                const isFinalized = a.status === FreightAnnouncementStatus.Finalized || a.status === 'Finalized' || a.status === 'تکمیل شده';
                return !isFinalized;
            });
        }

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            data = data.filter(a => 
                a.announcementCode.toLowerCase().includes(lowerFilter) || 
                a.destinations.some(d => d.city.toLowerCase().includes(lowerFilter))
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

        return data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }, [announcements, isManager, managerView, activeTab, filter, columnFilters, allColumns]);

    const handlePrint = () => {
        window.print();
    };

    const getExportValue = (ann: FreightAnnouncement, col: any, idx: number) => {
        if (!col.accessor) return '';

        let value;
        if (typeof col.accessor === 'function') {
            value = col.accessor(ann, idx);
        } else {
            value = ann[col.accessor as keyof FreightAnnouncement];
        }
        
        if (Array.isArray(value)) {
            return value.join('; ');
        }
    
        return value ?? '';
    };

    const handleExportToCSV = () => {
        try {
            const headers = visibleColumns.map(c => `"${c.header.replace(/"/g, '""')}"`);
            
            const dataRows = filteredAnnouncements.map((ann, idx) => 
                visibleColumns.map(col => {
                    const value = getExportValue(ann, col, idx);
                    const sanitizedValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value).replace(/"/g, '""') : String(value).replace(/"/g, '""');
                    return `"${sanitizedValue}"`;
                })
            );

            const csvContent = [headers.join(','), ...dataRows.map(row => row.join(','))].join('\n');
            
            const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `freight_export_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to export CSV:", error);
            alert("خطا در خروجی گرفتن اکسل.");
        }
    };
    
    // Header rendering logic
    const isFullDairyAmbient = viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeTab as any);
    const commonCols = useMemo(() => visibleColumns.filter(c => c.header !== 'عملیات'), [visibleColumns]);
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
                                <button onClick={handleExportToCSV} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700"><DocumentArrowDownIcon className="w-4 h-4" />اکسل</button>
                                <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700"><PrinterIcon className="w-4 h-4" />چاپ</button>
                                <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><BookOpenIcon className="w-5 h-5 text-slate-600"/></button>
                                {isManager && <div className="flex items-center p-1 bg-slate-100 rounded-lg"><button onClick={()=>setManagerView('approval')} className={`px-2 py-1 text-xs rounded ${managerView==='approval'?'bg-sky-600 text-white shadow':'bg-slate-100 hover:bg-slate-200'}`}>در انتظار تایید</button><button onClick={()=>setManagerView('all')} className={`px-2 py-1 text-xs rounded ${managerView==='all'?'bg-sky-600 text-white shadow':'bg-slate-100 hover:bg-slate-200'}`}>همه</button></div>}
                                <div className="flex items-center p-1 bg-slate-200 rounded-lg"><button onClick={()=>setViewMode('compact')} className={`px-2 py-1 text-xs rounded ${viewMode==='compact'?'bg-sky-600 text-white shadow':'bg-slate-200 hover:bg-slate-300'}`}>فشرده</button><button onClick={()=>setViewMode('full')} className={`px-2 py-1 text-xs rounded ${viewMode==='full'?'bg-sky-600 text-white shadow':'bg-slate-200 hover:bg-slate-300'}`}>کامل</button></div>
                                {canCreate && <button onClick={handleOpenCreatePanel} className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700"><PlusCircleIcon className="w-4 h-4"/>اعلام بار جدید</button>}
                            </div>
                        </div>
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg mb-4 print:hidden">
                            {Object.values(FreightLineType).map(lt => (
                                <button key={lt} onClick={() => setActiveTab(lt as any)} className={`flex-1 py-1 rounded-md text-sm font-semibold transition-colors ${activeTab === lt ? 'bg-sky-600 text-white shadow' : 'hover:bg-slate-200'}`}>{lt}</button>
                            ))}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase bg-gray-50">
                                     {isFullDairyAmbient ? (
                                        <>
                                            <tr>
                                                {commonCols.map(col => <th key={col.header} rowSpan={2} className="p-2 text-center" style={{ width: col.width }}>{col.header}</th>)}
                                                <th colSpan={5} className="p-2 text-center border-x">مقصد اول</th>
                                                <th colSpan={5} className="p-2 text-center border-x">مقصد دوم</th>
                                                <th colSpan={5} className="p-2 text-center border-x">مقصد سوم</th>
                                                <th colSpan={5} className="p-2 text-center border-x">مقصد چهارم</th>
                                                {actionCol && <th key={actionCol.header} rowSpan={2} className="p-2 text-center" style={{ width: actionCol.width }}>{actionCol.header}</th>}
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
                                            {visibleColumns.map(col => <th key={col.header} className="p-2 text-center" style={{ width: col.width }}>{col.header}</th>)}
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
                                        {isFullDairyAmbient && [...Array(21)].map((_, i) => <th key={`ph-${i}`}></th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAnnouncements.map((ann, idx) => (
                                        <tr key={ann.id} className="border-b hover:bg-slate-50">
                                             {isFullDairyAmbient ? (
                                                <>
                                                    {commonCols.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, props, activeTab as FreightLineType)}</td>)}
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
                                                    {actionCol && <td className="p-2 text-center">{actionCol.render(ann, idx, props, activeTab as FreightLineType)}</td>}
                                                </>
                                            ) : (
                                                visibleColumns.map(col => <td key={col.header} className="p-2 text-center">{col.render(ann, idx, props, activeTab as FreightLineType)}</td>)
                                            )}
                                        </tr>
                                    ))}
                                    {filteredAnnouncements.length === 0 && (
                                        <tr><td colSpan={isFullDairyAmbient ? commonCols.length + 21 : visibleColumns.length} className="text-center py-8 text-slate-500">موردی یافت نشد.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
            
            <AnnouncementPanel
                isOpen={isPanelOpen}
                data={panelData}
                onClose={handleClosePanel}
                onSaveNew={onAddAnnouncement}
                onSaveEdit={onUpdateAnnouncement}
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

const AnnouncementPanel: React.FC<{isOpen: boolean, data: FreightAnnouncement | null, onClose: () => void, onSaveNew: Function, onSaveEdit: (data: FreightAnnouncement) => void}> = ({ isOpen, data, onClose, onSaveNew, onSaveEdit }) => {
    const isEditMode = !!(data && data.id);
    
    const initialCommonState = { loadingDate: '', cargoValue: '', vehicleType: '', notes: '' };
    const initialIceCreamState = { originCity: '', destinationCity: '', brand: 'میهن', representativeType: 'agent', representativeName: '', cartonCount: '', priority: 'normal' as 'low'|'normal'|'high', products: [] as string[] };
    const initialMultiDestState = { platformArrivalTime: '' };
    const initialDestinations = [{ id: crypto.randomUUID(), city: '', representativeName: '' }];

    const [lineType, setLineType] = useState<FreightLineType>(FreightLineType.IceCream);
    const [commonState, setCommonState] = useState(initialCommonState);
    const [iceCreamState, setIceCreamState] = useState(initialIceCreamState);
    const [multiDestState, setMultiDestState] = useState(initialMultiDestState);
    const cargoPreview = useMemo(() => {
        const rials = parseFloat(commonState.cargoValue || '');
        if (!isFinite(rials)) return '';
        const toman = rials / 10;
        const millionToman = toman / 1_000_000;
        return millionToman > 0 ? `${millionToman.toLocaleString('fa-IR')} میلیون تومان` : '';
    }, [commonState.cargoValue]);
    const [destinations, setDestinations] = useState<Partial<Destination>[]>(initialDestinations);
    
    const resetForm = () => {
        // Don't reset lineType to allow multiple entries of the same type
        // Don't reset loadingDate to preserve the selected date
        // Don't reset platformArrivalTime to preserve the selected time
        setCommonState(prev => ({ ...initialCommonState, loadingDate: prev.loadingDate }));
        setIceCreamState(initialIceCreamState);
        setMultiDestState(prev => ({ ...initialMultiDestState, platformArrivalTime: prev.platformArrivalTime }));
        setDestinations(initialDestinations);
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
                setCommonState({ loadingDate: loadingDateStr, cargoValue: String((data.cargoValue || 0) / 1_000_000_000), vehicleType: data.vehicleType, notes: data.notes || '' });
                if (data.lineType === FreightLineType.IceCream) {
                    setIceCreamState({
                        originCity: data.originCity || '', destinationCity: data.destinations[0]?.city || '', brand: data.brand || 'میهن', representativeType: data.representativeType || 'agent', representativeName: data.representativeName || '', cartonCount: String(data.cartonCount || ''), priority: data.priority || 'normal', products: data.products || []
                    });
                } else {
                    setMultiDestState({ platformArrivalTime: data.platformArrivalTime || '' });
                    setDestinations(data.destinations.length > 0 ? data.destinations.map(d => ({...d})) : initialDestinations);
                }
            } else { // Create mode: ensure form is clear
                resetForm();
            }
        }
    }, [data, isOpen]);

    useEffect(() => {
        // Only run for new announcements and when lineType changes
        if (!data) { 
            const today = new Date();
            let targetDate = new Date(today);
            if (lineType === FreightLineType.IceCream) targetDate.setDate(today.getDate() + 1);
            // Set default as Jalali string
            setCommonState(s => ({ ...s, loadingDate: formatJalali(targetDate) }));
            if (lineType === FreightLineType.IceCream) {
                setMultiDestState(s => ({ ...s, platformArrivalTime: '07:00' }));
            } else if (lineType === FreightLineType.Dairy || lineType === FreightLineType.Ambient) {
                setMultiDestState(s => ({ ...s, platformArrivalTime: '07:00' }));
                setIceCreamState(s => ({ ...s, originCity: 'شهر لبنیات' } as any));
            }
        }
    }, [lineType, data, isOpen]); // Rerun when panel opens too

    const addDestination = () => { if(destinations.length < 4) setDestinations([...destinations, { id: crypto.randomUUID(), city: '', representativeName: '' }]); };
    const removeDestination = (id: string) => setDestinations(destinations.filter(d => d.id !== id));
    const handleDestinationChange = (id: string, field: keyof Destination, value: any) => setDestinations(destinations.map(d => d.id === id ? { ...d, [field]: value } : d));
    const handleProductChange = (product: string, checked: boolean) => setIceCreamState(s => ({ ...s, products: checked ? [...s.products, product] : s.products.filter(p => p !== product)}));

    const handleSubmit = (e: React.FormEvent, isDraft: boolean = false) => {
        e.preventDefault();
        const cargoValueInRials = parseFloat(commonState.cargoValue) * 1_000_000_000;
        if (isNaN(cargoValueInRials) || cargoValueInRials < 1_000_000_000 || cargoValueInRials > 110_000_000_000) { alert('ارزش بار باید بین ۱ تا ۱۱۰ میلیارد ریال باشد.'); return; }
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
        if (!jalaliDate || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(jalaliDate)) { 
            console.error(`📅 [FreightDashboard] Invalid date format:`, jalaliDate);
            alert('تاریخ نامعتبر است. قالب صحیح: YYYY/MM/DD'); 
            return; 
        }
        console.log(`📅 [FreightDashboard] Submitting with loadingDate:`, jalaliDate);
        const announcementData: Omit<FreightAnnouncement, 'id' | 'status' | 'announcementCode' | 'createdAt' | 'history'> = lineType === FreightLineType.IceCream
            ? { loadingDate: jalaliDate, lineType, cargoValue: cargoValueInRials, vehicleType: commonState.vehicleType, notes: commonState.notes, originCity: iceCreamState.originCity, brand: iceCreamState.brand as any, representativeType: iceCreamState.representativeType as any, representativeName: iceCreamState.representativeName, cartonCount: Number(iceCreamState.cartonCount), priority: iceCreamState.priority, products: iceCreamState.products, destinations: [{id: crypto.randomUUID(), city: iceCreamState.destinationCity, representativeName: iceCreamState.representativeName }] }
            : { loadingDate: jalaliDate, lineType, cargoValue: cargoValueInRials, vehicleType: commonState.vehicleType, notes: commonState.notes, platformArrivalTime: multiDestState.platformArrivalTime, destinations: destinations as Destination[] };
        
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
                            {Object.values(FreightLineType).map(lt => (
                                <button type="button" key={lt} onClick={() => setLineType(lt)} className={`px-4 py-2 rounded-lg text-sm ${lineType === lt ? 'bg-sky-600 text-white' : 'bg-slate-200'}`}>{lt}</button>
                            ))}
                        </div>
                    </div>

                    <fieldset className="p-3 border rounded-lg bg-white">
                        <legend className="font-semibold px-1 text-sm">اطلاعات مشترک</legend>
                            <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs">تاریخ بارگیری (جلالی)*</label>
                                <input 
                                    type="text" 
                                    placeholder="1403/01/01" 
                                    value={commonState.loadingDate} 
                                    onChange={e => setCommonState(s=>({...s, loadingDate: e.target.value}))} 
                                    className="input-style mt-1" 
                                    pattern="\d{4}/\d{1,2}/\d{1,2}"
                                    title="فرمت صحیح: 1403/01/01"
                                    required
                                />
                                <div className="text-xs text-slate-500 mt-1">فرمت: 1403/01/01</div>
                            </div>
                            <div><label className="text-xs">نوع خودرو*</label><select value={commonState.vehicleType} onChange={e => setCommonState(s=>({...s, vehicleType: e.target.value}))} className="input-style mt-1" required><option value="">-- انتخاب کنید --</option>{VEHICLE_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}</select></div>
                                <div>
                                   <label className="text-xs">ارزش بار (میلیارد ریال)*</label>
                                   <input type="number" step="0.1" value={commonState.cargoValue} onChange={e => setCommonState(s=>({...s, cargoValue: e.target.value}))} className="input-style mt-1" required/>
                                   <div className="text-[11px] text-slate-500 mt-1">≈ {cargoPreview || '-'} (حدوداً)</div>
                                   <small className="text-slate-500 text-xs">بین ۱ تا ۱۱۰</small>
                                </div>
                        </div>
                    </fieldset>

                    {lineType === FreightLineType.IceCream && (
                        <>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">مسیر و بار</legend>
                            <div className="grid grid-cols-3 gap-3">
                                <div><label className="text-xs">مبدا بارگیری*</label><input value={iceCreamState.originCity} onChange={e=>setIceCreamState(s=>({...s, originCity: e.target.value}))} className="input-style mt-1" list="cities" required/></div>
                                <div><label className="text-xs">شهر مقصد*</label><input value={iceCreamState.destinationCity} onChange={e=>setIceCreamState(s=>({...s, destinationCity: e.target.value}))} className="input-style mt-1" list="cities" required/></div>
                                <div><label className="text-xs">تعداد کارتن*</label><input type="number" value={iceCreamState.cartonCount} onChange={e=>setIceCreamState(s=>({...s, cartonCount: e.target.value}))} className="input-style mt-1" required/></div>
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">جزئیات نماینده و محصول</legend>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs">برند*</label><select value={iceCreamState.brand} onChange={e=>setIceCreamState(s=>({...s, brand: e.target.value as any}))} className="input-style mt-1">{BRANDS.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                                <div><label className="text-xs">نوع*</label><select value={iceCreamState.representativeType} onChange={e=>setIceCreamState(s=>({...s, representativeType: e.target.value as any}))} className="input-style mt-1"><option value="agent">نماینده</option><option value="distributor">پخش</option></select></div>
                                <div><label className="text-xs">نام نماینده/پخش</label><input value={iceCreamState.representativeName} onChange={e=>setIceCreamState(s=>({...s, representativeName: e.target.value}))} className="input-style mt-1" /></div>
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
                            <div><label className="text-xs">ساعت حضور در سکو</label><input type="time" value={multiDestState.platformArrivalTime} onChange={e=>setMultiDestState(s=>({...s, platformArrivalTime: e.target.value}))} className="input-style mt-1" /></div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-white">
                            <legend className="font-semibold px-1 text-sm">مقاصد</legend>
                            <div className="space-y-2">
                                {destinations.map((dest, index) => (
                                    <div key={dest.id} className="p-2 bg-slate-100 rounded space-y-2 relative">
                                        <span className="absolute top-2 left-2 bg-slate-300 text-slate-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{index + 1}</span>
                                        {destinations.length > 1 && <button type="button" onClick={() => removeDestination(dest.id!)} className="absolute top-2 right-2 text-red-500 text-xs">حذف</button>}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-xs">شهر مقصد*</label><input value={dest.city || ''} onChange={e => handleDestinationChange(dest.id!, 'city', e.target.value)} list="cities" className="input-style" required/></div>
                                            <div><label className="text-xs">نام نماینده</label><input value={dest.representativeName || ''} onChange={e => handleDestinationChange(dest.id!, 'representativeName', e.target.value)} className="input-style"/></div>
                                            <div><label className="text-xs">تناژ <span className="text-[10px] text-slate-500">(کیلوگرم)</span></label><input type="number" value={dest.tonnage || ''} onChange={e => handleDestinationChange(dest.id!, 'tonnage', Number(e.target.value))} className="input-style"/></div>
                                            <div><label className="text-xs">ساعت تخلیه</label><input type="time" value={dest.unloadTime || ''} onChange={e => handleDestinationChange(dest.id!, 'unloadTime', e.target.value)} className="input-style"/></div>
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
                 <datalist id="cities">{mockCities.map(c => <option key={c} value={c} />)}</datalist>
            </aside>
        </>
    );
}

export default FreightDashboard;