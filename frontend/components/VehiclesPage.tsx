import React, { useEffect, useState } from 'react';
import VehicleManagement from './dashboards/VehicleDashboard';
import { Branch, Vehicle } from '../types';

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
                const [vehRes, brRes] = await Promise.all([
                    fetch('http://localhost:3000/api/v1/vehicles', { headers }),
                    fetch('http://localhost:3000/api/v1/branches', { headers }),
                ]);
                if (!vehRes.ok) throw new Error('خطا در دریافت خودروها');
                if (!brRes.ok) throw new Error('خطا در دریافت شعب');
                setVehicles(await vehRes.json());
                setBranches(await brRes.json());
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAddVehicle = async () => {
        alert('ثبت خودروی جدید فعلاً غیرفعال است. لطفاً فقط مشاهده کنید.');
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <VehicleManagement
            vehicles={vehicles}
            branches={branches}
            onAddVehicle={handleAddVehicle as any}
        />
    );
};

export default VehiclesPage;


