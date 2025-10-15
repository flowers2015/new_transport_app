import React, { useEffect, useState } from 'react';
import SupplierManagement from './SupplierManagement';
import { Supplier } from '../types';

const PurchasingPage: React.FC = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSuppliers = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('http://localhost:3000/api/v1/suppliers', {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('خطا در دریافت تامین‌کنندگان');
                setSuppliers(await res.json());
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchSuppliers();
    }, []);

    const handleAddSupplier = async () => {
        alert('افزودن تامین‌کننده از فرانت غیرفعال است.');
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <SupplierManagement suppliers={suppliers} onAddSupplier={handleAddSupplier as any} />
    );
};

export default PurchasingPage;


