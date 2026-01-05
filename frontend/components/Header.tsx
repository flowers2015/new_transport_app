import React, { useState, useRef, useEffect } from 'react';
import { View, UserRole, User } from '../types';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import ChangePasswordDialog from './ChangePasswordDialog';

interface HeaderProps {
    onNavigate: (view: View) => void;
    alertsCount: number;
    currentUser?: User; // currentUser may be undefined before login
    onLogout: () => void;
    defaultDashboardView: View;
}

const Header: React.FC<HeaderProps> = ({ onNavigate, alertsCount, currentUser, onLogout, defaultDashboardView }) => {
    const [isMgmtDropdownOpen, setMgmtDropdownOpen] = useState(false);
    const [isAdminDropdownOpen, setAdminDropdownOpen] = useState(false);
    const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
    const mgmtDropdownRef = useRef<HTMLDivElement>(null);
    const adminDropdownRef = useRef<HTMLDivElement>(null);

    const useOutsideAlerter = (ref: React.RefObject<HTMLDivElement>, close: () => void) => {
        useEffect(() => {
            function handleClickOutside(event: MouseEvent) {
                if (ref.current && !ref.current.contains(event.target as Node)) {
                    close();
                }
            }
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }, [ref, close]);
    };

    useOutsideAlerter(mgmtDropdownRef, () => setMgmtDropdownOpen(false));
    useOutsideAlerter(adminDropdownRef, () => setAdminDropdownOpen(false));

    const handleNavigate = (view: View) => {
        // Debug navigation
        console.log('[Header] Navigating to view:', view);
        setMgmtDropdownOpen(false);
        setAdminDropdownOpen(false);
        onNavigate(view);
    };
    
    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (!currentUser) return false;
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    };

    const isAdmin = !!currentUser && currentUser.role === UserRole.Admin;
    
    // Debug: بررسی نقش کاربر
    React.useEffect(() => {
        if (currentUser) {
            console.log('🔍 [Header] Current user role:', currentUser.role, 'Is Admin?', isAdmin);
            console.log('🔍 [Header] UserManagement access:', hasAccess([UserRole.Admin]));
        }
    }, [currentUser, isAdmin]);
    const isTransportDefault = defaultDashboardView === View.TransportDashboard;

    const navItems = [
      // Transport Finance Section - منوهای مالی ترابری
      { view: View.TransportFinance, label: 'داشبورد', roles: [UserRole.TransportationFinance] },
      { view: View.TransportFinanceCalculation, label: 'محاسبه هزینه تور', roles: [UserRole.TransportationFinance] },
      { view: View.MonthlyCommissionCalculation, label: 'محاسبه پورسانت', roles: [UserRole.TransportationFinance] },
      { view: View.TransportFinancePaymentList, label: 'لیست پرداخت', roles: [UserRole.TransportationFinance] },
      { view: View.TransportFinancePaidInvoices, label: 'صورتحساب‌های پرداخت شده', roles: [UserRole.TransportationFinance] },
      { view: View.AllowanceRegulation, label: 'بخشنامه', roles: [UserRole.TransportationFinance] },
      { type: 'divider', roles: [UserRole.TransportationFinance] },
      // Planning Section - برنامه ریزی (اولین برای PlanningEmployee)
      { view: View.FreightPlanning, label: 'برنامه ریزی ارسال بار', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager] },
      // Freight Management Section - اعلام بار
      { view: View.TransportLive, label: 'پیگیری اعلام بار-زنده', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User, UserRole.BranchFinance, UserRole.HQFinance, UserRole.CentralFinance, UserRole.TransportationFinance], special: 'blinking' },
      { view: View.FreightHistory, label: 'تاریخچه اعلام بار', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User, UserRole.BranchFinance, UserRole.HQFinance, UserRole.CentralFinance, UserRole.TransportationFinance] },
      // داشبورد برای PlanningEmployee (بعد از تاریخچه اعلام بار)
      { view: View.Dashboard, label: 'داشبورد', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager] },
      { type: 'divider', roles: [UserRole.TransportationFinance] },
      // سایر منوها
      { view: View.FreightFinance, label: 'مالی حمل', roles: [UserRole.BranchFinance, UserRole.HQFinance] },
      { view: View.CentralFinance, label: 'کارتابل مالی ستاد', roles: [UserRole.CentralFinance] },
      { view: View.TransportDashboard, label: 'داشبورد ترابری', roles: [UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User] },
      { view: View.TransportDispatchQueue, label: 'ثبت نوبت', roles: [UserRole.TransportationUser] },
      { view: View.TransportDispatchBoard, label: 'تابلو اعلام بار', roles: [UserRole.TransportationUser] },
      { type: 'divider', roles: Object.values(UserRole) },
      // Workshop & Fleet Management
      { view: View.Branches, label: 'مدیریت شعب', roles: [UserRole.Transportation, UserRole.VehicleAllocationExpert] },
      { view: View.Vehicles, label: 'مدیریت خودروها', roles: [UserRole.Transportation, UserRole.VehicleDocumentsExpert, UserRole.AccidentExpert, UserRole.VehicleAllocationExpert, UserRole.InsuranceExpert] },
      { view: View.VehicleDocuments, label: 'مدیریت مدارک خودرو', roles: [UserRole.Transportation, UserRole.VehicleDocumentsExpert] },
      { view: View.Insurance, label: 'مدیریت بیمه', roles: [UserRole.Transportation, UserRole.Admin, UserRole.AccidentExpert, UserRole.InsuranceExpert] },
      { type: 'divider', roles: [UserRole.Transportation, UserRole.Workshop, UserRole.Merchant, UserRole.VehicleAllocationExpert] },
      { view: View.Drivers, label: 'مدیریت رانندگان', roles: [UserRole.Transportation, UserRole.VehicleAllocationExpert] },
      { view: View.VehicleAllocation, label: 'مدیریت تخصیص خودرو', roles: [UserRole.VehicleAllocationExpert] },
      { view: View.Technicians, label: 'مدیریت تعمیرکاران', roles: [UserRole.Workshop] },
      { view: View.Suppliers, label: 'مدیریت تامین کنندگان', roles: [UserRole.Merchant] },
      { type: 'divider', roles: [UserRole.Merchant, UserRole.Warehouse, UserRole.BranchFinance, UserRole.HQFinance] },
      { view: View.Inventory, label: 'انبار قطعات', roles: [UserRole.Warehouse, UserRole.Merchant] },
      { view: View.Purchasing, label: 'خرید و تدارکات', roles: [UserRole.Warehouse, UserRole.Merchant] },
      { view: View.Outsourcing, label: 'برون سپاری', roles: [UserRole.Workshop] },
      { type: 'divider', roles: [UserRole.BranchFinance, UserRole.HQFinance, UserRole.Workshop] },
      { view: View.NewInvoice, label: 'ثبت فاکتور', roles: [] },
      { view: View.Invoices, label: 'لیست فاکتور ها', roles: [] },
      { type: 'divider', roles: [UserRole.Workshop] },
      { view: View.Alerts, label: 'هشدارها', roles: [UserRole.Workshop] },
      { view: View.PartUsageReport, label: 'گزارش مصرف قطعات', roles: [UserRole.Workshop, UserRole.HQFinance] },
      { view: View.CostReport, label: 'گزارش هزینه‌های شعب', roles: [] },
      { type: 'divider', roles: Object.values(UserRole) },
      { view: View.SupportTickets, label: 'تیکت‌های پشتیبانی', roles: [UserRole.Workshop, UserRole.Warehouse, UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.BranchFinance, UserRole.VehicleAllocationExpert, UserRole.Transportation] },
    ];

    // آیتم‌های منوی ادمین - جداگانه
    const adminItems = [
      { view: View.UserManagement, label: 'مدیریت کاربران', icon: '👥' },
      { view: View.FreightManagement, label: 'مدیریت اعلام بار', icon: '📦' },
      { view: View.AdminResourceManagement, label: 'مدیریت منابع', icon: '🚛' },
      { view: View.CityManagement, label: 'مدیریت شهرها', icon: '🏙️' },
      { view: View.FinalizePermissionManagement, label: 'مدیریت دسترسی اتمام تخصیص', icon: '🔐' },
      { view: View.PlanningManagerApprovalPermissionManagement, label: 'مجوز تاییدیه مدیران برنامه‌ریزی', icon: '✅' },
      { view: View.AuditTrail, label: 'تاریخچه تراکنش‌ها', icon: '📋' },
    ];


    return (
        <header className="bg-white text-slate-700 shadow-md print:hidden border-b border-slate-200">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                         <div className="flex items-center cursor-pointer" onClick={() => onNavigate(defaultDashboardView)}>
                            <WrenchScrewdriverIcon className="h-8 w-8 text-sky-600" />
                            <h1 className="text-xl font-bold mr-3 text-slate-800">مدیریت ناوگان</h1>
                        </div>
                        <div className="mr-6 border-r border-slate-200 pr-6">
                            <p className="font-semibold text-sm text-slate-800">
                                {currentUser 
                                    ? (currentUser.name && currentUser.name !== currentUser.username 
                                        ? `${currentUser.username} - ${currentUser.name}` 
                                        : currentUser.username)
                                    : 'کاربر مهمان'}
                            </p>
                            <p className="text-xs text-slate-500">
                                {currentUser?.role ? `${currentUser.role}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <nav className="hidden md:flex items-center flex-wrap gap-x-2 gap-y-1">
                            {!isTransportDefault && currentUser?.role !== UserRole.BranchFinance && currentUser?.role !== UserRole.PlanningEmployee && currentUser?.role !== UserRole.PlanningManager && currentUser?.role !== UserRole.TransportationFinance && (
                                <button onClick={() => onNavigate(defaultDashboardView)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition">داشبورد</button>
                            )}
                            
                            {isAdmin ? (
                                <>
                                {/* منوی عمومی */}
                                <div className="relative" ref={mgmtDropdownRef}>
                                    <button onClick={() => setMgmtDropdownOpen(!isMgmtDropdownOpen)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition flex items-center">
                                       <span>منوها</span>
                                       <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform ${isMgmtDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isMgmtDropdownOpen && (
                                        <div className="absolute left-0 z-20 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none py-1">
                                           {navItems.map((item, index) => {
                                                const hasItemAccess = hasAccess(item.roles);
                                                if (!hasItemAccess) return null;

                                                if (item.type === 'divider') {
                                                    const prevItem = index > 0 ? navItems[index - 1] : null;
                                                    const nextItem = index < navItems.length - 1 ? navItems[index + 1] : null;
                                                    const hasVisibleNeighbor = (prevItem && prevItem.type !== 'divider' && hasAccess(prevItem.roles)) && (nextItem && nextItem.type !== 'divider' && hasAccess(nextItem.roles));
                                                    
                                                    if (!hasVisibleNeighbor) return null;

                                                    return <div key={`div-${index}`} className="border-t my-1 border-slate-100"></div>;
                                                }
                                                
                                                const isAlerts = item.view === View.Alerts;
                                                const hasBlinking = (item as any).special === 'blinking';

                                                return (
                                                    <a key={item.view} onClick={() => handleNavigate(item.view!)} className="cursor-pointer text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100 flex justify-between items-center">
                                                        <span className="flex items-center gap-2">
                                                            {item.label}
                                                            {hasBlinking && <span className="blinking-dot !w-2 !h-2"></span>}
                                                        </span>
                                                        {isAlerts && alertsCount > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{alertsCount}</span>}
                                                    </a>
                                                );
                                           })}
                                        </div>
                                    )}
                                </div>
                                
                                {/* منوی ادمین - جداگانه */}
                                <div className="relative" ref={adminDropdownRef}>
                                    <button 
                                        onClick={() => setAdminDropdownOpen(!isAdminDropdownOpen)} 
                                        className="px-3 py-2 rounded-md text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition flex items-center border border-amber-200"
                                    >
                                       <span>🔧 پنل ادمین</span>
                                       <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform ${isAdminDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isAdminDropdownOpen && (
                                        <div className="absolute left-0 z-20 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-amber-200 focus:outline-none py-1">
                                           <div className="px-4 py-2 text-xs font-medium text-amber-600 bg-amber-50 border-b border-amber-100">
                                             ابزارهای مدیریت سیستم
                                           </div>
                                           {adminItems.map((item) => (
                                                <a 
                                                    key={item.view} 
                                                    onClick={() => handleNavigate(item.view)} 
                                                    className="cursor-pointer text-slate-700 block px-4 py-2 text-sm hover:bg-amber-50 flex items-center gap-2"
                                                >
                                                    <span>{item.icon}</span>
                                                    <span>{item.label}</span>
                                                </a>
                                           ))}
                                        </div>
                                    )}
                                </div>
                                </>
                            ) : (
                                <>
                                {navItems.filter(item => item.type !== 'divider' && hasAccess(item.roles)).map(item => (
                                    <button key={item.view} onClick={() => handleNavigate(item.view!)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition flex items-center gap-2 whitespace-nowrap">
                                        <span>{item.label}</span>
                                        {(item as any).special === 'blinking' && <span className="blinking-dot"></span>}
                                        {item.view === View.Alerts && alertsCount > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{alertsCount}</span>}
                                    </button>
                                ))}
                                </>
                            )}

                            {hasAccess([UserRole.Transportation, UserRole.Workshop]) && (
                               <button onClick={() => onNavigate(View.NewRepairOrder)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition">ثبت سفارش تعمیر</button>
                            )}
                        </nav>
                        {currentUser && (
                            <button 
                                onClick={() => setShowChangePasswordDialog(true)} 
                                className="mr-4 px-3 py-2 rounded-md text-sm font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition"
                            >
                                تغییر رمز عبور
                            </button>
                        )}
                        <button onClick={onLogout} className="mr-4 px-3 py-2 rounded-md text-sm font-medium bg-red-50 hover:bg-red-100 text-red-700 transition">خروج</button>
                    </div>
                </div>
            </div>
            <ChangePasswordDialog 
                isOpen={showChangePasswordDialog} 
                onClose={() => setShowChangePasswordDialog(false)}
            />
        </header>
    );
};

export default Header;