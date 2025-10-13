import React, { useState, useMemo } from 'react';
import { Vehicle, Branch, FuelCardRequest, TrafficFine, VehiclePermit } from '../types';
import { formatPlateNumber, formatJalali } from '../utils/jalali';
import { CreditCardIcon } from './icons/CreditCardIcon';
import { ShieldExclamationIcon } from './icons/ShieldExclamationIcon';
import { DocumentDuplicateIcon } from './icons/DocumentDuplicateIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { UploadIcon } from './icons/UploadIcon'; // Assuming you'll create this icon

interface VehicleDocumentsManagementProps {
    vehicles: Vehicle[];
    branches: Branch[];
    fuelCardRequests: FuelCardRequest[];
    trafficFines: TrafficFine[];
    vehiclePermits: VehiclePermit[];
    onAddFuelCardRequest: (request: Omit<FuelCardRequest, 'id' | 'requestDate'>) => void;
    onAddVehiclePermit: (permit: Omit<VehiclePermit, 'id' | 'requestDate'>) => void;
}

// --- Sub-component for Fuel Card Reissue Tab ---
const FuelCardReissue = ({ vehicles, branches, onAddFuelCardRequest, fuelCardRequests }: any) => {
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const [issueDate, setIssueDate] = useState('');

    const handleVehicleLookup = () => {
        if (!vehicleIdentifier) {
            setFoundVehicle(null);
            return;
        }
        const searchTerm = vehicleIdentifier.toLowerCase().replace(/ /g, '');
        const found = vehicles.find((v: Vehicle) =>
            (v.serialNumber && v.serialNumber.toLowerCase() === searchTerm) ||
            (v.vin && v.vin.toLowerCase() === searchTerm) ||
            (v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(searchTerm))
        );
        setFoundVehicle(found || null);
        if (!found) {
            alert('خودرویی با این شناسه یافت نشد.');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!foundVehicle || !issueDate) {
            alert('لطفاً خودرو را مشخص کرده و تاریخ صدور را وارد نمایید.');
            return;
        }
        onAddFuelCardRequest({
            vehicleId: foundVehicle.id,
            branchId: foundVehicle.branchId,
            issueDate: new Date(issueDate),
        });
        setFoundVehicle(null);
        setVehicleIdentifier('');
        setIssueDate('');
    };
    
    const getVehicleDetails = (vehicleId: string) => vehicles.find((v: Vehicle) => v.id === vehicleId);

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-700">ثبت درخواست کارت سوخت المثنی</h3>
            <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
                <div className="flex items-end gap-2">
                    <div className="flex-grow">
                        <label className="block text-sm font-medium text-slate-700">جستجوی خودرو (پلاک یا شماره شاسی)</label>
                        <input
                            type="text"
                            value={vehicleIdentifier}
                            onChange={e => setVehicleIdentifier(e.target.value)}
                            className="mt-1 w-full input-style"
                            disabled={!!foundVehicle}
                        />
                    </div>
                    <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700" disabled={!!foundVehicle}>جستجو</button>
                </div>
                {foundVehicle && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md">
                            <p><strong>خودرو:</strong> {foundVehicle.brand} {foundVehicle.model}</p>
                            <p className="text-sm font-mono">{formatPlateNumber(foundVehicle.plateNumber)}</p>
                        </div>
                        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-md">
                           <p><strong>شعبه:</strong> {branches.find((b: Branch) => b.id === foundVehicle.branchId)?.name || 'نامشخص'}</p>
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-slate-700">تاریخ صدور</label>
                             <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="mt-1 w-full input-style" required />
                        </div>
                    </div>
                )}
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={() => { setFoundVehicle(null); setVehicleIdentifier(''); }} className="px-6 py-2 rounded-md text-sm font-medium bg-slate-200 text-slate-800 hover:bg-slate-300">پاک کردن</button>
                    <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700" disabled={!foundVehicle}>ثبت درخواست</button>
                </div>
            </form>
            
            <h3 className="text-lg font-bold text-slate-700 pt-4 border-t">تاریخچه درخواست‌ها</h3>
            <div className="overflow-x-auto">
                 <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">خودرو</th>
                            <th className="px-6 py-3">شعبه</th>
                            <th className="px-6 py-3">تاریخ درخواست</th>
                            <th className="px-6 py-3">تاریخ صدور</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fuelCardRequests.map((req: FuelCardRequest) => {
                            const vehicle = getVehicleDetails(req.vehicleId);
                            const branch = branches.find((b: Branch) => b.id === req.branchId);
                            return (
                            <tr key={req.id} className="bg-white border-b hover:bg-gray-50">
                                <th className="px-6 py-4 font-medium text-gray-900">{vehicle ? `${vehicle.brand} ${vehicle.model} (${formatPlateNumber(vehicle.plateNumber)})` : '-'}</th>
                                <td className="px-6 py-4">{branch?.name || '-'}</td>
                                <td className="px-6 py-4">{formatJalali(new Date(req.requestDate))}</td>
                                <td className="px-6 py-4">{req.issueDate ? formatJalali(new Date(req.issueDate)) : 'در انتظار'}</td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

// --- Sub-component for Traffic Fines Tab ---
const TrafficFines = ({ branches, trafficFines, vehicles }: any) => {
    const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);

    const finesByBranch = useMemo(() => {
        const branchMap = new Map<string, { total: number; fines: TrafficFine[] }>();
        trafficFines.forEach((fine: TrafficFine) => {
            if (!branchMap.has(fine.branchId)) {
                branchMap.set(fine.branchId, { total: 0, fines: [] });
            }
            const branchData = branchMap.get(fine.branchId)!;
            branchData.total += fine.amount;
            branchData.fines.push(fine);
        });
        return Array.from(branchMap.entries()).map(([branchId, data]) => ({
            branchId,
            branchName: branches.find((b: Branch) => b.id === branchId)?.name || 'نامشخص',
            ...data,
        })).sort((a,b) => b.total - a.total);
    }, [branches, trafficFines]);

    const handleToggleExpand = (branchId: string) => {
        setExpandedBranchId(prev => (prev === branchId ? null : branchId));
    };

    const getVehicleIdentifier = (vehicleId: string) => {
        const vehicle = vehicles.find((v: Vehicle) => v.id === vehicleId);
        if (!vehicle) return 'نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    }

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 w-12"></th>
                            <th className="px-6 py-3">نام شعبه</th>
                            <th className="px-6 py-3">مجموع مبلغ جریمه (ریال)</th>
                            <th className="px-6 py-3">عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {finesByBranch.map(({ branchId, branchName, total, fines }) => (
                            <React.Fragment key={branchId}>
                                <tr className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <button onClick={() => handleToggleExpand(branchId)} className="text-slate-500 hover:text-sky-600">
                                            <ChevronDownIcon className={`w-5 h-5 transition-transform ${expandedBranchId === branchId ? 'rotate-180' : ''}`} />
                                        </button>
                                    </td>
                                    <th className="px-6 py-4 font-medium text-gray-900">{branchName}</th>
                                    <td className="px-6 py-4 font-mono text-lg font-bold text-red-600">{total.toLocaleString('fa-IR')}</td>
                                    <td className="px-6 py-4">
                                        <button className="px-4 py-2 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600" title="این قابلیت در آینده فعال خواهد شد">استعلام</button>
                                    </td>
                                </tr>
                                {expandedBranchId === branchId && (
                                    <tr className="bg-slate-50">
                                        <td colSpan={4} className="p-4">
                                            <div className="p-4 bg-white rounded-md border">
                                                <h4 className="font-semibold mb-2">جزئیات جرایم شعبه {branchName}</h4>
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b">
                                                            <th className="py-2 text-right">خودرو</th>
                                                            <th className="py-2 text-right">تاریخ جریمه</th>
                                                            <th className="py-2 text-right">مبلغ (ریال)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {fines.map(fine => (
                                                            <tr key={fine.id} className="border-b border-slate-100">
                                                                <td className="py-2 font-mono">{getVehicleIdentifier(fine.vehicleId)}</td>
                                                                <td className="py-2">{formatJalali(new Date(fine.fineDate))}</td>
                                                                <td className="py-2 font-mono">{fine.amount.toLocaleString('fa-IR')}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Sub-component for Permits Tab ---
const VehiclePermits = ({ vehicles, branches, vehiclePermits, onAddVehiclePermit }: any) => {
    const initialFormState = {
        permitIssueDate: '',
        permitExpiryDate: '',
        baseFuelQuota: '',
        inspectionIssueDate: '',
        inspectionExpiryDate: '',
    };
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const [formState, setFormState] = useState(initialFormState);
    const [files, setFiles] = useState({ inspectionImageName: '', permitImageName: '' });

    const handleVehicleLookup = () => {
        if (!vehicleIdentifier) {
            setFoundVehicle(null);
            return;
        }
        const searchTerm = vehicleIdentifier.toLowerCase().replace(/ /g, '');
        const found = vehicles.find((v: Vehicle) => (v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(searchTerm)));
        setFoundVehicle(found || null);
        if (!found) alert('خودرویی با این پلاک یافت نشد.');
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormState(prev => ({...prev, [e.target.name]: e.target.value}));
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [e.target.name]: e.target.files![0].name }));
        }
    };
    
    const resetForm = () => {
        setFoundVehicle(null);
        setVehicleIdentifier('');
        setFormState(initialFormState);
        setFiles({ inspectionImageName: '', permitImageName: '' });
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!foundVehicle) {
            alert('لطفا ابتدا یک خودرو را انتخاب کنید.');
            return;
        }
        const { permitIssueDate, permitExpiryDate, baseFuelQuota, inspectionIssueDate, inspectionExpiryDate } = formState;
        if (!permitIssueDate || !permitExpiryDate || !baseFuelQuota || !inspectionIssueDate || !inspectionExpiryDate) {
             alert('لطفا تمامی فیلدهای تاریخ و سهمیه سوخت را تکمیل کنید.');
            return;
        }
        
        onAddVehiclePermit({
            vehicleId: foundVehicle.id,
            branchId: foundVehicle.branchId,
            permitIssueDate: new Date(permitIssueDate),
            permitExpiryDate: new Date(permitExpiryDate),
            baseFuelQuota: parseInt(baseFuelQuota, 10),
            inspectionIssueDate: new Date(inspectionIssueDate),
            inspectionExpiryDate: new Date(inspectionExpiryDate),
            inspectionImageName: files.inspectionImageName || undefined,
            permitImageName: files.permitImageName || undefined,
        });
        resetForm();
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-700">ثبت پروانه فعالیت و معاینه فنی</h3>
             <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
                 <div className="flex items-end gap-2">
                    <div className="flex-grow">
                        <label className="block text-sm font-medium text-slate-700">۱. جستجوی خودرو (پلاک)</label>
                        <input type="text" value={vehicleIdentifier} onChange={e => setVehicleIdentifier(e.target.value)} className="mt-1 w-full input-style" disabled={!!foundVehicle} />
                    </div>
                    <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700" disabled={!!foundVehicle}>جستجو</button>
                </div>

                {foundVehicle && (
                    <>
                        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md">
                            <p><strong>خودرو یافت شد:</strong> {foundVehicle.brand} {foundVehicle.model} ({formatPlateNumber(foundVehicle.plateNumber)})</p>
                        </div>
                        <fieldset className="p-4 border border-slate-200 rounded-lg">
                            <legend className="px-2 font-semibold text-slate-700">۲. اطلاعات معاینه فنی</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">تاریخ صدور</label>
                                    <input type="date" name="inspectionIssueDate" value={formState.inspectionIssueDate} onChange={handleFormChange} className="mt-1 w-full input-style" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">تاریخ انقضا</label>
                                    <input type="date" name="inspectionExpiryDate" value={formState.inspectionExpiryDate} onChange={handleFormChange} className="mt-1 w-full input-style" required />
                                </div>
                                 <FileInput label="تصویر معاینه فنی" name="inspectionImageName" fileName={files.inspectionImageName} onChange={handleFileChange} />
                            </div>
                        </fieldset>
                         <fieldset className="p-4 border border-slate-200 rounded-lg">
                            <legend className="px-2 font-semibold text-slate-700">۳. اطلاعات پروانه فعالیت</legend>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">تاریخ صدور</label>
                                    <input type="date" name="permitIssueDate" value={formState.permitIssueDate} onChange={handleFormChange} className="mt-1 w-full input-style" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">تاریخ انقضا</label>
                                    <input type="date" name="permitExpiryDate" value={formState.permitExpiryDate} onChange={handleFormChange} className="mt-1 w-full input-style" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">سهمیه پایه کارت سوخت</label>
                                    <input type="number" name="baseFuelQuota" placeholder="مثال: 4500" value={formState.baseFuelQuota} onChange={handleFormChange} className="mt-1 w-full input-style" required />
                                </div>
                                <div className="md:col-span-3">
                                    <FileInput label="تصویر پروانه فعالیت" name="permitImageName" fileName={files.permitImageName} onChange={handleFileChange} />
                                </div>
                             </div>
                        </fieldset>
                        <div className="flex justify-end gap-4 pt-4">
                            <button type="button" onClick={resetForm} className="px-6 py-2 rounded-md text-sm font-medium bg-slate-200 text-slate-800 hover:bg-slate-300">انصراف</button>
                            <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700">ثبت</button>
                        </div>
                    </>
                )}
            </form>
            
            <h3 className="text-lg font-bold text-slate-700 pt-4 border-t">تاریخچه تراکنش‌ها</h3>
            <div className="overflow-x-auto">
                 <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">پلاک</th>
                            <th className="px-6 py-3">شعبه</th>
                            <th className="px-6 py-3">تاریخ انقضای معاینه فنی</th>
                            <th className="px-6 py-3">تاریخ انقضای پروانه فعالیت</th>
                            <th className="px-6 py-3">سهمیه پایه</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vehiclePermits.map((p: VehiclePermit) => {
                             const vehicle = vehicles.find((v: Vehicle) => v.id === p.vehicleId);
                             const branch = branches.find((b: Branch) => b.id === p.branchId);
                             return (
                                <tr key={p.id} className="bg-white border-b hover:bg-gray-50">
                                    <th className="px-6 py-4 font-medium text-gray-900 font-mono">{vehicle ? formatPlateNumber(vehicle.plateNumber) : '-'}</th>
                                    <td className="px-6 py-4">{branch?.name || '-'}</td>
                                    <td className="px-6 py-4">{formatJalali(new Date(p.inspectionExpiryDate))}</td>
                                    <td className="px-6 py-4">{formatJalali(new Date(p.permitExpiryDate))}</td>
                                    <td className="px-6 py-4 font-mono">{p.baseFuelQuota.toLocaleString('fa-IR')}</td>
                                </tr>
                             );
                        })}
                    </tbody>
                 </table>
            </div>

        </div>
    );
};

const FileInput = ({ label, name, fileName, onChange }: { label: string; name: string; fileName: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }) => (
    <div>
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <label htmlFor={name} className="mt-1 flex justify-center items-center px-3 py-2 border-2 border-slate-300 border-dashed rounded-md cursor-pointer bg-white hover:border-sky-400">
            <UploadIcon className="w-5 h-5 text-slate-400" />
            <span className={`mr-2 text-sm ${fileName ? 'text-green-600 font-semibold' : 'text-slate-500'}`}>
                {fileName || 'انتخاب فایل'}
            </span>
            <input id={name} name={name} type="file" className="sr-only" onChange={onChange} accept="image/*,.pdf" />
        </label>
    </div>
);


// --- Main Component ---
const VehicleDocumentsManagement: React.FC<VehicleDocumentsManagementProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'fuelCard' | 'fines' | 'permits'>('permits');

    const renderTabContent = () => {
        switch (activeTab) {
            case 'fuelCard':
                return <FuelCardReissue {...props} />;
            case 'fines':
                return <TrafficFines {...props} />;
            case 'permits':
                return <VehiclePermits {...props} />;
            default:
                return null;
        }
    };

    const getTabClass = (tabName: 'fuelCard' | 'fines' | 'permits') => {
        const baseClass = "flex-1 text-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer";
        if (activeTab === tabName) {
            return `${baseClass} bg-sky-600 text-white shadow`;
        }
        return `${baseClass} bg-slate-100 text-slate-600 hover:bg-slate-200`;
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-2 rounded-xl shadow-md flex items-center border border-slate-200 space-x-2 space-x-reverse">
                <div onClick={() => setActiveTab('fuelCard')} className={getTabClass('fuelCard')}>
                    <CreditCardIcon className="w-5 h-5" />
                    صدور المثنی کارت سوخت
                </div>
                <div onClick={() => setActiveTab('fines')} className={getTabClass('fines')}>
                    <ShieldExclamationIcon className="w-5 h-5" />
                    جرایم راهنمایی و رانندگی
                </div>
                <div onClick={() => setActiveTab('permits')} className={getTabClass('permits')}>
                    <DocumentDuplicateIcon className="w-5 h-5" />
                    پروانه فعالیت وسایل نقلیه
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg">
                {renderTabContent()}
            </div>
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default VehicleDocumentsManagement;