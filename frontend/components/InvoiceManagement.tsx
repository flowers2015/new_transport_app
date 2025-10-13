import React, { useState, useMemo } from 'react';
import { Invoice, InvoiceStatus, Vehicle } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

interface InvoiceManagementProps {
    invoices: Invoice[];
    vehicles: Vehicle[];
    onSelectInvoice: (invoiceId: string) => void;
}

const InvoiceManagement: React.FC<InvoiceManagementProps> = ({ invoices, vehicles, onSelectInvoice }) => {
    const [searchTerm, setSearchTerm] = useState('');
    
    const getVehicleIdentifier = (vehicleId: string): string => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return 'نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    };
    
    const statusStyles: { [key in InvoiceStatus]: string } = {
        [InvoiceStatus.Pending]: 'bg-yellow-100 text-yellow-800',
        [InvoiceStatus.Paid]: 'bg-green-100 text-green-800',
        [InvoiceStatus.Overdue]: 'bg-red-100 text-red-800',
    };
    
    const filteredInvoices = useMemo(() => {
        if (!searchTerm) return invoices;
        const lowercasedTerm = searchTerm.toLowerCase();
        return invoices.filter(inv =>
            inv.id.substring(0,8).toLowerCase().includes(lowercasedTerm) ||
            (inv.repairOrderId && inv.repairOrderId.substring(0,6).toLowerCase().includes(lowercasedTerm)) ||
            getVehicleIdentifier(inv.vehicleId).toLowerCase().includes(lowercasedTerm)
        );
    }, [searchTerm, invoices, vehicles]);

    return (
        <div className="max-w-5xl mx-auto bg-white p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <DocumentTextIcon className="w-6 h-6 mr-2 text-sky-600" />
                    لیست فاکتورها
                </h2>
                <input
                    type="text"
                    placeholder="جستجو شماره فاکتور/سفارش/خودرو..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">شماره فاکتور</th>
                            <th className="px-6 py-3">خودرو</th>
                            <th className="px-6 py-3">شماره سفارش</th>
                            <th className="px-6 py-3">تاریخ صدور</th>
                            <th className="px-6 py-3">مبلغ کل</th>
                            <th className="px-6 py-3">وضعیت</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.length > 0 ? filteredInvoices.map(invoice => (
                            <tr key={invoice.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono text-slate-600">#{invoice.id.substring(0,8)}</td>
                                <td className="px-6 py-4 font-mono">{getVehicleIdentifier(invoice.vehicleId)}</td>
                                <td className="px-6 py-4 font-mono text-slate-600">{invoice.repairOrderId ? `#${invoice.repairOrderId.substring(0,6)}` : '-'}</td>
                                <td className="px-6 py-4">{formatJalali(invoice.issuedAt)}</td>
                                <td className="px-6 py-4 font-mono">{invoice.totalAmount.toLocaleString('fa-IR')} تومان</td>
                                <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusStyles[invoice.status]}`}>
                                        {invoice.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-left">
                                    <button onClick={() => onSelectInvoice(invoice.id)} className="font-medium text-sky-600 hover:underline">مشاهده</button>
                                </td>
                            </tr>
                        )) : (
                           <tr>
                                <td colSpan={7} className="text-center py-8 text-slate-500">هیچ فاکتوری یافت نشد.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InvoiceManagement;