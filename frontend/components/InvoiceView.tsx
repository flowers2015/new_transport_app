import React from 'react';
import { Invoice, RepairOrder, Vehicle, Branch, InvoiceStatus } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { ChevronRightIcon } from './icons/ChevronRightIcon';

interface InvoiceViewProps {
    invoice: Invoice;
    order?: RepairOrder;
    vehicle?: Vehicle;
    branch?: Branch;
    onBack: () => void;
}

const InvoiceView: React.FC<InvoiceViewProps> = ({ invoice, order, vehicle, branch, onBack }) => {

    const statusStyles: { [key in InvoiceStatus]: string } = {
        [InvoiceStatus.Pending]: 'bg-yellow-100 text-yellow-800',
        [InvoiceStatus.Paid]: 'bg-green-100 text-green-800',
        [InvoiceStatus.Overdue]: 'bg-red-100 text-red-800',
    };

    return (
        <div className="max-w-4xl mx-auto">
             <button onClick={onBack} className="flex items-center text-sm font-medium text-sky-600 hover:text-sky-800 mb-4 print:hidden">
                <ChevronRightIcon className="w-5 h-5 ml-1"/>
                <span>بازگشت به لیست فاکتورها</span>
            </button>
            <div className="bg-white p-8 rounded-xl shadow-lg" id="invoice-content">
                <div className="flex justify-between items-start pb-4 border-b">
                    <div>
                        <h2 className="text-lg font-bold">تعمیرگاه مرکزی ناوگان</h2>
                        <p className="text-xs text-slate-500">آدرس: تهران، جاده مخصوص کرج، کیلومتر ۲۰</p>
                    </div>
                    <div className="text-left">
                        <h1 className="text-2xl font-bold">فاکتور فروش</h1>
                        <p className="text-slate-500 font-mono mt-1">شماره فاکتور: {invoice.id.substring(0, 8)}</p>
                        <p className="text-slate-500 mt-1">تاریخ صدور: <span className="font-semibold">{formatJalali(invoice.issuedAt)}</span></p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 my-6">
                    <div>
                        <h3 className="font-semibold text-slate-600">مشخصات خودرو:</h3>
                        <p className="font-bold text-lg mt-1">{vehicle?.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle?.serialNumber}</p>
                        <p className="text-slate-500">{vehicle?.model} ({vehicle?.type})</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-600">مربوط به شعبه:</h3>
                        <p className="font-bold text-lg mt-1">{branch?.name}</p>
                        <p className="text-slate-500">{branch?.location}</p>
                    </div>
                </div>
                
                 {order && (
                    <div>
                        <h3 className="font-semibold text-slate-600">شرح خدمات (سفارش #{order.id.substring(0,6)}):</h3>
                        <p className="p-3 bg-slate-50 rounded-md mt-2 text-slate-700 border">{order?.description}</p>
                    </div>
                 )}


                <div className="mt-8">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="p-3 font-semibold w-12">ردیف</th>
                                <th className="p-3 font-semibold">شرح کالا/خدمات</th>
                                <th className="p-3 font-semibold">تعداد</th>
                                <th className="p-3 font-semibold">فی (ریال)</th>
                                <th className="p-3 font-semibold text-left">قیمت کل (ریال)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items.map((item, index) => (
                                <tr key={item.partId || index} className="border-b">
                                    <td className="p-3 text-center">{index + 1}</td>
                                    <td className="p-3 font-medium">{item.description}</td>
                                    <td className="p-3">{item.quantity}</td>
                                    <td className="p-3 font-mono">{item.price.toLocaleString('fa-IR')}</td>
                                    <td className="p-3 font-mono text-left">{item.total.toLocaleString('fa-IR')}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} className="text-left font-bold p-3 text-lg">جمع کل:</td>
                                <td className="font-bold p-3 text-left font-mono text-lg">{invoice.totalAmount.toLocaleString('fa-IR')} ریال</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="flex justify-between items-center mt-8 pt-4 border-t">
                     <div>
                        <span className="text-sm mr-2">وضعیت:</span>
                         <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusStyles[invoice.status]}`}>
                            {invoice.status}
                        </span>
                    </div>
                     <button onClick={() => window.print()} className="px-5 py-2 rounded-md text-sm font-medium bg-slate-600 text-white hover:bg-slate-700 transition print:hidden">
                        چاپ
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InvoiceView;