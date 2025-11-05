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

const TransportDashboardContainer: React.FC<TransportDashboardContainerProps> = ({ currentUser }) => {
    // Statistics for each line separately
    const [iceCreamStats, setIceCreamStats] = useState<StatisticsData[]>([]);
    const [dairyStats, setDairyStats] = useState<StatisticsData[]>([]);
    const [ambientStats, setAmbientStats] = useState<StatisticsData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
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

    useEffect(() => {
        fetchStatistics();
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
        />
    );
};

export default TransportDashboardContainer;

