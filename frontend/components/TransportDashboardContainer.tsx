import React, { useState, useEffect } from 'react';
import { User, FreightLineType } from '../types';
import TransportDashboard from './TransportDashboard';
import { getApiUrl } from '../utils/apiConfig';
import { gregorianToJalali, jalaliToGregorian } from '../utils/jalali';

interface TransportDashboardContainerProps {
    currentUser: User;
}

interface StatisticsData {
    timePeriod: string;
    totalRequests: number;
    companyAssignments: number;
    personalAssignments: number;
    totalAssignments: number;
    successRate: number;
}

interface RepresentativeStatisticsData {
    representativeName: string;
    city: string;
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
    assignedAt: string | null;
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
    destinationCity: string;
    unitType: 'carton' | 'ton';
    unitLabel: string;
    current: LineAnalyticsCurrentStats;
    comparisons: LineAnalyticsComparison[];
    chartData: LineAnalyticsChartPoint[];
}

interface LineAnalyticsResponse {
    meta: {
        lineTypes: string[];
        year: number;
        month: number;
        timeRange: string;
        periods: LineAnalyticsPeriodMeta[];
    };
    data: LineAnalyticsItem[];
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
    byVehicleType: AssignmentStatisticsByVehicleType[];
    vehicleTypeComparisons?: { [vehicleType: string]: AssignmentStatisticsVehicleTypeComparison };
    monthlyComparison: AssignmentStatisticsMonthlyComparison[];
    dateRange: {
        start: string;
        end: string;
        monthsDiff: number;
    };
}

