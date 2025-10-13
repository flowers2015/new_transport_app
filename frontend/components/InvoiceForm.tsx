import React, { useState, useMemo } from 'react';
import { Vehicle, Part, Invoice } from '../types';
import { formatPlateNumber } from '../utils/jalali';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

type InvoiceItem = Omit<Invoice['items'][0], 'total'>;

interface InvoiceFormProps {
    vehicles: Vehicle[];
    inventory: Part[];
    onCreateInvoice: (invoiceData: Omit<Invoice, 'id' | 'status' | 'issuedAt'>) => void;
    onCancel: () => void;
}

const InvoiceForm: React.FC<InvoiceFormProps> = ({ vehicles, inventory, onCreateInvoice, onCancel }) => {
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const [items, setItems] = useState<InvoiceItem[]>([]);
    
    const [newItem, setNewItem] = useState({ partId: '', description: '', quantity: '1', price: '0' });

    const handleVehicleLookup = () => {
        if (!vehicleIdentifier) {
            setFoundVehicle(null);
            return;
        }
        const searchTerm = vehicleIdentifier.toLowerCase().replace(/ /g, '');
        const found = vehicles.find(v => 
            (v.serialNumber && v.serialNumber.toLowerCase() === searchTerm) ||
            (v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(searchTerm))
        );
        setFoundVehicle(found || null);
        if (!found) {
            alert('خودرویی با این شناسه یافت نشد.');
        }
    };
    
    const handlePartSelection = (partId: string) => {
        const part = inventory.find(p => p.id === partId);
        if (part) {
            setNewItem({
                partId: part.id,
                description: part.name,
                quantity: '1',
                price: String(part.price)
            });
        } else {
             setNewItem({ partId: '', description: '', quantity: '1', price: '0' });
        }
    };
    
    const handleAddItem = () => {
        const quantity = parseInt(newItem.quantity, 10);
        const price = parseFloat(newItem.price);
        if (!newItem.description || isNaN(quantity) || isNaN(price) || quantity <= 0 || price < 0) {
            alert('لطفا شرح، تعداد و قیمت معتبر وارد کنید.');
            return;
        }
        setItems(prev => [...prev, { ...newItem, quantity, price, partId: newItem.partId || undefined }]);
        setNewItem({ partId: '', description: '', quantity: '1', price: '0' }); // Reset form
    };
    
    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!foundVehicle) {
            alert('لطفا ابتدا یک خودرو را انتخاب کنید.');
            return;
        }
        if (items.length === 0) {
            alert('فاکتور باید حداقل یک قلم کالا/خدمات داشته باشد.');
            return;
        }

        const invoiceData = {
            vehicleId: foundVehicle.id,
            totalAmount,
            items: items.map(item => ({...item, total: item.price * item.quantity })),
        };
        onCreateInvoice(invoiceData);
    };

    return (
        <div className="max-w-6xl mx-auto bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                <DocumentTextIcon className="w-7 h-7 mr-2 text-sky-600" />
                فرم ثبت فاکتور جدید
            </h2>
            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Vehicle Selection */}
                <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                    <label className="block text-md font-bold text-slate-700">۱. انتخاب وسیله نقلیه</label>
                    <div className="flex items-end gap-2">
                        <input 
                            type="text"
                            value={vehicleIdentifier}
                            onChange={e => setVehicleIdentifier(e.target.value)}
                            placeholder="شماره پلاک یا شماره سریال خودرو را وارد کنید"
                            className="flex-grow input-style"
                            disabled={!!foundVehicle}
                        />
                        <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700" disabled={!!foundVehicle}>جستجو</button>
                    </div>
                    {foundVehicle && (
                        <div className="flex justify-between items-center p-3 bg-green-50 border border-green-200 text-green-800 rounded-md">
                            <div>
                                <p><strong>خودرو:</strong> {foundVehicle.model} ({foundVehicle.type})</p>
                                <p className="text-sm font-mono">{formatPlateNumber(foundVehicle.plateNumber)}</p>
                            </div>
                            <button type="button" onClick={() => setFoundVehicle(null)} className="text-sm text-red-600 hover:underline">تغییر خودرو</button>
                        </div>
                    )}
                </div>

                {/* Invoice Items */}
                {foundVehicle && (
                    <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                        <label className="block text-md font-bold text-slate-700">۲. اقلام فاکتور</label>
                        
                        {/* Items Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-200 text-slate-600">
                                    <tr>
                                        <th className="p-2 font-semibold text-right">ردیف</th>
                                        <th className="p-2 font-semibold text-right">شرح کالا/خدمات</th>
                                        <th className="p-2 font-semibold">تعداد</th>
                                        <th className="p-2 font-semibold">فی (ریال)</th>
                                        <th className="p-2 font-semibold text-left">قیمت کل (ریال)</th>
                                        <th className="p-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, index) => (
                                        <tr key={index} className="border-b">
                                            <td className="p-2">{index + 1}</td>
                                            <td className="p-2">{item.description}</td>
                                            <td className="p-2 text-center">{item.quantity}</td>
                                            <td className="p-2 font-mono text-center">{item.price.toLocaleString('fa-IR')}</td>
                                            <td className="p-2 font-mono text-left font-semibold">{(item.price * item.quantity).toLocaleString('fa-IR')}</td>
                                            <td className="p-2 text-center">
                                                <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700">حذف</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {items.length === 0 && <p className="text-center text-slate-500 py-4">هنوز هیچ قلمی اضافه نشده است.</p>}
                        </div>

                        {/* Add Item Form */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 border-t mt-4">
                            <div className="md:col-span-3">
                                <label className="text-xs">انتخاب از انبار (اختیاری)</label>
                                <select value={newItem.partId} onChange={e => handlePartSelection(e.target.value)} className="w-full mt-1 input-style">
                                    <option value="">-- انتخاب قطعه --</option>
                                    {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.partNumber})</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-4">
                                <label className="text-xs">شرح کالا/خدمات</label>
                                <input type="text" value={newItem.description} onChange={e => setNewItem(s => ({...s, description: e.target.value}))} className="w-full mt-1 input-style" required />
                            </div>
                             <div className="md:col-span-1">
                                <label className="text-xs">تعداد</label>
                                <input type="number" value={newItem.quantity} onChange={e => setNewItem(s => ({...s, quantity: e.target.value}))} className="w-full mt-1 input-style" min="1" required />
                            </div>
                             <div className="md:col-span-2">
                                <label className="text-xs">فی (ریال)</label>
                                <input type="number" value={newItem.price} onChange={e => setNewItem(s => ({...s, price: e.target.value}))} className="w-full mt-1 input-style" min="0" required />
                            </div>
                            <div className="md:col-span-2">
                                <button type="button" onClick={handleAddItem} className="w-full px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700">افزودن قلم</button>
                            </div>
                        </div>

                        {/* Total Amount */}
                        <div className="text-left font-bold text-xl mt-4">
                            <span>مبلغ کل: </span>
                            <span className="font-mono">{totalAmount.toLocaleString('fa-IR')} ریال</span>
                        </div>
                    </div>
                )}


                <div className="flex justify-end gap-4 pt-6 border-t">
                    <button type="button" onClick={onCancel} className="px-6 py-2 rounded-md text-sm font-medium bg-slate-200 text-slate-800 hover:bg-slate-300">
                        انصراف
                    </button>
                    <button type="submit" className="px-8 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition" disabled={!foundVehicle || items.length === 0}>
                        ثبت نهایی فاکتور
                    </button>
                </div>
            </form>
            <style>{`.input-style { display: block; width: 100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default InvoiceForm;
