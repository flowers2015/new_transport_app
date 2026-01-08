import React, { useMemo, useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LabelList } from 'recharts';
import { FreightLineType, User, View } from '../types';
import { formatJalali, gregorianToJalali } from '../utils/jalali';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getApiUrl } from '../utils/apiConfig';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';
import PerformanceIndexTab from './PerformanceIndexTab';

interface StatisticsData {
    timePeriod: string;
    totalRequests: number;
    companyAssignments: number;
    personalAssignments: number;
    totalAssignments: number;
    successRate: number;
    leftoverFromPrevious?: number;
    assignmentByDay?: { [key: string]: number };
    assignmentPercentagesByDay?: { [key: string]: number };
    totalAssigned?: number;
}

// Interface برای آمار تفصیلی تخصیص (assignment statistics)
interface AssignmentStatisticsComparison {
    totalRequests: { count: number; percent: number };
    companyAssignments: { count: number; percent: number };
    personalAssignments: { count: number; percent: number };
    totalAssignments: { count: number; percent: number };
    successRate: { count: number; percent: number };
}

interface AssignmentStatisticsSummary {
    totalRequests: number;
    companyAssignments: number;
    personalAssignments: number;
    totalAssignments: number;
    successRate: number;
    comparisonWithPreviousMonth: AssignmentStatisticsComparison;
    comparisonWithLastYear: AssignmentStatisticsComparison;
}

interface AssignmentStatisticsTimeBased {
    timePeriod: string;
    totalRequests: number;
    companyAssignments: number;
    personalAssignments: number;
    totalAssignments: number;
    successRate: number;
    leftoverFromPrevious?: number;
    assignmentByDay?: { [key: string]: number };
    assignmentPercentagesByDay?: { [key: string]: number };
    totalAssigned?: number;
}

interface AssignmentStatisticsByVehicleType {
    city: string;
    representativeName: string;
    vehicleType: string;
    companyCount: number;
    personalCount: number;
    totalCount: number;
}

interface AssignmentStatisticsVehicleTypeComparison {
    current: number;
    comparisonWithPreviousMonth: AssignmentStatisticsComparison['totalRequests'];
    comparisonWithLastYear: AssignmentStatisticsComparison['totalRequests'];
}

interface AssignmentStatisticsMonthlyComparison {
    month: string;
    vehicleTypes: { [vehicleType: string]: { company: number; personal: number; total: number } };
}

interface AssignmentStatisticsResponse {
    summary: AssignmentStatisticsSummary;
    timeBased: AssignmentStatisticsTimeBased[];
    dailyTimeBased?: AssignmentStatisticsTimeBased[]; // داده‌های روزانه (همیشه موجود است)
    byVehicleType: AssignmentStatisticsByVehicleType[];
    vehicleTypeComparisons?: { [vehicleType: string]: AssignmentStatisticsVehicleTypeComparison };
    monthlyComparison: AssignmentStatisticsMonthlyComparison[];
    dateRange: {
        start: string;
        end: string;
        monthsDiff: number;
    };
}

interface RepresentativeStatisticsData {
    representativeName: string;
    city: string;
    lineType: string;
    totalFreights: number;
    companyCount: number;
    personalCount: number;
    totalPersonalFreightCost: number;
    unpaidInvoiceCount: number;
    unpaidAmount: number;
}

interface RepresentativeDetailData {
    id: string;
    announcementCode: string;
    loadingDate: string;
    lineType: string;
    assignmentType: string;
    totalFreightCost: number;
    destinationFreightCost?: number; // کرایه مقصد خاص (مشهد)
    assignedAt: string | null;
    destinations?: Array<{
        id: string | null;
        city: string;
        freightCost: number;
    }>;
    driver: {
        id: string;
        name: string;
        employeeId: string;
        phone: string;
    } | null;
    vehicle: {
        id: string;
        plateNumber: {
            part1: string;
            letter: string;
            part2: string;
            cityCode: string;
        };
        make: string;
        model: string;
    } | null;
}

interface LineAnalyticsPeriodMeta {
    key: string;
    label: string;
    jalali: {
        year: number;
        month: number;
    };
}

interface LineAnalyticsComparison {
    key: string;
    label: string;
    modeFare: number | null;
    changePercent: number | null;
    sampleSize: number;
}

interface LineAnalyticsChartPoint {
    key: string;
    label: string;
    meanFare: number | null;
    modeFare: number | null;
    sampleSize: number;
}

interface LineAnalyticsCurrentStats {
    modeFare: number | null;
    meanFare: number | null;
    modeUnitCost: number | null;
    modePerCargoPercent: number | null;
    totalUnits: number | null;
    totalFreight: number | null;
    sampleSize: number;
    destinationCountMedian: number | null;
}

interface LineAnalyticsItem {
    lineType: string;
    vehicleType: string;
    representativeName: string;
    destinationCity: string;
    unitType: 'carton' | 'ton';
    unitLabel: string;
    current: LineAnalyticsCurrentStats;
    comparisons: LineAnalyticsComparison[];
    chartData: LineAnalyticsChartPoint[];
}

interface LineAnalyticsMeta {
    lineTypes: string[];
    year: number;
    month: number;
    timeRange: string;
    periods: LineAnalyticsPeriodMeta[];
}

