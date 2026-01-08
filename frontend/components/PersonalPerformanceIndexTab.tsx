import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';

interface PersonalPerformanceIndexData {
    month: string; // YYYY/MM
    lineType: string;
    vehicleType: string;
    assignmentCount: number;
    avgAssignmentSuccess: number; // میانگین روزهای تخصیص
    totalFreightCost: number;
    totalCarton: number;
    totalTonnage: number;
    freightPerUnit: number;
    freightPerVehicle: number;
    totalUnit: number;
}

interface PersonalPerformanceIndexResponse {
    data: PersonalPerformanceIndexData[];
}

const PersonalPerformanceIndexTab: React.FC = () => {
    const [data, setData] = useState<PersonalPerformanceIndexData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // تاریخ پیش‌فرض: از 1404/09/26 تا 1404/10/25
    const getDefaultDates = () => {
        const defaultYear = 1404;
        const startYear = defaultYear;
        const startMonth = 9;
        const startDay = 26;
        const endYear = defaultYear;
        const endMonth = 10;
        const endDay = 25;
        
        return {
            startYear,
            startMonth,
            startDay,
            endYear,
            endMonth,
            endDay
        };
    };
    
    const defaultDates = useMemo(() => getDefaultDates(), []);
    
    const parseJalaliDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        return {
            year: parseInt(parts[0]) || 1404,
            month: parseInt(parts[1]) || 1,
            day: parseInt(parts[2]) || 1
        };
    };
    
    const [startDate, setStartDate] = useState(
        `${defaultDates.startYear}/${String(defaultDates.startMonth).padStart(2, '0')}/${String(defaultDates.startDay).padStart(2, '0')}`
    );
    const [endDate, setEndDate] = useState(
        `${defaultDates.endYear}/${String(defaultDates.endMonth).padStart(2, '0')}/${String(defaultDates.endDay).padStart(2, '0')}`
    );
    
    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const startParts = parseJalaliDate(startDate);
            const endParts = parseJalaliDate(endDate);
            
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                startYear: startParts.year.toString(),
                startMonth: startParts.month.toString(),
                startDay: startParts.day.toString(),
                endYear: endParts.year.toString(),
                endMonth: endParts.month.toString(),
                endDay: endParts.day.toString()
            });
            
            const response = await fetch(getApiUrl(`freight-announcements/personal-performance-index?${params}`), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('خطا در دریافت داده‌ها');
            }
            
            const result: PersonalPerformanceIndexResponse = await response.json();
            setData(result.data || []);
        } catch (err: any) {
            console.error('Error fetching personal performance index:', err);
            setError(err.message || 'خطا در دریافت داده‌ها');
        } finally {
            setLoading(false);
        }
    };
    
    // گروه‌بندی داده‌ها بر اساس ماه، لاین و نوع خودرو
    const groupedData = useMemo(() => {
        const grouped: { [key: string]: { [lineType: string]: { [vehicleType: string]: PersonalPerformanceIndexData } } } = {};
        
        data.forEach(item => {
            if (!grouped[item.month]) {
                grouped[item.month] = {};
            }
            if (!grouped[item.month][item.lineType]) {
                grouped[item.month][item.lineType] = {};
            }
            grouped[item.month][item.lineType][item.vehicleType] = item;
        });
        
        return grouped;
    }, [data]);
    
    // مرتب‌سازی ماه‌ها
    const sortedMonths = useMemo(() => {
        return Object.keys(groupedData).sort((a, b) => {
            const [aYear, aMonth] = a.split('/').map(Number);
            const [bYear, bMonth] = b.split('/').map(Number);
            if (aYear !== bYear) return aYear - bYear;
            return aMonth - bMonth;
        });
    }, [groupedData]);
    
    // محاسبه مجموع برای هر ماه و لاین
    const getMonthLineTotals = (month: string, lineType: string) => {
        const lineData = groupedData[month]?.[lineType] || {};
        const vehicleTypes = Object.keys(lineData);
        
        return {
            assignmentCount: vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.assignmentCount || 0), 0),
            totalFreightCost: vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.totalFreightCost || 0), 0),
            totalCarton: vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.totalCarton || 0), 0),
            totalTonnage: vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.totalTonnage || 0), 0),
            totalUnit: vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.totalUnit || 0), 0),
            avgAssignmentSuccess: vehicleTypes.length > 0
                ? vehicleTypes.reduce((sum, vt) => sum + (lineData[vt]?.avgAssignmentSuccess || 0), 0) / vehicleTypes.length
                : 0
        };
    };
    
    // تشخیص لاین‌های موجود
    const getLineTypes = (month: string) => {
        return Object.keys(groupedData[month] || {});
    };
    
    return (
        <div className="space-y-4">
            {/* فیلتر تاریخ */}
            <div className="bg-white rounded-lg shadow p-3">
                <h3 className="text-base font-semibold text-slate-800 mb-3">فیلتر تاریخ</h3>
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-medium text-slate-700 mb-1">از تاریخ</label>
                        <input
                            type="text"
                            value={startDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setStartDate(value);
                                }
                            }}
                            placeholder="1404/09/26"
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs"
                            dir="rtl"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-medium text-slate-700 mb-1">تا تاریخ</label>
                        <input
                            type="text"
                            value={endDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setEndDate(value);
                                }
                            }}
                            placeholder="1404/10/25"
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs"
                            dir="rtl"
                        />
                    </div>
                    <div className="flex-shrink-0">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="px-4 py-1.5 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-slate-400 text-xs font-medium whitespace-nowrap"
                        >
                            {loading ? 'در حال جستجو...' : 'جستجو'}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* جدول */}
            {loading ? (
                <div className="text-center py-10 text-slate-500">در حال بارگذاری...</div>
            ) : error ? (
                <div className="text-center py-10 text-red-500">{error}</div>
            ) : sortedMonths.length === 0 ? (
                <div className="text-center py-10 text-slate-500">داده‌ای برای نمایش وجود ندارد</div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-600">
                            <tr>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">ماه</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">لاین</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">نوع خودرو</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">تعداد تخصیص</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">میانگین موفقیت تخصیص (روز)</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">مجموع کرایه</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">کارتن/تناژ</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">کرایه به ازای کارتن/تناژ</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center bg-slate-600 text-white font-bold">کرایه به ازای خودرو</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedMonths.map(month => {
                                const lineTypes = getLineTypes(month);
                                
                                return (
                                    <React.Fragment key={month}>
                                        {lineTypes.map(lineType => {
                                            const lineData = groupedData[month][lineType] || {};
                                            const vehicleTypes = Object.keys(lineData);
                                            const totals = getMonthLineTotals(month, lineType);
                                            const isIceCream = lineType === 'بستنی' || lineType === 'IceCream';
                                            
                                            return (
                                                <React.Fragment key={`${month}_${lineType}`}>
                                                    {vehicleTypes.map((vehicleType, idx) => {
                                                        const item = lineData[vehicleType];
                                                        const isFirstVehicle = idx === 0;
                                                        const isLastVehicle = idx === vehicleTypes.length - 1;
                                                        
                                                        return (
                                                            <tr key={`${month}_${lineType}_${vehicleType}`} className="hover:bg-slate-50">
                                                                {isFirstVehicle && (
                                                                    <>
                                                                        <td className="px-3 py-2 border border-slate-300 text-center" rowSpan={vehicleTypes.length + 1}>{month}</td>
                                                                        <td className="px-3 py-2 border border-slate-300 text-center" rowSpan={vehicleTypes.length + 1}>{lineType}</td>
                                                                    </>
                                                                )}
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{vehicleType}</td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{item.assignmentCount.toLocaleString('fa-IR')}</td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{item.avgAssignmentSuccess.toFixed(2)}</td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{item.totalFreightCost.toLocaleString('fa-IR')}</td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">
                                                                    {isIceCream 
                                                                        ? item.totalCarton.toLocaleString('fa-IR')
                                                                        : item.totalTonnage.toFixed(2)}
                                                                </td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{item.freightPerUnit.toFixed(2)}</td>
                                                                <td className="px-3 py-2 border border-slate-300 text-center">{item.freightPerVehicle.toFixed(2)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {/* جمع کل لاین */}
                                                    <tr className="bg-slate-100 font-semibold">
                                                        <td colSpan={2} className="px-3 py-2 border border-slate-300 text-center">جمع کل {lineType}</td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">{totals.assignmentCount.toLocaleString('fa-IR')}</td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">{totals.avgAssignmentSuccess.toFixed(2)}</td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalFreightCost.toLocaleString('fa-IR')}</td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">
                                                            {isIceCream 
                                                                ? totals.totalCarton.toLocaleString('fa-IR')
                                                                : totals.totalTonnage.toFixed(2)}
                                                        </td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">
                                                            {totals.totalUnit > 0 
                                                                ? (totals.totalFreightCost / totals.totalUnit).toFixed(2)
                                                                : '0'}
                                                        </td>
                                                        <td className="px-3 py-2 border border-slate-300 text-center">
                                                            {totals.assignmentCount > 0 
                                                                ? (totals.totalFreightCost / totals.assignmentCount).toFixed(2)
                                                                : '0'}
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PersonalPerformanceIndexTab;

