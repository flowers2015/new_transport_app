import React, { useState, useEffect } from 'react';
import { User } from '../types';
import RemainingFreightsView from './RemainingFreightsView';

interface RemainingFreightsContainerProps {
  currentUser: User;
}

const RemainingFreightsContainer: React.FC<RemainingFreightsContainerProps> = ({ currentUser }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/freight-announcements/remaining/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete freight');
      }

      const result = await response.json();
      console.log('Freight deleted:', result);
    } catch (error) {
      console.error('Error deleting freight:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleReAnnounce = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/freight-announcements/remaining/${id}/re-announce`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to re-announce freight');
      }

      const result = await response.json();
      console.log('Freight re-announced:', result);
    } catch (error) {
      console.error('Error re-announcing freight:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      // The refresh is handled by the RemainingFreightsView component
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate refresh
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">
            بارهای مانده
          </h2>
          <p className="text-sm text-gray-600">
            بارهایی که بدون تخصیص مانده‌اند و به شما برگردانده شده‌اند
          </p>
        </div>
        
        <RemainingFreightsView
          onDelete={handleDelete}
          onReAnnounce={handleReAnnounce}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
};

export default RemainingFreightsContainer;