const TransportDashboardContainer: React.FC<TransportDashboardContainerProps> = ({ currentUser }) => {
    // Statistics for each line separately
    const [iceCreamStats, setIceCreamStats] = useState<StatisticsData[]>([]);
    const [dairyStats, setDairyStats] = useState<StatisticsData[]>([]);
    const [ambientStats, setAmbientStats] = useState<StatisticsData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Representative statistics
    const [representativeStats, setRepresentativeStats] = useState<RepresentativeStatisticsData[]>([]);
    const [representativeStatsLoading, setRepresentativeStatsLoading] = useState(false);
    const [representativeStatsError, setRepresentativeStatsError] = useState<string | null>(null);

    const [lineAnalytics, setLineAnalytics] = useState<LineAnalyticsItem[]>([]);
    const [lineAnalyticsMeta, setLineAnalyticsMeta] = useState<LineAnalyticsResponse['meta'] | null>(null);
    const [lineAnalyticsLoading, setLineAnalyticsLoading] = useState(false);
    const [lineAnalyticsError, setLineAnalyticsError] = useState<string | null>(null);
    
    // Filters - برای خطوط (قدیمی)
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 621);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [timeRange, setTimeRange] = useState<'day' | 'month' | 'year'>('month');

    // Helper function برای محاسبه اول و آخر ماه جاری (شمسی)
    const getCurrentMonthJalaliRange = (): { startDate: string; endDate: string } => {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        const startDate = `${jy}/${String(jm).padStart(2, '0')}/01`;
        // آخر ماه - محاسبه آخرین روز ماه شمسی
        // ماه‌های 1-6: 31 روز، ماه‌های 7-11: 30 روز، ماه 12: 29 یا 30 روز (بسته به کبیسه بودن)
        let lastDay = 30;
        if (jm <= 6) {
            lastDay = 31;
        } else if (jm === 12) {
            // سال کبیسه: ((year + 2346) % 128) < 29
            const isLeap = ((jy + 2346) % 128) < 29;
            lastDay = isLeap ? 30 : 29;
        }
        const endDate = `${jy}/${String(jm).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;
        return { startDate, endDate };
    };

    // State برای تاریخ‌های شمسی (representatives و analytics)
    const [representativeStartDate, setRepresentativeStartDate] = useState<string>(() => getCurrentMonthJalaliRange().startDate);
    const [representativeEndDate, setRepresentativeEndDate] = useState<string>(() => getCurrentMonthJalaliRange().endDate);
    const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(() => getCurrentMonthJalaliRange().startDate);
    const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(() => getCurrentMonthJalaliRange().endDate);
    
    // State برای lines tab (آمار تخصیص)
    const [lineStartDate, setLineStartDate] = useState<string>(() => getCurrentMonthJalaliRange().startDate);
    const [lineEndDate, setLineEndDate] = useState<string>(() => getCurrentMonthJalaliRange().endDate);
    const [selectedLine, setSelectedLine] = useState<string | null>(null);
    const [lineStats, setLineStats] = useState<StatisticsData[]>([]);
    const [lineStatsLoading, setLineStatsLoading] = useState(false);
    const [lineStatsError, setLineStatsError] = useState<string | null>(null);
    
    // State برای آمار تفصیلی تخصیص (assignment statistics)
    const [assignmentStatistics, setAssignmentStatistics] = useState<AssignmentStatisticsResponse | null>(null);
    const [assignmentStatisticsLoading, setAssignmentStatisticsLoading] = useState(false);
    const [assignmentStatisticsError, setAssignmentStatisticsError] = useState<string | null>(null);

    // Helper function برای تبدیل تاریخ شمسی به year/month/day برای API
    const parseJalaliDateToAPI = (jalaliDate: string): { year: number; month: number; day: number } | null => {
        const match = jalaliDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (!match) return null;
        return {
            year: parseInt(match[1], 10),
            month: parseInt(match[2], 10),
            day: parseInt(match[3], 10)
        };
    };

    // Helper function برای تشخیص timeRange از startDate و endDate
    const detectTimeRange = (startDate: string, endDate: string): 'day' | 'month' | 'year' => {
        const start = parseJalaliDateToAPI(startDate);
        const end = parseJalaliDateToAPI(endDate);
        if (!start || !end) return 'month';
        
        if (start.year === end.year && start.month === end.month && start.day === end.day) {
            return 'day';
        } else if (start.year === end.year && start.month === end.month) {
            return 'month';
        } else {
            return 'year';
        }
    };

    const fetchStatisticsForLine = async (lineType: string) => {
        const token = localStorage.getItem('token');
        const headers: HeadersInit = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const params = new URLSearchParams();
        // برای آمار روزانه (timeRange = 'day'):
        // - اگر year و month انتخاب شده‌اند: ارسال کن (برای آمار روزانه یک ماه خاص)
        // - اگر انتخاب نشده‌اند: ارسال نکن (برای آمار روزانه زنده - امروز)
        // برای آمار ماهانه/سالانه (timeRange = 'month' or 'year'): همیشه ارسال کن
        console.log(`📊 [fetchStatisticsForLine] Filters: timeRange=${timeRange}, selectedYear=${selectedYear}, selectedMonth=${selectedMonth}, selectedDay=${selectedDay}, lineType=${lineType}`);
        if (timeRange === 'day') {
          // فقط اگر year و month انتخاب شده‌اند، ارسال کن
          if (selectedYear && selectedMonth) {
            params.append('year', selectedYear.toString());
            params.append('month', selectedMonth.toString());
            if (selectedDay) params.append('day', selectedDay.toString());
            console.log(`📊 [fetchStatisticsForLine] Daily historical: sending year=${selectedYear}, month=${selectedMonth}`);
          } else {
            console.log(`📊 [fetchStatisticsForLine] Daily live: not sending date filters (year=${selectedYear}, month=${selectedMonth})`);
          }
          // اگر year یا month انتخاب نشده، چیزی ارسال نمی‌کنیم (آمار زنده)
        } else {
          // برای آمار ماهانه/سالانه: همیشه ارسال کن
          if (selectedYear) params.append('year', selectedYear.toString());
          if (selectedMonth) params.append('month', selectedMonth.toString());
          if (selectedDay) params.append('day', selectedDay.toString());
        }
        params.append('lineType', lineType);
        params.append('timeRange', timeRange);

        console.log(`📊 [fetchStatisticsForLine] Final URL params: ${params.toString()}`);
        const res = await fetch(getApiUrl(`freight-announcements/statistics?${params.toString()}`), { headers });
        
        if (!res.ok) {
            throw new Error('خطا در دریافت آمار');
        }
        
        return await res.json();
    };

    const fetchStatistics = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Fetch statistics for each line separately
            const [iceCream, dairy, ambient] = await Promise.all([
                fetchStatisticsForLine(FreightLineType.IceCream),
                fetchStatisticsForLine(FreightLineType.Dairy),
                fetchStatisticsForLine(FreightLineType.Ambient)
            ]);
            
            console.log('📊 [TransportDashboard] Statistics received:', { iceCream, dairy, ambient });
            console.log('📊 [TransportDashboard] IceCream length:', iceCream?.length, 'Data:', iceCream);
            console.log('📊 [TransportDashboard] Dairy length:', dairy?.length, 'Data:', dairy);
            console.log('📊 [TransportDashboard] Ambient length:', ambient?.length, 'Data:', ambient);
            setIceCreamStats(Array.isArray(iceCream) ? iceCream : []);
            setDairyStats(Array.isArray(dairy) ? dairy : []);
            setAmbientStats(Array.isArray(ambient) ? ambient : []);
        } catch (err: any) {
            console.error('❌ [TransportDashboard] Failed to fetch statistics:', err);
            setError(err.message || 'خطا در دریافت آمار');
        } finally {
            setLoading(false);
        }
    };

    const fetchRepresentativeStatistics = async () => {
        try {
            setRepresentativeStatsLoading(true);
            setRepresentativeStatsError(null);
            
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // تبدیل تاریخ‌های شمسی به پارامترهای API
            const start = parseJalaliDateToAPI(representativeStartDate);
            const detectedTimeRange = detectTimeRange(representativeStartDate, representativeEndDate);

            const params = new URLSearchParams();
            if (start) {
                params.append('year', start.year.toString());
                params.append('month', start.month.toString());
                params.append('day', start.day.toString());
            }
            params.append('timeRange', detectedTimeRange);

            const res = await fetch(getApiUrl(`freight-announcements/representative-statistics?${params.toString()}`), { headers });
            
            if (!res.ok) {
                throw new Error('خطا در دریافت آمار نمایندگان');
            }
            
            const data = await res.json();
            setRepresentativeStats(Array.isArray(data) ? data : []);
        } catch (err: any) {
            console.error('❌ [RepresentativeStatistics] Failed to fetch:', err);
            setRepresentativeStatsError(err.message || 'خطا در دریافت آمار نمایندگان');
        } finally {
            setRepresentativeStatsLoading(false);
        }
    };

    const fetchRepresentativeDetails = async (representativeName: string, city: string, lineType?: string): Promise<RepresentativeDetailData[]> => {
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // تبدیل تاریخ‌های شمسی به پارامترهای API
            const start = parseJalaliDateToAPI(representativeStartDate);
            const detectedTimeRange = detectTimeRange(representativeStartDate, representativeEndDate);

            const params = new URLSearchParams();
            params.append('representativeName', representativeName);
            params.append('city', city);
            if (lineType) params.append('lineType', lineType);
            if (start) {
                params.append('year', start.year.toString());
                params.append('month', start.month.toString());
                params.append('day', start.day.toString());
            }
            params.append('timeRange', detectedTimeRange);

            const res = await fetch(getApiUrl(`freight-announcements/representative-details?${params.toString()}`), { headers });
            
            if (!res.ok) {
                throw new Error('خطا در دریافت جزئیات نماینده');
            }
            
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (err: any) {
            console.error('❌ [RepresentativeDetails] Failed to fetch:', err);
            throw err;
        }
    };

    const fetchLineStatistics = async (lineType: string, startDate: string, endDate: string) => {
        const start = parseJalaliDateToAPI(startDate);
        const end = parseJalaliDateToAPI(endDate);
        if (!start || !end) {
            setLineStats([]);
            setLineStatsError(null);
            setAssignmentStatistics(null);
            setAssignmentStatisticsError(null);
            return;
        }

        try {
            setLineStatsLoading(true);
            setLineStatsError(null);
            setAssignmentStatisticsLoading(true);
            setAssignmentStatisticsError(null);

            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // Fetch from assignment-statistics endpoint (new endpoint for finalized assignments)
            const assignmentParams = new URLSearchParams();
            assignmentParams.append('startYear', start.year.toString());
            assignmentParams.append('startMonth', start.month.toString());
            assignmentParams.append('startDay', start.day.toString());
            assignmentParams.append('endYear', end.year.toString());
            assignmentParams.append('endMonth', end.month.toString());
            assignmentParams.append('endDay', end.day.toString());
            if (lineType && lineType !== 'all') {
                assignmentParams.append('lineType', lineType);
            }

            const assignmentRes = await fetch(getApiUrl(`freight-announcements/assignment-statistics?${assignmentParams.toString()}`), { headers });
            
            if (!assignmentRes.ok) {
                const errorData = await assignmentRes.json().catch(() => ({}));
                if (assignmentRes.status === 400 && errorData.message?.includes('12 ماه')) {
                    throw new Error(errorData.message || 'بازه زمانی انتخاب شده بیش از 12 ماه است');
                }
                throw new Error('خطا در دریافت آمار تفصیلی تخصیص');
            }

            const assignmentData: AssignmentStatisticsResponse = await assignmentRes.json();
            setAssignmentStatistics(assignmentData);
            
            // Convert assignment statistics timeBased to StatisticsData format for backward compatibility
            // شامل همه فیلدها از جمله assignmentPercentagesByDay و assignmentByDay
            const convertedStats: StatisticsData[] = assignmentData.timeBased.map(item => ({
                timePeriod: item.timePeriod,
                totalRequests: item.totalRequests,
                companyAssignments: item.companyAssignments,
                personalAssignments: item.personalAssignments,
                totalAssignments: item.totalAssignments,
                successRate: item.successRate,
                leftoverFromPrevious: item.leftoverFromPrevious || 0,
                assignmentByDay: item.assignmentByDay || {},
                assignmentPercentagesByDay: item.assignmentPercentagesByDay || {},
                totalAssigned: item.totalAssigned || 0
            }));
            setLineStats(convertedStats);

        } catch (err: any) {
            console.error('❌ [LineStatistics] Failed to fetch:', err);
            const errorMessage = err.message || 'خطا در دریافت آمار خط';
            setLineStatsError(errorMessage);
            setAssignmentStatisticsError(errorMessage);
            setLineStats([]);
            setAssignmentStatistics(null);
        } finally {
            setLineStatsLoading(false);
            setAssignmentStatisticsLoading(false);
        }
    };

    const fetchLineAnalytics = async () => {
        const start = parseJalaliDateToAPI(analyticsStartDate);
        const end = parseJalaliDateToAPI(analyticsEndDate);
        if (!start || !end) {
            setLineAnalytics([]);
            setLineAnalyticsMeta(null);
            setLineAnalyticsError(null);
            return;
        }

        try {
            setLineAnalyticsLoading(true);
            setLineAnalyticsError(null);

            const token = localStorage.getItem('token');
            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const detectedTimeRange = detectTimeRange(analyticsStartDate, analyticsEndDate);

            const params = new URLSearchParams();
            params.append('startYear', start.year.toString());
            params.append('startMonth', start.month.toString());
            params.append('startDay', start.day.toString());
            params.append('endYear', end.year.toString());
            params.append('endMonth', end.month.toString());
            params.append('endDay', end.day.toString());
            params.append('timeRange', detectedTimeRange);

            const res = await fetch(getApiUrl(`freight-announcements/line-analytics?${params.toString()}`), { headers });

            if (!res.ok) {
                throw new Error('خطا در دریافت آنالیز لاین');
            }

            const data: LineAnalyticsResponse = await res.json();
            setLineAnalytics(Array.isArray(data?.data) ? data.data : []);
            setLineAnalyticsMeta(data?.meta || null);
        } catch (err: any) {
            console.error('❌ [LineAnalytics] Failed to fetch:', err);
            setLineAnalyticsError(err.message || 'خطا در دریافت آنالیز لاین');
        } finally {
            setLineAnalyticsLoading(false);
        }
    };


    useEffect(() => {
        fetchStatistics();
    }, [selectedYear, selectedMonth, selectedDay, timeRange]);

    // Remove auto-fetch - only fetch on search button click

    return (
        <TransportDashboard
            currentUser={currentUser}
                iceCreamStats={iceCreamStats}
                dairyStats={dairyStats}
                ambientStats={ambientStats}
                loading={loading}
                error={error}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                selectedDay={selectedDay}
                timeRange={timeRange}
                onYearChange={setSelectedYear}
                onMonthChange={setSelectedMonth}
                onDayChange={setSelectedDay}
                onTimeRangeChange={setTimeRange}
                onRefresh={fetchStatistics}
                representativeStats={representativeStats}
                representativeStatsLoading={representativeStatsLoading}
                representativeStatsError={representativeStatsError}
                onFetchRepresentativeDetails={fetchRepresentativeDetails}
                lineAnalytics={lineAnalytics}
                lineAnalyticsMeta={lineAnalyticsMeta}
                lineAnalyticsLoading={lineAnalyticsLoading}
                lineAnalyticsError={lineAnalyticsError}
                representativeStartDate={representativeStartDate}
                representativeEndDate={representativeEndDate}
                onRepresentativeStartDateChange={setRepresentativeStartDate}
                onRepresentativeEndDateChange={setRepresentativeEndDate}
                analyticsStartDate={analyticsStartDate}
                analyticsEndDate={analyticsEndDate}
                onAnalyticsStartDateChange={setAnalyticsStartDate}
                onAnalyticsEndDateChange={setAnalyticsEndDate}
                lineStartDate={lineStartDate}
                lineEndDate={lineEndDate}
                onLineStartDateChange={setLineStartDate}
                onLineEndDateChange={setLineEndDate}
                selectedLine={selectedLine}
                onSelectedLineChange={setSelectedLine}
                lineStats={lineStats}
                lineStatsLoading={lineStatsLoading}
                lineStatsError={lineStatsError}
                assignmentStatistics={assignmentStatistics}
                assignmentStatisticsLoading={assignmentStatisticsLoading}
                assignmentStatisticsError={assignmentStatisticsError}
                onFetchLineStatistics={fetchLineStatistics}
                onFetchRepresentativeStatistics={fetchRepresentativeStatistics}
                onFetchLineAnalytics={fetchLineAnalytics}
            />
    );
};

export default TransportDashboardContainer;

