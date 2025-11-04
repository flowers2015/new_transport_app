import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { FreightLineType } from '../types';
import { formatJalali, gregorianToJalali } from '../utils/jalali';

interface StatisticsData {
    timePeriod: string;
    totalRequests: number;
    companyAssignments: number;
    personalAssignments: number;
    totalAssignments: number;
    successRate: number;
}

interface TransportDashboardProps {
    iceCreamStats: StatisticsData[];
    dairyStats: StatisticsData[];
    ambientStats: StatisticsData[];
    loading: boolean;
    error: string | null;
    selectedYear: number;
    selectedMonth: number | null;
    selectedDay: number | null;
    timeRange: 'day' | 'month' | 'year';
    onYearChange: (year: number) => void;
    onMonthChange: (month: number | null) => void;
    onDayChange: (day: number | null) => void;
    onTimeRangeChange: (range: 'day' | 'month' | 'year') => void;
    onRefresh: () => void;
}

const COLORS = {
    company: '#10b981', // green
    personal: '#f59e0b', // orange
    requests: '#3b82f6', // blue
};

// Format Jalali date string to display format
// timePeriod comes from backend as Jalali string (e.g., "1403/11/24" or "1403/11" or "1403")
const formatJalaliDate = (jalaliStr: string, timeRange: 'day' | 'month' | 'year'): string => {
    try {
        // Backend already returns Jalali format, just ensure proper display
        if (timeRange === 'day') {
            // Format: 1403/11/24
            return jalaliStr;
        } else if (timeRange === 'month') {
            // Format: 1403/11
            return jalaliStr;
        } else if (timeRange === 'year') {
            // Format: 1403
            return jalaliStr;
        }
        return jalaliStr;
    } catch {
        return jalaliStr;
    }
};

