import React, { useState, useMemo } from 'react';
import { Driver, LicenseType } from '../types';
import { UserPlusIcon } from './icons/UserPlusIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import JalaliDateInput from './JalaliDateInput';

interface DriverManagementProps {
    drivers: Driver[];
    onAddDriver: (driver: Omit<Driver, 'id'>) => void;
    onUpdateDriver: (id: string, driver: Omit<Driver, 'id'>) => void;
    onDeleteDriver: (id: string) => void;
}

const initialFormState = {
    employeeId: '',
    name: '',
    fatherName: '',
    nationalId: '',
    birthDate: '',
    idNumber: '',
    birthPlace: '',
    issuePlace: '',
    homePhone: '',
    workPhone: '',
    mobile: '',
    postalCode: '',
    homeAddress: '',
    workLocation: '',
    jobTitle: '',
    hireDate: '',
    terminationDate: '',
    licenseNumber: '',
    licenseType: LicenseType.Base1,
    licenseIssueDate: '',
    licenseIssuePlace: '',
    licenseExpiryDate: '',
};

const DriverManagement: React.FC<DriverManagementProps> = ({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.employeeId.trim()) {
            alert('نام و کد پرسنلی الزامی است.');
            return;
        }

        const driverData: Omit<Driver, 'id'> = {
          ...formData,
          birthDate: formData.birthDate ? new Date(formData.birthDate) : undefined,
          hireDate: formData.hireDate ? new Date(formData.hireDate) : undefined,
          terminationDate: formData.terminationDate ? new Date(formData.terminationDate) : undefined,
          licenseIssueDate: formData.licenseIssueDate ? new Date(formData.licenseIssueDate) : undefined,
          licenseExpiryDate: formData.licenseExpiryDate ? new Date(formData.licenseExpiryDate) : undefined,
          licenseType: formData.licenseType as LicenseType,
        };
        
        if (editingDriver) {
            onUpdateDriver(editingDriver.id, driverData);
            setEditingDriver(null);
        } else {
            onAddDriver(driverData);
        }
        setFormData(initialFormState);
    };

    const handleEdit = (driver: Driver) => {
        console.log('🔍 [DriverEdit] Editing driver:', driver);
        setEditingDriver(driver);
        
        const formData = {
            employeeId: driver.employee_id || driver.employeeId || '',
            name: driver.name || '',
            fatherName: driver.father_name || driver.fatherName || '',
            nationalId: driver.national_id || driver.nationalId || '',
            birthDate: driver.birth_date ? new Date(driver.birth_date).toISOString().split('T')[0] : (driver.birthDate ? driver.birthDate.toISOString().split('T')[0] : ''),
            idNumber: driver.id_number || driver.idNumber || '',
            birthPlace: driver.birth_place || driver.birthPlace || '',
            issuePlace: driver.issue_place || driver.issuePlace || '',
            homePhone: driver.home_phone || driver.homePhone || '',
            workPhone: driver.work_phone || driver.workPhone || '',
            mobile: driver.mobile || '',
            postalCode: driver.postal_code || driver.postalCode || '',
            homeAddress: driver.home_address || driver.homeAddress || '',
            workLocation: driver.work_location || driver.workLocation || '',
            jobTitle: driver.job_title || driver.jobTitle || '',
            hireDate: driver.hire_date ? new Date(driver.hire_date).toISOString().split('T')[0] : (driver.hireDate ? driver.hireDate.toISOString().split('T')[0] : ''),
            terminationDate: driver.termination_date ? new Date(driver.termination_date).toISOString().split('T')[0] : (driver.terminationDate ? driver.terminationDate.toISOString().split('T')[0] : ''),
            licenseNumber: driver.license_number || driver.licenseNumber || '',
            licenseType: driver.license_type || driver.licenseType || LicenseType.Base1,
            licenseIssueDate: driver.license_issue_date ? new Date(driver.license_issue_date).toISOString().split('T')[0] : (driver.licenseIssueDate ? driver.licenseIssueDate.toISOString().split('T')[0] : ''),
            licenseIssuePlace: driver.license_issue_place || driver.licenseIssuePlace || '',
            licenseExpiryDate: driver.license_expiry_date ? new Date(driver.license_expiry_date).toISOString().split('T')[0] : (driver.licenseExpiryDate ? driver.licenseExpiryDate.toISOString().split('T')[0] : ''),
        };
        
        console.log('📝 [DriverEdit] Form data:', formData);
        setFormData(formData);
    };

    const handleCancel = () => {
        setEditingDriver(null);
        setFormData(initialFormState);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('آیا از حذف این راننده اطمینان دارید؟')) {
            onDeleteDriver(id);
        }
    };
    
    const filteredDrivers = useMemo(() => {
        if (!searchTerm) return drivers;
        const lowercasedTerm = searchTerm.toLowerCase();
        return drivers.filter(driver =>
            driver.name.toLowerCase().includes(lowercasedTerm) ||
            driver.employeeId.toLowerCase().includes(lowercasedTerm) ||
            (driver.mobile && driver.mobile.includes(searchTerm))
        );
    }, [searchTerm, drivers]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <UserPlusIcon className="w-6 h-6 mr-2 text-sky-600" />
                    {editingDriver ? `ویرایش راننده: ${editingDriver.name}` : 'افزودن پرسنل / راننده جدید'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <fieldset className="p-4 border border-slate-200 rounded-lg">
                        <legend className="px-2 font-semibold text-slate-700">اطلاعات هویتی</legend>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <InputField label="کد پرسنلی" name="employeeId" value={formData.employeeId} onChange={handleChange} required />
                            <InputField label="نام و نام خانوادگی" name="name" value={formData.name} onChange={handleChange} required />
                            <InputField label="نام پدر" name="fatherName" value={formData.fatherName} onChange={handleChange} />
                            <InputField label="کد ملی" name="nationalId" value={formData.nationalId} onChange={handleChange} />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ تولد</label>
                                <JalaliDateInput 
                                    value={formData.birthDate}
                                    onChange={(value) => setFormData({...formData, birthDate: value})}
                                    placeholder="تاریخ تولد شمسی"
                                />
                            </div>
                            <InputField label="شماره شناسنامه" name="idNumber" value={formData.idNumber} onChange={handleChange} />
                            <InputField label="محل تولد" name="birthPlace" value={formData.birthPlace} onChange={handleChange} />
                            <InputField label="محل صدور" name="issuePlace" value={formData.issuePlace} onChange={handleChange} />
                        </div>
                    </fieldset>
                    
                    <fieldset className="p-4 border border-slate-200 rounded-lg">
                        <legend className="px-2 font-semibold text-slate-700">اطلاعات تماس و آدرس</legend>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <InputField label="تلفن منزل" name="homePhone" value={formData.homePhone} onChange={handleChange} />
                            <InputField label="تلفن محل کار" name="workPhone" value={formData.workPhone} onChange={handleChange} />
                            <InputField label="همراه" name="mobile" value={formData.mobile} onChange={handleChange} />
                            <InputField label="کد پستی" name="postalCode" value={formData.postalCode} onChange={handleChange} />
                         </div>
                         <div className="mt-4">
                            <label htmlFor="homeAddress" className="block text-sm font-medium text-slate-700">آدرس منزل</label>
                            <textarea id="homeAddress" name="homeAddress" value={formData.homeAddress} onChange={handleChange} rows={2} className="mt-1 block w-full input-style"></textarea>
                         </div>
                    </fieldset>

                    <fieldset className="p-4 border border-slate-200 rounded-lg">
                        <legend className="px-2 font-semibold text-slate-700">اطلاعات شغلی</legend>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <InputField label="محل خدمت" name="workLocation" value={formData.workLocation} onChange={handleChange} />
                            <InputField label="شغل" name="jobTitle" value={formData.jobTitle} onChange={handleChange} />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ استخدام</label>
                                <JalaliDateInput 
                                    value={formData.hireDate}
                                    onChange={(value) => setFormData({...formData, hireDate: value})}
                                    placeholder="تاریخ استخدام شمسی"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ تسویه حساب</label>
                                <JalaliDateInput 
                                    value={formData.terminationDate}
                                    onChange={(value) => setFormData({...formData, terminationDate: value})}
                                    placeholder="تاریخ تسویه حساب شمسی"
                                />
                            </div>
                         </div>
                    </fieldset>

                    <fieldset className="p-4 border border-slate-200 rounded-lg">
                        <legend className="px-2 font-semibold text-slate-700">اطلاعات گواهینامه</legend>
                         <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <InputField label="شماره گواهینامه" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} />
                             <div>
                                <label htmlFor="licenseType" className="block text-sm font-medium text-slate-700">نوع گواهینامه</label>
                                <select id="licenseType" name="licenseType" value={formData.licenseType} onChange={handleChange} className="mt-1 block w-full input-style">
                                    {Object.values(LicenseType).map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ صدور</label>
                                <JalaliDateInput 
                                    value={formData.licenseIssueDate}
                                    onChange={(value) => setFormData({...formData, licenseIssueDate: value})}
                                    placeholder="تاریخ صدور شمسی"
                                />
                            </div>
                            <InputField label="محل صدور" name="licenseIssuePlace" value={formData.licenseIssuePlace} onChange={handleChange} />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ اعتبار</label>
                                <JalaliDateInput 
                                    value={formData.licenseExpiryDate}
                                    onChange={(value) => setFormData({...formData, licenseExpiryDate: value})}
                                    placeholder="تاریخ اعتبار شمسی"
                                />
                            </div>
                         </div>
                    </fieldset>
                    
                    <div className="flex justify-end gap-2">
                        <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">
                            {editingDriver ? 'ذخیره تغییرات' : 'افزودن'}
                        </button>
                        {editingDriver && (
                            <button type="button" onClick={handleCancel} className="px-6 py-2 rounded-md text-sm font-medium bg-gray-500 text-white hover:bg-gray-600 transition">
                                انصراف
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                        <UserCircleIcon className="w-6 h-6 mr-2 text-slate-600" />
                        لیست پرسنل
                    </h2>
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
                                <th className="px-6 py-3">نام</th>
                                <th className="px-6 py-3">کد پرسنلی</th>
                                <th className="px-6 py-3">موبایل</th>
                                <th className="px-6 py-3">محل خدمت</th>
                                <th className="px-6 py-3">شغل</th>
                                <th className="px-6 py-3">نوع گواهینامه</th>
                                <th className="px-6 py-3">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDrivers.map(driver => (
                                <tr key={driver.id} className="bg-white border-b hover:bg-gray-50">
                                    <th className="px-6 py-4 font-medium text-gray-900">{driver.name}</th>
                                    <td className="px-6 py-4 font-mono">{driver.employeeId}</td>
                                    <td className="px-6 py-4 font-mono">{driver.mobile || '-'}</td>
                                    <td className="px-6 py-4">{driver.workLocation || '-'}</td>
                                    <td className="px-6 py-4">{driver.jobTitle || '-'}</td>
                                    <td className="px-6 py-4">{driver.licenseType || '-'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleEdit(driver)}
                                                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
                                            >
                                                ویرایش
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(driver.id)}
                                                className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition"
                                            >
                                                حذف
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

const InputField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; required?: boolean }> = 
({ label, name, value, onChange, type = 'text', required = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            id={name}
            name={name}
            value={value}
            onChange={onChange}
            className="mt-1 block w-full input-style"
            required={required}
        />
    </div>
);

export default DriverManagement;