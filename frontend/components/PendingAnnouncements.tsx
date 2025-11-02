import React, { useState, useEffect } from 'react';
import { FreightAnnouncement, User } from '../types';
import { formatJalali } from '../utils/jalali';
import { formatCurrency } from '../utils/currency';

interface PendingAnnouncementsProps {
  currentUser: User;
  onRefresh?: () => void;
}

const PendingAnnouncements: React.FC<PendingAnnouncementsProps> = ({ currentUser, onRefresh }) => {
  const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPendingAnnouncements();
  }, []);

  const fetchPendingAnnouncements = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/v1/planning/pending-announcements', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data);
      } else {
        setError('خطا در دریافت بارهای مانده');
      }
    } catch (error) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const confirmMessage = `آیا مطمئنید که می‌خواهید ${selectedIds.size} اعلام بار را حذف کنید؟`;
    if (!confirm(confirmMessage)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/v1/announcements/bulk-operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          operation: 'delete',
          announcementIds: Array.from(selectedIds)
        })
      });

      if (response.ok) {
        alert('اعلام بارهای انتخاب شده با موفقیت حذف شدند.');
        setSelectedIds(new Set());
        fetchPendingAnnouncements();
        onRefresh?.();
      } else {
        alert('خطا در حذف اعلام بارها');
      }
    } catch (error) {
      alert('خطا در حذف اعلام بارها');
    }
  };

  const handleReassignSelected = async () => {
    if (selectedIds.size === 0) return;

    const confirmMessage = `آیا مطمئنید که می‌خواهید ${selectedIds.size} اعلام بار را برای ارجاع مجدد ارسال کنید؟`;
    if (!confirm(confirmMessage)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/v1/announcements/bulk-operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          operation: 'reassign',
          announcementIds: Array.from(selectedIds)
        })
      });

      if (response.ok) {
        alert('اعلام بارهای انتخاب شده برای ارجاع مجدد ارسال شدند.');
        setSelectedIds(new Set());
        fetchPendingAnnouncements();
        onRefresh?.();
      } else {
        alert('خطا در ارجاع مجدد اعلام بارها');
      }
    } catch (error) {
      alert('خطا در ارجاع مجدد اعلام بارها');
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === announcements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(announcements.map(a => a.id)));
    }
  };

  if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">بارهای مانده</h2>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <button 
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  حذف ({selectedIds.size})
                </button>
                <button 
                  onClick={handleReassignSelected}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  ارجاع مجدد ({selectedIds.size})
                </button>
              </>
            )}
            <button 
              onClick={fetchPendingAnnouncements}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              بروزرسانی
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs uppercase bg-gray-50">
              <tr>
                <th className="p-2">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === announcements.length && announcements.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="p-2">کد اعلام بار</th>
                <th className="p-2">تاریخ بارگیری</th>
                <th className="p-2">مبدا</th>
                <th className="p-2">نوع خودرو</th>
                <th className="p-2">کل تناژ</th>
                <th className="p-2">ارزش بار</th>
                <th className="p-2">تاریخ بازگشت</th>
                <th className="p-2">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((ann) => (
                <tr key={ann.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(ann.id)}
                      onChange={() => handleSelectRow(ann.id)}
                    />
                  </td>
                  <td className="p-2 font-mono">{ann.announcementCode}</td>
                  <td className="p-2">{formatJalali(ann.loadingDate)}</td>
                  <td className="p-2">{ann.originCity || '-'}</td>
                  <td className="p-2">{ann.vehicleType}</td>
                  <td className="p-2">{ann.totalTonnage?.toLocaleString('fa-IR') || '-'} کیلوگرم</td>
                  <td className="p-2">{formatCurrency(ann.totalValue)}</td>
                  <td className="p-2">{formatJalali(ann.updatedAt)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleDeleteSelected()}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        حذف
                      </button>
                      <button 
                        onClick={() => handleReassignSelected()}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        ارجاع مجدد
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {announcements.length === 0 && (
          <div className="text-center p-8 text-gray-500">
            هیچ اعلام بار مانده‌ای وجود ندارد.
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingAnnouncements;
