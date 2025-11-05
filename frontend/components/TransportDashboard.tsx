import React, { useMemo, useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LabelList } from 'recharts';
import { FreightLineType } from '../types';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
        // استخراج بخش مورد نیاز بر اساس timeRange
        if (timeRange === 'day') {
            // برای روزانه: فقط روز را برمی‌گردانیم (مثلاً از "1404/08/05" فقط "05")
            const parts = jalaliStr.split('/');
            if (parts.length >= 3) {
                return parts[2]; // روز
            }
            return jalaliStr;
        } else if (timeRange === 'month') {
            // برای ماهانه: فقط ماه را برمی‌گردانیم (مثلاً از "1404/08" فقط "08")
            const parts = jalaliStr.split('/');
            if (parts.length >= 2) {
                return parts[1]; // ماه
            }
            return jalaliStr;
        } else if (timeRange === 'year') {
            // برای سالانه: فقط سال را برمی‌گردانیم (مثلاً "1404")
            const parts = jalaliStr.split('/');
            if (parts.length >= 1) {
                return parts[0]; // سال
            }
            return jalaliStr;
        }
        return jalaliStr;
    } catch {
        return jalaliStr;
    }
};

// Chart Zoom Dialog Component
const ChartZoomDialog: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    chartType: 'line' | 'bar' | 'pie';
    chartData: any;
    chartData2?: any;
    timeRange: 'day' | 'month' | 'year';
    colors?: any;
}> = ({ isOpen, onClose, title, chartType, chartData, chartData2, timeRange, colors }) => {
    if (!isOpen) return null;

    const renderChart = () => {
        if (chartType === 'line' && chartData) {
            return (
                <div className="w-full h-full overflow-auto">
                    <ResponsiveContainer width="100%" height={600} minHeight={600}>
                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="formattedLabel" 
                                angle={0}
                                textAnchor="middle"
                                height={80}
                                fontSize={14}
                                interval={0}
                                tick={{ fill: '#475569', fontSize: 14 }}
                            />
                            <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 14 }} />
                            <Tooltip />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="totalRequests" 
                                stroke={colors?.requests || '#3b82f6'} 
                                strokeWidth={3}
                                name="درخواست خودرو"
                            >
                                <LabelList dataKey="totalRequests" position="top" fontSize={10} fill="#3b82f6" />
                            </Line>
                            <Line 
                                type="monotone" 
                                dataKey="companyAssignments" 
                                stroke={colors?.company || '#10b981'} 
                                strokeWidth={3}
                                name="تخصیص شرکتی"
                            >
                                <LabelList dataKey="companyAssignments" position="top" fontSize={10} fill="#10b981" />
                            </Line>
                            <Line 
                                type="monotone" 
                                dataKey="personalAssignments" 
                                stroke={colors?.personal || '#f59e0b'} 
                                strokeWidth={3}
                                name="تخصیص شخصی"
                            >
                                <LabelList dataKey="personalAssignments" position="top" fontSize={10} fill="#f59e0b" />
                            </Line>
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            );
        } else if (chartType === 'bar' && chartData2) {
            return (
                <div className="w-full h-full overflow-auto">
                    <ResponsiveContainer width="100%" height={600} minHeight={600}>
                        <BarChart 
                            data={chartData2} 
                            barCategoryGap="15%" 
                            barGap={10}
                            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="period" 
                                type="category"
                                angle={0}
                                tick={{ fill: '#475569', fontSize: 14 }}
                                height={80}
                                interval={0}
                                tickMargin={10}
                                axisLine={true}
                                tickLine={false}
                            />
                            <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 14 }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="company" fill={colors?.company || '#10b981'} name="تخصیص شرکتی">
                                <LabelList dataKey="company" position="top" fontSize={10} fill="#10b981" />
                            </Bar>
                            <Bar dataKey="personal" fill={colors?.personal || '#f59e0b'} name="تخصیص شخصی">
                                <LabelList dataKey="personal" position="top" fontSize={10} fill="#f59e0b" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        } else if (chartType === 'pie' && chartData) {
            return (
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={600} minHeight={600}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value, percentage }) => {
                                    // Show label only if segment is large enough
                                    return percentage >= 3 ? `${name}: ${value} بار (${percentage}%)` : '';
                                }}
                                outerRadius={200}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {chartData.map((entry: any, index: number) => {
                                    // If it's assignment timing chart, use specific colors
                                    if (entry.name === 'یک روز' || entry.name === 'دو روز' || entry.name === 'سه روز' || entry.name === 'چهار روز' || entry.name === 'پنج روز به بالا') {
                                        let color = '#8884d8';
                                        if (entry.name === 'یک روز') color = '#10b981';
                                        else if (entry.name === 'دو روز') color = '#f59e0b';
                                        else if (entry.name === 'سه روز') color = '#f97316';
                                        else if (entry.name === 'چهار روز') color = '#ef4444';
                                        else if (entry.name === 'پنج روز به بالا') color = '#dc2626';
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    }
                                    // Otherwise use default colors (for company/personal chart)
                                    return <Cell key={`cell-${index}`} fill={index === 0 ? (colors?.company || '#10b981') : (colors?.personal || '#f59e0b')} />;
                                })}
                            </Pie>
                            <Tooltip 
                                formatter={(value: number, name: string, props: any) => {
                                    if (props.payload && props.payload.name) {
                                        return [`${value} بار (${props.payload.percentage}%)`, props.payload.name];
                                    }
                                    return [`${value}`, name];
                                }}
                            />
                            <Legend 
                                verticalAlign="bottom"
                                height={36}
                                formatter={(value, entry: any) => {
                                    if (entry.payload && entry.payload.name) {
                                        return `${entry.payload.name}: ${entry.payload.value} بار (${entry.payload.percentage}%)`;
                                    }
                                    return value;
                                }}
                                wrapperStyle={{ paddingTop: '20px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold text-slate-800">{title}</h2>
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-700 text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-6">
                    {renderChart()}
                </div>
            </div>
        </div>
    );
};

