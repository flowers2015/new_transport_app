import React, { useState, useMemo } from 'react';
import { Part } from '../types';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon';
import { formatJalali } from '../utils/jalali';

interface InventoryManagementProps {
    parts: Part[];
    onAddPart: (part: Omit<Part, 'id'| 'quantityInStock'>) => void;
}

const InventoryManagement: React.FC<InventoryManagementProps> = ({ parts, onAddPart }) => {
    const [newPart, setNewPart] = useState({
        partNumber: '',
        name: '',
        price: '',
        minStockLevel: '',
        location: '',
        warehouseCode: '',
        batchNumber: '',
        expiryDate: '',
    });
    const [searchTerm, setSearchTerm] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewPart(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(newPart.price);
        const minStockLevel = parseInt(newPart.minStockLevel, 10);

        if (newPart.name.trim() && newPart.partNumber.trim() && !isNaN(price) && !isNaN(minStockLevel)) {
            onAddPart({
                partNumber: newPart.partNumber.trim(),
                name: newPart.name.trim(),
                price,
                minStockLevel,
                location: newPart.location.trim(),
                warehouseCode: newPart.warehouseCode.trim(),
                batchNumber: newPart.batchNumber.trim(),
                expiryDate: newPart.expiryDate ? new Date(newPart.expiryDate) : undefined,
            });
            setNewPart({ partNumber: '', name: '', price: '', minStockLevel: '', location: '', warehouseCode: '', batchNumber: '', expiryDate: '' });
        }
    };
    
    const filteredParts = useMemo(() => {
        const sorted = [...parts].sort((a,b) => a.name.localeCompare(b.name));
        if (!searchTerm) return sorted;
        return sorted.filter(part => 
            part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            part.partNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, parts]);
    
    const today = new Date();
    today.setHours(0,0,0,0);

    return (
        <div className="max-w-7xl mx-auto">
            <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <ArchiveBoxIcon className="w-6 h-6 mr-2 text-sky-600" />
                    افزودن قطعه جدید به انبار
                </h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700">نام قطعه</label>
                        <input type="text" name="name" value={newPart.name} onChange={handleChange} className="mt-1 w-full input-style" required />
                    </div>
                     <div>
                        <label htmlFor="partNumber" className="block text-sm font-medium text-slate-700">شماره قطعه</label>
                        <input type="text" name="partNumber" value={newPart.partNumber} onChange={handleChange} className="mt-1 w-full input-style" required />
                    </div>
                    <div>
                        <label htmlFor="price" className="block text-sm font-medium text-slate-700">قیمت (تومان)</label>
                        <input type="number" name="price" value={newPart.price} onChange={handleChange} className="mt-1 w-full input-style" required />
                    </div>
                     <div>
                        <label htmlFor="minStockLevel" className="block text-sm font-medium text-slate-700">حداقل موجودی</label>
                        <input type="number" name="minStockLevel" value={newPart.minStockLevel} onChange={handleChange} className="mt-1 w-full input-style" required />
                    </div>
                    <div>
                        <label htmlFor="location" className="block text-sm font-medium text-slate-700">مکان انبار</label>
                        <input type="text" name="location" value={newPart.location} onChange={handleChange} placeholder="مثال: A-5" className="mt-1 w-full input-style" />
                    </div>
                    <div>
                        <label htmlFor="warehouseCode" className="block text-sm font-medium text-slate-700">کد انبار</label>
                        <input type="text" name="warehouseCode" value={newPart.warehouseCode} onChange={handleChange} placeholder="مثال: WH-FIL-01" className="mt-1 w-full input-style" />
                    </div>
                    <div>
                        <label htmlFor="batchNumber" className="block text-sm font-medium text-slate-700">شماره بچ</label>
                        <input type="text" name="batchNumber" value={newPart.batchNumber} onChange={handleChange} className="mt-1 w-full input-style" />
                    </div>
                    <div>
                        <label htmlFor="expiryDate" className="block text-sm font-medium text-slate-700">تاریخ انقضا</label>
                        <input type="date" name="expiryDate" value={newPart.expiryDate} onChange={handleChange} className="mt-1 w-full input-style" />
                    </div>
                    <button type="submit" className="lg:col-start-5 px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">
                        افزودن
                    </button>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">موجودی انبار</h2>
                    <input
                        type="text"
                        placeholder="جستجو بر اساس نام یا شماره قطعه..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">نام قطعه</th>
                                <th scope="col" className="px-6 py-3">شماره قطعه</th>
                                <th scope="col" className="px-6 py-3">کد انبار</th>
                                <th scope="col" className="px-6 py-3">مکان</th>
                                <th scope="col" className="px-6 py-3">تاریخ انقضا</th>
                                <th scope="col" className="px-6 py-3">موجودی فعلی</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredParts.length > 0 ? filteredParts.map(part => {
                                const isExpired = part.expiryDate && new Date(part.expiryDate) < today;
                                const isLowStock = part.quantityInStock < part.minStockLevel;
                                const rowClass = isExpired ? 'bg-orange-50' : (isLowStock ? 'bg-red-50' : 'bg-white');

                                return (
                                <tr key={part.id} className={`border-b hover:bg-gray-50 ${rowClass}`}>
                                    <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{part.name}</th>
                                    <td className="px-6 py-4 font-mono text-slate-600">{part.partNumber}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600">{part.warehouseCode || '-'}</td>
                                    <td className="px-6 py-4">{part.location || '-'}</td>
                                    <td className={`px-6 py-4 ${isExpired ? 'text-orange-600 font-bold' : ''}`}>
                                        {part.expiryDate ? formatJalali(new Date(part.expiryDate)) : '-'}
                                    </td>
                                    <td className={`px-6 py-4 font-bold ${isLowStock ? 'text-red-600' : 'text-slate-700'}`}>{part.quantityInStock} عدد</td>
                                </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-6 text-slate-500">هیچ قطعه‌ای یافت نشد.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default InventoryManagement;