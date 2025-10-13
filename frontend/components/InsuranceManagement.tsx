
import React, { useState, useMemo } from 'react';
import { 
    Vehicle, Driver, Branch, InsurancePolicy, AccidentReport, InsuranceType, FaultParty, AccidentStatus,
    AccidentFileType, ReconstructionLocation, FileProgressStatus 
} from '../types';
import { formatPlateNumber, formatJalali, formatJalaliDateTime } from '../utils/jalali';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { UploadIcon } from './icons/UploadIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

type ActiveTab = 'definePolicy' | 'reportAccident' | 'expertView' | 'workshop' | 'finance';

interface InsuranceManagementProps {
    vehicles: Vehicle[];
    drivers: Driver[];
    branches: Branch[];
    insurancePolicies: InsurancePolicy[];
    accidentReports: AccidentReport[];
    onAddPolicy: (policy: Omit<InsurancePolicy, 'id'>) => void;
    onAddAccidentReport: (report: Omit<AccidentReport, 'id' | 'status' | 'branchId'>) => void;
    onUpdateAccidentReport: (report: AccidentReport) => void;
    onUpdateAccidentWorkshopStatus: (reportId: string, status: AccidentStatus) => void;
}

const insuranceCompanies = [
    'بیمه ایران', 'بیمه البرز', 'بیمه آسیا', 'بیمه پاسارگاد', 'بیمه سامان', 
    'بیمه دانا', 'بیمه دی', 'بیمه ملت', 'بیمه کارآفرین', 'بیمه کوثر', 'بیمه سینا'
];

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


const InsuranceManagement: React.FC<InsuranceManagementProps> = (props) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('expertView');

    const renderTabContent = () => {
        switch (activeTab) {
            case 'definePolicy': return <DefinePolicy {...props} />;
            case 'reportAccident': return <ReportAccident {...props} />;
            case 'expertView': return <ExpertView {...props} />;
            case 'workshop': return <WorkshopView {...props} />;
            case 'finance': return <div className="text-center p-8 text-slate-500">محتوای تب وصول پرداخت (مالی) در آینده اضافه خواهد شد.</div>;
            default: return null;
        }
    };
    
    const getTabClass = (tabName: ActiveTab) => {
        const baseClass = "flex-1 text-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer";
        if (activeTab === tabName) return `${baseClass} bg-sky-600 text-white shadow`;
        return `${baseClass} bg-slate-100 text-slate-600 hover:bg-slate-200`;
    };

    return (
         <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-2 rounded-xl shadow-md flex flex-wrap items-center border border-slate-200 gap-2">
                <div onClick={() => setActiveTab('definePolicy')} className={getTabClass('definePolicy')}>تعریف بیمه‌نامه</div>
                <div onClick={() => setActiveTab('reportAccident')} className={getTabClass('reportAccident')}>گزارش حادثه</div>
                <div onClick={() => setActiveTab('expertView')} className={getTabClass('expertView')}>کارشناس بیمه</div>
                <div onClick={() => setActiveTab('workshop')} className={getTabClass('workshop')}>تعمیرگاه</div>
                <div onClick={() => setActiveTab('finance')} className={getTabClass('finance')}>وصول پرداخت (مالی)</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg">
                {renderTabContent()}
            </div>
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};


