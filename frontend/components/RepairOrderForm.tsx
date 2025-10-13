import React, { useState, useMemo } from 'react';
import { Branch, Vehicle, Driver, RepairOrder } from '../types';
import { formatPlateNumber } from '../utils/jalali';

interface RepairOrderFormProps {
    branches: Branch[];
    vehicles: Vehicle[];
    drivers: Driver[];
    onSubmit: (orderData: Omit<RepairOrder, 'id' | 'status' | 'createdAt' | 'branchId'>) => void;
    onCancel: () => void;
}

const RepairOrderForm: React.FC<RepairOrderFormProps> = ({ branches, vehicles, drivers, onSubmit, onCancel }) => {
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [driverIdentifier, setDriverIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const [foundDriver, setFoundDriver] = useState<Driver | null>(null);

    const [formData, setFormData] = useState({
        vehicleId: '',
        driverId: '',
        description: '',
        priority: 'Normal' as 'Normal' | 'High',
    });

    const handleVehicleLookup = () => {
        if (!vehicleIdentifier) {
            setFoundVehicle(null);
            return;
        }
        const searchTerm = vehicleIdentifier.toLowerCase().replace(/ /g, '');
        const found = vehicles.find(v => 
            (v.serialNumber && v.serialNumber.toLowerCase() === searchTerm) ||
            (v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(searchTerm))
        );
        setFoundVehicle(found || null);
        if (found) {
            setFormData(prev => ({ ...prev, vehicleId: found.id }));
        } else {
            alert('خودرویی با این شناسه یافت نشد.');
        }
    };
    
    const handleDriverLookup = () => {
        if (!driverIdentifier) {
            setFoundDriver(null);
            return;
        }
        const searchTerm = driverIdentifier.toLowerCase();
        const found = drivers.find(d => d.employeeId.toLowerCase() === searchTerm);
        setFoundDriver(found || null);
        if (found) {
            setFormData(prev => ({ ...prev, driverId: found.id }));
        } else {
             alert('راننده‌ای با این کد پرسنلی یافت نشد.');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.vehicleId || !formData.driverId || !formData.description) {
            alert('لطفا تمام فیلدهای الزامی را تکمیل کنید.');
            return;
        }
        onSubmit(formData);
    };

    return (
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">فرم ثبت سفارش تعمیر جدید</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                    <label className="block text-sm font-medium text-slate-700">۱. اطلاعات خودرو</label>
                    <div className="flex items-end gap-2">
                        <input 
                            type="text"
                            value={vehicleIdentifier}
                            onChange={e => setVehicleIdentifier(e.target.value)}
                            placeholder="شماره پلاک یا شماره سریال خودرو را وارد کنید"
                            className="flex-grow input-style"
                        />
                        <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700">جستجو</button>
                    </div>
                    {foundVehicle && (
                        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md">
                            <p><strong>خودرو یافت شد:</strong> {foundVehicle.model} ({foundVehicle.type})</p>
                            <p className="text-sm"><strong>شعبه:</strong> {branches.find(b => b.id === foundVehicle.branchId)?.name}</p>
                        </div>
                    )}
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                     <label className="block text-sm font-medium text-slate-700">۲. اطلاعات راننده</label>
                     <div className="flex items-end gap-2">
                        <input
                            type="text"
                            value={driverIdentifier}
                            onChange={e => setDriverIdentifier(e.target.value)}
                            placeholder="کد پرسنلی راننده را وارد کنید"
                            className="flex-grow input-style"
                        />
                        <button type="button" onClick={handleDriverLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700">جستجو</button>
                    </div>
                     {foundDriver && (
                        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md">
                            <p><strong>راننده یافت شد:</strong> {foundDriver.name}</p>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                     <label className="block text-sm font-medium text-slate-700">۳. جزئیات سفارش</label>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">اولویت</label>
                        <select name="priority" value={formData.priority} onChange={handleChange} className="mt-1 block w-full input-style">
                            <option value="Normal">عادی</option>
                            <option value="High">فوری</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">شرح مشکل</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="mt-1 block w-full input-style" required />
                    </div>
                </div>


                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onCancel} className="px-6 py-2 rounded-md text-sm font-medium bg-slate-200 text-slate-800 hover:bg-slate-300">
                        انصراف
                    </button>
                    <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">
                        ثبت سفارش
                    </button>
                </div>
            </form>
            <style>{`.input-style { display: block; width: 100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default RepairOrderForm;
