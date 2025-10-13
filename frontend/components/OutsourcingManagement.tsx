import React, { useState, useMemo } from 'react';
import { OutsourcingRequest, RepairOrder, Supplier, Vehicle, OutsourcingStatus } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { BriefcaseIcon } from './icons/BriefcaseIcon';

interface OutsourcingManagementProps {
    requests: OutsourcingRequest[];
    repairOrders: RepairOrder[];
    suppliers: Supplier[];
    vehicles: Vehicle[];
}

const OutsourcingManagement: React.FC<OutsourcingManagementProps> = ({ requests, repairOrders, suppliers, vehicles }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const getRequestDetails = (req: OutsourcingRequest) => {
        const order = repairOrders.find(ro => ro.id === req.repairOrderId);
        const vehicle = vehicles.find(v => v.id === order?.vehicleId);
        const supplier = suppliers.find(s => s.id === req.supplierId);
        const vehicleIdentifier = vehicle ? (vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber) : 'نامشخص';
        return { order, vehicle, supplier, vehicleIdentifier };
    }
    
    const statusStyles: { [key in OutsourcingStatus]: string } = {
        [OutsourcingStatus.PendingQuote]: 'bg-gray-100 text-gray-800',
        [OutsourcingStatus.InProgress]: 'bg-yellow-100 text-yellow-800',
        [OutsourcingStatus.Completed]: 'bg-green-100 text-green-800',
        [OutsourcingStatus.Cancelled]: 'bg-red-100 text-red-800',
    };
    
    const filteredRequests = useMemo(() => {
        if (!searchTerm) return requests;
        return requests.filter(req => {
            const { vehicleIdentifier, supplier } = getRequestDetails(req);
            return (
                (vehicleIdentifier && vehicleIdentifier.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (supplier && supplier.name.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        });
    }, [searchTerm, requests, repairOrders, vehicles, suppliers]);


    return (
        <div className="max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <BriefcaseIcon className="w-6 h-6 mr-2 text-sky-600" />
                    مدیریت برون سپاری تعمیرات
                </h2>
                <input
                    type="text"
                    placeholder="جستجو..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">شماره سفارش</th>
                            <th className="px-6 py-3">خودرو</th>
                            <th className="px-6 py-3">تامین کننده</th>
                            <th className="px-6 py-3">تاریخ ارسال</th>
                            <th className="px-6 py-3">وضعیت</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.length > 0 ? filteredRequests.map(req => {
                            const { order, vehicleIdentifier, supplier } = getRequestDetails(req);
                            return (
                                <tr key={req.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono text-slate-600">#{order?.id.substring(0, 6)}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{vehicleIdentifier}</td>
                                    <td className="px-6 py-4">{supplier?.name}</td>
                                    <td className="px-6 py-4">{formatJalali(req.sentDate)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusStyles[req.status]}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-slate-500">هیچ درخواست برون سپاری یافت نشد.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OutsourcingManagement;
