

import React, { useMemo } from 'react';
import { DrillDownInfo, RepairOrder, PartUsage, Part, Vehicle, OutsourcingRequest, Branch } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';

interface DrillDownViewProps {
    info: DrillDownInfo;
    repairOrders: RepairOrder[];
    partUsages: PartUsage[];
    parts: Part[];
    vehicles: Vehicle[];
    outsourcingRequests: OutsourcingRequest[];
    branches: Branch[];
    onBack: () => void;
}

const StatCard: React.FC<{ title: string; value: string | number; color: string; }> = ({ title, value, color }) => (
    <div className={`bg-white p-5 rounded-xl shadow-md flex-grow border-t-4 ${color}`}>
        <p className="text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
);


const DrillDownView: React.FC<DrillDownViewProps> = (props) => {
    const { info, repairOrders, partUsages, parts, vehicles, outsourcingRequests, branches, onBack } = props;

    const branchName = useMemo(() => {
        if (!info || info.type !== 'branchCost') return 'نامشخص';
        return branches.find(b => b.id === info.branchId)?.name || 'نامشخص';
    }, [info, branches]);

    const dateRangeText = useMemo(() => {
        if (!info) return '';
        const { startDate, endDate } = info;
        if (startDate && endDate) return `از ${formatJalali(new Date(startDate))} تا ${formatJalali(new Date(endDate))}`;
        if (startDate) return `از ${formatJalali(new Date(startDate))} به بعد`;
        if (endDate) return `تا تاریخ ${formatJalali(new Date(endDate))}`;
        return 'در تمام بازه‌های زمانی';
    }, [info]);

    const detailedData = useMemo(() => {
        if (!info || info.type !== 'branchCost') return { repairs: [], totalOutsourcedCost: 0, totalInternalCost: 0 };
        
        const { branchId, startDate, endDate } = info;
        
        const filteredOrders = repairOrders.filter(order => {
            if (order.branchId !== branchId) return false;
            
            if (startDate && order.createdAt.getTime() < new Date(startDate).getTime()) {
                return false;
            }

            if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                if (order.createdAt.getTime() > endOfDay.getTime()) {
                    return false;
                }
            }
            return true;
        });

        const partPriceMap = new Map(parts.map(p => [p.id, p.price]));

        const repairs = filteredOrders.map(order => {
            const internalCost = partUsages
                .filter(pu => pu.repairOrderId === order.id)
                // FIX: Explicitly typing the accumulator 'sum' as a number to resolve the arithmetic operation error.
                .reduce((sum: number, usage) => {
                    const price = partPriceMap.get(usage.partId) || 0;
                    return sum + (price * usage.quantityUsed);
                }, 0);
            
            const outsourcingReq = outsourcingRequests.find(or => or.repairOrderId === order.id);
            const outsourcedCost = outsourcingReq?.quoteAmount || 0;

            const vehicle = vehicles.find(v => v.id === order.vehicleId);
            const vehicleIdentifier = vehicle ? (vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber) : 'نامشخص';

            return {
                ...order,
                internalCost,
                outsourcedCost,
                totalCost: internalCost + outsourcedCost,
                vehicleIdentifier,
            };
        });

        // FIX: Explicitly typing the accumulator 'sum' resolves the "left-hand side of an arithmetic operation" error by ensuring it's treated as a number.
        const totalInternalCost = repairs.reduce((sum: number, r) => sum + r.internalCost, 0);
        // FIX: Explicitly typing the accumulator 'sum' resolves the "left-hand side of an arithmetic operation" error by ensuring it's treated as a number.
        const totalOutsourcedCost = repairs.reduce((sum: number, r) => sum + r.outsourcedCost, 0);

        return { repairs, totalOutsourcedCost, totalInternalCost };

    }, [info, repairOrders, partUsages, parts, vehicles, outsourcingRequests, branches]);

    if (!info) return null;

    const { repairs, totalOutsourcedCost, totalInternalCost } = detailedData;
    const grandTotalCost = totalInternalCost + totalOutsourcedCost;

    const internalCostPercentage = grandTotalCost > 0 ? (totalInternalCost / grandTotalCost) * 100 : 0;
    const outsourcedCostPercentage = grandTotalCost > 0 ? (totalOutsourcedCost / grandTotalCost) * 100 : 0;


    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="flex items-center text-sm font-medium text-sky-600 hover:text-sky-800">
                    <ChevronRightIcon className="w-5 h-5 ml-1" />
                    <span>بازگشت به گزارش</span>
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 text-left">جزئیات هزینه‌های شعبه: {branchName}</h2>
                    <p className="text-slate-500 text-left">{dateRangeText}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <StatCard title="تعداد کل تعمیرات" value={repairs.length.toLocaleString('fa-IR')} color="border-blue-500" />
                <StatCard title="هزینه قطعات داخلی" value={`${totalInternalCost.toLocaleString('fa-IR')} تومان`} color="border-green-500" />
                <StatCard title="هزینه برون سپاری" value={`${totalOutsourcedCost.toLocaleString('fa-IR')} تومان`} color="border-orange-500" />
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                        <ChartBarIcon className="w-6 h-6 mr-2 text-sky-600" />
                        نمودار تفکیک هزینه‌ها
                    </h3>
                    <div className="space-y-4 pt-2">
                        <div title={`هزینه داخلی: ${totalInternalCost.toLocaleString('fa-IR')} تومان`}>
                            <div className="flex justify-between items-center mb-1 text-sm">
                                <span className="font-medium text-slate-700">هزینه قطعات داخلی</span>
                                <span className="font-mono text-green-700">{internalCostPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-4">
                                <div className="bg-green-500 h-4 rounded-full" style={{ width: `${internalCostPercentage}%` }}></div>
                            </div>
                        </div>
                        <div title={`هزینه برون‌سپاری: ${totalOutsourcedCost.toLocaleString('fa-IR')} تومان`}>
                            <div className="flex justify-between items-center mb-1 text-sm">
                                <span className="font-medium text-slate-700">هزینه برون سپاری</span>
                                <span className="font-mono text-orange-700">{outsourcedCostPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-4">
                                <div className="bg-orange-500 h-4 rounded-full" style={{ width: `${outsourcedCostPercentage}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">خلاصه هزینه‌ها</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b">
                                <td className="py-3 font-medium text-slate-700 flex items-center">
                                    <span className="w-3 h-3 rounded-full bg-green-500 ml-2"></span>
                                    هزینه قطعات داخلی
                                </td>
                                <td className="py-3 font-mono text-left">{totalInternalCost.toLocaleString('fa-IR')} تومان</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-3 font-medium text-slate-700 flex items-center">
                                    <span className="w-3 h-3 rounded-full bg-orange-500 ml-2"></span>
                                    هزینه برون سپاری
                                </td>
                                <td className="py-3 font-mono text-left">{totalOutsourcedCost.toLocaleString('fa-IR')} تومان</td>
                            </tr>
                            <tr className="bg-slate-50">
                                <td className="py-3 font-bold text-slate-800">جمع کل</td>
                                <td className="py-3 font-mono text-left font-bold text-slate-800">{grandTotalCost.toLocaleString('fa-IR')} تومان</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-bold text-slate-800 mb-4">لیست تعمیرات</h3>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">خودرو</th>
                                <th className="px-6 py-3">شرح مشکل</th>
                                <th className="px-6 py-3">هزینه داخلی</th>
                                <th className="px-6 py-3">هزینه برون سپاری</th>
                                <th className="px-6 py-3">جمع کل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {repairs.length > 0 ? repairs.map(item => (
                                <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">{item.vehicleIdentifier}</td>
                                    <td className="px-6 py-4 max-w-sm truncate" title={item.description}>{item.description}</td>
                                    <td className="px-6 py-4 font-mono">{item.internalCost > 0 ? `${item.internalCost.toLocaleString('fa-IR')}` : '-'}</td>
                                    <td className="px-6 py-4 font-mono">{item.outsourcedCost > 0 ? `${item.outsourcedCost.toLocaleString('fa-IR')}` : '-'}</td>
                                    <td className="px-6 py-4 font-mono font-bold text-slate-800">{item.totalCost.toLocaleString('fa-IR')}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">هیچ تعمیراتی برای این شعبه در بازه زمانی انتخابی یافت نشد.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DrillDownView;