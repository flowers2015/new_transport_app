import React, { useState, useEffect } from 'react';
import { User, FreightLineType } from '../types';
import TransportDashboard from './TransportDashboard';
import { getApiUrl } from '../utils/apiConfig';

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
    
    // Filters
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 621);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [timeRange, setTimeRange] = useState<'day' | 'month' | 'year'>('month');

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

            const params = new URLSearchParams();
            if (selectedYear) params.append('year', selectedYear.toString());
            if (selectedMonth) params.append('month', selectedMonth.toString());
            if (selectedDay) params.append('day', selectedDay.toString());
            params.append('timeRange', timeRange);

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

            const params = new URLSearchParams();
            params.append('representativeName', representativeName);
            params.append('city', city);
            if (lineType) params.append('lineType', lineType);
            if (selectedYear) params.append('year', selectedYear.toString());
            if (selectedMonth) params.append('month', selectedMonth.toString());
            if (selectedDay) params.append('day', selectedDay.toString());
            params.append('timeRange', timeRange);

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

    const fetchLineAnalytics = async () => {
        if (!selectedYear || !selectedMonth) {
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

            const params = new URLSearchParams();
            params.append('year', selectedYear.toString());
            params.append('month', selectedMonth.toString());
            params.append('timeRange', 'month');

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
        fetchRepresentativeStatistics();
        fetchLineAnalytics();
    }, [selectedYear, selectedMonth, selectedDay, timeRange]);

    return (
        <TransportDashboard
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
        />
    );
};

export default TransportDashboardContainer;

