import React, { useState, useEffect } from 'react';
import { RepairOrder, RepairStatus } from '../../types';
import { formatJalaliDateTime } from '../../utils/jalali';
import { WrenchScrewdriverIcon } from '../icons/WrenchScrewdriverIcon';
import { ClockIcon } from '../icons/ClockIcon';
import { CheckCircleIcon } from '../icons/CheckCircleIcon';

interface TechnicianDashboardProps {
    onSelectOrder: (orderId: string) => void;
}

const TechnicianDashboard: React.FC<TechnicianDashboardProps> = ({ onSelectOrder }) => {
    const [myOrders, setMyOrders] = useState<RepairOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMyOrders = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    throw new Error('Authentication token not found.');
                }

                const response = await fetch('http://localhost:3000/api/v1/repair-orders/my-orders', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch assigned orders.');
                }

                const data: RepairOrder[] = await response.json();
                setMyOrders(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMyOrders();
    }, []);

    const getStatusIcon = (status: RepairStatus) => {
        switch (status) {
            case RepairStatus.New:
            case RepairStatus.Diagnosing:
            case RepairStatus.AwaitingPart:
                return <ClockIcon className="w-5 h-5 text-yellow-500" />;
            case RepairStatus.InProgress:
                return <WrenchScrewdriverIcon className="w-5 h-5 text-blue-500 animate-spin" />;
            case RepairStatus.Completed:
            case RepairStatus.Delivered:
            case RepairStatus.Closed:
                return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
            default:
                return <ClockIcon className="w-5 h-5 text-gray-400" />;
        }
    };

    if (loading) return <div className="text-center p-8">Loading your assigned repair orders...</div>;
    if (error) return <div className="text-center p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4 flex items-center">
                <WrenchScrewdriverIcon className="w-6 h-6 text-slate-500 mr-2" />
                <span>My Assigned Repair Orders</span>
            </h3>
            <div className="space-y-4">
                {myOrders.length > 0 ? (
                    myOrders.map(order => (
                        <div 
                            key={order.id} 
                            className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition"
                            onClick={() => onSelectOrder(order.id)}
                        >
                            <div className="flex justify-between items-center">
                                <p className="font-semibold text-slate-700">Order #{order.id.substring(0, 6)}</p>
                                <span className="text-sm text-slate-500">{formatJalaliDateTime(order.created_at)}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">{order.description}</p>
                            <div className="flex items-center justify-end mt-2">
                                {getStatusIcon(order.status)}
                                <span className="text-sm font-medium text-slate-600 ml-1">{order.status}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-slate-500 py-4">You have no repair orders assigned to you.</p>
                )}
            </div>
        </div>
    );
};

export default TechnicianDashboard;
