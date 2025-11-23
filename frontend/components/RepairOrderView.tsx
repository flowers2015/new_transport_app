import React, { useState, useMemo, useEffect } from 'react';
import { 
    RepairOrder, Technician, Part, Driver, Vehicle, Branch, UserRole, PartUsage,
    RepairStatus, Supplier, OutsourcingRequest
} from '../types';
import { formatJalaliDateTime, formatPlateNumber } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { CogIcon } from './icons/CogIcon';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon';
import { TruckIcon } from './icons/CarIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';


interface RepairOrderViewProps {
    orderId: string; // Changed from order object to orderId
    // Removed other props that will be fetched
    onBack: () => void;
    currentUserRole: UserRole;
}

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; }> = ({ title, icon, children }) => (
    <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4 flex items-center">
            {icon}
            <span className="mr-2">{title}</span>
        </h3>
        {children}
    </div>
);

const RepairOrderView: React.FC<RepairOrderViewProps> = ({ orderId, onBack, currentUserRole }) => {
    const [order, setOrder] = useState<RepairOrder | null>(null);
    const [partUsages, setPartUsages] = useState<PartUsage[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [inventory, setInventory] = useState<Part[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [outsourcingRequest, setOutsourcingRequest] = useState<OutsourcingRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedPart, setSelectedPart] = useState({ partId: '', quantity: '1' });
    const [selectedSupplier, setSelectedSupplier] = useState('');

    useEffect(() => {
        const fetchOrderDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token'); // Assuming token is stored in localStorage
                const headers = {
                    'Authorization': `Bearer ${token}`,
                };

                const orderRes = await fetch(getApiUrl(`repair-orders/${orderId}`), { headers });
                if (!orderRes.ok) throw new Error('Failed to fetch repair order.');
                const orderData = await orderRes.json();
                setOrder(orderData);

                // Fetch related data in parallel
                const [partsRes, techniciansRes, inventoryRes, branchesRes, vehiclesRes, driversRes, suppliersRes] = await Promise.all([
                    fetch(getApiUrl(`repair-orders/${orderId}/part-usages`), { headers }),
                    fetch(getApiUrl('technicians'), { headers }),
                    fetch(getApiUrl('parts'), { headers }),
                    fetch(getApiUrl('branches'), { headers }),
                    fetch(getApiUrl('vehicles'), { headers }),
                    fetch(getApiUrl('drivers'), { headers }),
                    fetch(getApiUrl('suppliers'), { headers })
                ]);

                if (partsRes.ok) {
                    const partsData = await partsRes.json();
                    setPartUsages(partsData);
                }
                if (techniciansRes.ok) {
                    const techniciansData = await techniciansRes.json();
                    setTechnicians(techniciansData);
                }
                if (inventoryRes.ok) {
                    const inventoryData = await inventoryRes.json();
                    setInventory(inventoryData);
                }
                if (branchesRes.ok) {
                    const branchesData = await branchesRes.json();
                    setBranches(branchesData);
                }
                if (vehiclesRes.ok) {
                    const vehiclesData = await vehiclesRes.json();
                    setVehicles(vehiclesData);
                }
                if (driversRes.ok) {
                    const driversData = await driversRes.json();
                    setDrivers(driversData);
                }
                if (suppliersRes.ok) {
                    const suppliersData = await suppliersRes.json();
                    setSuppliers(suppliersData);
                }

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchOrderDetails();
    }, [orderId]);


    const handleAddPartUsage = async () => {
        if (!selectedPart.partId || !selectedPart.quantity || !order) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`repair-orders/${order.id}/part-usages`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    partId: selectedPart.partId,
                    quantity: parseInt(selectedPart.quantity, 10),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to add part usage.');
            }

            // Refresh part usages or optimistically update UI
            // For now, we can just log success
            console.log('Part usage added successfully');
            setSelectedPart({ partId: '', quantity: '1' });
            // You might want to re-fetch the order details to show the new part usage
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    const handleCreateOutsource = async () => {
        if (!selectedSupplier || !order) {
            alert('لطفا یک تامین کننده را انتخاب کنید.');
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`repair-orders/${order.id}/outsourcing-requests`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    supplierId: selectedSupplier,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create outsourcing request.');
            }

            // Refresh order details or optimistically update UI
            console.log('Outsourcing request created successfully');
            setSelectedSupplier('');
            // You might want to re-fetch the order details to show the new outsourcing request
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleAssignTechnician = async (techId: string) => {
        if (!order) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`repair-orders/${order.id}/assign-technician`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    technicianId: techId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to assign technician.');
            }

            // Update order state optimistically
            setOrder(prev => prev ? { ...prev, assignedTechnicianId: techId } : null);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleStatusChange = async (status: RepairStatus) => {
        if (!order) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl(`repair-orders/${order.id}/status`), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    status: status,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update status.');
            }

            // Update order state optimistically
            setOrder(prev => prev ? { ...prev, status: status } : null);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const onGenerateInvoice = (orderId: string) => {
        // Placeholder for invoice generation logic
        console.log("Generating invoice for order:", orderId);
    };

    // Hooks must not be after early returns; compute memos safely before returns
    const vehicle = useMemo(() => {
        if (!order) return undefined;
        return vehicles.find(v => v.id === order.vehicleId);
    }, [vehicles, order]);
    const driver = useMemo(() => {
        if (!order) return undefined;
        return drivers.find(d => d.id === order.driverId);
    }, [drivers, order]);
    const branch = useMemo(() => {
        if (!order) return undefined;
        return branches.find(b => b.id === order.branchId);
    }, [branches, order]);
    const outsourcedSupplier = useMemo(() => {
        if (!outsourcingRequest) return undefined;
        return suppliers.find(s => s.id === outsourcingRequest.supplierId);
    }, [suppliers, outsourcingRequest]);
    
    const vehicleIdentifier = useMemo(() => {
        if (!vehicle) return 'نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    }, [vehicle]);

    if (loading) return <div className="text-center p-8">Loading...</div>;
    if (error) return <div className="text-center p-8 text-red-500">Error: {error}</div>;
    if (!order) return <div className="text-center p-8">Repair order not found.</div>;

    const getPartName = (partId: string) => inventory.find(p => p.id === partId)?.name || 'قطعه نامشخص';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <button onClick={onBack} className="flex items-center text-sm font-medium text-sky-600 hover:text-sky-800">
                    <ChevronRightIcon className="w-5 h-5 ml-1"/>
                    <span>بازگشت به داشبورد</span>
                </button>
                <h2 className="text-2xl font-bold text-slate-800">سفارش تعمیر #{order.id.substring(0, 6)}</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <InfoCard title="شرح مشکل" icon={<CogIcon className="w-6 h-6 text-slate-500" />}>
                        <p className="text-slate-700 leading-relaxed">{order.description}</p>
                    </InfoCard>

                    <InfoCard title="قطعات مصرفی" icon={<ArchiveBoxIcon className="w-6 h-6 text-slate-500" />}>
                        <div className="flex items-end gap-3 p-3 bg-slate-50 rounded-lg">
                            <div className="flex-grow">
                                <label htmlFor="part-select" className="block text-sm font-medium text-slate-700">انتخاب قطعه</label>
                                <select id="part-select" value={selectedPart.partId} onChange={e => setSelectedPart(p => ({...p, partId: e.target.value}))} className="w-full mt-1 input-style">
                                    <option value="">یک قطعه انتخاب کنید</option>
                                    {inventory.map(part => (
                                        <option key={part.id} value={part.id}>{part.name} (موجودی: {part.stock})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-20">
                                 <label htmlFor="part-quantity" className="block text-sm font-medium text-slate-700">تعداد</label>
                                 <input id="part-quantity" type="number" min="1" value={selectedPart.quantity} onChange={e => setSelectedPart(p => ({...p, quantity: e.target.value}))} className="w-full mt-1 input-style" />
                            </div>
                            <button onClick={handleAddPartUsage} className="w-full mt-4 px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition whitespace-nowrap">ثبت مصرف</button>
                        </div>
                        {partUsages.length > 0 ? (
                            <div className="mt-4 space-y-2">
                                {partUsages.map(usage => (
                                    <div key={usage.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                        <div>
                                            <span className="font-semibold">{getPartName(usage.partId)}</span>
                                            <span className="text-sm text-gray-500 mr-2">({usage.quantityUsed} عدد)</span>
                                        </div>
                                        <span className="text-xs text-gray-400">{formatJalaliDateTime(usage.usageDate)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-slate-400 text-sm mt-4">هنوز قطعه‌ای برای این سفارش مصرف نشده است.</p>
                        )}
                    </InfoCard>

                    <InfoCard title="برون سپاری" icon={<BriefcaseIcon className="w-6 h-6 text-slate-500" />}>
                        {outsourcingRequest ? (
                             <div>
                                <p>این سفارش به تامین کننده <span className="font-bold">{outsourcedSupplier?.name}</span> سپرده شده است.</p>
                                <p className="text-sm text-slate-500">وضعیت: <span className="font-semibold">{outsourcingRequest.status}</span></p>
                             </div>
                        ) : (
                            <div className="flex items-end gap-3">
                                <div className="flex-grow">
                                    <label htmlFor="supplier-select" className="block text-sm font-medium text-slate-700">انتخاب تامین کننده</label>
                                    <select id="supplier-select" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full mt-1 input-style">
                                        <option value="">یک تامین کننده انتخاب کنید</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button onClick={handleCreateOutsource} className="w-full mt-2 px-4 py-2 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 transition whitespace-nowrap">ایجاد درخواست</button>
                            </div>
                        )}
                    </InfoCard>
                </div>
                <div className="space-y-6">
                    <InfoCard title="اطلاعات خودرو و شعبه" icon={<TruckIcon className="w-6 h-6 text-slate-500" />}>
                        <p className="font-bold text-lg">{vehicleIdentifier}</p>
                        <p className="text-sm text-slate-600">{vehicle?.model} ({vehicle?.type})</p>
                        <p className="text-sm text-slate-500 mt-2">شعبه: <span className="font-semibold">{branch?.name}</span></p>
                    </InfoCard>
                     <InfoCard title="اطلاعات راننده" icon={<UserCircleIcon className="w-6 h-6 text-slate-500" />}>
                        <p className="font-semibold">{driver?.name}</p>
                        <p className="text-sm text-slate-500 font-mono">کد پرسنلی: {driver?.employeeId}</p>
                     </InfoCard>
                     <InfoCard title="مدیریت سفارش" icon={<CogIcon className="w-6 h-6 text-slate-500" />}>
                        <div>
                            <label htmlFor="status-select" className="block text-sm font-medium text-slate-700">تغییر وضعیت</label>
                            <select id="status-select" value={order.status} onChange={e => handleStatusChange(e.target.value as RepairStatus)} className="w-full mt-1 input-style">
                                {Object.values(RepairStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="mt-4">
                            <label htmlFor="technician-select" className="block text-sm font-medium text-slate-700">تخصیص به تکنسین</label>
                            <select id="technician-select" value={order.assignedTechnicianId || ''} onChange={e => handleAssignTechnician(e.target.value)} className="w-full mt-1 input-style">
                                <option value="">یک تکنسین انتخاب کنید</option>
                                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                     </InfoCard>
                      <InfoCard title="عملیات" icon={<BriefcaseIcon className="w-6 h-6 text-slate-500" />}>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="status-select" className="block text-sm font-medium text-slate-700">تغییر وضعیت</label>
                                <select id="status-select" value={order.status} onChange={e => handleStatusChange(e.target.value as RepairStatus)} className="w-full mt-1 input-style">
                                    {Object.values(RepairStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="technician-select" className="block text-sm font-medium text-slate-700">تخصیص به تکنسین</label>
                                <select id="technician-select" value={order.assignedTechnicianId || ''} onChange={e => handleAssignTechnician(e.target.value)} className="w-full mt-1 input-style">
                                    <option value="">یک تکنسین انتخاب کنید</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <button onClick={() => onGenerateInvoice(order.id)} className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition">
                                صدور فاکتور
                            </button>
                        </div>
                     </InfoCard>
                </div>
            </div>
            <style>{`.input-style { display: block; width: 100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default RepairOrderView;