interface TransportDashboardProps {
    currentUser: User;
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
    representativeStats: RepresentativeStatisticsData[];
    representativeStatsLoading: boolean;
    representativeStatsError: string | null;
    onFetchRepresentativeDetails: (representativeName: string, city: string, lineType?: string) => Promise<RepresentativeDetailData[]>;
    lineAnalytics: LineAnalyticsItem[];
    lineAnalyticsMeta: LineAnalyticsMeta | null;
    lineAnalyticsLoading: boolean;
    lineAnalyticsError: string | null;
    representativeStartDate: string;
    representativeEndDate: string;
    onRepresentativeStartDateChange: (date: string) => void;
    onRepresentativeEndDateChange: (date: string) => void;
    analyticsStartDate: string;
    analyticsEndDate: string;
    onAnalyticsStartDateChange: (date: string) => void;
    onAnalyticsEndDateChange: (date: string) => void;
    onFetchLineAnalytics: () => Promise<void>;
    lineStartDate: string;
    lineEndDate: string;
    onLineStartDateChange: (date: string) => void;
    onLineEndDateChange: (date: string) => void;
    selectedLine: string | null;
    onSelectedLineChange: (line: string | null) => void;
    lineStats: StatisticsData[];
    lineStatsLoading: boolean;
    lineStatsError: string | null;
    assignmentStatistics: AssignmentStatisticsResponse | null;
    assignmentStatisticsLoading: boolean;
    assignmentStatisticsError: string | null;
    onFetchLineStatistics: (lineType: string, startDate: string, endDate: string) => Promise<void>;
    onFetchRepresentativeStatistics: () => Promise<void>;
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
    assignmentStatistics?: AssignmentStatisticsResponse | null;
}> = ({ title, stats, timeRange, assignmentStatistics }) => {
    const [zoomChart, setZoomChart] = useState<{ type: 'line' | 'bar' | 'pie' | null; data: any; data2?: any }>({ type: null, data: null });
    const [dailySummaryPage, setDailySummaryPage] = useState(1);
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
                console.log(`📊 [AssignmentTimingPie] Processing stat for ${stat.timePeriod}:`, {
                    assignmentByDay: stat.assignmentByDay,
                    '0': stat.assignmentByDay['0'],
                    '1': stat.assignmentByDay['1']
                });
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

            {/* Statistics Summary Table - Daily with Pagination (31 rows per page) */}
            {(() => {
                // استفاده از dailyTimeBased از assignmentStatistics به جای chartData
                let dailyData: StatisticsData[] = [];
                
                if (assignmentStatistics && assignmentStatistics.dailyTimeBased && assignmentStatistics.dailyTimeBased.length > 0) {
                    // استفاده مستقیم از dailyTimeBased
                    dailyData = assignmentStatistics.dailyTimeBased.map(item => ({
                        timePeriod: item.timePeriod?.replace(/-/g, '/') || item.timePeriod || '',
                        totalRequests: item.totalRequests || 0,
                        companyAssignments: item.companyAssignments || 0,
                        personalAssignments: item.personalAssignments || 0,
                        totalAssignments: item.totalAssignments || 0,
                        successRate: item.successRate || 0,
                        leftoverFromPrevious: (item as any).leftoverFromPrevious || 0,
                        assignmentByDay: (item as any).assignmentByDay || {},
                        assignmentPercentagesByDay: (item as any).assignmentPercentagesByDay || {},
                        totalAssigned: (item as any).totalAssigned || 0
                    }));
                } else {
                    // Fallback: فیلتر کردن از stats (برای سازگاری با کد قدیمی)
                    dailyData = stats.filter(stat => {
                        const period = stat.timePeriod || '';
                        const normalizedPeriod = period.replace(/-/g, '/');
                        const isDaily = normalizedPeriod.length === 10 && /^\d{4}\/\d{2}\/\d{2}$/.test(normalizedPeriod);
                        return isDaily;
                    }).map(stat => ({
                        ...stat,
                        timePeriod: stat.timePeriod?.replace(/-/g, '/') || stat.timePeriod
                    }));
                }
                
                const dailySummaryPageSize = 31; // 31 روز = یک ماه
                const totalDailyPages = Math.ceil(dailyData.length / dailySummaryPageSize);
                const startDailyIndex = (dailySummaryPage - 1) * dailySummaryPageSize;
                const endDailyIndex = startDailyIndex + dailySummaryPageSize;
                const paginatedDailyData = dailyData.slice(startDailyIndex, endDailyIndex);
                
                return (
                <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-slate-700">خلاصه عملکرد روزانه</h3>
                        {totalDailyPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDailySummaryPage(p => Math.max(1, p - 1))}
                                    disabled={dailySummaryPage === 1}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    قبلی
                                </button>
                                <span className="text-sm text-slate-600">
                                    صفحه {dailySummaryPage} از {totalDailyPages}
                                </span>
                                <button
                                    onClick={() => setDailySummaryPage(p => Math.min(totalDailyPages, p + 1))}
                                    disabled={dailySummaryPage === totalDailyPages}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    بعدی
                                </button>
                            </div>
                        )}
                    </div>
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
                                    <th className="px-3 py-2 text-center text-slate-700">تعداد بار مانده (عودت به کارشناس)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedDailyData.map((stat, idx) => {
                                    return (
                                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-100">
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
                                                {stat.leftoverFromPrevious > 0 ? (
                                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                                        {stat.leftoverFromPrevious}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">0</span>
                                                )}
                                            </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {dailyData.length === 0 && (
                        <div className="text-center py-4 text-slate-500 text-sm">
                            داده روزانه برای نمایش وجود ندارد.
                            {chartData.length > 0 && (
                                <div className="mt-2 text-xs text-slate-400">
                                    (تعداد کل داده‌ها: {chartData.length}، نمونه فرمت‌ها: {chartData.slice(0, 3).map(s => s.timePeriod).join(', ')})
                                </div>
                            )}
                        </div>
                    )}
                </div>
                );
            })()}

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
    currentUser,
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
    representativeStats,
    representativeStatsLoading,
    representativeStatsError,
    onFetchRepresentativeDetails,
    lineAnalytics,
    lineAnalyticsMeta,
    lineAnalyticsLoading,
    lineAnalyticsError,
    representativeStartDate,
    representativeEndDate,
    onRepresentativeStartDateChange,
    onRepresentativeEndDateChange,
    analyticsStartDate,
    analyticsEndDate,
    onAnalyticsStartDateChange,
    onAnalyticsEndDateChange,
    lineStartDate,
    lineEndDate,
    onLineStartDateChange,
    onLineEndDateChange,
    selectedLine,
    onSelectedLineChange,
    lineStats,
    lineStatsLoading,
    lineStatsError,
    assignmentStatistics,
    assignmentStatisticsLoading,
    assignmentStatisticsError,
    onFetchLineStatistics,
    onFetchRepresentativeStatistics,
    onFetchLineAnalytics,
}) => {
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [dailyStatsIndex, setDailyStatsIndex] = useState(0);
    const [vehicleTypePage, setVehicleTypePage] = useState(1);
    const [vehicleTypeSearch, setVehicleTypeSearch] = useState('');
    const [monthlySummaryPage, setMonthlySummaryPage] = useState(1);
    const [dailySummaryPage, setDailySummaryPage] = useState(1);
    const [activeTab, setActiveTab] = useState<'daily' | 'lines' | 'representatives' | 'analytics' | 'performance'>('daily');
    const [loadedTabs, setLoadedTabs] = useState<Set<'daily' | 'lines' | 'representatives' | 'analytics' | 'performance'>>(new Set(['daily']));
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

    // Helper function برای استخراج month از تاریخ شمسی
    const parseMonthFromJalaliDate = (jalaliDate: string): number | null => {
        const match = jalaliDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (!match) return null;
        return parseInt(match[2], 10);
    };

    // Helper function برای استخراج year/month/day از تاریخ شمسی
    const parseJalaliDate = (jalaliDate: string): { year: number; month: number; day: number } | null => {
        const match = jalaliDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (!match) return null;
        return {
            year: parseInt(match[1], 10),
            month: parseInt(match[2], 10),
            day: parseInt(match[3], 10)
        };
    };

    // Helper function برای تشخیص timeRange
    const detectTimeRange = (startDate: string, endDate: string): 'day' | 'month' | 'year' => {
        const start = parseJalaliDate(startDate);
        const end = parseJalaliDate(endDate);
        if (!start || !end) return 'month';
        
        if (start.year === end.year && start.month === end.month && start.day === end.day) {
            return 'day';
        } else if (start.year === end.year && start.month === end.month) {
            return 'month';
        } else {
            return 'year';
        }
    };

    // Helper function برای محاسبه تعداد ماه بین دو تاریخ شمسی
    const calculateMonthsDiff = (startDate: string, endDate: string): number => {
        const start = parseJalaliDate(startDate);
        const end = parseJalaliDate(endDate);
        if (!start || !end) return 0;
        
        const monthsDiff = (end.year - start.year) * 12 + (end.month - start.month);
        // اگر end.day < start.day، یک ماه کمتر در نظر بگیر
        if (end.day < start.day) {
            return Math.max(0, monthsDiff - 1);
        }
        return monthsDiff;
    };

    // استخراج month برای analytics
    const analyticsMonth = parseMonthFromJalaliDate(analyticsStartDate);
    
    // استخراج props برای RepresentativeStatisticsTable
    const representativeDateParsed = parseJalaliDate(representativeStartDate);
    const representativeYear = representativeDateParsed?.year || selectedYear;
    const representativeMonth = representativeDateParsed?.month || null;
    const representativeDay = representativeDateParsed?.day || null;
    const representativeTimeRange = detectTimeRange(representativeStartDate, representativeEndDate);

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
                    const response = await fetch(getApiUrl(`freight-announcements/statistics?${params(lineType)}`), { headers });
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

            // استفاده از pdf.save() مستقیم برای جلوگیری از هشدار blob URL
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

    // Handle tab change with lazy loading
    const handleTabChange = (tab: 'daily' | 'lines' | 'representatives' | 'analytics' | 'performance') => {
        setActiveTab(tab);
        setLoadedTabs(prev => new Set([...prev, tab]));
    };

    return (
        <div className="p-6 space-y-8" ref={pdfExportRef}>
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800">داشبورد ترابری</h1>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100" title="قوانین کارتابل">
                        <BookOpenIcon className="w-5 h-5 text-slate-600"/>
                    </button>
                    {activeTab !== 'daily' && (
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
                    )}
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="bg-white rounded-lg shadow">
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => handleTabChange('daily')}
                        className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                            activeTab === 'daily'
                                ? 'border-b-2 border-sky-600 text-sky-600 bg-sky-50'
                                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        آمار روزانه
                    </button>
                    <button
                        onClick={() => handleTabChange('lines')}
                        className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                            activeTab === 'lines'
                                ? 'border-b-2 border-sky-600 text-sky-600 bg-sky-50'
                                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        آمار تخصیص
                    </button>
                    <button
                        onClick={() => handleTabChange('representatives')}
                        className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                            activeTab === 'representatives'
                                ? 'border-b-2 border-sky-600 text-sky-600 bg-sky-50'
                                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        آمار کرایه پخش/نماینده
                    </button>
                    <button
                        onClick={() => handleTabChange('analytics')}
                        className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                            activeTab === 'analytics'
                                ? 'border-b-2 border-sky-600 text-sky-600 bg-sky-50'
                                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        آنالیز کرایه
                    </button>
                    <button
                        onClick={() => handleTabChange('performance')}
                        className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                            activeTab === 'performance'
                                ? 'border-b-2 border-sky-600 text-sky-600 bg-sky-50'
                                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        شاخص عملکرد
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                    {/* Tab 1: Daily Stats */}
                    {activeTab === 'daily' && loadedTabs.has('daily') && (
                        <div className="space-y-6">
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

                            {/* Daily Stats Full Table */}
                            <div className="bg-white rounded-lg shadow p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-bold text-slate-800">آمار عملکرد روزانه - {getTodayJalali().dateStr}</h2>
                                </div>
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
                        </div>
                    )}

                    {/* Tab 2: Line Statistics */}
                    {activeTab === 'lines' && loadedTabs.has('lines') && (
                        <div className="space-y-6">
                            {/* Filters */}
                            <div className="bg-white rounded-lg shadow p-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    {/* Start Date Filter */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">از تاریخ (شمسی)</label>
                                        <input
                                            type="text"
                                            value={lineStartDate}
                                            onChange={(e) => {
                                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                                if (value.length <= 10) {
                                                    onLineStartDateChange(value);
                                                }
                                            }}
                                            placeholder="1404/05/01"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                            dir="rtl"
                                        />
                                    </div>

                                    {/* End Date Filter */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">تا تاریخ (شمسی)</label>
                                        <input
                                            type="text"
                                            value={lineEndDate}
                                            onChange={(e) => {
                                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                                if (value.length <= 10) {
                                                    onLineEndDateChange(value);
                                                }
                                            }}
                                            placeholder="1404/05/31"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                            dir="rtl"
                                        />
                                    </div>

                                    {/* Line Type Filter */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">لاین</label>
                                        <select
                                            value={selectedLine || ''}
                                            onChange={(e) => onSelectedLineChange(e.target.value || null)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                        >
                                            <option value="">لطفاً یک لاین انتخاب کنید</option>
                                            <option value={FreightLineType.IceCream}>بستنی</option>
                                            <option value={FreightLineType.Dairy}>پاستوریزه</option>
                                            <option value={FreightLineType.Ambient}>لبنیات-فروتلند</option>
                                        </select>
                                    </div>

                                    {/* Search Button */}
                                    <div>
                                        <button
                                            onClick={() => {
                                                if (selectedLine && lineStartDate && lineEndDate) {
                                                    const monthsDiff = calculateMonthsDiff(lineStartDate, lineEndDate);
                                                    if (monthsDiff > 12) {
                                                        alert('بازه زمانی انتخاب شده بیش از 12 ماه است. لطفاً بازه کوچک‌تری انتخاب کنید.');
                                                        return;
                                                    }
                                                    onFetchLineStatistics(selectedLine, lineStartDate, lineEndDate);
                                                } else {
                                                    alert('لطفاً تاریخ‌ها و لاین را انتخاب کنید');
                                                }
                                            }}
                                            disabled={!selectedLine || !lineStartDate || !lineEndDate || lineStatsLoading}
                                            className="w-full px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-sm font-medium"
                                        >
                                            {lineStatsLoading ? 'در حال جستجو...' : 'جستجو'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 12 Month Warning */}
                            {lineStartDate && lineEndDate && (() => {
                                const monthsDiff = calculateMonthsDiff(lineStartDate, lineEndDate);
                                return monthsDiff > 12 ? (
                                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-yellow-800">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                            <div>
                                                <strong>هشدار:</strong> بازه زمانی انتخاب شده ({monthsDiff} ماه) بیش از 12 ماه است. لطفاً بازه کوچک‌تری انتخاب کنید.
                                            </div>
                                        </div>
                                    </div>
                                ) : null;
                            })()}

                            {/* Error Display */}
                            {(assignmentStatisticsError || lineStatsError) && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                                    {assignmentStatisticsError || lineStatsError}
                                </div>
                            )}

                            {/* Summary Cards with Comparisons */}
                            {assignmentStatistics && assignmentStatistics.summary && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Total Requests Card */}
                                    <div className="bg-white rounded-lg shadow p-4">
                                        <div className="text-sm text-slate-600 mb-2">کل درخواست‌ها</div>
                                        <div className="text-2xl font-bold text-slate-800 mb-2">{assignmentStatistics.summary.totalRequests.toLocaleString('fa-IR')}</div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">ماه قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithPreviousMonth.totalRequests.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithPreviousMonth.totalRequests.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithPreviousMonth.totalRequests.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs mt-1">
                                            <span className="text-slate-500">سال قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithLastYear.totalRequests.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithLastYear.totalRequests.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithLastYear.totalRequests.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Company Assignments Card */}
                                    <div className="bg-white rounded-lg shadow p-4">
                                        <div className="text-sm text-slate-600 mb-2">تخصیص شرکتی</div>
                                        <div className="text-2xl font-bold text-green-600 mb-2">{assignmentStatistics.summary.companyAssignments.toLocaleString('fa-IR')}</div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">ماه قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithPreviousMonth.companyAssignments.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithPreviousMonth.companyAssignments.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithPreviousMonth.companyAssignments.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs mt-1">
                                            <span className="text-slate-500">سال قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithLastYear.companyAssignments.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithLastYear.companyAssignments.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithLastYear.companyAssignments.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Personal Assignments Card */}
                                    <div className="bg-white rounded-lg shadow p-4">
                                        <div className="text-sm text-slate-600 mb-2">تخصیص شخصی</div>
                                        <div className="text-2xl font-bold text-orange-600 mb-2">{assignmentStatistics.summary.personalAssignments.toLocaleString('fa-IR')}</div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">ماه قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithPreviousMonth.personalAssignments.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithPreviousMonth.personalAssignments.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithPreviousMonth.personalAssignments.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs mt-1">
                                            <span className="text-slate-500">سال قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithLastYear.personalAssignments.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithLastYear.personalAssignments.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithLastYear.personalAssignments.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Success Rate Card */}
                                    <div className="bg-white rounded-lg shadow p-4">
                                        <div className="text-sm text-slate-600 mb-2">نرخ موفقیت</div>
                                        <div className="text-2xl font-bold text-blue-600 mb-2">{assignmentStatistics.summary.successRate.toFixed(1)}%</div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">ماه قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithPreviousMonth.successRate.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithPreviousMonth.successRate.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithPreviousMonth.successRate.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs mt-1">
                                            <span className="text-slate-500">سال قبل:</span>
                                            <span className={assignmentStatistics.summary.comparisonWithLastYear.successRate.percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {assignmentStatistics.summary.comparisonWithLastYear.successRate.percent >= 0 ? '+' : ''}{assignmentStatistics.summary.comparisonWithLastYear.successRate.percent.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Vehicle Type Comparison Cards - Three Cards: Company, Personal, Total */}
                            {assignmentStatistics && assignmentStatistics.vehicleTypeComparisons && (
                                (() => {
                                    const companyData = assignmentStatistics.vehicleTypeComparisons.company || {};
                                    const personalData = assignmentStatistics.vehicleTypeComparisons.personal || {};
                                    const totalData = assignmentStatistics.vehicleTypeComparisons.total || {};
                                    
                                    const allVehicleTypes = new Set([
                                        ...Object.keys(companyData),
                                        ...Object.keys(personalData),
                                        ...Object.keys(totalData)
                                    ]);
                                    
                                    if (allVehicleTypes.size === 0) return null;
                                    
                                    // محاسبه مجموع برای هر کارت
                                    const companyTotal = Object.values(companyData).reduce((sum, v: any) => sum + (v.current || 0), 0);
                                    const personalTotal = Object.values(personalData).reduce((sum, v: any) => sum + (v.current || 0), 0);
                                    const totalTotal = Object.values(totalData).reduce((sum, v: any) => sum + (v.current || 0), 0);
                                    
                                    return (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Company Card */}
                                            <div className="bg-white rounded-lg shadow p-4">
                                                <div className="text-sm font-semibold text-slate-700 mb-3">تخصیص شرکتی</div>
                                                <div className="text-xl font-bold text-green-600 mb-3">{companyTotal.toLocaleString('fa-IR')}</div>
                                                <div className="space-y-2 border-t pt-2">
                                                    {Array.from(allVehicleTypes).map(vehicleType => {
                                                        const comp = companyData[vehicleType];
                                                        if (!comp || comp.current === 0) return null;
                                                        const percent = companyTotal > 0 ? ((comp.current / companyTotal) * 100).toFixed(1) : '0';
                                                        return (
                                                            <div key={`company-${vehicleType}`} className="flex items-center justify-between text-xs">
                                                                <span className="text-slate-600">{vehicleType}:</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-800 font-medium">{comp.current.toLocaleString('fa-IR')}</span>
                                                                    <span className="text-slate-500">({percent}%)</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            
                                            {/* Personal Card */}
                                            <div className="bg-white rounded-lg shadow p-4">
                                                <div className="text-sm font-semibold text-slate-700 mb-3">تخصیص شخصی</div>
                                                <div className="text-xl font-bold text-orange-600 mb-3">{personalTotal.toLocaleString('fa-IR')}</div>
                                                <div className="space-y-2 border-t pt-2">
                                                    {Array.from(allVehicleTypes).map(vehicleType => {
                                                        const comp = personalData[vehicleType];
                                                        if (!comp || comp.current === 0) return null;
                                                        const percent = personalTotal > 0 ? ((comp.current / personalTotal) * 100).toFixed(1) : '0';
                                                        return (
                                                            <div key={`personal-${vehicleType}`} className="flex items-center justify-between text-xs">
                                                                <span className="text-slate-600">{vehicleType}:</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-800 font-medium">{comp.current.toLocaleString('fa-IR')}</span>
                                                                    <span className="text-slate-500">({percent}%)</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            
                                            {/* Total Card */}
                                            <div className="bg-white rounded-lg shadow p-4">
                                                <div className="text-sm font-semibold text-slate-700 mb-3">جمع کل</div>
                                                <div className="text-xl font-bold text-blue-600 mb-3">{totalTotal.toLocaleString('fa-IR')}</div>
                                                <div className="space-y-2 border-t pt-2">
                                                    {Array.from(allVehicleTypes).map(vehicleType => {
                                                        const comp = totalData[vehicleType];
                                                        if (!comp || comp.current === 0) return null;
                                                        const percent = totalTotal > 0 ? ((comp.current / totalTotal) * 100).toFixed(1) : '0';
                                                        return (
                                                            <div key={`total-${vehicleType}`} className="flex items-center justify-between text-xs">
                                                                <span className="text-slate-600">{vehicleType}:</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-800 font-medium">{comp.current.toLocaleString('fa-IR')}</span>
                                                                    <span className="text-slate-500">({percent}%)</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}

                            {/* Vehicle Type Statistics Table */}
                            {assignmentStatistics && assignmentStatistics.byVehicleType && assignmentStatistics.byVehicleType.length > 0 && (() => {
                                const vehicleTypePageSize = 15;
                                
                                const filteredVehicleTypes = assignmentStatistics.byVehicleType.filter(item =>
                                    !vehicleTypeSearch || item.city.toLowerCase().includes(vehicleTypeSearch.toLowerCase())
                                );
                                
                                const totalVehicleTypePages = Math.ceil(filteredVehicleTypes.length / vehicleTypePageSize);
                                const startVehicleTypeIndex = (vehicleTypePage - 1) * vehicleTypePageSize;
                                const endVehicleTypeIndex = startVehicleTypeIndex + vehicleTypePageSize;
                                const paginatedVehicleTypes = filteredVehicleTypes.slice(startVehicleTypeIndex, endVehicleTypeIndex);
                                
                                return (
                                    <div className="bg-white rounded-lg shadow p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-800">آمار بر اساس نوع خودرو</h3>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="جستجوی شهر..."
                                                    value={vehicleTypeSearch}
                                                    onChange={(e) => {
                                                        setVehicleTypeSearch(e.target.value);
                                                        setVehicleTypePage(1);
                                                    }}
                                                    className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-300 bg-slate-50">
                                                        <th className="px-4 py-3 text-right text-slate-700 font-semibold">شهر</th>
                                                        <th className="px-4 py-3 text-right text-slate-700 font-semibold">نماینده/پخش</th>
                                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">نوع خودرو</th>
                                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">شرکتی</th>
                                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">شخصی</th>
                                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">کل</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedVehicleTypes.map((item, idx) => (
                                                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                                                            <td className="px-4 py-3 text-right">{item.city}</td>
                                                            <td className="px-4 py-3 text-right">{item.representativeName}</td>
                                                            <td className="px-4 py-3 text-center">{item.vehicleType}</td>
                                                            <td className="px-4 py-3 text-center">{item.companyCount.toLocaleString('fa-IR')}</td>
                                                            <td className="px-4 py-3 text-center">{item.personalCount.toLocaleString('fa-IR')}</td>
                                                            <td className="px-4 py-3 text-center font-semibold">{item.totalCount.toLocaleString('fa-IR')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {totalVehicleTypePages > 1 && (
                                            <div className="mt-4 flex justify-center items-center gap-2">
                                                <button
                                                    onClick={() => setVehicleTypePage(p => Math.max(1, p - 1))}
                                                    disabled={vehicleTypePage === 1}
                                                    className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                >
                                                    قبلی
                                                </button>
                                                <span className="text-sm text-slate-600">
                                                    صفحه {vehicleTypePage} از {totalVehicleTypePages}
                                                </span>
                                                <button
                                                    onClick={() => setVehicleTypePage(p => Math.min(totalVehicleTypePages, p + 1))}
                                                    disabled={vehicleTypePage === totalVehicleTypePages}
                                                    className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                >
                                                    بعدی
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Monthly Summary Table - Always Monthly */}
                            {assignmentStatistics && assignmentStatistics.timeBased && assignmentStatistics.timeBased.length > 0 && (() => {
                                // فقط رکوردهای ماهانه را نمایش می‌دهیم (بازه زمانی که فقط YYYY/MM است)
                                const monthlyData = assignmentStatistics.timeBased.filter(stat => {
                                    const period = stat.timePeriod || '';
                                    // اگر بازه زمانی فقط YYYY/MM باشد (7 کاراکتر)، ماهانه است
                                    return period.length === 7 && /^\d{4}\/\d{2}$/.test(period);
                                });
                                
                                if (monthlyData.length === 0) return null;
                                
                                const monthlySummaryPageSize = 15;
                                const totalMonthlyPages = Math.ceil(monthlyData.length / monthlySummaryPageSize);
                                const startMonthlyIndex = (monthlySummaryPage - 1) * monthlySummaryPageSize;
                                const endMonthlyIndex = startMonthlyIndex + monthlySummaryPageSize;
                                const paginatedMonthlyData = monthlyData.slice(startMonthlyIndex, endMonthlyIndex);
                                
                                return (
                                    <div className="bg-white rounded-lg shadow p-6">
                                        <h3 className="text-lg font-bold text-slate-800 mb-4">خلاصه عملکرد ماهانه</h3>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-300 bg-slate-50">
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
                                                    {paginatedMonthlyData.map((stat, idx) => {
                                                        const day1Percent = stat.assignmentPercentagesByDay?.['0'] || 0;
                                                        const day2Percent = stat.assignmentPercentagesByDay?.['1'] || 0;
                                                        const day3Percent = stat.assignmentPercentagesByDay?.['2'] || 0;
                                                        const day4Percent = stat.assignmentPercentagesByDay?.['3'] || 0;
                                                        const day5PlusPercent = Object.entries(stat.assignmentPercentagesByDay || {})
                                                            .filter(([day]) => day !== '0' && day !== '1' && day !== '2' && day !== '3')
                                                            .reduce((sum, [, percent]) => sum + (percent || 0), 0);
                                                        
                                                        return (
                                                            <tr key={idx} className="border-b border-slate-200 hover:bg-slate-100">
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
                                        {totalMonthlyPages > 1 && (
                                            <div className="mt-4 flex justify-center items-center gap-2">
                                                <button
                                                    onClick={() => setMonthlySummaryPage(p => Math.max(1, p - 1))}
                                                    disabled={monthlySummaryPage === 1}
                                                    className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                >
                                                    قبلی
                                                </button>
                                                <span className="text-sm text-slate-600">
                                                    صفحه {monthlySummaryPage} از {totalMonthlyPages}
                                                </span>
                                                <button
                                                    onClick={() => setMonthlySummaryPage(p => Math.min(totalMonthlyPages, p + 1))}
                                                    disabled={monthlySummaryPage === totalMonthlyPages}
                                                    className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                >
                                                    بعدی
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Line Row - Only show selected line */}
                            {selectedLine && lineStats.length > 0 && (
                                <LineRow 
                                    title={
                                        selectedLine === FreightLineType.IceCream ? 'بستنی' :
                                        selectedLine === FreightLineType.Dairy ? 'پاستوریزه' :
                                        'لبنیات-فروتلند'
                                    } 
                                    stats={lineStats} 
                                    timeRange={detectTimeRange(lineStartDate, lineEndDate)}
                                    assignmentStatistics={assignmentStatistics}
                                />
                            )}

                            {/* No Data Message */}
                            {selectedLine && !lineStatsLoading && lineStats.length === 0 && !lineStatsError && (
                                <div className="bg-white rounded-lg shadow p-8 text-center text-slate-500">
                                    داده‌ای برای این لاین یافت نشد
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: Representative Statistics */}
                    {activeTab === 'representatives' && loadedTabs.has('representatives') && (
                        <div className="space-y-4">
                            {/* Representative Statistics Table */}
                            <RepresentativeStatisticsTable
                                stats={representativeStats}
                                loading={representativeStatsLoading}
                                error={representativeStatsError}
                                onFetchDetails={onFetchRepresentativeDetails}
                                selectedYear={representativeYear}
                                selectedMonth={representativeMonth}
                                selectedDay={representativeDay}
                                timeRange={representativeTimeRange}
                                representativeStartDate={representativeStartDate}
                                representativeEndDate={representativeEndDate}
                                onRepresentativeStartDateChange={onRepresentativeStartDateChange}
                                onRepresentativeEndDateChange={onRepresentativeEndDateChange}
                                onFetchRepresentativeStatistics={onFetchRepresentativeStatistics}
                            />
                        </div>
                    )}

                    {/* Tab 4: Line Analytics */}
                    {activeTab === 'analytics' && loadedTabs.has('analytics') && (
                        <div className="space-y-4">
                            {/* Filters */}
                            <div className="bg-white rounded-lg shadow p-4">
                                <h2 className="text-lg font-semibold text-slate-700 mb-4">فیلترها</h2>
                                <div className="flex flex-wrap gap-3 items-end">
                                    {/* Start Date Filter */}
                                    <div className="flex-1 min-w-[140px]">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            از تاریخ (شمسی) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={analyticsStartDate}
                                            onChange={(e) => {
                                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                                if (value.length <= 10) {
                                                    onAnalyticsStartDateChange(value);
                                                }
                                            }}
                                            placeholder="1404/05/01"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                                            dir="rtl"
                                        />
                                    </div>

                                    {/* End Date Filter */}
                                    <div className="flex-1 min-w-[140px]">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            تا تاریخ (شمسی) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={analyticsEndDate}
                                            onChange={(e) => {
                                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                                if (value.length <= 10) {
                                                    onAnalyticsEndDateChange(value);
                                                }
                                            }}
                                            placeholder="1404/05/31"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                                            dir="rtl"
                                        />
                                    </div>

                                    {/* Search Button */}
                                    <div>
                                        <button
                                            onClick={() => {
                                                if (analyticsStartDate && analyticsEndDate) {
                                                    onFetchLineAnalytics();
                                                } else {
                                                    alert('لطفاً تاریخ‌ها را وارد کنید');
                                                }
                                            }}
                                            disabled={!analyticsStartDate || !analyticsEndDate || lineAnalyticsLoading}
                                            className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-sm font-medium h-[38px]"
                                        >
                                            {lineAnalyticsLoading ? 'در حال جستجو...' : 'جستجو'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Error Display */}
                            {lineAnalyticsError && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                                    {lineAnalyticsError}
                                </div>
                            )}

                            {/* Content */}
                            {!analyticsStartDate || !analyticsEndDate ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                                    <div className="text-amber-800 text-lg font-semibold mb-2">
                                        برای مشاهده آنالیز کرایه، ابتدا بازه تاریخی را مشخص کنید
                                    </div>
                                    <div className="text-amber-600 text-sm">
                                        آنالیز کرایه به تفکیک لاین و خودرو برای بازه تاریخی انتخابی شما نمایش داده خواهد شد
                                    </div>
                                </div>
                            ) : lineAnalyticsLoading ? (
                                <div className="text-center py-8 text-slate-500">در حال بارگذاری آنالیز...</div>
                            ) : lineAnalytics.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">داده‌ای برای نمایش وجود ندارد</div>
                            ) : (
                                <LineAnalyticsSection
                                    data={lineAnalytics}
                                    meta={lineAnalyticsMeta}
                                    loading={lineAnalyticsLoading}
                                    error={lineAnalyticsError}
                                    selectedMonth={analyticsMonth}
                                />
                            )}
                        </div>
                    )}

                    {/* Tab 5: Performance Index */}
                    {activeTab === 'performance' && loadedTabs.has('performance') && (
                        <div className="space-y-4">
                            <PerformanceIndexTab />
                        </div>
                    )}
                </div>
            </div>

            {/* WorkflowRules Dialog */}
            {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.TransportDashboard} userRole={currentUser.role} />
                        <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Representative Statistics Table Component
const RepresentativeStatisticsTable: React.FC<{
    stats: RepresentativeStatisticsData[];
    loading: boolean;
    error: string | null;
    onFetchDetails: (representativeName: string, city: string, lineType?: string) => Promise<RepresentativeDetailData[]>;
    selectedYear: number;
    selectedMonth: number | null;
    selectedDay: number | null;
    timeRange: 'day' | 'month' | 'year';
    representativeStartDate: string;
    representativeEndDate: string;
    onRepresentativeStartDateChange: (date: string) => void;
    onRepresentativeEndDateChange: (date: string) => void;
    onFetchRepresentativeStatistics: () => Promise<void>;
}> = ({ stats, loading, error, onFetchDetails, selectedYear, selectedMonth, selectedDay, timeRange, representativeStartDate, representativeEndDate, onRepresentativeStartDateChange, onRepresentativeEndDateChange, onFetchRepresentativeStatistics }) => {
    const [selectedRepresentative, setSelectedRepresentative] = useState<{ name: string; city: string; lineType?: string } | null>(null);
    const [details, setDetails] = useState<RepresentativeDetailData[]>([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [filterRepresentative, setFilterRepresentative] = useState<string>('');
    const [filterCity, setFilterCity] = useState<string>('');
    const [filterLine, setFilterLine] = useState<string>('');
    const [statsPage, setStatsPage] = useState<number>(1);
    const [statsPageSize, setStatsPageSize] = useState<number>(10);
    const [detailsSearch, setDetailsSearch] = useState<string>('');
    const [detailsLineFilter, setDetailsLineFilter] = useState<string>('');
    const [detailsPage, setDetailsPage] = useState<number>(1);
    const [detailsPageSize, setDetailsPageSize] = useState<number>(10);

    const handleShowDetails = async (representativeName: string, city: string, lineType?: string) => {
        setSelectedRepresentative({ name: representativeName, city, lineType });
        setDetailsLoading(true);
        setDetailsError(null);
        setDetailsSearch('');
        setDetailsLineFilter('');
        setDetailsPage(1);
        setDetailsPageSize(10);
        setShowDetailsModal(true);
        
        try {
            const data = await onFetchDetails(representativeName, city, lineType);
            setDetails(data);
        } catch (err: any) {
            setDetailsError(err.message || 'خطا در دریافت جزئیات');
        } finally {
            setDetailsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fa-IR').format(amount);
    };

    const getTimeRangeLabel = () => {
        if (timeRange === 'day' && selectedYear && selectedMonth && selectedDay) {
            return `${selectedYear}/${String(selectedMonth).padStart(2, '0')}/${String(selectedDay).padStart(2, '0')}`;
        } else if (timeRange === 'month' && selectedYear && selectedMonth) {
            return `${selectedYear}/${String(selectedMonth).padStart(2, '0')}`;
        } else if (timeRange === 'year' && selectedYear) {
            return `${selectedYear}`;
        }
        return 'همه';
    };

    // تابع برای تولید محتوای CSV/Excel
    const generateExcelContent = (data: RepresentativeStatisticsData[], timeRangeLabel: string) => {
        const headers = [
            'نماینده/پخش',
            'شهر',
            'لاین',
            'تعداد ارسال',
            'شرکتی',
            'شخصی',
            'جمع کرایه شخصی',
            'بارنامه پرداخت نشده',
            'مبلغ پرداخت نشده'
        ];

        // تبدیل اعداد فارسی به انگلیسی برای Excel
        const toEnglishNumber = (num: number) => {
            return num.toString().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
        };

        // Escape کردن مقادیر برای CSV
        const escapeCSV = (value: string | number) => {
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // هدرها
        let csv = '\uFEFF'; // BOM برای UTF-8
        csv += headers.map(h => escapeCSV(h)).join(',') + '\n';

        // داده‌ها
        data.forEach(stat => {
            const row = [
                stat.representativeName || 'پخش',
                stat.city,
                stat.lineType || '-',
                toEnglishNumber(stat.totalFreights),
                toEnglishNumber(stat.companyCount),
                toEnglishNumber(stat.personalCount),
                toEnglishNumber(stat.totalPersonalFreightCost),
                toEnglishNumber(stat.unpaidInvoiceCount),
                toEnglishNumber(stat.unpaidAmount)
            ];
            csv += row.map(cell => escapeCSV(cell)).join(',') + '\n';
        });

        // خلاصه کل
        const totalPersonalFreightCost = data.reduce((sum, s) => sum + (s.totalPersonalFreightCost || 0), 0);
        const totalUnpaidAmount = data.reduce((sum, s) => sum + (s.unpaidAmount || 0), 0);
        const totalFreights = data.reduce((sum, s) => sum + (s.totalFreights || 0), 0);
        const totalCompany = data.reduce((sum, s) => sum + (s.companyCount || 0), 0);
        const totalPersonal = data.reduce((sum, s) => sum + (s.personalCount || 0), 0);
        const totalUnpaidInvoices = data.reduce((sum, s) => sum + (s.unpaidInvoiceCount || 0), 0);

        csv += '\n';
        csv += 'خلاصه کل,' + escapeCSV(timeRangeLabel) + ',,,,,,\n';
        csv += 'جمع کل,' + escapeCSV('') + ',' + escapeCSV('') + ',' + 
               toEnglishNumber(totalFreights) + ',' + 
               toEnglishNumber(totalCompany) + ',' + 
               toEnglishNumber(totalPersonal) + ',' + 
               toEnglishNumber(totalPersonalFreightCost) + ',' + 
               toEnglishNumber(totalUnpaidInvoices) + ',' + 
               toEnglishNumber(totalUnpaidAmount) + '\n';

        return csv;
    };

    // تابع برای دانلود CSV
    const downloadCSV = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // فیلتر کردن داده‌ها بر اساس نماینده، شهر و لاین
    const filteredStats = stats.filter(stat => {
        const matchesRepresentative = !filterRepresentative || 
            stat.representativeName?.toLowerCase().includes(filterRepresentative.toLowerCase()) ||
            (stat.representativeName === '' && 'پخش'.includes(filterRepresentative.toLowerCase()));
        const matchesCity = !filterCity || 
            stat.city?.toLowerCase().includes(filterCity.toLowerCase());
        const matchesLine = !filterLine || 
            stat.lineType?.toLowerCase().includes(filterLine.toLowerCase());
        return matchesRepresentative && matchesCity && matchesLine;
    });

    // استخراج لیست منحصر به فرد نمایندگان، شهرها و لاین‌ها برای فیلتر
    const uniqueRepresentatives = Array.from(new Set(stats.map(s => s.representativeName || 'پخش'))).sort();
    const uniqueCities = Array.from(new Set(stats.map(s => s.city))).sort();
    const uniqueLines = Array.from(new Set(stats.map(s => s.lineType))).filter(Boolean).sort();

    // گروه‌بندی بر اساس نماینده/شهر برای نمایش خلاصه
    const groupedStats = filteredStats.reduce((acc, stat) => {
        const key = `${stat.representativeName || 'پخش'}_${stat.city}`;
        if (!acc[key]) {
            acc[key] = {
                representativeName: stat.representativeName || 'پخش',
                city: stat.city,
                items: [],
                totalPersonalFreightCost: 0,
                totalUnpaidAmount: 0
            };
        }
        acc[key].items.push(stat);
        acc[key].totalPersonalFreightCost += stat.totalPersonalFreightCost || 0;
        acc[key].totalUnpaidAmount += stat.unpaidAmount || 0;
        return acc;
    }, {} as Record<string, {
        representativeName: string;
        city: string;
        items: RepresentativeStatisticsData[];
        totalPersonalFreightCost: number;
        totalUnpaidAmount: number;
    }>);

    // تبدیل به آرایه و صفحه‌بندی
    const groupedStatsArray = Object.values(groupedStats);
    const totalPages = Math.ceil(groupedStatsArray.length / statsPageSize);
    const startIndex = (statsPage - 1) * statsPageSize;
    const paginatedGroups = groupedStatsArray.slice(startIndex, startIndex + statsPageSize);

    return (
        <>
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
                {/* Filters in one row */}
                <div className="flex flex-wrap gap-3 items-end mb-4">
                    {/* Start Date Filter */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">از تاریخ (شمسی)</label>
                        <input
                            type="text"
                            value={representativeStartDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    onRepresentativeStartDateChange(value);
                                }
                            }}
                            placeholder="1404/05/01"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                            dir="rtl"
                        />
                    </div>

                    {/* End Date Filter */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">تا تاریخ (شمسی)</label>
                        <input
                            type="text"
                            value={representativeEndDate}
                            onChange={(e) => {
                                let value = e.target.value.replace(/[^\d\/]/g, '');
                                if (value.length <= 10) {
                                    onRepresentativeEndDateChange(value);
                                }
                            }}
                            placeholder="1404/05/31"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                            dir="rtl"
                        />
                    </div>

                    {/* جستجوی نماینده/پخش */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">جستجوی نماینده/پخش</label>
                        <input
                            type="text"
                            value={filterRepresentative}
                            onChange={(e) => {
                                setFilterRepresentative(e.target.value);
                                setStatsPage(1);
                            }}
                            placeholder="جستجو نماینده..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                        />
                    </div>

                    {/* جستجوی شهر */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">جستجوی شهر</label>
                        <input
                            type="text"
                            value={filterCity}
                            onChange={(e) => {
                                setFilterCity(e.target.value);
                                setStatsPage(1);
                            }}
                            placeholder="جستجو شهر..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                        />
                    </div>

                    {/* فیلتر لاین */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">فیلتر لاین</label>
                        <select
                            value={filterLine}
                            onChange={(e) => {
                                setFilterLine(e.target.value);
                                setStatsPage(1);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                        >
                            <option value="">همه لاین‌ها</option>
                            {uniqueLines.map(line => (
                                <option key={line} value={line}>{line}</option>
                            ))}
                        </select>
                    </div>

                    {/* تعداد ردیف */}
                    <div className="min-w-[100px]">
                        <label className="block text-sm font-medium text-slate-700 mb-2">تعداد ردیف</label>
                        <select
                            value={statsPageSize}
                            onChange={(e) => {
                                setStatsPageSize(Number(e.target.value));
                                setStatsPage(1);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                        >
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={100}>100</option>
                        </select>
                    </div>

                    {/* خروجی اکسل */}
                    <div>
                        <button
                            onClick={() => {
                                const csvContent = generateExcelContent(filteredStats, getTimeRangeLabel());
                                downloadCSV(csvContent, `آمار_کرایه_نماینده_${getTimeRangeLabel()}.csv`);
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2 flex-row-reverse h-[38px]"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            خروجی اکسل
                        </button>
                    </div>

                    {/* جستجو */}
                    <div>
                        <button
                            onClick={onFetchRepresentativeStatistics}
                            disabled={loading}
                            className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-sm font-medium h-[38px]"
                        >
                            {loading ? 'در حال جستجو...' : 'جستجو'}
                        </button>
                    </div>

                    {/* پاک کردن فیلترها */}
                    {(filterRepresentative || filterCity || filterLine) && (
                        <div>
                            <button
                                onClick={() => {
                                    setFilterRepresentative('');
                                    setFilterCity('');
                                    setFilterLine('');
                                    setStatsPage(1);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 text-sm font-medium h-[38px]"
                            >
                                پاک کردن فیلترها
                            </button>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">

                        {loading ? (
                            <div className="text-center py-8 text-slate-500">در حال بارگذاری...</div>
                        ) : filteredStats.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                {stats.length === 0 ? 'داده‌ای برای نمایش وجود ندارد' : 'نتیجه‌ای با فیلترهای انتخابی یافت نشد'}
                            </div>
                        ) : (
                            <>
                            <table className="min-w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-300 bg-slate-50">
                                        <th className="px-4 py-3 text-right text-slate-700 font-semibold">شهر</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">لاین</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">تعداد ارسال</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">شرکتی</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">شخصی</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">جمع کرایه شخصی</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">بارنامه پرداخت نشده</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">مبلغ پرداخت نشده</th>
                                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">جزئیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                        {paginatedGroups.map((group, groupIdx) => (
                                            <React.Fragment key={`${group.city}_${groupIdx}`}>
                                                {group.items.map((stat, itemIdx) => (
                                                    <tr key={`${stat.city}_${stat.lineType}_${itemIdx}`} className="border-b border-slate-200 hover:bg-slate-50">
                                                        <td className="px-4 py-3 text-right">{stat.city}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                                {stat.lineType || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">{stat.totalFreights}</td>
                                                        <td className="px-4 py-3 text-center">{stat.companyCount}</td>
                                                        <td className="px-4 py-3 text-center">{stat.personalCount}</td>
                                                        <td className="px-4 py-3 text-center">{formatCurrency(stat.totalPersonalFreightCost)}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            {stat.unpaidInvoiceCount > 0 ? (
                                                                <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                                                    {stat.unpaidInvoiceCount}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">0</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {stat.unpaidAmount > 0 ? (
                                                                <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                                                                    {formatCurrency(stat.unpaidAmount)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">0</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <button
                                                                onClick={() => handleShowDetails(stat.representativeName, stat.city, stat.lineType)}
                                                                className="text-sky-600 hover:text-sky-800 text-sm font-medium flex items-center gap-1 flex-row-reverse"
                                                            >
                                                                مشاهده
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {group.items.length > 0 && (
                                                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                                                        <td className="px-4 py-3 text-center text-slate-600 font-bold">
                                                            {group.items.reduce((sum, item) => sum + item.totalFreights, 0)} ارسال | {group.items.reduce((sum, item) => sum + item.companyCount, 0)} شرکتی | {group.items.reduce((sum, item) => sum + item.personalCount, 0)} شخصی
                                                        </td>
                                                        <td className="px-4 py-3"></td>
                                                        <td className="px-4 py-3"></td>
                                                        <td className="px-4 py-3"></td>
                                                        <td className="px-4 py-3"></td>
                                                        <td className="px-4 py-3 text-center font-bold text-slate-800">
                                                            {formatCurrency(group.totalPersonalFreightCost)}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {group.items.reduce((sum, item) => sum + item.unpaidInvoiceCount, 0) > 0 ? (
                                                                <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                                                    {group.items.reduce((sum, item) => sum + item.unpaidInvoiceCount, 0)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">0</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center font-bold text-orange-800">
                                                            {formatCurrency(group.totalUnpaidAmount)}
                                                        </td>
                                                        <td className="px-4 py-3"></td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                    ))}
                                </tbody>
                            </table>

                                {/* صفحه‌بندی */}
                                {totalPages > 1 && (
                                    <div className="mt-4 flex justify-center items-center gap-2">
                                        <button
                                            onClick={() => setStatsPage(p => Math.max(1, p - 1))}
                                            disabled={statsPage === 1}
                                            className="px-4 py-2 border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        >
                                            قبلی
                                        </button>
                                        <span className="px-4 py-2 text-slate-700">
                                            صفحه {statsPage} از {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setStatsPage(p => Math.min(totalPages, p + 1))}
                                            disabled={statsPage === totalPages}
                                            className="px-4 py-2 border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        >
                                            بعدی
                                        </button>
                                    </div>
                                )}

                                {/* خلاصه کل */}
                                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <div className="flex gap-6">
                                            <div>
                                                <span className="text-sm text-slate-600">مبلغ کل کرایه شخصی: </span>
                                                <span className="text-lg font-semibold text-slate-800">
                                                    {formatCurrency(filteredStats.reduce((sum, s) => sum + (s.totalPersonalFreightCost || 0), 0))}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-sm text-slate-600">مبلغ کل پرداخت نشده: </span>
                                                <span className="text-lg font-semibold text-orange-800">
                                                    {formatCurrency(filteredStats.reduce((sum, s) => sum + (s.unpaidAmount || 0), 0))}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-sm text-slate-500">
                                            نمایش {startIndex + 1} تا {Math.min(startIndex + statsPageSize, groupedStatsArray.length)} از {groupedStatsArray.length} گروه
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                </div>
            </div>

            {/* Details Modal */}
            {showDetailsModal && selectedRepresentative && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailsModal(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-800">
                                جزئیات تخصیص‌های خودرو - {selectedRepresentative.name} ({selectedRepresentative.city})
                            </h3>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6">
                            {detailsLoading ? (
                                <div className="text-center py-8 text-slate-500">در حال بارگذاری...</div>
                            ) : detailsError ? (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                                    {detailsError}
                                </div>
                            ) : details.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">داده‌ای برای نمایش وجود ندارد</div>
                            ) : (
                                <>
                                    {/* فیلترها و سرچ */}
                                    <div className="mb-4 space-y-3">
                                        <div className="flex gap-4 items-end">
                                            <div className="flex-1">
                                                <label className="block text-sm font-medium text-slate-700 mb-2">جستجو (کد، راننده، خودرو، ...)</label>
                                                <input
                                                    type="text"
                                                    value={detailsSearch}
                                                    onChange={(e) => {
                                                        setDetailsSearch(e.target.value);
                                                        setDetailsPage(1);
                                                    }}
                                                    placeholder="جستجو..."
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-sm font-medium text-slate-700 mb-2">فیلتر لاین</label>
                                                <select
                                                    value={detailsLineFilter}
                                                    onChange={(e) => {
                                                        setDetailsLineFilter(e.target.value);
                                                        setDetailsPage(1);
                                                    }}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                >
                                                    <option value="">همه لاین‌ها</option>
                                                    {Array.from(new Set(details.map(d => d.lineType))).map(line => (
                                                        <option key={line} value={line}>{line}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">تعداد ردیف</label>
                                                <select
                                                    value={detailsPageSize}
                                                    onChange={(e) => {
                                                        setDetailsPageSize(Number(e.target.value));
                                                        setDetailsPage(1);
                                                    }}
                                                    className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                >
                                                    <option value={10}>10</option>
                                                    <option value={30}>30</option>
                                                    <option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* فیلتر کردن داده‌ها */}
                                    {(() => {
                                        const filteredDetails = details.filter(detail => {
                                            const searchLower = detailsSearch.toLowerCase();
                                            const matchesSearch = !detailsSearch || 
                                                detail.driver?.name?.toLowerCase().includes(searchLower) ||
                                                detail.driver?.employeeId?.toLowerCase().includes(searchLower) ||
                                                detail.driver?.phone?.toLowerCase().includes(searchLower) ||
                                                `${detail.vehicle?.plateNumber.part1}${detail.vehicle?.plateNumber.letter}${detail.vehicle?.plateNumber.part2}`.toLowerCase().includes(searchLower) ||
                                                detail.vehicle?.make?.toLowerCase().includes(searchLower) ||
                                                detail.vehicle?.model?.toLowerCase().includes(searchLower) ||
                                                detail.loadingDate?.toLowerCase().includes(searchLower) ||
                                                detail.assignedAt?.toLowerCase().includes(searchLower) ||
                                                detail.destinations?.some(dest => dest.city?.toLowerCase().includes(searchLower));
                                            
                                            const matchesLine = !detailsLineFilter || detail.lineType === detailsLineFilter;
                                            
                                            return matchesSearch && matchesLine;
                                        });

                                        const totalPages = Math.ceil(filteredDetails.length / detailsPageSize);
                                        const startIndex = (detailsPage - 1) * detailsPageSize;
                                        const paginatedDetails = filteredDetails.slice(startIndex, startIndex + detailsPageSize);

                                        // محاسبه مبالغ - استفاده از destinationFreightCost (کرایه مقصد خاص) به جای totalFreightCost
                                        const totalPaid = filteredDetails
                                            .filter(d => d.assignmentType === 'personal')
                                            .reduce((sum, d) => sum + (d.destinationFreightCost || d.totalFreightCost || 0), 0);
                                        
                                        const totalUnpaid = filteredDetails
                                            .filter(d => d.assignmentType === 'personal')
                                            .reduce((sum, d) => sum + (d.destinationFreightCost || d.totalFreightCost || 0), 0);

                                        return (
                                            <>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-300 bg-slate-50">
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">تاریخ بارگیری</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">تاریخ تخصیص</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">لاین</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">نوع تخصیص</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">مقاصد</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">راننده</th>
                                                <th className="px-4 py-3 text-right text-slate-700 font-semibold">خودرو</th>
                                                <th className="px-4 py-3 text-center text-slate-700 font-semibold">مبلغ کرایه</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                                            {paginatedDetails.map((detail, idx) => (
                                                                <tr key={`${detail.id}-${idx}`} className="border-b border-slate-200 hover:bg-slate-50">
                                                    <td className="px-4 py-3 text-right">{detail.loadingDate}</td>
                                                    <td className="px-4 py-3 text-right">{detail.assignedAt || '-'}</td>
                                                    <td className="px-4 py-3 text-right">{detail.lineType}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                            detail.assignmentType === 'company' 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-orange-100 text-orange-800'
                                                        }`}>
                                                            {detail.assignmentType === 'company' ? 'شرکتی' : 'شخصی'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {detail.destinations && detail.destinations.length > 0 ? (
                                                            <div>
                                                                <div>
                                                                    {detail.destinations.map((dest: any, destIdx: number) => (
                                                                        <span key={destIdx} className="font-semibold text-blue-700">
                                                                            {dest.city}
                                                                            {destIdx < detail.destinations.length - 1 ? '، ' : ''}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                {detail.totalFreightCost > 0 && (
                                                                    <div className="text-xs text-slate-500 mt-1">
                                                                        ({formatCurrency(detail.totalFreightCost)})
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {detail.driver ? (
                                                            <div>
                                                                <div className="font-semibold">{detail.driver.name}</div>
                                                                {detail.driver.employeeId && (
                                                                    <div className="text-xs text-slate-500">کد: {detail.driver.employeeId}</div>
                                                                )}
                                                                {detail.driver.phone && (
                                                                    <div className="text-xs text-slate-500">{detail.driver.phone}</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {detail.vehicle ? (
                                                            <div>
                                                                <div className="font-semibold">
                                                                    {detail.vehicle.plateNumber.part1} 
                                                                    {detail.vehicle.plateNumber.letter} 
                                                                    {detail.vehicle.plateNumber.part2} 
                                                                    {detail.vehicle.plateNumber.cityCode && `-${detail.vehicle.plateNumber.cityCode}`}
                                                                </div>
                                                                {(detail.vehicle.make || detail.vehicle.model) && (
                                                                    <div className="text-xs text-slate-500">
                                                                        {detail.vehicle.make} {detail.vehicle.model}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">{formatCurrency(detail.destinationFreightCost || detail.totalFreightCost)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                                </div>

                                                {/* خلاصه مبالغ */}
                                                <div className="mt-4 p-4 bg-slate-50 rounded-lg flex justify-between items-center">
                                                    <div className="flex gap-6">
                                                        <div>
                                                            <span className="text-sm text-slate-600">مبلغ کل کرایه شخصی: </span>
                                                            <span className="text-lg font-semibold text-slate-800">{formatCurrency(totalUnpaid)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-slate-500">
                                                        نمایش {startIndex + 1} تا {Math.min(startIndex + detailsPageSize, filteredDetails.length)} از {filteredDetails.length} ردیف
                                                    </div>
                                                </div>

                                                {/* صفحه‌بندی */}
                                                {totalPages > 1 && (
                                                    <div className="mt-4 flex justify-center items-center gap-2">
                                                        <button
                                                            onClick={() => setDetailsPage(p => Math.max(1, p - 1))}
                                                            disabled={detailsPage === 1}
                                                            className="px-4 py-2 border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                        >
                                                            قبلی
                                                        </button>
                                                        <span className="px-4 py-2 text-slate-700">
                                                            صفحه {detailsPage} از {totalPages}
                                                        </span>
                                                        <button
                                                            onClick={() => setDetailsPage(p => Math.min(totalPages, p + 1))}
                                                            disabled={detailsPage === totalPages}
                                                            className="px-4 py-2 border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                        >
                                                            بعدی
                                                        </button>
                                </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const LineAnalyticsSection: React.FC<{
    data: LineAnalyticsItem[];
    meta: LineAnalyticsMeta | null;
    loading: boolean;
    error: string | null;
    selectedMonth: number | null;
}> = ({ data, meta, loading, error, selectedMonth }) => {
    const periods = meta?.periods ?? [];
    const comparisonPeriods = periods.filter(period => period.key !== 'current');

    type EnrichedItem = LineAnalyticsItem & {
        vehicleDisplay: string;
    };

    const createDefaultFilter = () => ({ vehicleType: '', search: '' });

    const [lineFilters, setLineFilters] = useState<Record<string, { vehicleType: string; search: string }>>({});
    const [expandedTable, setExpandedTable] = useState<{ lineType: string; rows: EnrichedItem[]; unitLabel: string } | null>(null);
    const [expandedChart, setExpandedChart] = useState<{ lineType: string; data: { vehicleType: string; meanFare: number | null; sampleSize: number }[] } | null>(null);

    const groupedByLine = useMemo(() => {
        const lineMap = new Map<string, LineAnalyticsItem[]>();
        data.forEach(item => {
            const lineType = item.lineType || 'نامشخص';
            if (!lineMap.has(lineType)) {
                lineMap.set(lineType, []);
            }
            lineMap.get(lineType)!.push(item);
        });

        return Array.from(lineMap.entries()).map(([lineType, items]) => ({ lineType, items }));
    }, [data]);

    useEffect(() => {
        setLineFilters(prev => {
            const next = { ...prev };
            groupedByLine.forEach(group => {
                if (!next[group.lineType]) {
                    next[group.lineType] = createDefaultFilter();
                }
            });
            return next;
        });
    }, [groupedByLine]);

    const updateLineFilter = (lineType: string, updates: Partial<{ vehicleType: string; search: string }>) => {
        setLineFilters(prev => {
            const current = prev[lineType] ?? createDefaultFilter();
            return {
                ...prev,
                [lineType]: {
                    ...current,
                    ...updates,
                },
            };
        });
    };

    const formatCurrency = (value: number | null | undefined, maximumFractionDigits = 0) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '—';
        }
        return new Intl.NumberFormat('fa-IR', {
            maximumFractionDigits,
        }).format(value);
    };

    const formatCurrencyCompact = (value: number | null | undefined) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '';
        }
        return new Intl.NumberFormat('fa-IR', {
            notation: 'compact',
            compactDisplay: 'short',
            maximumFractionDigits: 1,
        }).format(value);
    };

    const formatPercent = (value: number | null | undefined, fractionDigits = 2) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '—';
        }
        return `${value >= 0 ? '+' : ''}${value.toFixed(fractionDigits)}%`;
    };

    const formatUnits = (value: number | null | undefined, unitType: 'carton' | 'ton') => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '—';
        }
        const digits = unitType === 'carton' ? 0 : 2;
        return new Intl.NumberFormat('fa-IR', {
            maximumFractionDigits: digits,
        }).format(value);
    };

    const toEnglishDigits = (value: string | number | null | undefined) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        return str.replace(/[۰-۹]/g, d => String(persianDigits.indexOf(d)));
    };

    const buildAnalyticsCSV = () => {
        if (!meta || data.length === 0) return '';

        const header = [
            'لاین',
            'نوع خودرو',
            'شهر مقصد',
            'حجم بار (واحد)',
            'مد کرایه جاری (ریال)',
            'میانگین کرایه جاری (ریال)',
            'کرایه به‌ازای هر واحد (ریال)',
            'کرایه / ارزش بار (%)',
            'جمع کرایه (ریال)',
            'تعداد سفر جاری',
            ...comparisonPeriods.flatMap(period => [
                `مد کرایه - ${period.label}`,
                `درصد تغییر - ${period.label}`,
                `تعداد سفر - ${period.label}`,
            ]),
        ];

        const rows: string[][] = [];

        data.forEach(item => {
            const comparisonMap = new Map(item.comparisons.map(comp => [comp.key, comp]));
            const vehicleDisplay = item.vehicleType || 'نامشخص';
            const totalUnitsCell = item.current.totalUnits !== null && item.current.totalUnits !== undefined
                ? `${toEnglishDigits(item.current.totalUnits)} ${item.unitLabel}`
                : '';
            const perUnitCostCell = item.current.modeUnitCost !== null && item.current.modeUnitCost !== undefined
                ? `${toEnglishDigits(item.current.modeUnitCost)} ریال/${item.unitLabel}`
                : '';

            const row: string[] = [
                item.lineType,
                item.vehicleType,
                item.destinationCity,
                totalUnitsCell,
                toEnglishDigits(item.current.modeFare),
                toEnglishDigits(item.current.meanFare),
                perUnitCostCell,
                item.current.modePerCargoPercent !== null && item.current.modePerCargoPercent !== undefined
                    ? toEnglishDigits(item.current.modePerCargoPercent.toFixed(2))
                    : '',
                toEnglishDigits(item.current.totalFreight),
                toEnglishDigits(item.current.sampleSize),
            ];

            comparisonPeriods.forEach(period => {
                const cmp = comparisonMap.get(period.key);
                row.push(
                    toEnglishDigits(cmp?.modeFare ?? ''),
                    cmp?.changePercent !== null && cmp?.changePercent !== undefined
                        ? toEnglishDigits(cmp.changePercent.toFixed(2))
                        : '',
                    toEnglishDigits(cmp?.sampleSize ?? '')
                );
            });

            rows.push(row);
        });

        const csvLines = [
            '\uFEFF' + header.join(','),
            ...rows.map(row =>
                row
                    .map(cell => {
                        const str = String(cell ?? '');
                        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
                    })
                    .join(',')
            ),
        ];

        return csvLines.join('\n');
    };

    const handleDownload = () => {
        const csv = buildAnalyticsCSV();
        if (!csv) return;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const fileName = `line-analytics-${meta?.year || ''}-${String(meta?.month || '').padStart(2, '0')}.csv`;
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!selectedMonth) {
        return (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4">آنالیز کرایه به تفکیک لاین و خودرو</h2>
                <p className="text-slate-600">برای مشاهده آنالیز کرایه، ابتدا یک ماه مشخص انتخاب کنید.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-800">آنالیز کرایه به تفکیک لاین و خودرو</h2>
                {meta && (
                    <span className="text-sm text-slate-500">
                        دوره انتخابی: {meta.year}/{String(meta.month).padStart(2, '0')}
                    </span>
                )}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDownload}
                        disabled={loading || error !== null || data.length === 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        خروجی اکسل آنالیز
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-slate-500">در حال بارگذاری آنالیز...</div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
            ) : data.length === 0 ? (
                <div className="text-center py-8 text-slate-500">داده‌ای برای نمایش وجود ندارد</div>
            ) : (
                groupedByLine.map(lineGroup => {
                    const filter = lineFilters[lineGroup.lineType] ?? createDefaultFilter();
                    const normalizedSearch = filter.search.trim().toLowerCase();

                    const allItems: EnrichedItem[] = lineGroup.items.map(item => ({
                        ...item,
                        vehicleDisplay: item.vehicleType || 'نامشخص',
                    }));

                    const vehicleOptions = Array.from(new Set(allItems.map(item => item.vehicleDisplay))).sort((a, b) => a.localeCompare(b, 'fa'));

                    const filteredItems = allItems.filter(item => {
                        const matchesVehicle = !filter.vehicleType || item.vehicleDisplay === filter.vehicleType;
                        const matchesSearch = !normalizedSearch
                            || item.destinationCity.toLowerCase().includes(normalizedSearch)
                            || item.vehicleDisplay.toLowerCase().includes(normalizedSearch);
                        return matchesVehicle && matchesSearch;
                    });

                    const unitLabel = filteredItems[0]?.unitLabel ?? allItems[0]?.unitLabel ?? 'واحد';

                    const vehicleAggregation = new Map<string, { weightedMean: number; totalSamples: number }>();
                    filteredItems.forEach(item => {
                        const key = item.vehicleDisplay;
                        const current = vehicleAggregation.get(key) || { weightedMean: 0, totalSamples: 0 };
                        const sampleSize = item.current.sampleSize && item.current.sampleSize > 0 ? item.current.sampleSize : (item.current.meanFare !== null ? 1 : 0);
                        if (item.current.meanFare !== null && sampleSize > 0) {
                            current.weightedMean += item.current.meanFare * sampleSize;
                        }
                        current.totalSamples += sampleSize;
                        vehicleAggregation.set(key, current);
                    });

                    const vehicleChartData = Array.from(vehicleAggregation.entries()).map(([vehicleType, agg]) => ({
                        vehicleType,
                        meanFare: agg.totalSamples > 0 ? Math.round(agg.weightedMean / agg.totalSamples) : null,
                        sampleSize: agg.totalSamples,
                    }));

                    const hasData = filteredItems.length > 0;

                    return (
                        <div key={lineGroup.lineType} className="mb-10">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                                <h3 className="text-lg font-semibold text-slate-700">لاین: {lineGroup.lineType}</h3>
                                <span className="text-sm text-slate-500">({allItems.length} ترکیب مقصد)</span>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 mb-6">
                                <div className="flex flex-col">
                                    <label className="text-xs font-medium text-slate-600 mb-1">نوع خودرو</label>
                                    <select
                                        value={filter.vehicleType}
                                        onChange={e => updateLineFilter(lineGroup.lineType, { vehicleType: e.target.value })}
                                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    >
                                        <option value="">همه انواع خودرو</option>
                                        {vehicleOptions.map(option => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-xs font-medium text-slate-600 mb-1">جستجوی شهر یا خودرو</label>
                                    <input
                                        type="text"
                                        value={filter.search}
                                        onChange={e => updateLineFilter(lineGroup.lineType, { search: e.target.value })}
                                        placeholder="مثلاً مشهد یا تریلی"
                                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    />
                                </div>
                            </div>

                            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                                <div className="bg-white border border-slate-200 rounded-lg shadow-sm order-1 lg:order-1">
                                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                        <h4 className="text-base font-semibold text-slate-700">جدول جزئیات کرایه</h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500">
                                                {hasData ? `${filteredItems.length} ردیف پس از فیلتر` : 'داده‌ای مطابق فیلترها یافت نشد'}
                                            </span>
                                            {hasData && (
                                                <>
                                                    <button
                                                        onClick={() => setExpandedTable({ lineType: lineGroup.lineType, rows: filteredItems, unitLabel })}
                                                        className="text-xs text-sky-600 border border-sky-300 px-2 py-1 rounded-md hover:bg-sky-50"
                                                    >
                                                        بزرگنمایی جدول
                                                    </button>
                                                    <button
                                                        onClick={() => updateLineFilter(lineGroup.lineType, { search: '' })}
                                                        className="text-xs text-slate-600 border border-slate-300 px-2 py-1 rounded-md hover:bg-slate-50"
                                                    >
                                                        پاک کردن جستجو
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-slate-100">
                                                <tr>
                                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">نوع خودرو</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">شهر مقصد نهایی</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">حجم بار ({unitLabel})</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">مد کرایه (ریال)</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">میانگین کرایه (ریال)</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">کرایه به‌ازای هر {unitLabel}</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">کرایه / ارزش بار (%)</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">جمع کرایه (ریال)</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-slate-700">تعداد سفر</th>
                                                    {comparisonPeriods.map(period => (
                                                        <th key={period.key} className="px-3 py-2 text-center font-semibold text-slate-700">
                                                            {period.label}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {hasData ? (
                                                    filteredItems.map(item => {
                                                        const comparisonMap = new Map(item.comparisons.map(comp => [comp.key, comp]));
                                                        const rowKey = `${item.vehicleDisplay}-${item.destinationCity}`;
                                                        return (
                                                            <tr key={rowKey} className="border-t border-slate-200">
                                                                <td className="px-3 py-2 text-right text-slate-800 font-semibold">{item.vehicleDisplay}</td>
                                                                <td className="px-3 py-2 text-right text-slate-800">{item.destinationCity}</td>
                                                                <td className="px-3 py-2 text-center text-slate-800">{formatUnits(item.current.totalUnits, item.unitType)}</td>
                                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(item.current.modeFare, 0)}</td>
                                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(item.current.meanFare, 0)}</td>
                                                                <td className="px-3 py-2 text-center text-slate-800">
                                                                    <div className="flex flex-col items-center leading-tight">
                                                                        <span className="font-semibold">
                                                                            {formatCurrency(
                                                                                item.current.modeUnitCost,
                                                                                item.unitType === 'carton' ? 0 : 2
                                                                            )}
                                                                        </span>
                                                                        <span className="text-[11px] text-slate-500">ریال برای هر {item.unitLabel}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-slate-800">
                                                                    {item.current.modePerCargoPercent !== null
                                                                        ? `${item.current.modePerCargoPercent.toFixed(2)}%`
                                                                        : '—'}
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(item.current.totalFreight, 0)}</td>
                                                                <td className="px-3 py-2 text-center text-slate-800">{item.current.sampleSize}</td>
                                                                {comparisonPeriods.map(period => {
                                                                    const cmp = comparisonMap.get(period.key);
                                                                    return (
                                                                        <td key={`${rowKey}-${period.key}`} className="px-3 py-2 text-center">
                                                                            <div className="flex flex-col items-center gap-1">
                                                                                <span className="text-slate-800 font-semibold">
                                                                                    {formatCurrency(cmp?.modeFare ?? null, 0)}
                                                                                </span>
                                                                                <span
                                                                                    className={`text-xs font-medium ${
                                                                                        cmp?.changePercent !== null && cmp?.changePercent !== undefined
                                                                                            ? cmp.changePercent > 0
                                                                                                ? 'text-green-600'
                                                                                                : cmp.changePercent < 0
                                                                                                ? 'text-red-600'
                                                                                                : 'text-slate-500'
                                                                                            : 'text-slate-400'
                                                                                    }`}
                                                                                >
                                                                                    {formatPercent(cmp?.changePercent)}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan={9 + comparisonPeriods.length} className="px-3 py-6 text-center text-slate-500">
                                                            هیچ داده‌ای با فیلترهای انتخابی یافت نشد.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 shadow-sm order-2 lg:order-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h4 className="text-base font-semibold text-slate-700">میانگین کرایه به‌ازای نوع خودرو</h4>
                                            <span className="text-xs text-slate-500">(براساس فیلترهای بالا)</span>
                                        </div>
                                        {vehicleChartData.length > 0 && (
                                            <button
                                                onClick={() => setExpandedChart({ lineType: lineGroup.lineType, data: vehicleChartData })}
                                                className="text-xs text-sky-600 border border-sky-300 px-2 py-1 rounded-md hover:bg-sky-50"
                                            >
                                                بزرگنمایی نمودار
                                            </button>
                                        )}
                                    </div>
                                    <div className="w-full h-72 min-w-0 p-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={vehicleChartData}
                                                margin={{ top: 12, right: 6, bottom: 6, left: 6 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis
                                                    dataKey="vehicleType"
                                                    tickMargin={8}
                                                    tick={{ fill: '#475569', fontSize: 12, dy: 2 }}
                                                    axisLine={{ stroke: '#cbd5f5' }}
                                                    tickLine={false}
                                                />
                                                <YAxis
                                                    tickFormatter={(value) => formatCurrencyCompact(Number(value))}
                                                    tickMargin={16}
                                                    width={96}
                                                    tick={{ fill: '#475569', fontSize: 12, dx: -4, textAnchor: 'end' }}
                                                    axisLine={{ stroke: '#cbd5f5' }}
                                                    tickLine={false}
                                                    mirror
                                                    padding={{ left: 32 }}
                                                />
                                                <Tooltip
                                                    formatter={(value: any, _name, item) => {
                                                        const payload = item?.payload as typeof vehicleChartData[number];
                                                        const formattedValue = formatCurrency(Number(value), 0);
                                                        const sample = payload?.sampleSize ?? 0;
                                                        return [`${formattedValue} (سفر: ${sample})`, 'میانگین کرایه (ریال)'];
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ paddingTop: 12 }} />
                                                <Bar dataKey="meanFare" name="میانگین کرایه (ریال)" fill="#0ea5e9" barSize={24}>
                                                    <LabelList
                                                        dataKey="meanFare"
                                                        position="top"
                                                        offset={12}
                                                        formatter={(value: any) =>
                                                            value !== null && value !== undefined
                                                                ? formatCurrency(Number(value), 0)
                                                                : '—'
                                                        }
                                                    />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {expandedTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-full overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">نمایش کامل جدول - لاین {expandedTable.lineType}</h3>
                                <p className="text-xs text-slate-500 mt-1">اطلاعات همان ردیف‌ها با فیلترهای فعال</p>
                            </div>
                            <button
                                onClick={() => setExpandedTable(null)}
                                className="text-slate-500 hover:text-slate-700 transition"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 px-6 py-4 overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">نوع خودرو</th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">شهر مقصد نهایی</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">حجم بار ({expandedTable.unitLabel})</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">مد کرایه (ریال)</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">میانگین کرایه (ریال)</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">کرایه به‌ازای هر {expandedTable.unitLabel}</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">کرایه / ارزش بار (%)</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">جمع کرایه (ریال)</th>
                                        <th className="px-3 py-2 text-center font-semibold text-slate-700">تعداد سفر</th>
                                        {comparisonPeriods.map(period => (
                                            <th key={period.key} className="px-3 py-2 text-center font-semibold text-slate-700">
                                                {period.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {expandedTable.rows.map(row => {
                                        const comparisonMap = new Map(row.comparisons.map(comp => [comp.key, comp]));
                                        const rowKey = `${row.vehicleDisplay}-${row.destinationCity}-expanded`;
                                        return (
                                            <tr key={rowKey} className="border-t border-slate-200">
                                                <td className="px-3 py-2 text-right text-slate-800 font-semibold">{row.vehicleDisplay}</td>
                                                <td className="px-3 py-2 text-right text-slate-800">{row.destinationCity}</td>
                                                <td className="px-3 py-2 text-center text-slate-800">{formatUnits(row.current.totalUnits, row.unitType)}</td>
                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(row.current.modeFare, 0)}</td>
                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(row.current.meanFare, 0)}</td>
                                                <td className="px-3 py-2 text-center text-slate-800">
                                                    <div className="flex flex-col items-center leading-tight">
                                                        <span className="font-semibold">
                                                            {formatCurrency(
                                                                row.current.modeUnitCost,
                                                                row.unitType === 'carton' ? 0 : 2
                                                            )}
                                                        </span>
                                                        <span className="text-[11px] text-slate-500">ریال برای هر {row.unitLabel}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-center text-slate-800">
                                                    {row.current.modePerCargoPercent !== null
                                                        ? `${row.current.modePerCargoPercent.toFixed(2)}%`
                                                        : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-center text-slate-800">{formatCurrency(row.current.totalFreight, 0)}</td>
                                                <td className="px-3 py-2 text-center text-slate-800">{row.current.sampleSize}</td>
                                                {comparisonPeriods.map(period => {
                                                    const cmp = comparisonMap.get(period.key);
                                                    return (
                                                        <td key={`${rowKey}-${period.key}`} className="px-3 py-2 text-center">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className="text-slate-800 font-semibold">
                                                                    {formatCurrency(cmp?.modeFare ?? null, 0)}
                                                                </span>
                                                                <span
                                                                    className={`text-xs font-medium ${
                                                                        cmp?.changePercent !== null && cmp?.changePercent !== undefined
                                                                            ? cmp.changePercent > 0
                                                                                ? 'text-green-600'
                                                                                : cmp.changePercent < 0
                                                                                ? 'text-red-600'
                                                                                : 'text-slate-500'
                                                                            : 'text-slate-400'
                                                                    }`}
                                                                >
                                                                    {formatPercent(cmp?.changePercent)}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-right">
                            <button
                                onClick={() => setExpandedTable(null)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition text-sm"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {expandedChart && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">بزرگنمایی نمودار لاین {expandedChart.lineType}</h3>
                                <p className="text-xs text-slate-500 mt-1">میانگین کرایه بر اساس نوع خودرو</p>
                            </div>
                            <button
                                onClick={() => setExpandedChart(null)}
                                className="text-slate-500 hover:text-slate-700 transition"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 px-6 py-4">
                            <div className="w-full h-[440px] min-w-0 p-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={expandedChart.data}
                                        margin={{ top: 18, right: 8, bottom: 10, left: 10 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="vehicleType"
                                            tickMargin={10}
                                            tick={{ fill: '#475569', fontSize: 13, dy: 4 }}
                                            axisLine={{ stroke: '#cbd5f5' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tickFormatter={(value) => formatCurrencyCompact(Number(value))}
                                            tickMargin={18}
                                            width={110}
                                            tick={{ fill: '#475569', fontSize: 13, dx: -6, textAnchor: 'end' }}
                                            axisLine={{ stroke: '#cbd5f5' }}
                                            tickLine={false}
                                            mirror
                                            padding={{ left: 40 }}
                                        />
                                        <Tooltip
                                            formatter={(value: any, _name, item) => {
                                                const payload = item?.payload as typeof expandedChart.data[number];
                                                const formattedValue = formatCurrency(Number(value), 0);
                                                const sample = payload?.sampleSize ?? 0;
                                                return [`${formattedValue} (سفر: ${sample})`, 'میانگین کرایه (ریال)'];
                                            }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: 20 }} />
                                        <Bar dataKey="meanFare" name="میانگین کرایه (ریال)" fill="#0284c7" barSize={26}>
                                            <LabelList
                                                dataKey="meanFare"
                                                position="top"
                                                offset={14}
                                                formatter={(value: any) =>
                                                    value !== null && value !== undefined
                                                        ? formatCurrency(Number(value), 0)
                                                        : '—'
                                                }
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-right">
                            <button
                                onClick={() => setExpandedChart(null)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition text-sm"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransportDashboard;
