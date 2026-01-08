import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { gregorianToJalali, jalaliToGregorian } from '../utils/jalali';

interface PerformanceIndexData {
    month: string; // YYYY/MM
    vehicleType: 'کشنده' | 'ده چرخ';
    totalMileage: number;
    tourCount: number;
    mileagePerTour: number;
    returnCargoCount: number;
    returnCargoPerTour: number;
    fixedAllowanceTourCount: number;
    commissionTourCount: number;
    commissionMileage: number;
    fixedAllowanceMileage: number;
    fixedAllowanceMileagePerTour: number;
    commissionMileagePerTour: number;
    totalTourMileage: number;
    totalTours: number;
    totalMileagePerTotalTours: number;
}

interface PerformanceIndexResponse {
    data: PerformanceIndexData[];
}

const PerformanceIndexTab: React.FC = () => {
    const [data, setData] = useState<PerformanceIndexData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // تاریخ پیش‌فرض: سال 1404
    const getDefaultDates = () => {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        
        // سال پیش‌فرض 1404
        const defaultYear = 1404;
        
        // 26 ماه قبل از ماه جاری (در سال 1404)
        let startYear = defaultYear;
        let startMonth = jm - 26;
        while (startMonth <= 0) {
            startMonth += 12;
            startYear -= 1;
        }
        
        // 25 ماه جاری (اگر روز >= 26، ماه جاری، وگرنه ماه قبل)
        let endYear = defaultYear;
        let endMonth = jm;
        if (jd < 26) {
            endMonth = jm - 1;
            if (endMonth <= 0) {
                endMonth = 12;
                endYear -= 1;
            }
        }
        
        return {
            startYear,
            startMonth,
            startDay: 26,
            endYear,
            endMonth,
            endDay: 25
        };
    };
    
    const defaultDates = useMemo(() => getDefaultDates(), []);
    
    // استفاده از state برای تاریخ‌های شمسی (فرمت YYYY/MM/DD)
    const [startDate, setStartDate] = useState(
        `${defaultDates.startYear}/${String(defaultDates.startMonth).padStart(2, '0')}/${String(defaultDates.startDay).padStart(2, '0')}`
    );
    const [endDate, setEndDate] = useState(
        `${defaultDates.endYear}/${String(defaultDates.endMonth).padStart(2, '0')}/${String(defaultDates.endDay).padStart(2, '0')}`
    );
    
    // استخراج سال، ماه، روز از تاریخ شمسی
    const parseJalaliDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        return {
            year: parseInt(parts[0]) || 1404,
            month: parseInt(parts[1]) || 1,
            day: parseInt(parts[2]) || 1
        };
    };
    
    const startDateParts = parseJalaliDate(startDate);
    const endDateParts = parseJalaliDate(endDate);
    
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
                endDay: endParts.day.toString(),
                assignmentType: 'company' // فقط شرکتی
            });
            
            const response = await fetch(getApiUrl(`freight-announcements/performance-index?${params}`), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('خطا در دریافت داده‌ها');
            }
            
            const result: PerformanceIndexResponse = await response.json();
            setData(result.data || []);
        } catch (err: any) {
            console.error('Error fetching performance index:', err);
            setError(err.message || 'خطا در دریافت داده‌ها');
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);
    
    // Debug: Log data
    useEffect(() => {
        console.log('📊 [PerformanceIndexTab] Data:', data);
        console.log('📊 [PerformanceIndexTab] Grouped Data:', groupedData);
        console.log('📊 [PerformanceIndexTab] Sorted Months:', sortedMonths);
    }, [data, groupedData, sortedMonths]);
    
    // گروه‌بندی داده‌ها بر اساس ماه و نوع خودرو
    const groupedData = useMemo(() => {
        const grouped: { [key: string]: { [vehicleType: string]: PerformanceIndexData } } = {};
        
        data.forEach(item => {
            if (!grouped[item.month]) {
                grouped[item.month] = {};
            }
            grouped[item.month][item.vehicleType] = item;
        });
        
        return grouped;
    }, [data]);
    
    // مرتب‌سازی ماه‌ها (10 ماه گذشته)
    const sortedMonths = useMemo(() => {
        return Object.keys(groupedData).sort((a, b) => {
            const [aYear, aMonth] = a.split('/').map(Number);
            const [bYear, bMonth] = b.split('/').map(Number);
            if (aYear !== bYear) return aYear - bYear;
            return aMonth - bMonth;
        }).slice(-10); // آخرین 10 ماه
    }, [groupedData]);
    
    // محاسبه مجموع برای هر ماه
    const getMonthTotals = (month: string) => {
        const monthData = groupedData[month] || {};
        const keshan = monthData['کشنده'] || null;
        const dahCharkh = monthData['ده چرخ'] || null;
        
        return {
            totalMileage: (keshan?.totalMileage || 0) + (dahCharkh?.totalMileage || 0),
            totalTours: (keshan?.tourCount || 0) + (dahCharkh?.tourCount || 0),
            totalReturnCargo: (keshan?.returnCargoCount || 0) + (dahCharkh?.returnCargoCount || 0),
            totalFixedAllowanceTours: (keshan?.fixedAllowanceTourCount || 0) + (dahCharkh?.fixedAllowanceTourCount || 0),
            totalCommissionTours: (keshan?.commissionTourCount || 0) + (dahCharkh?.commissionTourCount || 0),
            totalCommissionMileage: (keshan?.commissionMileage || 0) + (dahCharkh?.commissionMileage || 0),
            totalFixedAllowanceMileage: (keshan?.fixedAllowanceMileage || 0) + (dahCharkh?.fixedAllowanceMileage || 0),
            totalTourMileage: (keshan?.totalTourMileage || 0) + (dahCharkh?.totalTourMileage || 0)
        };
    };
    
    return (
        <div className="space-y-4">
            {/* فیلتر تاریخ */}
            <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">فیلتر تاریخ</h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">از تاریخ</label>
                        <input
                            type="text"
                            value={startDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setStartDate(value);
                                }
                            }}
                            placeholder="1404/08/26"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                            dir="rtl"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">تا تاریخ</label>
                        <input
                            type="text"
                            value={endDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    setEndDate(value);
                                }
                            }}
                            placeholder="1404/09/25"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                            dir="rtl"
                        />
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
                        <thead className="bg-slate-50">
                            <tr>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">ماه</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">نوع خودرو</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">مجموع پیمایش کل</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">تعداد تور</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش/تعداد تور</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">تعداد بار برگشتی</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">بار برگشتی/تور</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">تعداد تور اجرت ثابت</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">تعداد تور پورسانتی</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش پورسانتی</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش اجرت ثابت</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش اجرت ثابت/تور اجرت ثابت</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش پورسانتی/تور پورسانتی</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">جمع کل پیمایش تورها</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">تعداد کل تور</th>
                                <th rowSpan={2} className="px-3 py-2 border border-slate-300 text-center text-slate-700">پیمایش کل/تعداد کل تور</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedMonths.map(month => {
                                const monthData = groupedData[month] || {};
                                const keshan = monthData['کشنده'];
                                const dahCharkh = monthData['ده چرخ'];
                                const totals = getMonthTotals(month);
                                
                                return (
                                    <React.Fragment key={month}>
                                        {/* کشنده */}
                                        {keshan && (
                                            <tr className="hover:bg-slate-50">
                                                <td className="px-3 py-2 border border-slate-300 text-center">{month}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">کشنده</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.totalMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.tourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.mileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.returnCargoCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.returnCargoPerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.fixedAllowanceTourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.commissionTourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.commissionMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.fixedAllowanceMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.fixedAllowanceMileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.commissionMileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.totalTourMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.totalTours.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{keshan.totalMileagePerTotalTours.toFixed(2)}</td>
                                            </tr>
                                        )}
                                        {/* ده چرخ */}
                                        {dahCharkh && (
                                            <tr className="hover:bg-slate-50">
                                                <td className="px-3 py-2 border border-slate-300 text-center">{month}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">ده چرخ</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.totalMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.tourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.mileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.returnCargoCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.returnCargoPerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.fixedAllowanceTourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.commissionTourCount.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.commissionMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.fixedAllowanceMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.fixedAllowanceMileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.commissionMileagePerTour.toFixed(2)}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.totalTourMileage.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.totalTours.toLocaleString('fa-IR')}</td>
                                                <td className="px-3 py-2 border border-slate-300 text-center">{dahCharkh.totalMileagePerTotalTours.toFixed(2)}</td>
                                            </tr>
                                        )}
                                        {/* جمع کل ماه */}
                                        <tr className="bg-slate-100 font-semibold">
                                            <td colSpan={2} className="px-3 py-2 border border-slate-300 text-center">جمع کل {month}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalMileage.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalTours.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">
                                                {totals.totalTours > 0 ? (totals.totalMileage / totals.totalTours).toFixed(2) : '0'}
                                            </td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalReturnCargo.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">
                                                {totals.totalTours > 0 ? (totals.totalReturnCargo / totals.totalTours).toFixed(2) : '0'}
                                            </td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalFixedAllowanceTours.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalCommissionTours.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalCommissionMileage.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalFixedAllowanceMileage.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">
                                                {totals.totalFixedAllowanceTours > 0 ? (totals.totalFixedAllowanceMileage / totals.totalFixedAllowanceTours).toFixed(2) : '0'}
                                            </td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">
                                                {totals.totalCommissionTours > 0 ? (totals.totalCommissionMileage / totals.totalCommissionTours).toFixed(2) : '0'}
                                            </td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalTourMileage.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">{totals.totalTours.toLocaleString('fa-IR')}</td>
                                            <td className="px-3 py-2 border border-slate-300 text-center">
                                                {totals.totalTours > 0 ? (totals.totalMileage / totals.totalTours).toFixed(2) : '0'}
                                            </td>
                                        </tr>
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

export default PerformanceIndexTab;

