import React, { useState, useEffect } from 'react';
import { View, UserRole, User, Branch, Driver } from './types';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import RepairOrderView from './components/RepairOrderView';
import VehicleReport from './components/VehicleReport';
import VehicleDocumentsManagement from './components/VehicleDocumentsManagement';
import VehiclesPage from './components/VehiclesPage';
import PurchasingPage from './components/PurchasingPage';
import InsuranceManagement from './components/InsuranceManagement';
import TechnicianManagement from './components/TechnicianManagement';
import SupplierManagement from './components/SupplierManagement';
import InventoryManagement from './components/InventoryManagement';
import OutsourcingManagement from './components/OutsourcingManagement';
import ContractManagement from './components/ContractManagement';
import InvoiceManagement from './components/InvoiceManagement';
import InvoiceForm from './components/InvoiceForm';
import AlertsView from './components/AlertsView';
import SupportTickets from './components/SupportTickets';
import VehicleAllocationManagement from './components/VehicleAllocationManagement';
import TransportLive from './components/TransportLive';
import TransportLiveContainer from './components/TransportLiveContainer';
import FreightHistoryContainer from './components/FreightHistoryContainer';
import TransportDashboardContainer from './components/TransportDashboardContainer';
import FreightDashboard from './components/FreightDashboard';
import FreightFinanceDashboard from './components/FreightFinanceDashboard';
import FreightPlanningContainer from './components/FreightPlanningContainer';
import AuditTrailView from './components/AuditTrailView';
import CustomerManagement from './components/CustomerManagement';
// Import other components as needed...

const getDefaultViewForRole = (role?: UserRole | null): View => {
    switch (role) {
        case UserRole.TransportationUser:
        case UserRole.Transportation_Personal_Vehicle_User:
            return View.TransportDashboard;
        default:
            return View.Dashboard;
    }
};

