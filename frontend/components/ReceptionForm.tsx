import React, { useState, useMemo } from 'react';
import { PartUsage, Part, Branch, DrillDownInfo } from '../types';
import { formatJalali } from '../utils/jalali';
import { ChartBarIcon } from './icons/ChartBarIcon';

interface CostReportProps {
    partUsages: PartUsage[];
    parts: Part[];
    branches: Branch[];
    onDrillDown: (info: DrillDownInfo) => void;
}

const CostReport: React.FC<CostReportProps> = ({ partUsages, parts, branches, onDrillDown }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const partPriceMap = useMemo(() => new Map(parts.map(p => [p.id, p.price])), [parts]);

    const branchCosts = useMemo(() => {
        const costs: { [key: string]: number } = {};

        partUsages.forEach(usage => {
            const usageDate = usage.usageDate;
            if (startDate && new Date(startDate) > usageDate) return;
            if (endDate && new Date(endDate) < usageDate) return;

            const partPrice = partPriceMap.get(usage.partId) || 0;
            const cost = partPrice * usage.quantityUsed;

            if (!costs[usage.branchId]) {
                costs[usage.branchId] = 0;
            }
            costs[usage.branchId] += cost;
        });
        
        const costArray = Object.entries(costs).map(([branchId, totalCost]) => ({
            branchId,
            branchName: branches.find(b => b.id === branchId)?.name || 'نامشخص',
            totalCost,
        }));

        return costArray.sort((a, b) => b.totalCost - a.totalCost);

    }, [partUsages, parts, branches, startDate, endDate, partPriceMap]);

    const handleDrillDown = (branchId: string) => {
        onDrillDown({
            type: 'branchCost',
            branchId,
            startDate,
            endDate
        });
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <ChartBarIcon className="w-6 h-6 mr-2 text-sky-600" />
                    گزارش هزینه‌های شعب
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end p-4 border border-slate-200 rounded-lg bg-slate-50">
                    <div>
                        <label htmlFor="startDate" className="block text-sm font-medium text-slate-700">از تاریخ</label>
                        <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full input-style" />
                    </div>
                    <div>
                        <label htmlFor="endDate" className="block text-sm font-medium text-slate-700">تا تاریخ</label>
                        <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full input-style" />
                    </div>
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-5 py-2 rounded-md text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition">
                        پاک کردن فیلترها
                    </button>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">رتبه</th>
                                <th className="px-6 py-3">نام شعبه</th>
                                <th className="px-6 py-3">مجموع هزینه تعمیرات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branchCosts.length > 0 ? branchCosts.map((item, index) => (
                                <tr key={item.branchId} 
                                    className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                                    onClick={() => handleDrillDown(item.branchId)}
                                    title="برای مشاهده جزئیات کلیک کنید"
                                >
                                    <td className="px-6 py-4">{index + 1}</td>
                                    <th className="px-6 py-4 font-medium text-gray-900">{item.branchName}</th>
                                    <td className="px-6 py-4 font-mono text-lg">{item.totalCost.toLocaleString('fa-IR')} تومان</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} className="text-center py-8 text-slate-500">هیچ هزینه‌ای برای بازه زمانی انتخابی یافت نشد.</td>
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

export default CostReport;