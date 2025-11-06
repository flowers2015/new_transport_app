import React, { useState, useEffect } from 'react';
import { User, FreightLineType } from '../types';
import TransportDashboard from './TransportDashboard';

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
        const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/statistics?${params.toString()}`, { headers });
        
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

            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/representative-statistics?${params.toString()}`, { headers });
            
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

            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/representative-details?${params.toString()}`, { headers });
            
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


    useEffect(() => {
        fetchStatistics();
        fetchRepresentativeStatistics();
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
        />
    );
};

export default TransportDashboardContainer;

