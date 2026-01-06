import React, { useEffect, useState } from 'react';
import VehicleManagement from './dashboards/VehicleDashboard';
import { Branch, Vehicle } from '../types';
import { getApiUrl } from '../utils/apiConfig';

const VehiclesPage: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchData = async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` } as any;
            
            if (forceRefresh) {
                // Force refresh - bypass cache
                const [vehiclesRes, branchesRes] = await Promise.all([
                    fetch(getApiUrl('vehicles'), { headers }),
                    fetch(getApiUrl('branches'), { headers })
                ]);
                const [vehiclesData, branchesData] = await Promise.all([
                    vehiclesRes.json(),
                    branchesRes.json()
                ]);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setBranches(Array.isArray(branchesData) ? branchesData : []);
            } else {
                // Use cache for initial load
                const { cachedFetch } = await import('../utils/apiCache');
                const [vehiclesData, branchesData] = await Promise.all([
                    cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000), // 10 min cache
                    cachedFetch(getApiUrl('branches'), { headers }, 10 * 60 * 1000), // 10 min cache
                ]);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setBranches(Array.isArray(branchesData) ? branchesData : []);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
        fetchData(true);
    };

    const handleAddVehicle = async (vehicle: Omit<Vehicle, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl('vehicles'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vehicle)
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'ثبت خودرو ناموفق بود');
            }
            const saved = await res.json();
            setVehicles(prev => [saved, ...prev]);
            alert('خودرو با موفقیت اضافه شد!');
        } catch (e:any) {
            alert(e.message || 'خطا در ثبت خودرو');
        }
    };

    const handleUpdateVehicle = async (id: string, vehicle: Omit<Vehicle, 'id'>) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl(`vehicles/${id}`), {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vehicle)
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'ویرایش خودرو ناموفق بود');
            }
            const updated = await res.json();
            setVehicles(prev => prev.map(v => v.id === id ? updated : v));
            // Refresh data after update
            await fetchData(true);
            alert('خودرو با موفقیت ویرایش شد!');
        } catch (e:any) {
            alert(e.message || 'خطا در ویرایش خودرو');
        }
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <VehicleManagement
            vehicles={vehicles}
            branches={branches}
            onAddVehicle={handleAddVehicle as any}
            onUpdateVehicle={handleUpdateVehicle as any}
            onRefresh={handleRefresh}
            refreshing={loading}
        />
    );
};

export default VehiclesPage;


