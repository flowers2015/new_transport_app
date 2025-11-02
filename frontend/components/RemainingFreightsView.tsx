import React, { useState, useEffect } from 'react';
import { FreightAnnouncement, FreightAnnouncementStatus } from '../types';
import { formatJalali } from '../utils/jalali';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshIcon } from './icons/RefreshIcon';

interface RemainingFreightsViewProps {
  onDelete: (id: string) => Promise<void>;
  onReAnnounce: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const RemainingFreightsView: React.FC<RemainingFreightsViewProps> = ({
  onDelete,
  onReAnnounce,
  onRefresh
}) => {
  const [remainingFreights, setRemainingFreights] = useState<FreightAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reAnnouncingId, setReAnnouncingId] = useState<string | null>(null);

  const fetchRemainingFreights = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Check if token is expired
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < now) {
            console.log('❌ [RemainingFreights] Token expired');
            alert('جلسه شما منقضی شده است. لطفاً دوباره وارد شوید.');
            window.location.href = '/login';
            return;
          }
        } catch (e) {
          console.log('❌ [RemainingFreights] Invalid token format');
        }
      }
      
      const response = await fetch('/api/v1/freight-announcements/remaining', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRemainingFreights(data);
      } else {
        console.error('Failed to fetch remaining freights');
      }
    } catch (error) {
      console.error('Error fetching remaining freights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRemainingFreights();
  }, []);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('آیا از حذف این بار اطمینان دارید؟');
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await onDelete(id);
      await fetchRemainingFreights(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete freight:', error);
      alert('خطا در حذف بار. لطفاً دوباره تلاش کنید.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReAnnounce = async (id: string) => {
    const confirmed = window.confirm('آیا از اعلام مجدد این بار اطمینان دارید؟');
    if (!confirmed) return;

    setReAnnouncingId(id);
    try {
      await onReAnnounce(id);
      await fetchRemainingFreights(); // Refresh the list
    } catch (error) {
      console.error('Failed to re-announce freight:', error);
      alert('خطا در اعلام مجدد بار. لطفاً دوباره تلاش کنید.');
    } finally {
      setReAnnouncingId(null);
    }
  };

  const handleRefresh = async () => {
    await onRefresh();
    await fetchRemainingFreights();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="mr-2">در حال بارگذاری...</span>
      </div>
    );
  }

  if (remainingFreights.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>هیچ بار مانده‌ای وجود ندارد</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshIcon className="w-4 h-4 inline ml-2" />
          بروزرسانی
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">
          بارهای مانده ({remainingFreights.length})
        </h3>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshIcon className="w-4 h-4" />
          بروزرسانی
        </button>
      </div>

      <div className="grid gap-4">
        {remainingFreights.map((freight) => (
          <div
            key={freight.id}
            className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-800">
                  {freight.announcementCode}
                </h4>
                <p className="text-sm text-gray-600">
                  {freight.lineType} - {freight.vehicleType}
                </p>
                <p className="text-sm text-gray-500">
                  تاریخ بارگیری: {formatJalali(freight.loadingDate)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReAnnounce(freight.id)}
                  disabled={reAnnouncingId === freight.id}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <RefreshIcon className="w-4 h-4" />
                  {reAnnouncingId === freight.id ? 'در حال...' : 'اعلام مجدد'}
                </button>
                <button
                  onClick={() => handleDelete(freight.id)}
                  disabled={deletingId === freight.id}
                  className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <TrashIcon className="w-4 h-4" />
                  {deletingId === freight.id ? 'در حال...' : 'حذف'}
                </button>
              </div>
            </div>

            {freight.destinations && freight.destinations.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">مقاصد:</p>
                <div className="space-y-1">
                  {freight.destinations.map((dest, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      {dest.city} - {dest.representativeName}
                      {dest.tonnage && ` (${dest.tonnage} کیلوگرم)`}
                      {dest.freightCost && ` - ${dest.freightCost.toLocaleString('fa-IR')} تومان`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {freight.notes && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-1">یادداشت:</p>
                <p className="text-sm text-gray-600">{freight.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RemainingFreightsView;
