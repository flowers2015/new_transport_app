// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface TransportLiveProps {
    announcements: FreightAnnouncement[];
    vehicles: Vehicle[];
    drivers: Driver[];
    onUpdateAssignment: (announcementId: string, assignment: { 
        assignmentType: 'company' | 'personal';
        driverId?: string; 
        vehicleId?: string; 
        billOfLadingNumber?: string;
        // Personal driver info
        nationalId?: string;
        driverName?: string;
        driverContact?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        destinations?: Destination[];
    }) => void;
    onFinalize: (announcementIds: string[]) => void;
    onTransferDestination: (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => void;
    onForward: (announcementId: string) => void;
    onCancel: (announcementId: string) => void;
    currentUser: User;
}

const getDriverName = (id: string | undefined, drivers: Driver[]) => id ? drivers.find(d => d.id === id)?.name : '-';
const getDriverContact = (id: string | undefined, drivers: Driver[]) => id ? drivers.find(d => d.id === id)?.mobile : '-';
const getVehicleIdentifier = (id: string | undefined, vehicles: Vehicle[]) => {
    if (!id) return '-';
    const v = vehicles.find(v => v.id === id);
    return v ? (v.plateNumber ? formatPlateNumber(v.plateNumber) : v.serialNumber) : 'نامشخص';
};
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
};

