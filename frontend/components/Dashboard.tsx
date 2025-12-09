import React, { useState, useMemo, useEffect } from 'react';
import { RepairOrder, Vehicle, RepairStatus, UserRole, View, Alert, User, FreightAnnouncement, FreightAnnouncementStatus, Invoice, InvoiceStatus } from '../types';
import { formatJalali, formatPlateNumber, formatJalaliDateTime, gregorianToJalali } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { CogIcon } from './icons/CogIcon';
import { ClockIcon } from './icons/ClockIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { TruckIcon } from './icons/CarIcon';

interface DashboardProps {
    onSelectOrder: (orderId: string) => void;
    onSelectInvoice: (invoiceId: string) => void;
    onNavigate: (view: View) => void;
    hasAccess: (roles: UserRole[]) => boolean;
    currentUser: User;
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; onClick?: () => void }> = ({ title, value, icon, color, onClick }) => (
    <div className={`bg-white p-5 rounded-xl shadow-md flex items-center border-l-4 ${color} ${onClick ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={onClick}>
        {icon}
        <div className="mr-4">
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-slate-500">{title}</p>
        </div>
    </div>
);

const isToday = (someDate: any) => {
    if (!someDate) return false;
    
    // اگر رشته شمسی است (YYYY/MM/DD)
    if (typeof someDate === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(someDate)) {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        const todayStr = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
        return someDate === todayStr;
    }
    
    // اگر Date object است
    const d = typeof someDate === 'string' ? new Date(someDate) : someDate;
    if (!(d instanceof Date) || isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
}


const Dashboard: React.FC<DashboardProps> = ({ onSelectOrder, onSelectInvoice, onNavigate, hasAccess, currentUser }) => {
    
    const [repairOrders, setRepairOrders] = useState<RepairOrder[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [freightAnnouncements, setFreightAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [repairSearchTerm, setRepairSearchTerm] = useState('');
    const [freightSearchTerm, setFreightSearchTerm] = useState('');
    const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
    const [freightDateView, setFreightDateView] = useState<'today' | 'all'>('today');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` };

                // استفاده از cachedFetch برای بهبود عملکرد
                const { cachedFetch } = await import('../utils/apiCache');
                
                // Fetch all data in parallel with caching
                const [repairOrdersData, vehiclesData, alertsData, freightAnnouncementsData, invoicesData] = await Promise.all([
                    cachedFetch(getApiUrl('repair-orders'), { headers }, 30 * 1000), // 30s cache
                    cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000), // 10 min cache
                    cachedFetch(getApiUrl('alerts'), { headers }, 30 * 1000), // 30s cache
                    cachedFetch(getApiUrl('freight-announcements'), { headers }, 30 * 1000), // 30s cache
                    cachedFetch(getApiUrl('invoices'), { headers }, 5 * 60 * 1000), // 5 min cache
                ]);

                setRepairOrders(Array.isArray(repairOrdersData) ? repairOrdersData : []);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setAlerts(Array.isArray(alertsData) ? alertsData : []);
                setFreightAnnouncements(Array.isArray(freightAnnouncementsData) ? freightAnnouncementsData : []);
                setInvoices(Array.isArray(invoicesData) ? invoicesData : []);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const activeOrders = repairOrders.filter(o => o.status === RepairStatus.InProgress || o.status === RepairStatus.New).length;
    const activeAlerts = alerts.length;
    const pendingAnnouncements = useMemo(() => freightAnnouncements.filter(fa => [FreightAnnouncementStatus.PendingCompanyAssignment, FreightAnnouncementStatus.PendingPersonalAssignment].includes(fa.status) && isToday(fa.loadingDate)).length, [freightAnnouncements]);
    
    const getVehicleIdentifier = (vehicleId: string): string => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return 'نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    };

    const filteredRepairOrders = useMemo(() => {
        if (!repairSearchTerm) return repairOrders;
        const lowercasedTerm = repairSearchTerm.toLowerCase();
        return repairOrders.filter(order => {
            const vehicleIdentifier = getVehicleIdentifier(order.vehicleId).toLowerCase();
            const orderId = order.id.substring(0,6).toLowerCase();
            return vehicleIdentifier.includes(lowercasedTerm) || orderId.includes(lowercasedTerm);
        });
    }, [repairSearchTerm, repairOrders, vehicles]);
    
    const filteredFreightAnnouncements = useMemo(() => {
        let data = freightAnnouncements;

        if (freightDateView === 'today') {
            data = data.filter(ann => isToday(ann.loadingDate));
        }

        if (!freightSearchTerm) return data;

        const lowercasedTerm = freightSearchTerm.toLowerCase();
        return data.filter(ann => 
            ann.announcementCode.toLowerCase().includes(lowercasedTerm) ||
            ann.destinations.some(d => d.city.toLowerCase().includes(lowercasedTerm))
        );
    }, [freightSearchTerm, freightAnnouncements, freightDateView]);

    const filteredInvoices = useMemo(() => {
        if (!invoiceSearchTerm) return invoices;
        const lowercasedTerm = invoiceSearchTerm.toLowerCase();
        return invoices.filter(inv =>
            inv.id.substring(0,8).toLowerCase().includes(lowercasedTerm) ||
            (inv.repairOrderId && inv.repairOrderId.substring(0,6).toLowerCase().includes(lowercasedTerm)) ||
            getVehicleIdentifier(inv.vehicleId).toLowerCase().includes(lowercasedTerm)
        );
    }, [invoiceSearchTerm, invoices, vehicles]);

    const repairStatusStyles: { [key in RepairStatus]: string } = {
        [RepairStatus.New]: 'bg-blue-100 text-blue-800',
        [RepairStatus.Diagnosing]: 'bg-cyan-100 text-cyan-800',
        [RepairStatus.AwaitingPart]: 'bg-orange-100 text-orange-800',
        [RepairStatus.InProgress]: 'bg-yellow-100 text-yellow-800',
        [RepairStatus.OnHold]: 'bg-gray-100 text-gray-800',
        [RepairStatus.Completed]: 'bg-green-100 text-green-800',
        [RepairStatus.Delivered]: 'bg-indigo-100 text-indigo-800',
        [RepairStatus.Closed]: 'bg-slate-100 text-slate-800',
    };
    
    const freightStatusStyles: { [key in FreightAnnouncementStatus]: string } = {
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
    };
    
    const invoiceStatusStyles: { [key in InvoiceStatus]: string } = {
        [InvoiceStatus.Pending]: 'bg-yellow-100 text-yellow-800',
        [InvoiceStatus.Paid]: 'bg-green-100 text-green-800',
        [InvoiceStatus.Overdue]: 'bg-red-100 text-red-800',
    };

    if (loading) return <div className="text-center p-8">Loading dashboard data...</div>;
    if (error) return <div className="text-center p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {hasAccess([UserRole.TransportationUser, UserRole.Transportation_Personal_Vehicle_User, UserRole.Transportation, UserRole.PlanningEmployee, UserRole.PlanningManager]) && (
                    <StatCard title="بارهای امروز در انتظار تخصیص" value={pendingAnnouncements} icon={<TruckIcon className="w-12 h-12 text-purple-500" />} color="border-purple-500" onClick={() => onNavigate(View.TransportLive)} />
                )}
                {hasAccess([UserRole.Workshop, UserRole.Transportation]) && (
                    <StatCard title="سفارش‌های تعمیر فعال" value={activeOrders} icon={<CogIcon className="w-12 h-12 text-blue-500" />} color="border-blue-500" />
                )}
                {hasAccess([UserRole.Workshop, UserRole.Transportation]) && (
                    <StatCard title="خودروهای در تعمیرگاه" value={activeOrders} icon={<ClockIcon className="w-12 h-12 text-yellow-500" />} color="border-yellow-500" />
                )}
                {hasAccess([UserRole.Workshop]) && (
                    <StatCard title="هشدارهای فعال" value={activeAlerts} icon={<ExclamationTriangleIcon className="w-12 h-12 text-red-500" />} color="border-red-500" onClick={() => onNavigate(View.Alerts)} />
                )}
                 {hasAccess([UserRole.Workshop, UserRole.Transportation]) && (
                    <StatCard title="تکمیل شده در این ماه" value={repairOrders.filter(o => o.status === RepairStatus.Completed && o.completedAt && o.completedAt.getMonth() === new Date().getMonth()).length} icon={<ChartBarIcon className="w-12 h-12 text-green-500" />} color="border-green-500" />
                 )}
            </div>

            {hasAccess([UserRole.Workshop, UserRole.Transportation, UserRole.Admin]) && (
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h2 className="text-xl font-bold text-slate-800">آخرین سفارش‌های تعمیر</h2>
                        <div className="w-full md:w-auto flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="جستجو بر اساس پلاک یا شماره سفارش..."
                                value={repairSearchTerm}
                                onChange={e => setRepairSearchTerm(e.target.value)}
                                className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            {hasAccess([UserRole.Transportation, UserRole.Workshop]) && (
                                <button onClick={() => onNavigate(View.NewRepairOrder)} className="px-4 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition whitespace-nowrap">
                                    + ثبت سفارش تعمیر
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">شماره سفارش</th>
                                    <th className="px-6 py-3">شناسه خودرو</th>
                                    <th className="px-6 py-3">تاریخ ثبت</th>
                                    <th className="px-6 py-3">اولویت</th>
                                    <th className="px-6 py-3">وضعیت</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRepairOrders.slice(0, 10).map(order => (
                                    <tr key={order.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer" onClick={() => onSelectOrder(order.id)}>
                                        <td className="px-6 py-4 font-mono text-slate-600">#{order.id.substring(0, 6)}</td>
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900">{getVehicleIdentifier(order.vehicleId)}</th>
                                        <td className="px-6 py-4">{formatJalali(order.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${order.priority === 'High' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {order.priority === 'High' ? 'فوری' : 'عادی'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${repairStatusStyles[order.status]}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-left">
                                            <span className="font-medium text-sky-600 hover:underline">مشاهده جزئیات</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {hasAccess([UserRole.PlanningEmployee, UserRole.PlanningManager]) && (
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h2 className="text-xl font-bold text-slate-800">آخرین اعلام بارها</h2>
                        <div className="w-full md:w-auto flex items-center gap-2">
                            <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                                <button onClick={() => setFreightDateView('today')} className={`px-3 py-1 text-xs rounded-md ${freightDateView === 'today' ? 'bg-white shadow' : ''}`}>بارگیری امروز</button>
                                <button onClick={() => setFreightDateView('all')} className={`px-3 py-1 text-xs rounded-md ${freightDateView === 'all' ? 'bg-white shadow' : ''}`}>مشاهده همه</button>
                            </div>
                            <input
                                type="text"
                                placeholder="جستجو کد اعلام بار یا مقصد..."
                                value={freightSearchTerm}
                                onChange={e => setFreightSearchTerm(e.target.value)}
                                className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            {/* Button removed as per user request */}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">کد</th>
                                    <th className="px-6 py-3">مقاصد</th>
                                    <th className="px-6 py-3">تاریخ بارگیری</th>
                                    <th className="px-6 py-3">نوع خودرو</th>
                                    <th className="px-6 py-3">وضعیت</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFreightAnnouncements.slice(0, 10).map(ann => (
                                    <tr key={ann.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-mono text-slate-600">{ann.announcementCode}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{ann.destinations.map(d => d.city).join(', ')}</td>
                                        <td className="px-6 py-4">{ann.loadingDate ? formatJalali(ann.loadingDate) : '-'}</td>
                                        <td className="px-6 py-4">{ann.vehicleType}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${freightStatusStyles[ann.status]}`}>
                                                {ann.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {hasAccess([UserRole.BranchFinance, UserRole.HQFinance, UserRole.CentralFinance]) && (
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h2 className="text-xl font-bold text-slate-800">آخرین فاکتورها</h2>
                        <div className="w-full md:w-auto flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="جستجو شماره فاکتور یا خودرو..."
                                value={invoiceSearchTerm}
                                onChange={e => setInvoiceSearchTerm(e.target.value)}
                                className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <button onClick={() => onNavigate(View.NewInvoice)} className="px-4 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition whitespace-nowrap">
                                + ثبت فاکتور
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">شماره فاکتور</th>
                                    <th className="px-6 py-3">خودرو</th>
                                    <th className="px-6 py-3">تاریخ</th>
                                    <th className="px-6 py-3">مبلغ کل</th>
                                    <th className="px-6 py-3">وضعیت</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.slice(0, 10).map(invoice => (
                                    <tr key={invoice.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer" onClick={() => onSelectInvoice(invoice.id)}>
                                        <td className="px-6 py-4 font-mono text-slate-600">#{invoice.id.substring(0, 8)}</td>
                                        <td className="px-6 py-4 font-mono">{getVehicleIdentifier(invoice.vehicleId)}</td>
                                        <td className="px-6 py-4">{formatJalali(invoice.issuedAt)}</td>
                                        <td className="px-6 py-4 font-mono">{invoice.totalAmount.toLocaleString('fa-IR')} تومان</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${invoiceStatusStyles[invoice.status]}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                         <td className="px-6 py-4 text-left">
                                            <span className="font-medium text-sky-600 hover:underline">مشاهده</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Dashboard;