import React, { useEffect, useState } from 'react';
import VehicleManagement from './dashboards/VehicleDashboard';
import { Branch, Vehicle } from '../types';
import { getApiUrl } from '../utils/apiConfig';

const VehiclesPage: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` } as any;
                const { cachedFetch } = await import('../utils/apiCache');
                const [vehiclesData, branchesData] = await Promise.all([
                    cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000), // 10 min cache
                    cachedFetch(getApiUrl('branches'), { headers }, 10 * 60 * 1000), // 10 min cache
                ]);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setBranches(Array.isArray(branchesData) ? branchesData : []);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

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
        />
    );
};

export default VehiclesPage;


