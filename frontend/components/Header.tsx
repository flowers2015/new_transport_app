import React, { useState, useRef, useEffect } from 'react';
import { View, UserRole, User } from '../types';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface HeaderProps {
    onNavigate: (view: View) => void;
    alertsCount: number;
    currentUser?: User; // currentUser may be undefined before login
    onLogout: () => void;
    defaultDashboardView: View;
}

const Header: React.FC<HeaderProps> = ({ onNavigate, alertsCount, currentUser, onLogout, defaultDashboardView }) => {
    const [isMgmtDropdownOpen, setMgmtDropdownOpen] = useState(false);
    const mgmtDropdownRef = useRef<HTMLDivElement>(null);

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

    const handleNavigate = (view: View) => {
        // Debug navigation
        console.log('[Header] Navigating to view:', view);
        setMgmtDropdownOpen(false);
        onNavigate(view);
    };
    
    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (!currentUser) return false;
        if (currentUser.role === UserRole.Admin) return true;
        return allowedRoles.includes(currentUser.role);
    };

    const isAdmin = !!currentUser && currentUser.role === UserRole.Admin;
    const isTransportDefault = defaultDashboardView === View.TransportDashboard;

    const navItems = [
      // Freight Management Section
      { view: View.FreightPlanning, label: 'برنامه ریزی ارسال بار', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager] },
      { view: View.TransportDashboard, label: 'داشبورد ترابری', roles: [UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User] },
      { view: View.TransportLive, label: 'پیگیری اعلام بار-زنده', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User, UserRole.BranchFinance], special: 'blinking' },
      { view: View.TransportDispatchQueue, label: 'ثبت نوبت', roles: [UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User] },
      { view: View.TransportDispatchBoard, label: 'تابلو اعلام بار', roles: [UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User] },
      { view: View.FreightHistory, label: 'تاریخچه اعلام بار', roles: [UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User, UserRole.BranchFinance] },
      { view: View.FreightFinance, label: 'مالی حمل', roles: [UserRole.BranchFinance, UserRole.HQFinance, UserRole.CentralFinance, UserRole.TransportationFinance] },
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
      { view: View.NewInvoice, label: 'ثبت فاکتور', roles: [UserRole.BranchFinance, UserRole.HQFinance] },
      { view: View.Invoices, label: 'لیست فاکتور ها', roles: [UserRole.BranchFinance, UserRole.HQFinance] },
      { type: 'divider', roles: [UserRole.Workshop] },
      { view: View.Alerts, label: 'هشدارها', roles: [UserRole.Workshop] },
      { view: View.PartUsageReport, label: 'گزارش مصرف قطعات', roles: [UserRole.Workshop, UserRole.HQFinance] },
      { view: View.CostReport, label: 'گزارش هزینه‌های شعب', roles: [UserRole.BranchFinance, UserRole.HQFinance] },
      { type: 'divider', roles: Object.values(UserRole) },
      { view: View.SupportTickets, label: 'تیکت‌های پشتیبانی', roles: [UserRole.Workshop, UserRole.Warehouse, UserRole.PlanningEmployee, UserRole.PlanningManager, UserRole.BranchFinance, UserRole.VehicleAllocationExpert, UserRole.Transportation] },
      { type: 'divider', roles: [UserRole.Admin] },
      { view: View.AuditTrail, label: 'تاریخچه تراکنش‌ها', roles: [UserRole.Admin] },
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
                            <p className="font-semibold text-sm text-slate-800">{currentUser?.name || 'کاربر مهمان'}</p>
                            <p className="text-xs text-slate-500">{currentUser?.role ?? ''}</p>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <nav className="hidden md:flex items-center flex-wrap gap-x-2 gap-y-1">
                            {!isTransportDefault && (
                                <button onClick={() => onNavigate(defaultDashboardView)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition">داشبورد</button>
                            )}
                            
                            {isAdmin ? (
                                <div className="relative" ref={mgmtDropdownRef}>
                                    <button onClick={() => setMgmtDropdownOpen(!isMgmtDropdownOpen)} className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 transition flex items-center">
                                       <span>منوها</span>
                                       <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform ${isMgmtDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isMgmtDropdownOpen && (
                                        <div className="absolute left-0 z-20 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none py-1">
                                           {navItems.map((item, index) => {
                                                if (!hasAccess(item.roles)) return null;

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
                        <button onClick={onLogout} className="mr-4 px-3 py-2 rounded-md text-sm font-medium bg-red-50 hover:bg-red-100 text-red-700 transition">خروج</button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;