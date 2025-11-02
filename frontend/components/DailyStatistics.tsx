import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { formatJalali } from '../utils/jalali';

interface DailyStatisticsProps {
  currentUser: User;
}

interface DailyStats {
  date: string;
  totalAnnouncements: number;
  assignedCount: number;
  unassignedCount: number;
  newCount: number;
  carriedOverCount: number;
  successRate: number;
}

const DailyStatistics: React.FC<DailyStatisticsProps> = ({ currentUser }) => {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchDailyStatistics();
  }, [selectedDate]);

  const fetchDailyStatistics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/v1/statistics/daily?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('خطا در دریافت آمار روزانه');
      }
    } catch (error) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">آمار روزانه</h2>
          <div className="flex gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded-md"
            />
            <button 
              onClick={fetchDailyStatistics}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              بروزرسانی
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800">کل اعلام بارها</h3>
            <p className="text-2xl font-bold text-blue-900">
              {stats.reduce((sum, stat) => sum + stat.totalAnnouncements, 0)}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800">تخصیص شده</h3>
            <p className="text-2xl font-bold text-green-900">
              {stats.reduce((sum, stat) => sum + stat.assignedCount, 0)}
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800">تخصیص نشده</h3>
            <p className="text-2xl font-bold text-yellow-900">
              {stats.reduce((sum, stat) => sum + stat.unassignedCount, 0)}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-purple-800">نرخ موفقیت</h3>
            <p className="text-2xl font-bold text-purple-900">
              {stats.length > 0 ? Math.round(stats.reduce((sum, stat) => sum + stat.successRate, 0) / stats.length) : 0}%
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs uppercase bg-gray-50">
              <tr>
                <th className="p-2">تاریخ</th>
                <th className="p-2">کل اعلام بارها</th>
                <th className="p-2">تخصیص شده</th>
                <th className="p-2">تخصیص نشده</th>
                <th className="p-2">جدید</th>
                <th className="p-2">مانده از قبل</th>
                <th className="p-2">نرخ موفقیت</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="p-2">{formatJalali(stat.date)}</td>
                  <td className="p-2">{stat.totalAnnouncements.toLocaleString('fa-IR')}</td>
                  <td className="p-2 text-green-600">{stat.assignedCount.toLocaleString('fa-IR')}</td>
                  <td className="p-2 text-red-600">{stat.unassignedCount.toLocaleString('fa-IR')}</td>
                  <td className="p-2 text-blue-600">{stat.newCount.toLocaleString('fa-IR')}</td>
                  <td className="p-2 text-yellow-600">{stat.carriedOverCount.toLocaleString('fa-IR')}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      stat.successRate >= 80 ? 'bg-green-100 text-green-800' :
                      stat.successRate >= 60 ? 'bg-yellow-100 text-yellow-800' :
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

        {stats.length === 0 && (
          <div className="text-center p-8 text-gray-500">
            آمار برای تاریخ انتخاب شده موجود نیست.
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyStatistics;
