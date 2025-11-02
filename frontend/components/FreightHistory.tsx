import React, { useState, useEffect, useMemo } from 'react';
import { FreightAnnouncement, User, FreightLineType } from '../types';
import { formatJalali } from '../utils/jalali';
import { formatCurrency } from '../utils/currency';
import { TruckIcon } from './icons/CarIcon';
import { HistoryIcon } from './icons/HistoryIcon';

interface FreightHistoryProps {
  currentUser: User;
}

interface HistoryRecord {
  id: string;
  announcementId: string;
  announcementCode: string;
  action: string;
  description: string;
  userName: string;
  timestamp: string;
  oldStatus?: string;
  newStatus?: string;
  fieldChanges: any;
  line?: string;
  originCity?: string;
  destinations?: string;
}

const FreightHistory: React.FC<FreightHistoryProps> = ({ currentUser }) => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterType, setFilterType] = useState<'all' | 'assignments' | 'returns' | 'status_changes'>('all');
  const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchHistory();
  }, [selectedDate, filterType, activeLine]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      console.log('🔍 [FreightHistory] Fetching history:', { selectedDate, filterType, activeLine });
      console.log('🔍 [FreightHistory] Token:', token ? 'exists' : 'missing');
      const response = await fetch(`http://localhost:3000/api/v1/freight-announcements/history?date=${selectedDate}&type=${filterType}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('🔍 [FreightHistory] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      } else {
        setError('خطا در دریافت تاریخچه');
      }
    } catch (error) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = useMemo(() => {
    let filtered = history;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.announcementCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.userName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by date range
    if (dateRange.start && dateRange.end) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
        return recordDate >= dateRange.start && recordDate <= dateRange.end;
      });
    }

    return filtered;
  }, [history, searchTerm, dateRange]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'ASSIGNED':
        return 'bg-green-100 text-green-800';
      case 'RETURNED_TO_USER':
        return 'bg-yellow-100 text-yellow-800';
      case 'STATUS_CHANGED':
        return 'bg-blue-100 text-blue-800';
      case 'CREATED':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'ASSIGNED':
        return 'تخصیص شده';
      case 'RETURNED_TO_USER':
        return 'عودت به کاربر';
      case 'STATUS_CHANGED':
        return 'تغییر وضعیت';
      case 'CREATED':
        return 'ایجاد شده';
      default:
        return action;
    }
  };

  if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <HistoryIcon className="w-6 h-6 mr-2 text-purple-600" />
            تاریخچه عملیات
          </h2>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button 
              onClick={fetchHistory}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              بروزرسانی
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          {/* Line Selection */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            {Object.values(FreightLineType).map(lt => (
              <button 
                key={lt} 
                onClick={() => setActiveLine(lt)} 
                className={`flex-1 px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
                  activeLine === lt ? 'bg-purple-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lt}
              </button>
            ))}
          </div>

          {/* Date Selection */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded-md"
            />
            <span className="text-sm text-gray-600">تاریخ</span>
          </div>

          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="all">همه عملیات</option>
            <option value="assignments">تخصیص‌ها</option>
            <option value="returns">عودت‌ها</option>
            <option value="status_changes">تغییر وضعیت</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="جستجو در کد اعلام بار، توضیحات، کاربر..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border rounded-md flex-1 min-w-64"
          />
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center gap-4 mb-4 p-4 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-blue-800">بازه زمانی:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 border rounded-md"
          />
          <span className="text-sm text-blue-600">تا</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 border rounded-md"
          />
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600">
          تعداد نتایج: {filteredHistory.length} از {history.length}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs uppercase bg-gray-50">
              <tr>
                <th className="p-2">زمان</th>
                <th className="p-2">کد اعلام بار</th>
                <th className="p-2">عملیات</th>
                <th className="p-2">توضیحات</th>
                <th className="p-2">کاربر</th>
                <th className="p-2">وضعیت قبلی</th>
                <th className="p-2">وضعیت جدید</th>
                <th className="p-2">مبدا</th>
                <th className="p-2">مقاصد</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((record) => (
                <tr key={record.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{formatJalali(record.timestamp)}</td>
                  <td className="p-2 font-mono">{record.announcementCode}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${getActionColor(record.action)}`}>
                      {getActionText(record.action)}
                    </span>
                  </td>
                  <td className="p-2">{record.description}</td>
                  <td className="p-2">{record.userName}</td>
                  <td className="p-2">{record.oldStatus || '-'}</td>
                  <td className="p-2">{record.newStatus || '-'}</td>
                  <td className="p-2">{record.originCity || '-'}</td>
                  <td className="p-2">{record.destinations || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredHistory.length === 0 && (
          <div className="text-center p-8 text-gray-500">
            {history.length === 0 
              ? 'تاریخچه‌ای برای تاریخ انتخاب شده موجود نیست.'
              : 'هیچ نتیجه‌ای برای فیلترهای انتخاب شده یافت نشد.'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default FreightHistory;