// --- DefinePolicy Sub-Component ---
const DefinePolicy: React.FC<InsuranceManagementProps> = ({ vehicles, insurancePolicies, onAddPolicy }) => {
    const [policyType, setPolicyType] = useState<InsuranceType>(InsuranceType.ThirdParty);
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const initialFormState = {
        policyNumber: '',
        insuranceCompany: '',
        startDate: '',
        endDate: '',
        vehicleValue: '',
        franchisePercentage: '',
        discountYears: '',
        discountPercentage: '',
        policyAmount: '',
    };
    const [formState, setFormState] = useState(initialFormState);

    const handleVehicleLookup = () => {
        if (!vehicleIdentifier) return setFoundVehicle(null);
        const searchTerm = vehicleIdentifier.toLowerCase().replace(/ /g, '');
        const found = vehicles.find(v => (v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(searchTerm)));
        setFoundVehicle(found || null);
        if (!found) alert('خودرویی با این پلاک یافت نشد.');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!foundVehicle) return;
        const policy: Omit<InsurancePolicy, 'id'> = {
            vehicleId: foundVehicle.id,
            type: policyType,
            policyNumber: formState.policyNumber,
            insuranceCompany: formState.insuranceCompany,
            startDate: new Date(formState.startDate),
            endDate: new Date(formState.endDate),
            policyAmount: Number(formState.policyAmount) || undefined,
            discountYears: Number(formState.discountYears) || undefined,
            discountPercentage: Number(formState.discountPercentage) || undefined,
            ...(policyType === InsuranceType.Body && {
                vehicleValue: Number(formState.vehicleValue) || undefined,
                franchisePercentage: Number(formState.franchisePercentage) || undefined,
            }),
        };
        onAddPolicy(policy);
        setFormState(initialFormState);
        setFoundVehicle(null);
        setVehicleIdentifier('');
    };
    
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormState(s => ({ ...s, [e.target.name]: e.target.value }));
    };

    return (
        <div className="space-y-6">
            <div className="flex border-b">
                <button onClick={() => setPolicyType(InsuranceType.ThirdParty)} className={`px-4 py-2 text-sm font-semibold ${policyType === InsuranceType.ThirdParty ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500'}`}>بیمه نامه ثالث</button>
                <button onClick={() => setPolicyType(InsuranceType.Body)} className={`px-4 py-2 text-sm font-semibold ${policyType === InsuranceType.Body ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500'}`}>بیمه نامه بدنه</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
                <div className="flex items-end gap-2">
                    <div className="flex-grow">
                        <label className="block text-sm font-medium">جستجوی خودرو (پلاک)</label>
                        <input type="text" value={vehicleIdentifier} onChange={e => setVehicleIdentifier(e.target.value)} className="mt-1 w-full input-style" disabled={!!foundVehicle} />
                    </div>
                    <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700" disabled={!!foundVehicle}>جستجو</button>
                </div>
                {foundVehicle && <p className="p-2 bg-green-100 text-green-800 rounded">خودرو: {foundVehicle.brand} {foundVehicle.model}</p>}
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
                    <input name="policyNumber" value={formState.policyNumber} onChange={handleFormChange} placeholder="شماره بیمه‌نامه" className="input-style" required/>
                    <select name="insuranceCompany" value={formState.insuranceCompany} onChange={handleFormChange} className="input-style" required>
                        <option value="">-- شرکت بیمه --</option>
                        {insuranceCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                     <input name="policyAmount" type="number" value={formState.policyAmount} onChange={handleFormChange} placeholder="مبلغ بیمه نامه (ریال)" className="input-style"/>
                    <div>
                        <label className="text-xs">تاریخ شروع</label>
                        <input name="startDate" type="date" value={formState.startDate} onChange={handleFormChange} className="input-style" required/>
                        {formState.startDate && <span className="text-xs text-slate-500">{formatJalali(new Date(formState.startDate))}</span>}
                    </div>
                    <div>
                        <label className="text-xs">تاریخ انقضا</label>
                        <input name="endDate" type="date" value={formState.endDate} onChange={handleFormChange} className="input-style" required/>
                         {formState.endDate && <span className="text-xs text-slate-500">{formatJalali(new Date(formState.endDate))}</span>}
                    </div>
                    <input name="discountYears" type="number" value={formState.discountYears} onChange={handleFormChange} placeholder="سال تخفیف" className="input-style"/>
                    <input name="discountPercentage" type="number" value={formState.discountPercentage} onChange={handleFormChange} placeholder="درصد تخفیف" className="input-style"/>
                    
                    {policyType === InsuranceType.Body && <>
                        <input name="vehicleValue" type="number" value={formState.vehicleValue} onChange={handleFormChange} placeholder="ارزش خودرو (ریال)" className="input-style"/>
                        <input name="franchisePercentage" type="number" value={formState.franchisePercentage} onChange={handleFormChange} placeholder="فرانشیز (درصد)" className="input-style"/>
                    </>}
                </div>
                <div className="text-right"><button type="submit" className="px-5 py-2 rounded-md text-sm bg-sky-600 text-white hover:bg-sky-700" disabled={!foundVehicle}>ثبت بیمه‌نامه</button></div>
            </form>
            <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-700">بیمه‌نامه‌های فعال</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="text-xs uppercase bg-gray-50">
                            <tr>
                                <th className="p-2">پلاک</th>
                                <th className="p-2">نوع</th>
                                <th className="p-2">شرکت بیمه</th>
                                <th className="p-2">شماره بیمه نامه</th>
                                <th className="p-2">تاریخ انقضا</th>
                            </tr>
                        </thead>
                        <tbody>
                            {insurancePolicies.filter(p => p.endDate > new Date()).sort((a,b) => a.endDate.getTime() - b.endDate.getTime()).map(policy => {
                                const vehicle = vehicles.find(v => v.id === policy.vehicleId);
                                return (
                                    <tr key={policy.id} className="border-b hover:bg-slate-50">
                                        <td className="p-2 font-mono">{vehicle ? formatPlateNumber(vehicle.plateNumber) : '-'}</td>
                                        <td className="p-2">{policy.type}</td>
                                        <td className="p-2">{policy.insuranceCompany}</td>
                                        <td className="p-2 font-mono">{policy.policyNumber}</td>
                                        <td className="p-2">{formatJalali(new Date(policy.endDate))}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- ReportAccident Sub-Component ---
const ReportAccident: React.FC<InsuranceManagementProps> = ({ vehicles, drivers, insurancePolicies, onAddAccidentReport }) => {
    const [vehicleIdentifier, setVehicleIdentifier] = useState('');
    const [driverIdentifier, setDriverIdentifier] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    const [foundDriver, setFoundDriver] = useState<Driver | null>(null);
    const [files, setFiles] = useState({ accidentSketchImageName: '', companyDriverLicenseImageName: '', thirdPartyDriverLicenseImageName: '', damagedVehicleImageName: '' });

    const initialFormState = {
        accidentDate: '',
        accidentTime: '',
        accidentLocation: '',
        accidentCause: '',
        wasInjury: false,
        atFaultParty: FaultParty.Unknown,
        vehiclePostAccidentLocation: '',
    };
    const [formState, setFormState] = useState(initialFormState);
    
    const vehicleInsurance = useMemo(() => {
        if (!foundVehicle) return null;
        const thirdParty = insurancePolicies.find(p => p.vehicleId === foundVehicle.id && p.type === InsuranceType.ThirdParty);
        const body = insurancePolicies.find(p => p.vehicleId === foundVehicle.id && p.type === InsuranceType.Body);
        return { thirdParty, body };
    }, [foundVehicle, insurancePolicies]);

    const handleLookup = (type: 'vehicle' | 'driver') => {
        if(type === 'vehicle' && vehicleIdentifier) {
            const found = vehicles.find(v => v.plateNumber && formatPlateNumber(v.plateNumber).replace(/ /g, '').includes(vehicleIdentifier.replace(/ /g, '')));
            if(found) setFoundVehicle(found); else alert('خودرو یافت نشد');
        }
        if(type === 'driver' && driverIdentifier) {
            const found = drivers.find(d => d.employeeId === driverIdentifier);
            if(found) setFoundDriver(found); else alert('راننده یافت نشد');
        }
    }
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [e.target.name]: e.target.files![0].name }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!foundDriver || !foundVehicle) return;
        
        onAddAccidentReport({
            vehicleId: foundVehicle.id,
            driverId: foundDriver.id,
            accidentDate: new Date(formState.accidentDate),
            ...formState,
            ...files
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="flex items-end gap-2"><input value={vehicleIdentifier} onChange={e=>setVehicleIdentifier(e.target.value)} placeholder="جستجو پلاک..." className="input-style flex-grow"/><button type="button" onClick={() => handleLookup('vehicle')} className="px-4 py-2 bg-slate-500 text-white rounded text-sm">یافتن</button></div>
                 <div className="flex items-end gap-2"><input value={driverIdentifier} onChange={e=>setDriverIdentifier(e.target.value)} placeholder="کد پرسنلی راننده..." className="input-style flex-grow"/><button type="button" onClick={() => handleLookup('driver')} className="px-4 py-2 bg-slate-500 text-white rounded text-sm">یافتن</button></div>
            </div>

            {(foundVehicle || foundDriver || vehicleInsurance) && 
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-slate-50 rounded">
                    {foundVehicle && <div><h4 className="font-bold">خودرو</h4><p>{foundVehicle.brand} {foundVehicle.model}</p></div>}
                    {foundDriver && <div><h4 className="font-bold">راننده</h4><p>{foundDriver.name}</p></div>}
                    {vehicleInsurance && <div><h4 className="font-bold">انقضای بیمه</h4><p>ثالث: {vehicleInsurance.thirdParty ? formatJalali(vehicleInsurance.thirdParty.endDate) : 'ندارد'}</p><p>بدنه: {vehicleInsurance.body ? formatJalali(vehicleInsurance.body.endDate) : 'ندارد'}</p></div>}
                </div>
            }

            <fieldset className="p-4 border rounded-lg space-y-4">
                <legend className="px-2 font-semibold">جزئیات حادثه</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs">تاریخ حادثه</label>
                        <input name="accidentDate" type="date" value={formState.accidentDate} onChange={e=>setFormState(s=>({...s, accidentDate: e.target.value}))} className="input-style" required />
                        {formState.accidentDate && <span className="text-xs text-slate-500">{formatJalali(new Date(formState.accidentDate))}</span>}
                    </div>
                    <div><label className="text-xs">ساعت حادثه</label><input name="accidentTime" type="time" value={formState.accidentTime} onChange={e=>setFormState(s=>({...s, accidentTime: e.target.value}))} className="input-style" required /></div>
                    <input name="accidentLocation" placeholder="محل حادثه" value={formState.accidentLocation} onChange={e=>setFormState(s=>({...s, accidentLocation: e.target.value}))} className="input-style"/>
                    <textarea name="accidentCause" placeholder="علت حادثه" value={formState.accidentCause} onChange={e=>setFormState(s=>({...s, accidentCause: e.target.value}))} className="input-style md:col-span-3"/>
                    <input name="vehiclePostAccidentLocation" placeholder="محل استقرار خودرو پس از حادثه" value={formState.vehiclePostAccidentLocation} onChange={e=>setFormState(s=>({...s, vehiclePostAccidentLocation: e.target.value}))} className="input-style"/>
                    <select name="atFaultParty" value={formState.atFaultParty} onChange={e=>setFormState(s=>({...s, atFaultParty: e.target.value as FaultParty}))} className="input-style"><option value={FaultParty.Company}>مقصر شرکت</option><option value={FaultParty.ThirdParty}>مقصر طرف مقابل</option><option value={FaultParty.Unknown}>نامشخص</option></select>
                    <label className="flex items-center gap-2"><input name="wasInjury" type="checkbox" checked={formState.wasInjury} onChange={e=>setFormState(s=>({...s, wasInjury: e.target.checked}))} /> جرحی بوده است؟</label>
                </div>
            </fieldset>

            <fieldset className="p-4 border rounded-lg">
                <legend className="px-2 font-semibold">مدارک تصادف</legend>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FileInput label="کروکی حادثه" name="accidentSketchImageName" fileName={files.accidentSketchImageName} onChange={handleFileChange} />
                    <FileInput label="گواهینامه راننده" name="companyDriverLicenseImageName" fileName={files.companyDriverLicenseImageName} onChange={handleFileChange} />
                    <FileInput label="گواهینامه طرف مقابل" name="thirdPartyDriverLicenseImageName" fileName={files.thirdPartyDriverLicenseImageName} onChange={handleFileChange} />
                    <FileInput label="تصویر خودرو" name="damagedVehicleImageName" fileName={files.damagedVehicleImageName} onChange={handleFileChange} />
                </div>
            </fieldset>

            <div className="text-right"><button type="submit" className="px-6 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700" disabled={!foundVehicle || !foundDriver}>ثبت گزارش</button></div>
        </form>
    );
};

// --- ExpertView Sub-Component ---
const ExpertView: React.FC<InsuranceManagementProps> = ({ accidentReports, vehicles, branches, onUpdateAccidentReport }) => {
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
    const [currentReport, setCurrentReport] = useState<Partial<AccidentReport>>({});
    
    const handleExpand = (report: AccidentReport) => {
        if(expandedReportId === report.id) {
            setExpandedReportId(null);
            setCurrentReport({});
        } else {
            setExpandedReportId(report.id);
            setCurrentReport(report);
        }
    }

    const handleUpdateField = (field: keyof AccidentReport, value: any) => {
        setCurrentReport(prev => ({ ...prev, [field]: value }));
    }

    const handleSave = () => {
        if(currentReport.id) {
            onUpdateAccidentReport(currentReport as AccidentReport);
            setExpandedReportId(null);
            setCurrentReport({});
        }
    }
    
    const repairInvoiceAmount = currentReport.repairInvoiceAmount;
    const receivedAmount = currentReport.claimAmountReceived;
    let percentageNotReceivedText = 'N/A';
    if (typeof repairInvoiceAmount === 'number' && repairInvoiceAmount > 0 && typeof receivedAmount === 'number' && receivedAmount >= 0) {
        const percentage = ((repairInvoiceAmount - receivedAmount) / repairInvoiceAmount) * 100;
        percentageNotReceivedText = `${percentage.toFixed(2)}%`;
    }

    return (
        <div>
            <div className="overflow-x-auto">
                 <table className="w-full text-sm text-right">
                    <thead className="text-xs uppercase bg-gray-50">
                        <tr>
                            <th className="p-2"></th>
                            <th className="p-2">پلاک</th>
                            <th className="p-2">شعبه</th>
                            <th className="p-2">وضعیت</th>
                            <th className="p-2">روز از تکمیل</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accidentReports.filter(r => r.status !== AccidentStatus.Closed).map(report => {
                            const daysSinceCompletion = report.fileCompletionDate
                                ? Math.floor((new Date().getTime() - new Date(report.fileCompletionDate).getTime()) / (1000 * 60 * 60 * 24))
                                : null;

                            return (
                            <React.Fragment key={report.id}>
                                <tr className="border-b hover:bg-slate-50">
                                    <td><button onClick={() => handleExpand(report)}><ChevronDownIcon className={`w-5 h-5 transition-transform ${expandedReportId === report.id ? 'rotate-180' : ''}`} /></button></td>
                                    <td className="p-2 font-mono">{formatPlateNumber(vehicles.find(v=>v.id===report.vehicleId)?.plateNumber)}</td>
                                    <td className="p-2">{branches.find(b=>b.id===report.branchId)?.name}</td>
                                    <td className="p-2 text-xs"><span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">{report.status}</span></td>
                                    <td className="p-2">{daysSinceCompletion !== null ? `${daysSinceCompletion} روز` : '-'}</td>
                                </tr>
                                {expandedReportId === report.id && (
                                    <tr className="bg-slate-50"><td colSpan={5} className="p-4">
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs font-medium mb-1 block">نوع پرونده</label>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm p-2 bg-white rounded-md border">
                                                        {Object.values(AccidentFileType).map(type => (
                                                            <label key={type} className="flex items-center gap-1 cursor-pointer">
                                                                <input type="radio" name="fileType" value={type} checked={currentReport.fileType === type} onChange={() => handleUpdateField('fileType', type)} />
                                                                {type}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium mb-1 block">محل بازسازی</label>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm p-2 bg-white rounded-md border">
                                                        {Object.values(ReconstructionLocation).map(loc => (
                                                            <label key={loc} className="flex items-center gap-1 cursor-pointer">
                                                                <input type="radio" name="reconstructionLocation" value={loc} checked={currentReport.reconstructionLocation === loc} onChange={() => handleUpdateField('reconstructionLocation', loc)} />
                                                                {loc}
                                                            </label>
                                                        ))}
                                                        {currentReport.reconstructionLocation === ReconstructionLocation.Personal && (
                                                            <input type="text" placeholder="نام تعمیرگاه شخصی" value={currentReport.personalReconstructionLocation || ''} onChange={e => handleUpdateField('personalReconstructionLocation', e.target.value)} className="input-style !text-xs !py-1 flex-grow"/>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="md:col-span-4">
                                                    <label className="text-xs">وضعیت روند پرونده</label>
                                                    <select value={currentReport.fileProgressStatus || ''} onChange={e => handleUpdateField('fileProgressStatus', e.target.value)} className="input-style">
                                                        <option value="">-- انتخاب کنید --</option>
                                                        {Object.values(FileProgressStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs">زمان تکمیل مدارک</label>
                                                    <input type="date" value={currentReport.fileCompletionDate ? new Date(currentReport.fileCompletionDate).toISOString().split('T')[0] : ''} onChange={e => handleUpdateField('fileCompletionDate', e.target.value ? new Date(e.target.value) : undefined)} className="input-style"/>
                                                    {currentReport.fileCompletionDate && <span className="text-xs text-slate-500">{formatJalali(new Date(currentReport.fileCompletionDate))}</span>}
                                                </div>
                                                <input placeholder="علت تاخیر" value={currentReport.fileCompletionDelayReason || ''} onChange={e => handleUpdateField('fileCompletionDelayReason', e.target.value)} className="input-style md:col-span-3"/>
                                                <input placeholder="شماره پرونده بیمه" value={currentReport.claimFileNumber || ''} onChange={e => handleUpdateField('claimFileNumber', e.target.value)} className="input-style md:col-span-2"/>
                                                <div className="md:col-span-2">
                                                    <label className="text-xs">تاریخ ارجاع به تعمیرگاه</label>
                                                    <input type="date" value={currentReport.referralToWorkshopDate ? new Date(currentReport.referralToWorkshopDate).toISOString().split('T')[0] : ''} onChange={e => handleUpdateField('referralToWorkshopDate', e.target.value ? new Date(e.target.value) : undefined)} className="input-style"/>
                                                    {currentReport.referralToWorkshopDate && <span className="text-xs text-slate-500">{formatJalali(new Date(currentReport.referralToWorkshopDate))}</span>}
                                                </div>
                                            </div>

                                            <fieldset className="p-3 border rounded-md bg-white">
                                                <legend className="text-xs font-semibold px-1">امور مالی</legend>
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <label className="text-xs">مبلغ فاکتور تعمیراتی (ریال)</label>
                                                        <input type="number" value={currentReport.repairInvoiceAmount || ''} onChange={e => handleUpdateField('repairInvoiceAmount', Number(e.target.value))} className="input-style"/>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs">مبلغ خسارت دریافتی از بیمه (ریال)</label>
                                                        <input type="number" value={currentReport.claimAmountReceived || ''} onChange={e => handleUpdateField('claimAmountReceived', Number(e.target.value))} className="input-style"/>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs">مبلغ استهلاک لوازم (ریال)</label>
                                                        <input type="number" value={currentReport.depreciationAmount || ''} onChange={e => handleUpdateField('depreciationAmount', Number(e.target.value))} className="input-style"/>
                                                    </div>
                                                    <div className="flex items-center justify-center text-sm font-semibold bg-slate-100 p-2 rounded border">
                                                         درصد دریافت نشده: {percentageNotReceivedText}
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="text-xs">شماره فرایند فرانشیز به حساب راننده</label>
                                                        <input type="text" value={currentReport.franchiseProcessNumber || ''} onChange={e => handleUpdateField('franchiseProcessNumber', e.target.value)} className="input-style"/>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs">مبلغ فرانشیز (ریال)</label>
                                                        <input type="number" value={currentReport.franchiseAmount || ''} onChange={e => handleUpdateField('franchiseAmount', Number(e.target.value))} className="input-style"/>
                                                    </div>
                                                </div>
                                            </fieldset>
                                            
                                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                                <FileInput label="الصاق حواله پرداخت بیمه" name="paymentVoucher" fileName={currentReport.paymentVoucherImageName || ''} onChange={(e) => e.target.files && handleUpdateField('paymentVoucherImageName', e.target.files[0].name)} />
                                                <div className="flex-grow"></div>
                                                <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded text-sm">ذخیره تغییرات</button>
                                                <button onClick={() => handleUpdateField('status', AccidentStatus.ReferredToWorkshop)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">معرفی به تعمیرگاه</button>
                                                <button className="px-4 py-2 bg-purple-600 text-white rounded text-sm">ارسال حواله به مالی</button>
                                                <button className="px-4 py-2 bg-teal-500 text-white rounded text-sm opacity-50 cursor-not-allowed" disabled>تایید واریز (مالی)</button>
                                            </div>
                                        </div>
                                    </td></tr>
                                )}
                            </React.Fragment>
                        })}
                    </tbody>
                 </table>
            </div>
        </div>
    );
}

const WorkshopView: React.FC<InsuranceManagementProps> = ({ accidentReports, vehicles, onUpdateAccidentWorkshopStatus }) => {
    const workshopReports = useMemo(() => accidentReports.filter(r => 
        [
            AccidentStatus.ReferredToWorkshop, 
            AccidentStatus.WorkshopInProgress, 
            AccidentStatus.WorkshopComplete
        ].includes(r.status)
    ).sort((a,b) => new Date(b.accidentDate).getTime() - new Date(a.accidentDate).getTime()), [accidentReports]);

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-700">لیست خودروهای ارجاع شده به تعمیرگاه</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="text-xs uppercase bg-gray-50">
                        <tr>
                            <th className="p-3">پلاک خودرو</th>
                            <th className="p-3">تاریخ حادثه</th>
                            <th className="p-3">وضعیت تعمیرات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workshopReports.length > 0 ? workshopReports.map(report => (
                            <tr key={report.id} className="border-b">
                                <td className="p-3 font-mono font-semibold">{formatPlateNumber(vehicles.find(v => v.id === report.vehicleId)?.plateNumber)}</td>
                                <td className="p-3">{formatJalali(new Date(report.accidentDate))}</td>
                                <td className="p-3">
                                    <div className="flex flex-col gap-2 text-xs">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`status-${report.id}`} 
                                                checked={report.status === AccidentStatus.ReferredToWorkshop} 
                                                onChange={() => onUpdateAccidentWorkshopStatus(report.id, AccidentStatus.ReferredToWorkshop)} 
                                            />
                                            <span>در انتظار تعمیر</span>
                                            {report.awaitingRepairDate && <span className="text-slate-500">({formatJalali(new Date(report.awaitingRepairDate))})</span>}
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`status-${report.id}`} 
                                                checked={report.status === AccidentStatus.WorkshopInProgress} 
                                                onChange={() => onUpdateAccidentWorkshopStatus(report.id, AccidentStatus.WorkshopInProgress)} 
                                            />
                                            <span>در دست تعمیر</span>
                                             {report.repairInProgressDate && <span className="text-slate-500">({formatJalali(new Date(report.repairInProgressDate))})</span>}
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`status-${report.id}`} 
                                                checked={report.status === AccidentStatus.WorkshopComplete} 
                                                onChange={() => onUpdateAccidentWorkshopStatus(report.id, AccidentStatus.WorkshopComplete)} 
                                            />
                                            <span>اتمام تعمیرات</span>
                                             {report.repairCompletedDate && <span className="text-slate-500">({formatJalali(new Date(report.repairCompletedDate))})</span>}
                                        </label>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="text-center py-8 text-slate-500">هیچ خودرویی به تعمیرگاه ارجاع نشده است.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


export default InsuranceManagement;