// Line Row Component
const LineRow: React.FC<{
    title: string;
    stats: StatisticsData[];
    timeRange: 'day' | 'month' | 'year';
}> = ({ title, stats, timeRange }) => {
    // Debug: Log stats received
    React.useEffect(() => {
        console.log(`📈 [LineRow:${title}] Stats:`, stats, 'Length:', stats?.length);
    }, [title, stats]);
    
    // Format chart data with Jalali dates and ensure numbers are actually numbers
    const chartData = useMemo(() => {
        if (!stats || !Array.isArray(stats) || stats.length === 0) {
            console.log(`⚠️ [LineRow:${title}] No stats or empty array`);
            return [];
        }
        const formatted = stats.map(stat => {
            // Ensure all numeric fields are actually numbers
            const item = {
                timePeriod: stat.timePeriod,
                formattedLabel: formatJalaliDate(stat.timePeriod, timeRange),
                totalRequests: typeof stat.totalRequests === 'number' ? stat.totalRequests : parseInt(stat.totalRequests || '0', 10),
                companyAssignments: typeof stat.companyAssignments === 'number' ? stat.companyAssignments : parseInt(stat.companyAssignments || '0', 10),
                personalAssignments: typeof stat.personalAssignments === 'number' ? stat.personalAssignments : parseInt(stat.personalAssignments || '0', 10),
                totalAssignments: typeof stat.totalAssignments === 'number' ? stat.totalAssignments : parseInt(stat.totalAssignments || '0', 10),
                successRate: typeof stat.successRate === 'number' ? stat.successRate : parseInt(stat.successRate || '0', 10),
            };
            return item;
        });
        console.log(`✅ [LineRow:${title}] Chart data:`, formatted);
        if (formatted.length > 0) {
            console.log(`✅ [LineRow:${title}] First item:`, JSON.stringify(formatted[0], null, 2));
            console.log(`✅ [LineRow:${title}] All values:`, formatted.map(f => ({
                period: f.formattedLabel,
                requests: f.totalRequests,
                company: f.companyAssignments,
                personal: f.personalAssignments,
                total: f.totalAssignments,
            })));
        }
        return formatted;
    }, [stats, timeRange, title]);

    // Calculate totals for pie and bar charts
    const totalCompany = useMemo(() => 
        stats.reduce((sum, s) => sum + s.companyAssignments, 0), 
        [stats]
    );
    const totalPersonal = useMemo(() => 
        stats.reduce((sum, s) => sum + s.personalAssignments, 0), 
        [stats]
    );
    const totalRequests = useMemo(() => 
        stats.reduce((sum, s) => sum + s.totalRequests, 0), 
        [stats]
    );
    const totalAssignments = totalCompany + totalPersonal;

    // Pie chart data (percentage)
    const pieData = useMemo(() => {
        if (totalAssignments === 0) {
            return [
                { name: 'شرکتی', value: 0, percentage: 0 },
                { name: 'شخصی', value: 0, percentage: 0 },
            ];
        }
        const companyPercent = Math.round((totalCompany / totalAssignments) * 100);
        const personalPercent = 100 - companyPercent;
        return [
            { name: 'شرکتی', value: totalCompany, percentage: companyPercent },
            { name: 'شخصی', value: totalPersonal, percentage: personalPercent },
        ];
    }, [totalCompany, totalPersonal, totalAssignments]);

    // Bar chart data (counts by period)
    const barData = useMemo(() => {
        return chartData.map(d => ({
            period: d.formattedLabel,
            company: d.companyAssignments,
            personal: d.personalAssignments,
            total: d.totalAssignments,
        }));
    }, [chartData]);

    // Calculate success rate
    const successRate = totalRequests > 0 
        ? Math.round((totalAssignments / totalRequests) * 100)
        : 0;

    // Horizontal KPI Component
    const HorizontalKPI: React.FC<{ label: string; value: number; maxValue: number }> = ({ label, value, maxValue }) => {
        const percentage = Math.min((value / maxValue) * 100, 100);
        return (
            <div className="flex-1 bg-slate-50 rounded-lg p-4">
                <div className="text-sm text-slate-600 mb-2">{label}</div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-6 overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                                percentage >= 70 ? 'bg-green-500' :
                                percentage >= 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                    <div className="text-lg font-bold text-slate-800 min-w-[60px] text-left">
                        {value}%
                    </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                    {totalAssignments} / {totalRequests}
                </div>
            </div>
        );
    };

    // Show message if no data
    if (!stats || stats.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-slate-800 border-b-2 border-slate-200 pb-3 mb-4">
                    {title}
                </h2>
                <div className="text-center py-8 text-slate-500">
                    <p>داده‌ای برای این لاین یافت نشد</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
            {/* Line Title */}
            <h2 className="text-2xl font-bold text-slate-800 border-b-2 border-slate-200 pb-3">
                {title}
            </h2>

            {/* Horizontal KPI Row */}
            <div className="bg-slate-100 rounded-lg p-4">
                <div className="text-lg font-semibold text-slate-700 mb-4">درصد موفقیت در تخصیص</div>
                <div className="flex gap-4">
                    <HorizontalKPI label="درصد موفقیت کلی" value={successRate} maxValue={100} />
                </div>
            </div>

            {/* Charts Grid - 3 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Line Chart */}
                <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-slate-700 mb-3">نمودار خطی - روند زمانی</h3>
                    {chartData && chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="formattedLabel" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                fontSize={11}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="totalRequests" 
                                stroke={COLORS.requests} 
                                strokeWidth={2}
                                name="درخواست خودرو"
                            />
                            <Line 
                                type="monotone" 
                                dataKey="companyAssignments" 
                                stroke={COLORS.company} 
                                strokeWidth={2}
                                name="تخصیص شرکتی"
                            />
                            <Line 
                                type="monotone" 
                                dataKey="personalAssignments" 
                                stroke={COLORS.personal} 
                                strokeWidth={2}
                                name="تخصیص شخصی"
                            />
                        </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-slate-500">
                            داده‌ای برای نمایش وجود ندارد
                        </div>
                    )}
                </div>

                {/* Pie Chart */}
                <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-slate-700 mb-3">نمودار دایره‌ای - درصد تخصیص</h3>
                    {pieData && pieData.length > 0 && totalAssignments > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percentage }) => `${name}: ${percentage}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.company : COLORS.personal} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-slate-500">
                            داده‌ای برای نمایش وجود ندارد
                        </div>
                    )}
                    <div className="text-center mt-2 space-y-1">
                        {pieData.map((item, idx) => (
                            <div key={idx} className="text-sm">
                                <span className={`inline-block w-3 h-3 rounded-full mr-2 ${idx === 0 ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                                <span className="text-slate-700">{item.name}: {item.value} ({item.percentage}%)</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bar Chart */}
                <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-slate-700 mb-3">نمودار میله‌ای - تعداد تخصیص</h3>
                    {barData && barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="period" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                fontSize={11}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="company" fill={COLORS.company} name="تخصیص شرکتی" />
                            <Bar dataKey="personal" fill={COLORS.personal} name="تخصیص شخصی" />
                        </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-slate-500">
                            داده‌ای برای نمایش وجود ندارد
                        </div>
                    )}
                </div>
            </div>

            {/* Statistics Summary Table */}
            {chartData.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-slate-700 mb-3">خلاصه آمار</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-300">
                                    <th className="px-3 py-2 text-right text-slate-700">بازه زمانی</th>
                                    <th className="px-3 py-2 text-center text-slate-700">درخواست</th>
                                    <th className="px-3 py-2 text-center text-slate-700">شرکتی</th>
                                    <th className="px-3 py-2 text-center text-slate-700">شخصی</th>
                                    <th className="px-3 py-2 text-center text-slate-700">کل</th>
                                    <th className="px-3 py-2 text-center text-slate-700">موفقیت</th>
                                </tr>
                            </thead>
                            <tbody>
                                {chartData.map((stat, idx) => (
                                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-100">
                                        <td className="px-3 py-2 text-right">{stat.formattedLabel}</td>
                                        <td className="px-3 py-2 text-center">{stat.totalRequests}</td>
                                        <td className="px-3 py-2 text-center">{stat.companyAssignments}</td>
                                        <td className="px-3 py-2 text-center">{stat.personalAssignments}</td>
                                        <td className="px-3 py-2 text-center">{stat.totalAssignments}</td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                stat.successRate >= 70 ? 'bg-green-100 text-green-800' :
                                                stat.successRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                                {stat.successRate}%
                                            </span>
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

const TransportDashboard: React.FC<TransportDashboardProps> = ({
    iceCreamStats,
    dairyStats,
    ambientStats,
    loading,
    error,
    selectedYear,
    selectedMonth,
    selectedDay,
    timeRange,
    onYearChange,
    onMonthChange,
    onDayChange,
    onTimeRangeChange,
    onRefresh,
}) => {
    // Generate year options
    const currentJalaliYear = new Date().getFullYear() - 621;
    const yearOptions = Array.from({ length: 4 }, (_, i) => currentJalaliYear - i);

    // Generate month options
    const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

    // Generate day options
    const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

    if (loading) {
        return (
            <div className="p-6">
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <div className="text-slate-600">در حال بارگذاری آمار...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <div className="text-red-600 mb-4">{error}</div>
                    <button
                        onClick={onRefresh}
                        className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700"
                    >
                        تلاش مجدد
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-4">
                <h1 className="text-2xl font-bold text-slate-800">داشبورد ترابری</h1>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">فیلترها</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Year Filter */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">سال اعلام بار</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => onYearChange(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            {yearOptions.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>

                    {/* Month Filter */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">ماه اعلام بار</label>
                        <select
                            value={selectedMonth || ''}
                            onChange={(e) => onMonthChange(e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="">همه ماه‌ها</option>
                            {monthOptions.map(month => (
                                <option key={month} value={month}>{month}</option>
                            ))}
                        </select>
                    </div>

                    {/* Day Filter */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">روز بارگیری</label>
                        <select
                            value={selectedDay || ''}
                            onChange={(e) => onDayChange(e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                            disabled={!selectedMonth}
                        >
                            <option value="">همه روزها</option>
                            {dayOptions.map(day => (
                                <option key={day} value={day}>{day}</option>
                            ))}
                        </select>
                    </div>

                    {/* Time Range Filter */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">بازه زمانی</label>
                        <select
                            value={timeRange}
                            onChange={(e) => onTimeRangeChange(e.target.value as 'day' | 'month' | 'year')}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="day">روزانه</option>
                            <option value="month">ماهانه</option>
                            <option value="year">سالانه</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Line Rows - Each line gets a full row */}
            <LineRow title="بستنی" stats={iceCreamStats} timeRange={timeRange} />
            <LineRow title="پاستوریزه" stats={dairyStats} timeRange={timeRange} />
            <LineRow title="لبنیات-فروتلند" stats={ambientStats} timeRange={timeRange} />
        </div>
    );
};

export default TransportDashboard;