// Line Row Component
const LineRow: React.FC<{
    title: string;
    stats: StatisticsData[];
    timeRange: 'day' | 'month' | 'year';
}> = ({ title, stats, timeRange }) => {
    const [zoomChart, setZoomChart] = useState<{ type: 'line' | 'bar' | 'pie' | null; data: any; data2?: any }>({ type: null, data: null });
    const [isSummaryTableOpen, setIsSummaryTableOpen] = useState(false); // State for summary table collapse/expand
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
                // New fields for assignment timing analysis
                leftoverFromPrevious: typeof stat.leftoverFromPrevious === 'number' ? stat.leftoverFromPrevious : parseInt(stat.leftoverFromPrevious || '0', 10),
                assignmentByDay: stat.assignmentByDay || {},
                assignmentPercentagesByDay: stat.assignmentPercentagesByDay || {},
                totalAssigned: typeof stat.totalAssigned === 'number' ? stat.totalAssigned : parseInt(stat.totalAssigned || '0', 10),
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

    // Pie chart data for assignment timing (by day)
    const assignmentTimingPieData = useMemo(() => {
        // Aggregate assignmentByDay from all periods
        const aggregated: { [key: string]: number } = {};
        chartData.forEach(stat => {
            if (stat.assignmentByDay) {
                Object.entries(stat.assignmentByDay).forEach(([day, count]) => {
                    if (count > 0) {
                        aggregated[day] = (aggregated[day] || 0) + count;
                    }
                });
            }
        });

        const totalAssignedFromDays = Object.values(aggregated).reduce((sum, count) => sum + count, 0);
        if (totalAssignedFromDays === 0) {
            return [];
        }

        // Convert to array format for PieChart
        // دسته‌بندی جدید: یک روز، دو روز، سه روز، چهار روز، پنج روز به بالا
        const result: Array<{ name: string; value: number; percentage: number }> = [];
        
        // یک روز (همان روز = day 0)
        const day1 = aggregated['0'] || 0;
        if (day1 > 0) {
            result.push({
                name: 'یک روز',
                value: day1,
                percentage: Math.round((day1 / totalAssignedFromDays) * 100)
            });
        }
        
        // دو روز (یک روز بعد = day 1)
        const day2 = aggregated['1'] || 0;
        if (day2 > 0) {
            result.push({
                name: 'دو روز',
                value: day2,
                percentage: Math.round((day2 / totalAssignedFromDays) * 100)
            });
        }
        
        // سه روز (دو روز بعد = day 2)
        const day3 = aggregated['2'] || 0;
        if (day3 > 0) {
            result.push({
                name: 'سه روز',
                value: day3,
                percentage: Math.round((day3 / totalAssignedFromDays) * 100)
            });
        }
        
        // چهار روز (سه روز بعد = day 3)
        const day4 = aggregated['3'] || 0;
        if (day4 > 0) {
            result.push({
                name: 'چهار روز',
                value: day4,
                percentage: Math.round((day4 / totalAssignedFromDays) * 100)
            });
        }
        
        // پنج روز به بالا (day 4 به بالا + 11+)
        let days5Plus = 0;
        for (let day = 4; day <= 10; day++) {
            if (aggregated[String(day)]) {
                days5Plus += aggregated[String(day)];
            }
        }
        if (aggregated['11+']) {
            days5Plus += aggregated['11+'];
        }
        if (days5Plus > 0) {
            result.push({
                name: 'پنج روز به بالا',
                value: days5Plus,
                percentage: Math.round((days5Plus / totalAssignedFromDays) * 100)
            });
        }

        console.log('📊 [AssignmentTimingPie] Aggregated:', JSON.stringify(aggregated, null, 2));
        console.log('📊 [AssignmentTimingPie] Result:', JSON.stringify(result, null, 2));
        console.log('📊 [AssignmentTimingPie] Total assigned from days:', totalAssignedFromDays);

        return result;
    }, [chartData]);

    // Bar chart data (counts by period)
    const barData = useMemo(() => {
        return chartData.map((d, idx) => ({
            period: d.formattedLabel,
            periodIndex: idx,
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
                <div className="bg-slate-50 rounded-lg p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-slate-700">نمودار خطی - روند زمانی</h3>
                        <button 
                            onClick={() => setZoomChart({ type: 'line', data: chartData })}
                            className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1"
                            title="بزرگنمایی"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        </button>
                    </div>
                    {chartData && chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="formattedLabel" 
                                angle={0}
                                textAnchor="middle"
                                height={60}
                                fontSize={12}
                                interval={0}
                                tick={{ fill: '#475569', fontSize: 12 }}
                            />
                            <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
                            <Tooltip />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="totalRequests" 
                                stroke={COLORS.requests} 
                                strokeWidth={2}
                                name="درخواست خودرو"
                            >
                                <LabelList dataKey="totalRequests" position="top" fontSize={9} fill="#3b82f6" />
                            </Line>
                            <Line 
                                type="monotone" 
                                dataKey="companyAssignments" 
                                stroke={COLORS.company} 
                                strokeWidth={2}
                                name="تخصیص شرکتی"
                            >
                                <LabelList dataKey="companyAssignments" position="top" fontSize={9} fill="#10b981" />
                            </Line>
                            <Line 
                                type="monotone" 
                                dataKey="personalAssignments" 
                                stroke={COLORS.personal} 
                                strokeWidth={2}
                                name="تخصیص شخصی"
                            >
                                <LabelList dataKey="personalAssignments" position="top" fontSize={9} fill="#f59e0b" />
                            </Line>
                        </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-slate-500">
                            داده‌ای برای نمایش وجود ندارد
                        </div>
                    )}
                </div>

                {/* Pie Chart */}
                <div className="bg-slate-50 rounded-lg p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-slate-700">نمودار دایره‌ای - درصد تخصیص</h3>
                        <button 
                            onClick={() => setZoomChart({ type: 'pie', data: pieData })}
                            className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1"
                            title="بزرگنمایی"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        </button>
                    </div>
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

                {/* Assignment Timing Pie Chart */}
                {(timeRange === 'month' || timeRange === 'year') && assignmentTimingPieData.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4 relative">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-slate-700">نمودار دایره‌ای - زمان تخصیص</h3>
                            <button 
                                onClick={() => setZoomChart({ type: 'pie', data: assignmentTimingPieData })}
                                className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1"
                                title="بزرگنمایی"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                            </button>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={assignmentTimingPieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={false} // Disable labels on pie segments to avoid overlap
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {assignmentTimingPieData.map((entry, index) => {
                                        // Color scheme: green for 1 day, yellow for 2 days, orange for 3 days, light red for 4 days, dark red for 5+
                                        let color = '#8884d8';
                                        if (entry.name === 'یک روز') color = '#10b981'; // green
                                        else if (entry.name === 'دو روز') color = '#f59e0b'; // yellow/amber
                                        else if (entry.name === 'سه روز') color = '#f97316'; // orange
                                        else if (entry.name === 'چهار روز') color = '#ef4444'; // red
                                        else if (entry.name === 'پنج روز به بالا') color = '#dc2626'; // dark red
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Pie>
                                <Tooltip 
                                    formatter={(value: number, name: string, props: any) => {
                                        return [`${value} بار (${props.payload.percentage}%)`, props.payload.name];
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="text-center mt-4 space-y-1">
                            {assignmentTimingPieData.map((item, idx) => {
                                let color = '#8884d8';
                                if (item.name === 'یک روز') color = '#10b981'; // green
                                else if (item.name === 'دو روز') color = '#f59e0b'; // yellow/amber
                                else if (item.name === 'سه روز') color = '#f97316'; // orange
                                else if (item.name === 'چهار روز') color = '#ef4444'; // red
                                else if (item.name === 'پنج روز به بالا') color = '#dc2626'; // dark red
                                
                                return (
                                    <div key={idx} className="text-sm">
                                        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }}></span>
                                        <span className="text-slate-700">{item.name}: {item.value} بار ({item.percentage}%)</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Bar Chart */}
                <div className="bg-slate-50 rounded-lg p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-slate-700">نمودار میله‌ای - تعداد تخصیص</h3>
                        <button 
                            onClick={() => setZoomChart({ type: 'bar', data: chartData, data2: barData })}
                            className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1"
                            title="بزرگنمایی"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        </button>
                    </div>
                    {barData && barData.length > 0 ? (
                        <div style={{ position: 'relative' }}>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart 
                                    data={barData} 
                                    barCategoryGap="15%" 
                                    barGap={10}
                                    margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                                >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="period" 
                                    type="category"
                                    angle={0}
                                    tick={({ x, y, payload, index }) => {
                                        // x موقعیت tick mark است که در مرکز category قرار دارد
                                        // برای تراز کردن label زیر مرکز گروه میله‌ها، از همان x استفاده می‌کنیم
                                        // چون Recharts خودکار labelها را در مرکز هر category قرار می‌دهد
                                        return (
                                            <text 
                                                x={x} 
                                                y={y + 15} 
                                                fill="#475569" 
                                                fontSize={12} 
                                                textAnchor="middle"
                                            >
                                                {payload.value}
                                            </text>
                                        );
                                    }}
                                    height={60}
                                    interval={0}
                                    tickMargin={8}
                                    axisLine={true}
                                    tickLine={false}
                                />
                                <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                                            <Bar dataKey="company" fill={COLORS.company} name="تخصیص شرکتی">
                                <LabelList dataKey="company" position="top" fontSize={9} fill="#10b981" />
                            </Bar>
                            <Bar dataKey="personal" fill={COLORS.personal} name="تخصیص شخصی">
                                <LabelList dataKey="personal" position="top" fontSize={9} fill="#f59e0b" />
                            </Bar>
                            </BarChart>
                            </ResponsiveContainer>
                        </div>
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
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-base font-semibold text-slate-700">خلاصه آمار</h3>
                        <button
                            onClick={() => setIsSummaryTableOpen(!isSummaryTableOpen)}
                            className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1 flex-row-reverse"
                            title={isSummaryTableOpen ? "بستن جدول" : "باز کردن جدول"}
                        >
                            {isSummaryTableOpen ? (
                                <>
                                    بستن
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                </>
                            ) : (
                                <>
                                    باز کردن
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                    {isSummaryTableOpen && (
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
                                    <th className="px-3 py-2 text-center text-slate-700">مانده از قبل</th>
                                    <th className="px-3 py-2 text-center text-slate-700">یک روز</th>
                                    <th className="px-3 py-2 text-center text-slate-700">دو روز</th>
                                    <th className="px-3 py-2 text-center text-slate-700">سه روز</th>
                                    <th className="px-3 py-2 text-center text-slate-700">چهار روز</th>
                                    <th className="px-3 py-2 text-center text-slate-700">پنج روز به بالا</th>
                                </tr>
                            </thead>
                            <tbody>
                                {chartData.map((stat, idx) => {
                                    const day1Percent = stat.assignmentPercentagesByDay?.['0'] || 0; // یک روز = همان روز (day 0)
                                    const day2Percent = stat.assignmentPercentagesByDay?.['1'] || 0; // دو روز = یک روز بعد (day 1)
                                    const day3Percent = stat.assignmentPercentagesByDay?.['2'] || 0; // سه روز = دو روز بعد (day 2)
                                    const day4Percent = stat.assignmentPercentagesByDay?.['3'] || 0; // چهار روز = سه روز بعد (day 3)
                                    const day5PlusPercent = Object.entries(stat.assignmentPercentagesByDay || {})
                                        .filter(([day]) => day !== '0' && day !== '1' && day !== '2' && day !== '3')
                                        .reduce((sum, [, percent]) => sum + (percent || 0), 0);
                                    
                                    return (
                                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-100">
                                            {/* در جدول کل تاریخ را نمایش می‌دهیم، نه فقط بخشی از آن */}
                                            <td className="px-3 py-2 text-right">{stat.timePeriod}</td>
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
                                            <td className="px-3 py-2 text-center">
                                                {stat.leftoverFromPrevious > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                                                        {stat.leftoverFromPrevious}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">0</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day1Percent > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                                                        {day1Percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day2Percent > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                                                        {day2Percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day3Percent > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                                                        {day3Percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day4Percent > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                                        {day4Percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day5PlusPercent > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-red-200 text-red-900">
                                                        {day5PlusPercent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}
                </div>
            )}

            {/* Chart Zoom Dialog */}
            <ChartZoomDialog
                isOpen={zoomChart.type !== null}
                onClose={() => setZoomChart({ type: null, data: null })}
                title={`${title} - ${zoomChart.type === 'line' ? 'نمودار خطی' : zoomChart.type === 'bar' ? 'نمودار میله‌ای' : 'نمودار دایره‌ای'}`}
                chartType={zoomChart.type || 'line'}
                chartData={zoomChart.data}
                chartData2={zoomChart.data2}
                timeRange={timeRange}
                colors={COLORS}
            />
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
    const [showDailyStats, setShowDailyStats] = useState(false);
    const [dailyStatsIndex, setDailyStatsIndex] = useState(0);
    const [dailyStats, setDailyStats] = useState<{
        iceCream: StatisticsData[];
        dairy: StatisticsData[];
        ambient: StatisticsData[];
    }>({ iceCream: [], dairy: [], ambient: [] });
    const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
    const pdfExportRef = useRef<HTMLDivElement>(null);

    // Generate year options
    const currentJalaliYear = new Date().getFullYear() - 621;
    const yearOptions = Array.from({ length: 4 }, (_, i) => currentJalaliYear - i);

    // Generate month options
    const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

    // Generate day options
    const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

    // Get today's Jalali date
    const getTodayJalali = () => {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        return {
            year: jy,
            month: jm,
            day: jd,
            dateStr: `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
        };
    };

    // Fetch daily statistics - memoized to prevent re-creation
    const fetchDailyStats = React.useCallback(async () => {
        setDailyStatsLoading(true);
        try {
            const today = getTodayJalali();
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const params = (lineType: string) => {
                const p = new URLSearchParams();
                // برای آمار روزانه، پارامترهای تاریخ را ارسال نمی‌کنیم
                // فقط lineType و timeRange ارسال می‌شود
                p.append('lineType', lineType);
                p.append('timeRange', 'day');
                return p.toString();
            };

            // Fetch each line separately with individual error handling
            const fetchLineStats = async (lineType: string, lineName: string) => {
                try {
                    const response = await fetch(`http://localhost:3000/api/v1/freight-announcements/statistics?${params(lineType)}`, { headers });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    // Only log once per fetch, not on every render
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ [DailyStats] ${lineName} stats loaded:`, data.length, 'items');
                    }
                    return Array.isArray(data) ? data : [];
                } catch (err) {
                    console.error(`❌ [DailyStats] Failed to fetch ${lineName} stats:`, err);
                    return []; // Return empty array on error
                }
            };

            // Fetch all lines in parallel, but handle errors individually
            const [iceCream, dairy, ambient] = await Promise.allSettled([
                fetchLineStats(FreightLineType.IceCream, 'بستنی'),
                fetchLineStats(FreightLineType.Dairy, 'پاستوریزه'),
                fetchLineStats(FreightLineType.Ambient, 'لبنیات-فروتلند')
            ]);

            setDailyStats({
                iceCream: iceCream.status === 'fulfilled' ? iceCream.value : [],
                dairy: dairy.status === 'fulfilled' ? dairy.value : [],
                ambient: ambient.status === 'fulfilled' ? ambient.value : []
            });
        } catch (err) {
            console.error('❌ [DailyStats] Failed to fetch daily stats:', err);
            setDailyStats({
                iceCream: [],
                dairy: [],
                ambient: []
            });
        } finally {
            setDailyStatsLoading(false);
        }
    }, []); // Empty deps - getTodayJalali is pure function, token is from localStorage

    // Fetch daily stats on mount (only once for teaser)
    // و نه هر بار که فیلترها تغییر می‌کنند
    React.useEffect(() => {
        fetchDailyStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // فقط یک بار در mount

    // Auto-rotate daily stats teaser - use ref to access latest dailyStats without causing re-renders
    const dailyStatsRef = React.useRef(dailyStats);
    React.useEffect(() => {
        dailyStatsRef.current = dailyStats;
    }, [dailyStats]);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setDailyStatsIndex(prev => {
                const lines = [
                    { name: 'بستنی', data: dailyStatsRef.current.iceCream },
                    { name: 'پاستوریزه', data: dailyStatsRef.current.dairy },
                    { name: 'لبنیات-فروتلند', data: dailyStatsRef.current.ambient }
                ];
                
                // Rotate through all 3 lines regardless of data
                return (prev + 1) % 3;
            });
        }, 5000); // Change every 5 seconds
        
        return () => clearInterval(interval);
    }, []); // Empty dependency array - only run once on mount

    // Export to PDF function
    const handleExportPDF = async () => {
        if (!pdfExportRef.current) return;
        
        try {
            // Create canvas from the dashboard content
            const canvas = await html2canvas(pdfExportRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });

            // Calculate PDF dimensions
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;

            // Create PDF
            const pdf = new jsPDF('p', 'mm', 'a4');
            let position = 0;

            // Add image to PDF
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            // Add new pages if content is longer than one page
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            // Generate filename with date
            const today = getTodayJalali();
            const filename = `آمار_ترابری_${today.dateStr}.pdf`;

            // Save PDF
            pdf.save(filename);
        } catch (error) {
            console.error('Error exporting PDF:', error);
            alert('خطا در ایجاد فایل PDF. لطفاً دوباره تلاش کنید.');
        }
    };



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
        <div className="p-6 space-y-8" ref={pdfExportRef}>
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800">داشبورد ترابری</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setShowDailyStats(!showDailyStats);
                            if (!showDailyStats) {
                                fetchDailyStats();
                            }
                        }}
                        className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 text-sm font-medium flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        {showDailyStats ? 'مخفی کردن آمار روزانه' : 'نمایش آمار روزانه'}
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium flex items-center gap-2"
                        title="خروجی PDF"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        خروجی PDF
                    </button>
                </div>
            </div>

            {/* Daily Stats Teaser - Carousel */}
            {!dailyStatsLoading && (
                <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg shadow-lg p-3 text-white relative overflow-hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 relative" style={{ height: '60px' }}>
                            {/* Carousel items with fade transition - render all items for smooth transition */}
                            {[
                                { name: 'بستنی', data: dailyStats.iceCream },
                                { name: 'پاستوریزه', data: dailyStats.dairy },
                                { name: 'لبنیات-فروتلند', data: dailyStats.ambient }
                            ].map((line, idx) => {
                                const stat = line.data && line.data.length > 0 ? line.data[0] : null;
                                const isActive = idx === dailyStatsIndex;
                                const displayStat = stat || {
                                    totalRequests: 0,
                                    companyAssignments: 0,
                                    personalAssignments: 0,
                                    totalAssignments: 0,
                                    successRate: 0
                                };
                                
                                // Get colors for statistics
                                const getRequestColor = (val: number) => {
                                    if (val === 0) return 'text-yellow-100';
                                    if (val >= 5) return 'text-green-200';
                                    return 'text-white';
                                };
                                
                                const getAssignmentColor = (val: number, total: number) => {
                                    if (val === 0) return 'text-red-200';
                                    if (val / total >= 0.7) return 'text-green-200';
                                    return 'text-yellow-100';
                                };
                                
                                const getSuccessColor = (rate: number) => {
                                    if (rate >= 70) return 'text-green-200';
                                    if (rate >= 50) return 'text-yellow-100';
                                    return 'text-red-200';
                                };
                                
                                // Render all items but control visibility with opacity for smooth transition
                                return (
                                    <div
                                        key={`${line.name}-${idx}`}
                                        className={`absolute inset-0 flex items-center transition-opacity duration-700 ease-in-out ${
                                            isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4 w-full">
                                            <div className="text-xs opacity-90 whitespace-nowrap flex-shrink-0">
                                                آمار عملکرد امروز - {getTodayJalali().dateStr}
                                            </div>
                                            <div className="flex-1 grid grid-cols-6 gap-3 text-center items-center">
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">لاین فروش</div>
                                                    <div className="font-semibold text-sm">{line.name}</div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">درخواست</div>
                                                    <div className={`font-bold text-base ${getRequestColor(displayStat.totalRequests)}`}>
                                                        {displayStat.totalRequests}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">شرکتی</div>
                                                    <div className={`font-bold text-base ${getAssignmentColor(displayStat.companyAssignments, displayStat.totalRequests)}`}>
                                                        {displayStat.companyAssignments}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">شخصی</div>
                                                    <div className={`font-bold text-base ${getAssignmentColor(displayStat.personalAssignments, displayStat.totalRequests)}`}>
                                                        {displayStat.personalAssignments}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">کل</div>
                                                    <div className="font-bold text-base text-white">{displayStat.totalAssignments}</div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] opacity-75 mb-0.5">موفقیت</div>
                                                    <div className={`font-bold text-base ${getSuccessColor(displayStat.successRate)}`}>
                                                        {displayStat.successRate}%
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {[0, 1, 2].map(i => {
                                const line = [
                                    { name: 'بستنی', data: dailyStats.iceCream },
                                    { name: 'پاستوریزه', data: dailyStats.dairy },
                                    { name: 'لبنیات-فروتلند', data: dailyStats.ambient }
                                ][i];
                                const hasData = line.data && line.data.length > 0;
                                const isActive = dailyStatsIndex === i;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setDailyStatsIndex(i)}
                                        className={`relative w-2 h-2 rounded-full transition-all duration-300 flex items-center justify-center ${
                                            isActive 
                                                ? 'bg-white w-8' 
                                                : 'bg-white/50 hover:bg-white/75 cursor-pointer'
                                        }`}
                                        title={line.name}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Stats Full Table - Collapsible */}
            {showDailyStats && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-4">آمار عملکرد روزانه - {getTodayJalali().dateStr}</h2>
                    {dailyStatsLoading ? (
                        <div className="text-center py-8 text-slate-600">در حال بارگذاری...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-300">
                                        <th className="px-4 py-3 text-right text-slate-700">لاین فروش</th>
                                        <th className="px-4 py-3 text-center text-slate-700">درخواست</th>
                                        <th className="px-4 py-3 text-center text-slate-700">شرکتی</th>
                                        <th className="px-4 py-3 text-center text-slate-700">شخصی</th>
                                        <th className="px-4 py-3 text-center text-slate-700">موفقیت جذب</th>
                                        <th className="px-4 py-3 text-center text-slate-700">کل</th>
                                        <th className="px-4 py-3 text-center text-slate-700">موفقیت</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { name: 'بستنی', data: dailyStats.iceCream },
                                        { name: 'پاستوریزه', data: dailyStats.dairy },
                                        { name: 'لبنیات-فروتلند', data: dailyStats.ambient }
                                    ].map((line, idx) => {
                                        const stat = line.data && line.data.length > 0 ? line.data[0] : null;
                                        // Always show row, even if no data (show zeros)
                                        const displayStat = stat || {
                                            totalRequests: 0,
                                            companyAssignments: 0,
                                            personalAssignments: 0,
                                            totalAssignments: 0,
                                            successRate: 0
                                        };
                                        // For now, success rate for personal is the same as overall
                                        // TODO: Calculate actual referral success rate from backend
                                        const personalSuccessRate = displayStat.totalRequests > 0 
                                            ? Math.round((displayStat.personalAssignments / displayStat.totalRequests) * 100)
                                            : 0;
                                        return (
                                            <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                                                <td className="px-4 py-3 text-right font-semibold">{line.name}</td>
                                                <td className="px-4 py-3 text-center">{displayStat.totalRequests}</td>
                                                <td className="px-4 py-3 text-center">{displayStat.companyAssignments}</td>
                                                <td className="px-4 py-3 text-center">{displayStat.personalAssignments}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-xs text-slate-600">
                                                            {displayStat.personalAssignments} از {displayStat.totalRequests}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                                                            personalSuccessRate >= 50 ? 'bg-green-100 text-green-800' :
                                                            personalSuccessRate >= 30 ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-red-100 text-red-800'
                                                        }`}>
                                                            {personalSuccessRate}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">{displayStat.totalAssignments}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                        displayStat.successRate >= 70 ? 'bg-green-100 text-green-800' :
                                                        displayStat.successRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                        {displayStat.successRate}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

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
