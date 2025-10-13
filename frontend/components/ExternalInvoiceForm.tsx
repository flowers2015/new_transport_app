import React, { useState, useMemo } from 'react';
import { Supplier, Part, PurchaseOrder, PurchaseOrderStatus } from '../types';
import { formatJalali } from '../utils/jalali';
import { TruckIcon } from './icons/CarIcon'; 
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon';

interface PurchasingProps {
    suppliers: Supplier[];
    parts: Part[];
    purchaseOrders: PurchaseOrder[];
    onAddPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'status' | 'orderDate'>) => void;
    onReceivePO: (poId: string) => void;
}

const Purchasing: React.FC<PurchasingProps> = ({ suppliers, parts, purchaseOrders, onAddPurchaseOrder, onReceivePO }) => {
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [poItems, setPoItems] = useState<{ partId: string; quantity: number }[]>([{ partId: '', quantity: 1 }]);
    const [searchTerm, setSearchTerm] = useState('');

    const handleItemChange = (index: number, field: 'partId' | 'quantity', value: string | number) => {
        const newItems = [...poItems];
        if (field === 'quantity') {
            newItems[index][field] = Number(value);
        } else {
            newItems[index][field] = String(value);
        }
        setPoItems(newItems);
    };

    const addItem = () => setPoItems([...poItems, { partId: '', quantity: 1 }]);
    const removeItem = (index: number) => setPoItems(poItems.filter((_, i) => i !== index));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSupplier || !expectedDeliveryDate || poItems.some(item => !item.partId || item.quantity <= 0)) {
            alert('لطفا تمام فیلدهای سفارش خرید را تکمیل کنید.');
            return;
        }
        onAddPurchaseOrder({
            supplierId: selectedSupplier,
            expectedDeliveryDate: new Date(expectedDeliveryDate),
            items: poItems,
        });
        setSelectedSupplier('');
        setExpectedDeliveryDate('');
        setPoItems([{ partId: '', quantity: 1 }]);
    };
    
    const getSupplierName = (supplierId: string) => suppliers.find(s => s.id === supplierId)?.name || 'نامشخص';

    const filteredPOs = useMemo(() => {
        if (!searchTerm) return purchaseOrders;
        return purchaseOrders.filter(po => 
            getSupplierName(po.supplierId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            po.id.substring(0,6).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, purchaseOrders, suppliers]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <ArchiveBoxIcon className="w-6 h-6 mr-2 text-sky-600" />
                    ایجاد سفارش خرید جدید
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">تامین‌کننده</label>
                            <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="mt-1 w-full input-style" required>
                                <option value="">-- انتخاب تامین‌کننده --</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">تاریخ تحویل مورد انتظار</label>
                            <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="mt-1 w-full input-style" required />
                        </div>
                    </div>
                    
                    <div className="border-t pt-4 mt-4">
                        <h3 className="text-md font-semibold text-slate-700 mb-2">اقلام سفارش</h3>
                        {poItems.map((item, index) => (
                            <div key={index} className="flex items-center gap-2 mb-2">
                                <select value={item.partId} onChange={e => handleItemChange(index, 'partId', e.target.value)} className="w-full input-style">
                                    <option value="">-- انتخاب قطعه --</option>
                                    {parts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.partNumber})</option>)}
                                </select>
                                <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-32 input-style" placeholder="تعداد"/>
                                <button type="button" onClick={() => removeItem(index)} className="px-3 py-2 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 transition-colors">حذف</button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="mt-2 px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300 transition-colors">+ افزودن قلم</button>
                    </div>

                    <div className="flex justify-end pt-4 border-t mt-4">
                        <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors">ثبت سفارش</button>
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">لیست سفارش‌های خرید</h2>
                     <input
                        type="text"
                        placeholder="جستجو..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
                <div className="overflow-x-auto">
                     <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">شماره سفارش</th>
                                <th className="px-6 py-3">تامین‌کننده</th>
                                <th className="px-6 py-3">تاریخ سفارش</th>
                                <th className="px-6 py-3">وضعیت</th>
                                <th className="px-6 py-3">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPOs.map(po => (
                                <tr key={po.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono text-slate-600">#{po.id.substring(0,6)}</td>
                                    <td className="px-6 py-4">{getSupplierName(po.supplierId)}</td>
                                    <td className="px-6 py-4">{formatJalali(po.orderDate)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${po.status === PurchaseOrderStatus.Received ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {po.status === PurchaseOrderStatus.Ordered && (
                                            <button onClick={() => onReceivePO(po.id)} className="flex items-center px-3 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600 transition-colors">
                                                <TruckIcon className="w-4 h-4 ml-1"/>
                                                <span>ثبت دریافت کالا</span>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
             <style>{`.input-style { display: block; width: 100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};
export default Purchasing;