const App: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<View>(View.Login);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    // Remove other state variables that held mock data

    const mapBackendRoleToUserRole = (role: string): UserRole | null => {
        switch ((role || '').toLowerCase()) {
            case 'admin': return UserRole.Admin;
            case 'planner': return UserRole.PlanningEmployee;
            case 'planner_manager': return UserRole.PlanningManager;
            case 'transport_user': return UserRole.TransportationUser;
            case 'personal_transport_user': return UserRole.Transportation_Personal_Vehicle_User;
            case 'finance': return UserRole.BranchFinance;
            case 'central_finance': return UserRole.CentralFinance;
            case 'transport_finance': return UserRole.TransportationFinance;
            case 'workshop': return UserRole.Workshop;
            case 'transport': return UserRole.Transportation;
            case 'warehouse': return UserRole.Warehouse;
            case 'merchant': return UserRole.Merchant;
            case 'docs': return UserRole.VehicleDocumentsExpert;
            case 'accident': return UserRole.AccidentExpert;
            case 'allocation': return UserRole.VehicleAllocationExpert;
            case 'insurance': return UserRole.InsuranceExpert;
            default: return null;
        }
    };

    const normalizeUser = (raw: any): User | null => {
        if (!raw) return null;
        const mappedRole = mapBackendRoleToUserRole(raw.role || raw.userRole || '');
        if (!mappedRole) return null;
        return {
            id: raw.id || raw.userId || '',
            username: raw.username || '',
            name: raw.fullName || raw.name || raw.username || 'کاربر',
            role: mappedRole,
            employeeId: raw.employeeId || undefined,
            branchCity: raw.branchCity || undefined,
        };
    };

    useEffect(() => {
        // On initial load, check for a stored token and user information
        const token = localStorage.getItem('token');
        const userJson = localStorage.getItem('user');

        if (token && userJson) {
            try {
                const rawUser = JSON.parse(userJson);
                const normalized = normalizeUser(rawUser);
                if (normalized) {
                    setCurrentUser(normalized);
                    setCurrentView(getDefaultViewForRole(normalized.role));
                } else {
                    // role mismatch → clear storage
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            } catch (error) {
                // If there's an error parsing the stored user, clear storage
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        }
    }, []);

    const handleLogin = (user: any, token: string) => {
        const normalized = normalizeUser(user);
        if (!normalized) {
            // fallback: store raw for debugging
            console.warn('Unrecognized role from backend:', user?.role);
            return;
        }
        setCurrentUser(normalized);
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(normalized));
        setCurrentView(getDefaultViewForRole(normalized.role));
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setCurrentView(View.Login);
    };

    // Branch management functions
    const fetchBranches = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/v1/branches', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                const data = await response.json();
                setBranches(data);
            }
        } catch (error) {
            console.error('Failed to fetch branches:', error);
        }
    };

    const handleAddBranch = async (branch: Omit<Branch, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/v1/branches', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(branch),
            });
            if (response.ok) {
                await fetchBranches();
            } else {
                alert('خطا در افزودن شعبه');
            }
        } catch (error) {
            console.error('Failed to add branch:', error);
            alert('خطا در افزودن شعبه');
        }
    };

    const handleUpdateBranch = async (id: string, branch: Omit<Branch, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3000/api/v1/branches/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(branch),
            });
            if (response.ok) {
                await fetchBranches();
            } else {
                alert('خطا در ویرایش شعبه');
            }
        } catch (error) {
            console.error('Failed to update branch:', error);
            alert('خطا در ویرایش شعبه');
        }
    };

    const handleDeleteBranch = async (id: string) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3000/api/v1/branches/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                await fetchBranches();
            } else {
                alert('خطا در حذف شعبه');
            }
        } catch (error) {
            console.error('Failed to delete branch:', error);
            alert('خطا در حذف شعبه');
        }
    };

    // Driver management functions
    const fetchDrivers = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/v1/drivers', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                const data = await response.json();
                setDrivers(data);
            }
        } catch (error) {
            console.error('Failed to fetch drivers:', error);
        }
    };

    const handleAddDriver = async (driver: Omit<Driver, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/v1/drivers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(driver),
            });
            if (response.ok) {
                await fetchDrivers();
            } else {
                alert('خطا در افزودن راننده');
            }
        } catch (error) {
            console.error('Failed to add driver:', error);
            alert('خطا در افزودن راننده');
        }
    };

    const handleUpdateDriver = async (id: string, driver: Omit<Driver, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3000/api/v1/drivers/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(driver),
            });
            if (response.ok) {
                await fetchDrivers();
            } else {
                alert('خطا در ویرایش راننده');
            }
        } catch (error) {
            console.error('Failed to update driver:', error);
            alert('خطا در ویرایش راننده');
        }
    };

    const handleDeleteDriver = async (id: string) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3000/api/v1/drivers/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                await fetchDrivers();
            } else {
                alert('خطا در حذف راننده');
            }
        } catch (error) {
            console.error('Failed to delete driver:', error);
            alert('خطا در حذف راننده');
        }
    };

    const handleNavigate = (view: View) => {
        setCurrentView(view);
        setSelectedOrderId(null); // Reset selections when navigating away
        setSelectedInvoiceId(null);
        
        // Fetch data when navigating to specific views
        if (view === View.Branches) {
            fetchBranches();
        } else if (view === View.Drivers) {
            fetchDrivers();
        }
    };

    const handleSelectOrder = (orderId: string) => {
        setSelectedOrderId(orderId);
        setCurrentView(View.RepairOrder);
    };

    const handleSelectInvoice = (invoiceId: string) => {
        setSelectedInvoiceId(invoiceId);
        setCurrentView(View.InvoiceDetail);
    };

    const hasAccess = (allowedRoles: UserRole[]): boolean => {
        if (!currentUser) return false;
        return allowedRoles.includes(currentUser.role);
    };

    const Placeholder: React.FC<{ title: string }> = ({ title }) => (
        <div className="bg-white p-8 rounded-xl shadow text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
            <p className="text-slate-600">این صفحه هنوز پیاده‌سازی نشده است.</p>
        </div>
    );

    const renderView = () => {
        if (!currentUser) {
            // Pass a modified onLogin that also expects the user object from the API response
            return <Login onLogin={handleLogin} />;
        }

        switch (currentView) {
            case View.Dashboard:
                return <Dashboard 
                            onSelectOrder={handleSelectOrder} 
                            onSelectInvoice={handleSelectInvoice}
                            onNavigate={handleNavigate}
                            hasAccess={hasAccess}
                            currentUser={currentUser}
                        />;
            case View.RepairOrder:
                if (selectedOrderId) {
                    return <RepairOrderView 
                                orderId={selectedOrderId} 
                                onBack={() => setCurrentView(View.Dashboard)}
                                currentUserRole={currentUser.role}
                            />;
                }
                return <div>No repair order selected. Return to <button onClick={() => setCurrentView(View.Dashboard)}>Dashboard</button>.</div>;
            case View.Branches:
                console.log('[App] Render view:', View.Branches);
                return <ContractManagement 
                    branches={branches} 
                    onAddBranch={handleAddBranch}
                    onUpdateBranch={handleUpdateBranch}
                    onDeleteBranch={handleDeleteBranch}
                />;
            case View.Vehicles:
                console.log('[App] Render view:', View.Vehicles);
                return <VehiclesPage />;
            case View.VehicleDocuments:
                console.log('[App] Render view:', View.VehicleDocuments);
                return (
                    <VehicleDocumentsManagement
                        vehicles={[]}
                        branches={[]}
                        fuelCardRequests={[]}
                        trafficFines={[]}
                        vehiclePermits={[]}
                        onAddFuelCardRequest={() => {}}
                        onAddVehiclePermit={() => {}}
                    />
                );
            case View.Insurance:
                console.log('[App] Render view:', View.Insurance);
                return (
                    <InsuranceManagement
                        vehicles={[]}
                        drivers={[]}
                        branches={[]}
                        insurancePolicies={[]}
                        accidentReports={[]}
                        onAddPolicy={() => {}}
                        onAddAccidentReport={() => {}}
                        onUpdateAccidentReport={() => {}}
                        onUpdateAccidentWorkshopStatus={() => {}}
                    />
                );
            case View.Drivers:
                console.log('[App] Render view:', View.Drivers);
                return <CustomerManagement 
                    drivers={drivers} 
                    onAddDriver={handleAddDriver}
                    onUpdateDriver={handleUpdateDriver}
                    onDeleteDriver={handleDeleteDriver}
                />;
            case View.VehicleAllocation:
                console.log('[App] Render view:', View.VehicleAllocation);
                return (
                    <VehicleAllocationManagement
                        vehicles={[]}
                        drivers={[]}
                        branches={[]}
                        allocations={[]}
                        currentUser={currentUser}
                        onAddAllocation={() => {}}
                        onUpdateAllocationStatus={() => {}}
                    />
                );
            case View.Technicians:
                console.log('[App] Render view:', View.Technicians);
                return <TechnicianManagement technicians={[]} onAddTechnician={() => {}} />;
            case View.Suppliers:
                console.log('[App] Render view:', View.Suppliers);
                return <SupplierManagement suppliers={[]} onAddSupplier={() => {}} />;
            case View.Inventory:
                console.log('[App] Render view:', View.Inventory);
                return <InventoryManagement parts={[]} onAddPart={() => {}} />;
            case View.Purchasing:
                console.log('[App] Render view:', View.Purchasing);
                return <PurchasingPage />;
            case View.Outsourcing:
                console.log('[App] Render view:', View.Outsourcing);
                return <OutsourcingManagement />;
            case View.Invoices:
                console.log('[App] Render view:', View.Invoices);
                return <InvoiceManagement invoices={[]} vehicles={[]} onSelectInvoice={handleSelectInvoice} />;
            case View.NewInvoice:
                console.log('[App] Render view:', View.NewInvoice);
                return <InvoiceForm vehicles={[]} inventory={[]} onCreateInvoice={() => {}} onCancel={() => setCurrentView(View.Invoices)} />;
            case View.Alerts:
                console.log('[App] Render view:', View.Alerts);
                return <AlertsView alerts={[]} parts={[]} vehicles={[]} />;
            case View.PartUsageReport:
                console.log('[App] Render view:', View.PartUsageReport);
                return <VehicleReport partUsages={[]} parts={[]} branches={[]} vehicles={[]} />;
            case View.CostReport:
                console.log('[App] Render view:', View.CostReport);
                return <Placeholder title="گزارش هزینه‌های شعب" />;
            case View.SupportTickets:
                console.log('[App] Render view:', View.SupportTickets);
                return <SupportTickets />;
            case View.TransportLive:
                console.log('[App] Render view:', View.TransportLive);
                return <TransportLiveContainer currentUser={currentUser} />;
            case View.FreightPlanning:
                console.log('[App] Render view:', View.FreightPlanning);
                return (
                    <FreightPlanningContainer currentUser={currentUser} />
                );
            case View.FreightFinance:
                console.log('[App] Render view:', View.FreightFinance);
                return (
                    <FreightFinanceDashboard
                        announcements={[]}
                        branches={[]}
                        transactions={[]}
                        onAddTransaction={() => {}}
                        currentUser={currentUser}
                    />
                );
            case View.FreightHistory:
                console.log('[App] Render view:', View.FreightHistory);
                return <FreightHistoryContainer currentUser={currentUser} />;
            case View.TransportDashboard:
                console.log('[App] Render view:', View.TransportDashboard);
                return <TransportDashboardContainer currentUser={currentUser} />;
            case View.AuditTrail:
                console.log('[App] Render view:', View.AuditTrail);
                return <AuditTrailView />;
            
            // Add cases for other views here as they are implemented
            // e.g., case View.InvoiceDetail: ...

            default:
                // Default to the main dashboard
                return <Dashboard 
                            onSelectOrder={handleSelectOrder} 
                            onSelectInvoice={handleSelectInvoice}
                            onNavigate={handleNavigate}
                            hasAccess={hasAccess}
                            currentUser={currentUser}
                        />;
        }
    };

    const defaultDashboardView = getDefaultViewForRole(currentUser?.role);
 
    return (
        <div dir="rtl" className="bg-slate-50 min-h-screen font-vazirmatn">
            {currentUser && (
                 <Header 
                     onNavigate={handleNavigate}
                     alertsCount={0}
                     currentUser={currentUser}
                     onLogout={handleLogout}
                     defaultDashboardView={defaultDashboardView}
                 />
             )}
            <main className="p-4 sm:p-6 lg:p-8">
                {renderView()}
            </main>
        </div>
    );
};

export default App;