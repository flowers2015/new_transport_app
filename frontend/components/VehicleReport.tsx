import React, { useState, useMemo } from 'react';
import { PartUsage, Part, Branch, Vehicle } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

interface PartUsageReportProps {
    partUsages: PartUsage[];
    parts: Part[];
    branches: Branch[];
    vehicles: Vehicle[];
}

const PartUsageReport: React.FC<PartUsageReportProps> = ({ partUsages, parts, branches, vehicles }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const getPartName = (partId: string) => parts.find(p => p.id === partId)?.name || 'نامشخص';
    const getBranchName = (branchId: string) => branches.find(b => b.id === branchId)?.name || 'نامشخص';
    const getVehicleIdentifier = (vehicleId: string): string => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return 'نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    };

    const filteredUsages = useMemo(() => {
        return partUsages.filter(usage => {
            if (startDate && new Date(startDate) > usage.usageDate) return false;
            if (endDate && new Date(endDate) < usage.usageDate) return false;
            if (selectedBranch && usage.branchId !== selectedBranch) return false;
            if (searchTerm && !getVehicleIdentifier(usage.vehicleId).toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });
    }, [partUsages, startDate, endDate, selectedBranch, searchTerm, vehicles]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <DocumentTextIcon className="w-6 h-6 mr-2 text-sky-600" />
                    گزارش مصرف قطعات
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end p-4 border border-slate-200 rounded-lg bg-slate-50">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">از تاریخ</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full input-style" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">تا تاریخ</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full input-style" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">شعبه</label>
                        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="mt-1 block w-full input-style">
                            <option value="">همه شعب</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700">جستجوی خودرو</label>
                         <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="پلاک یا شماره سریال خودرو را وارد کنید..." className="mt-1 block w-full input-style" />
                    </div>
                    <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedBranch(''); setSearchTerm(''); }} className="px-5 py-2 rounded-md text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition">
                        پاک کردن فیلترها
                    </button>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">نام قطعه</th>
                                <th className="px-6 py-3">شناسه خودرو</th>
                                <th className="px-6 py-3">شعبه</th>
                                <th className="px-6 py-3">تعداد</th>
                                <th className="px-6 py-3">تاریخ مصرف</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsages.length > 0 ? filteredUsages.map(usage => (
                                <tr key={usage.id} className="bg-white border-b hover:bg-gray-50">
                                    <th className="px-6 py-4 font-medium text-gray-900">{getPartName(usage.partId)}</th>
                                    <td className="px-6 py-4 font-mono">{getVehicleIdentifier(usage.vehicleId)}</td>
                                    <td className="px-6 py-4">{getBranchName(usage.branchId)}</td>
                                    <td className="px-6 py-4">{usage.quantityUsed}</td>
                                    <td className="px-6 py-4">{formatJalali(usage.usageDate)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">هیچ رکوردی برای فیلترهای انتخابی یافت نشد.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
}

export default PartUsageReport;