const columnsConfig = (props: TransportLiveProps, viewMode: 'compact' | 'full') => {
    const { vehicles, drivers } = props;
    
    let columns = [
        // Common Columns
        { header: 'ردیف', align: 'center', display: () => viewMode === 'full', render: (_: any, idx: number) => idx + 1 },
        { header: 'کد اعلام بار', align: 'center', display: () => true, render: (ann: FreightAnnouncement) => ann.announcementCode },
        { header: 'وضعیت', display: () => true, render: (ann: FreightAnnouncement) => <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyles[ann.status]}`}>{ann.status}</span> },
        { header: 'تاریخ بارگیری', display: () => true, render: (ann: FreightAnnouncement) => <span className="whitespace-nowrap">{formatJalali(ann.loadingDate)}</span> },
        { header: 'نوع خودرو', display: () => true, render: (ann: FreightAnnouncement) => ann.vehicleType },
        
        // Destinations Summary (for all compact views)
        { header: 'مقاصد', display: () => viewMode === 'compact', render: (ann: FreightAnnouncement) => ann.destinations.map(d => d.city).join('، ') },

        // Assignment Info (for all views)
        { header: 'نام راننده', display: () => true, render: (ann: FreightAnnouncement) => getDriverName(ann.assignedDriverId, drivers) },
        { header: 'تماس راننده', display: () => viewMode === 'full' || viewMode === 'compact', render: (ann: FreightAnnouncement) => <span className="font-mono">{getDriverContact(ann.assignedDriverId, drivers)}</span> },
        { header: 'پلاک خودرو', display: () => true, render: (ann: FreightAnnouncement) => <span className="font-mono whitespace-nowrap">{ann.assignmentType === 'company' ? getVehicleIdentifier(ann.assignedVehicleId, vehicles) : drivers.find(d => d.id === ann.assignedDriverId)?.currentVehiclePlate || '-'}</span> },
        { header: 'شماره بارنامه', display: () => true, render: (ann: FreightAnnouncement) => ann.billOfLadingNumber || '-' },
        { header: 'کرایه کل', display: () => true, render: (ann: FreightAnnouncement) => <span className="font-mono">{formatCurrency(ann.totalFreightCost)}</span> },
        
        // Full View Specific - Ice Cream
        { header: 'تعداد کارتن', align: 'center', display: (lt:any) => viewMode === 'full' && lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.cartonCount },
        { header: 'محصولات', display: (lt:any) => viewMode === 'full' && lt === FreightLineType.IceCream, render: (ann: FreightAnnouncement) => ann.products?.join(', ') },
        
        // Full View Specific - Dairy/Ambient
        { header: 'ساعت حضور', display: (lt: any) => viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(lt), render: (ann: FreightAnnouncement) => ann.platformArrivalTime },
        { header: 'ارزش بار', align: 'center', display: () => viewMode === 'full', render: (ann: FreightAnnouncement) => (ann.cargoValue || 0).toLocaleString('fa-IR') },
    ];

    return columns;
};


const TransportLive: React.FC<TransportLiveProps> = (props) => {
    const { announcements, onFinalize, currentUser, onCancel, onForward, onTransferDestination } = props;
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [dateView, setDateView] = useState<'today' | 'all'>('today');
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    
    const [dialog, setDialog] = useState<'assign' | 'transfer' | null>(null);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<FreightAnnouncement | null>(null);

    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    };

    const canPerformActions = hasAccess([UserRole.Transportation, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User]);

    const liveAnnouncements = useMemo(() => 
        announcements.filter(a => {
            if (dateView === 'today' && !isToday(a.loadingDate)) return false;

            if (currentUser.role === UserRole.TransportationUser) {
                // Company transport sees Company assignments or assigned loads
                return a.status === FreightAnnouncementStatus.PendingCompanyAssignment || a.status === FreightAnnouncementStatus.Assigned;
            }
            if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
                // Personal transport sees Personal assignments or assigned loads
                return a.status === FreightAnnouncementStatus.PendingPersonalAssignment || a.status === FreightAnnouncementStatus.Assigned;
            }
            if (currentUser.role === UserRole.BranchFinance && currentUser.branchCity) {
                 return a.destinations.some(d => d.city === currentUser.branchCity) && a.status === FreightAnnouncementStatus.Assigned;
            }
            // Other roles like planners see everything that's live
            return [
                FreightAnnouncementStatus.PendingCompanyAssignment, 
                FreightAnnouncementStatus.PendingPersonalAssignment, 
                FreightAnnouncementStatus.Assigned
            ].includes(a.status);
        })
        .sort((a,b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()), 
    [announcements, currentUser, dateView]);

    const filteredAnnouncements = useMemo(() => {
        return liveAnnouncements.filter(a => a.lineType === activeLine);
    }, [liveAnnouncements, activeLine]);

    const handleOpenDialog = (type: 'assign' | 'transfer', ann: FreightAnnouncement) => {
        setSelectedAnnouncement(ann);
        setDialog(type);
    };
    
    const handleCloseDialog = () => {
        setSelectedAnnouncement(null);
        setDialog(null);
    }
    
    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleFinalizeSelected = () => {
        if (selectedIds.size > 0) {
            onFinalize(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    }

    const visibleColumns = useMemo(() => {
        return columnsConfig(props, viewMode).filter(c => c.display(activeLine));
    }, [viewMode, activeLine, props]);

    const isFullDairyAmbient = viewMode === 'full' && [FreightLineType.Dairy, FreightLineType.Ambient].includes(activeLine);
    const commonCols = useMemo(() => visibleColumns, [visibleColumns]);

    return (
        <div className="max-w-screen-2xl mx-auto space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-md">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center"><TruckIcon className="w-6 h-6 mr-2 text-sky-600" />پیگیری اعلام بار-زنده و تخصیص</h2>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {canPerformActions && selectedIds.size > 0 && <button onClick={handleFinalizeSelected} className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600"><CheckCircleIcon className="w-4 h-4" />نهایی‌سازی ({selectedIds.size})</button>}
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                            <button onClick={() => setDateView('today')} className={`px-3 py-1 text-xs rounded-md ${dateView === 'today' ? 'bg-white shadow' : ''}`}>بارگیری امروز</button>
                            <button onClick={() => setDateView('all')} className={`px-3 py-1 text-xs rounded-md ${dateView === 'all' ? 'bg-white shadow' : ''}`}>مشاهده همه</button>
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
                                const isAnnLeftover = new Date(ann.loadingDate) < today && [FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status);
                                const isTransportRole = hasAccess([UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User]);
                                const canTakeAction = !isAnnLeftover || !isTransportRole;

                                const isAssignedByOther = ann.status === FreightAnnouncementStatus.Assigned && (
                                    (ann.assignmentType === 'personal' && currentUser.role === UserRole.TransportationUser) ||
                                    (ann.assignmentType === 'company' && currentUser.role === UserRole.Transportation_Personal_Vehicle_User)
                                );
                                
                                const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-400";

                                const showForwardButton = 
                                    (currentUser.role === UserRole.TransportationUser && ann.lineType === FreightLineType.IceCream && ann.status === FreightAnnouncementStatus.PendingCompanyAssignment) ||
                                    (currentUser.role === UserRole.Transportation_Personal_Vehicle_User && [FreightLineType.Dairy, FreightLineType.Ambient].includes(ann.lineType) && ann.status === FreightAnnouncementStatus.PendingPersonalAssignment);

                                return (
                                <tr key={ann.id} className={`border-b ${selectedIds.has(ann.id) ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
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
                                                        <td className="p-2 text-center border">{dest?.unloadTime || '-'}</td>
                                                        <td className="p-2 text-center border font-mono">{formatCurrency(dest?.freightCost)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        visibleColumns.map(col => <td key={col.header} className="p-2" style={{textAlign: (col.align || 'right') as any}}>{col.render(ann, idx, props)}</td>)
                                    )}

                                    <td className="p-2 sticky -left-px z-10" style={{width: '180px', backgroundColor: selectedIds.has(ann.id) ? '#f0f9ff' : 'white'}}>
                                        <div className="flex gap-1 flex-wrap">
                                            {canPerformActions && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('assign', ann)} className={`flex items-center gap-1 px-3 py-1 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700 ${disabledClasses}`}><PencilIcon className="w-3 h-3"/>{[FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(ann.status) ? 'تخصیص' : 'ویرایش'}</button>}
                                            {canPerformActions && ann.destinations.length > 1 && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => handleOpenDialog('transfer', ann)} title="انتقال مقصد" className={`p-1 bg-yellow-500 text-white rounded-md text-xs hover:bg-yellow-600 ${disabledClasses}`}><SwitchHorizontalIcon className="w-4 h-4"/></button>}
                                            {canPerformActions && showForwardButton && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => onForward(ann.id)} title="ارجاع به ترابری دیگر" className={`px-3 py-1 bg-purple-500 text-white rounded-md text-xs hover:bg-purple-600 ${disabledClasses}`}>ارجاع</button>}
                                            {canPerformActions && ann.status !== FreightAnnouncementStatus.Cancelled && ann.status !== FreightAnnouncementStatus.Finalized && <button disabled={!canTakeAction || isAssignedByOther} onClick={() => onCancel(ann.id)} title="لغو اعلام بار" className={`px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 ${disabledClasses}`}>لغو</button>}
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
             {selectedAnnouncement && dialog === 'transfer' && <DestinationTransferDialog allAnnouncements={liveAnnouncements} sourceAnnouncement={selectedAnnouncement} onClose={handleCloseDialog} onSave={props.onTransferDestination} />}
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
    const { announcement, drivers, vehicles, onClose, onUpdateAssignment, currentUser } = props;

    // --- Company User State ---
    const [driverEmployeeId, setDriverEmployeeId] = useState('');
    const [foundCompanyDriver, setFoundCompanyDriver] = useState<Driver | null>(null);
    const [vehicleInternalId, setVehicleInternalId] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    
    // --- Personal User State ---
    const [nationalId, setNationalId] = useState('');
    const [foundPersonalDriver, setFoundPersonalDriver] = useState<Driver | null | 'not_found'>(null);
    const [personalDriverDetails, setPersonalDriverDetails] = useState({ name: '', mobile: '' });
    const [personalVehicleDetails, setPersonalVehicleDetails] = useState({ type: '', plate: '' });
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [costMode, setCostMode] = useState<'manual' | 'auto'>('manual');
    const [autoTotalCost, setAutoTotalCost] = useState('');
    
    // --- Common State ---
    const [blNumber, setBlNumber] = useState(announcement.billOfLadingNumber || '');

    useEffect(() => {
        if (announcement.assignmentType === 'company') {
            const driver = drivers.find(d => d.id === announcement.assignedDriverId);
            const vehicle = vehicles.find(v => v.id === announcement.assignedVehicleId);
            if (driver) { setDriverEmployeeId(driver.employeeId); setFoundCompanyDriver(driver); }
            if (vehicle) { setVehicleInternalId(vehicle.id); setFoundVehicle(vehicle); }
        } else if (announcement.assignmentType === 'personal') {
            const driver = drivers.find(d => d.id === announcement.assignedDriverId);
            if(driver) {
                setNationalId(driver.nationalId);
                setFoundPersonalDriver(driver);
                setPersonalDriverDetails({ name: driver.name, mobile: driver.mobile });
                setPersonalVehicleDetails({ type: driver.currentVehicleType || '', plate: driver.currentVehiclePlate || '' });
            }
        }
        setDestinations(JSON.parse(JSON.stringify(announcement.destinations))); // Deep copy
        setBlNumber(announcement.billOfLadingNumber || '');
    }, [announcement, drivers, vehicles]);
    
    useEffect(() => {
        if(costMode === 'auto') {
            const totalCost = Number(autoTotalCost) || 0;
            const totalTonnage = destinations.reduce((sum, d) => sum + (d.tonnage || 0), 0);
            if(totalTonnage > 0 && totalCost > 0) {
                setDestinations(prevDests => prevDests.map(dest => {
                    const tonnageRatio = (dest.tonnage || 0) / totalTonnage;
                    return {...dest, freightCost: Math.round(totalCost * tonnageRatio)};
                }));
            }
        }
    }, [autoTotalCost, costMode]);

    const handleCompanyDriverLookup = () => {
        const driver = drivers.find(d => d.employeeId.toLowerCase() === driverEmployeeId.toLowerCase());
        setFoundCompanyDriver(driver || null);
        if (!driver) alert('راننده با این کد پرسنلی یافت نشد.');
    };

    const handleVehicleLookup = () => {
        const vehicle = vehicles.find(v => v.id.toLowerCase() === vehicleInternalId.toLowerCase());
        setFoundVehicle(vehicle || null);
        if (!vehicle) alert('خودرو با این کد یافت نشد.');
    };
    
    const handlePersonalDriverLookup = () => {
        const driver = drivers.find(d => d.nationalId === nationalId);
        if (driver) {
            setFoundPersonalDriver(driver);
            setPersonalDriverDetails({ name: driver.name, mobile: driver.mobile });
            setPersonalVehicleDetails({ type: driver.currentVehicleType || '', plate: driver.currentVehiclePlate || '' });
        } else {
            setFoundPersonalDriver('not_found');
            setPersonalDriverDetails({ name: '', mobile: '' });
            setPersonalVehicleDetails({ type: '', plate: '' });
            alert('راننده با این کدملی یافت نشد. لطفاً اطلاعات راننده جدید را وارد نمایید.');
        }
    }
    
    const totalPersonalCost = useMemo(() => destinations.reduce((sum, d) => sum + (d.freightCost || 0), 0), [destinations]);

    const handleSave = () => {
        if (currentUser.role === UserRole.TransportationUser) {
            if (!foundCompanyDriver || !foundVehicle) { alert('لطفا راننده و خودروی شرکتی را با جستجو مشخص کنید.'); return; }
            onUpdateAssignment(announcement.id, {
                driverId: foundCompanyDriver.id, vehicleId: foundVehicle.id, billOfLadingNumber: blNumber, assignmentType: 'company',
            });
        } else if (currentUser.role === UserRole.Transportation_Personal_Vehicle_User) {
            if (!nationalId || !personalDriverDetails.name || !personalVehicleDetails.plate) { alert('کدملی، نام راننده و پلاک خودرو الزامی است.'); return; }
            onUpdateAssignment(announcement.id, {
                nationalId, ...personalDriverDetails, ...personalVehicleDetails,
                destinations, billOfLadingNumber: blNumber, assignmentType: 'personal',
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
                                <input placeholder="کد پرسنلی راننده..." value={driverEmployeeId} onChange={e => setDriverEmployeeId(e.target.value)} className="input-style flex-grow"/>
                                <button onClick={handleCompanyDriverLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundCompanyDriver && <div className="mt-2 p-2 bg-green-50 text-green-800 text-sm rounded"><strong>راننده:</strong> {foundCompanyDriver.name} | <strong>تماس:</strong> {foundCompanyDriver.mobile}</div>}
                        </div>
                        <div className="p-2 border rounded-md bg-slate-50">
                            <label className="text-sm font-medium">خودرو شرکتی*</label>
                            <div className="flex items-end gap-2 mt-1">
                                <input placeholder="کد داخلی خودرو (مثال: veh-1)" value={vehicleInternalId} onChange={e => setVehicleInternalId(e.target.value)} className="input-style flex-grow"/>
                                <button onClick={handleVehicleLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundVehicle && <div className="mt-2 p-2 bg-green-50 text-green-800 text-sm rounded"><strong>خودرو:</strong> {getVehicleIdentifier(foundVehicle.id, vehicles)} | <strong>نوع:</strong> {foundVehicle.type}</div>}
                        </div>
                         <div><label className="text-sm">شماره بارنامه</label><input value={blNumber} onChange={e => setBlNumber(e.target.value)} className="input-style mt-1" /></div>
                    </div>
                )}

                {isPersonalUser && (
                     <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <fieldset className="p-3 border rounded-lg bg-slate-50 space-y-2">
                             <legend className="font-semibold px-1 text-sm">۱. اطلاعات راننده و خودرو</legend>
                             <div className="flex items-end gap-2">
                                <div className="flex-grow"><label className="text-xs">کد ملی راننده*</label><input placeholder="کدملی..." value={nationalId} onChange={e => {setNationalId(e.target.value); setFoundPersonalDriver(null);}} className="input-style"/></div>
                                <button onClick={handlePersonalDriverLookup} className="px-3 py-2 bg-slate-600 text-white rounded-md text-xs hover:bg-slate-700">جستجو</button>
                            </div>
                            {foundPersonalDriver && <div className={`mt-2 p-2 text-sm rounded ${foundPersonalDriver === 'not_found' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{foundPersonalDriver === 'not_found' ? 'راننده جدید. اطلاعات را وارد کنید.' : 'راننده یافت شد.'}</div>}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                <div><label className="text-xs">نام و نام خانوادگی*</label><input value={personalDriverDetails.name} onChange={e => setPersonalDriverDetails(s=>({...s, name: e.target.value}))} className="input-style" disabled={foundPersonalDriver !== 'not_found' && !!foundPersonalDriver}/></div>
                                <div><label className="text-xs">شماره تماس*</label><input value={personalDriverDetails.mobile} onChange={e => setPersonalDriverDetails(s=>({...s, mobile: e.target.value}))} className="input-style" disabled={foundPersonalDriver !== 'not_found' && !!foundPersonalDriver}/></div>
                                <div><label className="text-xs">نوع خودرو*</label><input value={personalVehicleDetails.type} onChange={e => setPersonalVehicleDetails(s=>({...s, type: e.target.value}))} className="input-style"/></div>
                                <div><label className="text-xs">شماره پلاک*</label><input value={personalVehicleDetails.plate} onChange={e => setPersonalVehicleDetails(s=>({...s, plate: e.target.value}))} className="input-style"/></div>
                            </div>
                        </fieldset>
                        <fieldset className="p-3 border rounded-lg bg-slate-50 space-y-2">
                            <legend className="font-semibold px-1 text-sm">۲. تخصیص کرایه</legend>
                            <div className="flex items-center gap-4"><label><input type="radio" value="manual" checked={costMode==='manual'} onChange={e=>setCostMode(e.target.value as any)}/> دستی</label><label><input type="radio" value="auto" checked={costMode==='auto'} onChange={e=>setCostMode(e.target.value as any)}/> خودکار</label></div>
                            {costMode === 'auto' && <div className="flex items-center gap-2"><label className="text-sm">کرایه کل (ریال):</label><input type="number" value={autoTotalCost} onChange={e=>setAutoTotalCost(e.target.value)} className="input-style flex-grow"/></div>}
                            <div className="space-y-2">
                                {destinations.map((dest, i) => (
                                    <div key={dest.id} className="grid grid-cols-5 gap-2 items-center text-sm p-1">
                                        <div className="col-span-2"><strong>مقصد {i+1}:</strong> {dest.city} ({dest.tonnage || 0} تن)</div>
                                        <div className="col-span-3 flex items-center gap-2"><label>کرایه:</label><input type="number" value={dest.freightCost || ''} onChange={e => setDestinations(dests => dests.map(d => d.id === dest.id ? {...d, freightCost: Number(e.target.value)}: d))} className="input-style" /><span className="text-xs">ریال</span></div>
                                    </div>
                                ))}
                            </div>
                             <div className="text-right font-bold pt-2 border-t">کرایه کل: {totalPersonalCost.toLocaleString('fa-IR')} ریال</div>
                        </fieldset>
                        <div><label className="text-sm">شماره بارنامه</label><input value={blNumber} onChange={e => setBlNumber(e.target.value)} className="input-style mt-1" /></div>
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

const DestinationTransferDialog: React.FC<{sourceAnnouncement: FreightAnnouncement, allAnnouncements: FreightAnnouncement[], onClose: ()=>void, onSave: TransportLiveProps['onTransferDestination']}> = 
({ sourceAnnouncement, allAnnouncements, onClose, onSave }) => {
    const [destinationId, setDestinationId] = useState('');
    const [targetAnnouncementId, setTargetAnnouncementId] = useState('');
    const [newPosition, setNewPosition] = useState(1);
    
    const handleSave = () => {
        if(!destinationId || !targetAnnouncementId) { alert('لطفا مقصد و بار هدف را انتخاب کنید.'); return; }
        onSave(sourceAnnouncement.id, destinationId, targetAnnouncementId, newPosition);
        onClose();
    }
    
    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b"><h3 className="text-lg font-bold">انتقال مقصد از بار #{sourceAnnouncement.announcementCode}</h3></div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label>۱. انتخاب مقصد مبدا</label><select value={destinationId} onChange={e=>setDestinationId(e.target.value)} className="input-style mt-1"><option value="">-- انتخاب مقصد --</option>{sourceAnnouncement.destinations.map(d=><option key={d.id} value={d.id}>{d.city} - {d.representativeName}</option>)}</select></div>
                    <div><label>۲. انتخاب بار هدف</label><select value={targetAnnouncementId} onChange={e=>setTargetAnnouncementId(e.target.value)} className="input-style mt-1"><option value="">-- انتخاب بار --</option>{allAnnouncements.filter(a => a.id !== sourceAnnouncement.id).map(a=><option key={a.id} value={a.id}>#{a.announcementCode} ({a.destinations.map(d=>d.city).join(', ')})</option>)}</select></div>
                    <div><label>۳. موقعیت جدید</label><select value={newPosition} onChange={e=>setNewPosition(Number(e.target.value))} className="input-style mt-1">{[1,2,3,4].map(n=><option key={n} value={n}>مقصد {n}</option>)}</select></div>
                </div>
                 <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md text-sm">انصراف</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">انتقال</button>
                </div>
             </div>
         </div>
    )
}


export default TransportLive;