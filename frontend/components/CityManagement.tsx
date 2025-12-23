import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';

// ============================================
// Types
// ============================================
interface City {
    id: string;
    cityName: string; // اسم شهر
    province: string; // استان
    approvedMissionDays?: number | null; // ماموریت مصوب
    cityKilometers?: number | null; // کیلومتر شهر
    createdAt?: string;
    updatedAt?: string;
}

// ============================================
// Main Component
// ============================================
const CityManagement: React.FC = () => {
    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Import states
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importType, setImportType] = useState<'excel' | 'json'>('excel');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [jsonData, setJsonData] = useState<string>('');
    const [importing, setImporting] = useState(false);

    const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
    };

    // ============================================
    // Data Fetching
    // ============================================
    const fetchCities = async () => {
        setLoading(true);
        setError(null);
        try {
            const { cachedFetch } = await import('../utils/apiCache');
            const data = await cachedFetch(getApiUrl('cities'), { headers }, 5 * 60 * 1000); // 5 min cache
            setCities(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCities();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // ============================================
    // CRUD Operations
    // ============================================
    const handleDelete = async (id: string) => {
        if (!confirm('آیا از حذف این شهر اطمینان دارید؟')) return;

        try {
            const res = await fetch(getApiUrl(`cities/${id}`), {
                method: 'DELETE',
                headers
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'خطا در حذف');
            }

            alert('با موفقیت حذف شد');
            fetchCities();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleSave = async (data: any) => {
        try {
            const url = modalMode === 'add' 
                ? getApiUrl('cities') 
                : getApiUrl(`cities/${selectedCity?.id}`);
            
            const method = modalMode === 'add' ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'خطا در ذخیره');
            }

            alert(modalMode === 'add' ? 'با موفقیت ایجاد شد' : 'با موفقیت ویرایش شد');
            setShowModal(false);
            setSelectedCity(null);
            fetchCities();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // ============================================
    // Import Operations
    // ============================================
    const handleExcelImport = async () => {
        if (!importFile) {
            alert('لطفاً فایل اکسل را انتخاب کنید');
            return;
        }

        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', importFile);

            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl('cities/import-excel'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'خطا در import');
            }

            const result = await res.json();
            const successCount = result.success || 0;
            const updatedCount = result.updated || 0;
            const errorCount = result.errors?.length || 0;
            const totalCount = result.total || 0;

            alert(`✅ Import موفق!\n\nکل: ${totalCount}\nموفق: ${successCount}\nبه‌روزرسانی شده: ${updatedCount}\nخطا: ${errorCount}`);
            
            setImportFile(null);
            setShowImportDialog(false);
            fetchCities();
        } catch (err: any) {
            alert(`❌ خطا: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    const handleJsonImport = async () => {
        if (!jsonData.trim()) {
            alert('لطفاً داده JSON را وارد کنید');
            return;
        }

        setImporting(true);
        try {
            let parsedData;
            try {
                parsedData = JSON.parse(jsonData);
            } catch (e) {
                throw new Error('فرمت JSON نامعتبر است');
            }

            if (!Array.isArray(parsedData)) {
                throw new Error('داده باید یک آرایه باشد');
            }

            // اعتبارسنجی داده‌ها
            const validatedData = parsedData.map((item, index) => {
                if (!item.cityName || !item.province) {
                    throw new Error(`ردیف ${index + 1}: شهر و استان الزامی است`);
                }
                return {
                    cityName: item.cityName,
                    province: item.province,
                    approvedMissionDays: item.approvedMissionDays || item.approved_mission_days || null,
                    cityKilometers: item.cityKilometers || item.city_kilometers || null,
                };
            });

            const res = await fetch(getApiUrl('cities/import-json'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ cities: validatedData }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'خطا در import');
            }

            const result = await res.json();
            const successCount = result.success || 0;
            const updatedCount = result.updated || 0;
            const errorCount = result.errors?.length || 0;
            const totalCount = result.total || 0;

            alert(`✅ Import موفق!\n\nکل: ${totalCount}\nموفق: ${successCount}\nبه‌روزرسانی شده: ${updatedCount}\nخطا: ${errorCount}`);
            
            setJsonData('');
            setShowImportDialog(false);
            fetchCities();
        } catch (err: any) {
            alert(`❌ خطا: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    // ============================================
    // Filtering & Pagination
    // ============================================
    const filteredCities = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return cities.filter(city => 
            city.cityName?.toLowerCase().includes(query) ||
            city.province?.toLowerCase().includes(query)
        );
    }, [cities, searchQuery]);

    const totalPages = Math.ceil(filteredCities.length / itemsPerPage);
    const paginatedCities = filteredCities.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // ============================================
    // Render
    // ============================================
    return (
        <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
            <div className="bg-white rounded-lg shadow-sm">
                {/* Header */}
                <div className="p-4 border-b">
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">مدیریت شهرها</h1>
                    
                    {/* Search & Actions */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="جستجو (شهر یا استان)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <button
                            onClick={() => { setModalMode('add'); setSelectedCity(null); setShowModal(true); }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                            + افزودن شهر جدید
                        </button>
                        <button
                            onClick={() => { setImportType('excel'); setShowImportDialog(true); }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                            📥 Import از Excel
                        </button>
                        <button
                            onClick={() => { setImportType('json'); setShowImportDialog(true); }}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                        >
                            📥 Import از JSON
                        </button>
                        <button
                            onClick={fetchCities}
                            disabled={loading}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                        >
                            {loading ? 'در حال بارگذاری...' : '🔄 بازخوانی'}
                        </button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="p-4 bg-red-50 text-red-700 border-b border-red-200">
                        {error}
                    </div>
                )}

                {/* Table */}
                <div className="p-4">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">در حال بارگذاری...</div>
                    ) : filteredCities.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">هیچ رکوردی یافت نشد</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">ردیف</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">اسم شهر</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">استان</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">ماموریت مصوب (روز)</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">کیلومتر شهر</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-500">عملیات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {paginatedCities.map((city, idx) => (
                                            <tr key={city.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                                <td className="px-3 py-2 font-medium">{city.cityName || '-'}</td>
                                                <td className="px-3 py-2">{city.province || '-'}</td>
                                                <td className="px-3 py-2">{city.approvedMissionDays?.toLocaleString('fa-IR') || '-'}</td>
                                                <td className="px-3 py-2">{city.cityKilometers?.toLocaleString('fa-IR') || '-'}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => { setSelectedCity(city); setModalMode('edit'); setShowModal(true); }}
                                                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(city.id)}
                                                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
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
                            
                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
                                    >
                                        قبلی
                                    </button>
                                    <span className="px-4 py-1 text-sm text-gray-600">
                                        صفحه {currentPage} از {totalPages} (کل: {filteredCities.length})
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
                                    >
                                        بعدی
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <CityFormModal
                    mode={modalMode}
                    city={selectedCity}
                    onSave={handleSave}
                    onCancel={() => { setShowModal(false); setSelectedCity(null); }}
                />
            )}

            {/* Import Dialog */}
            {showImportDialog && (
                <ImportDialog
                    type={importType}
                    file={importFile}
                    jsonData={jsonData}
                    onFileChange={setImportFile}
                    onJsonChange={setJsonData}
                    onImport={importType === 'excel' ? handleExcelImport : handleJsonImport}
                    onCancel={() => {
                        setShowImportDialog(false);
                        setImportFile(null);
                        setJsonData('');
                    }}
                    importing={importing}
                />
            )}
        </div>
    );
};

// ============================================
// City Form Modal
// ============================================
const CityFormModal: React.FC<{
    mode: 'add' | 'edit';
    city: City | null;
    onSave: (data: any) => void;
    onCancel: () => void;
}> = ({ mode, city, onSave, onCancel }) => {
    const [form, setForm] = useState({
        cityName: city?.cityName || '',
        province: city?.province || '',
        approvedMissionDays: city?.approvedMissionDays?.toString() || '',
        cityKilometers: city?.cityKilometers?.toString() || '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.cityName || !form.province) {
            alert('اسم شهر و استان الزامی است');
            return;
        }

        onSave({
            cityName: form.cityName,
            province: form.province,
            approvedMissionDays: form.approvedMissionDays ? parseFloat(form.approvedMissionDays) : null,
            cityKilometers: form.cityKilometers ? parseFloat(form.cityKilometers) : null,
        });
    };

    const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
    const labelClass = "block text-sm font-medium text-gray-700 mb-1";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">
                        {mode === 'add' ? 'افزودن شهر جدید' : 'ویرایش شهر'}
                    </h2>
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={labelClass}>اسم شهر *</label>
                        <input
                            type="text"
                            value={form.cityName}
                            onChange={e => setForm({...form, cityName: e.target.value})}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>استان *</label>
                        <input
                            type="text"
                            value={form.province}
                            onChange={e => setForm({...form, province: e.target.value})}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>ماموریت مصوب (روز)</label>
                        <input
                            type="number"
                            value={form.approvedMissionDays}
                            onChange={e => setForm({...form, approvedMissionDays: e.target.value})}
                            className={inputClass}
                            min="0"
                            step="0.1"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>کیلومتر شهر</label>
                        <input
                            type="number"
                            value={form.cityKilometers}
                            onChange={e => setForm({...form, cityKilometers: e.target.value})}
                            className={inputClass}
                            min="0"
                            step="0.1"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                            انصراف
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            ذخیره
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ============================================
// Import Dialog
// ============================================
const ImportDialog: React.FC<{
    type: 'excel' | 'json';
    file: File | null;
    jsonData: string;
    onFileChange: (file: File | null) => void;
    onJsonChange: (data: string) => void;
    onImport: () => void;
    onCancel: () => void;
    importing: boolean;
}> = ({ type, file, jsonData, onFileChange, onJsonChange, onImport, onCancel, importing }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">
                        Import از {type === 'excel' ? 'Excel' : 'JSON'}
                    </h2>
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                        disabled={importing}
                    >
                        ✕
                    </button>
                </div>

                {type === 'excel' ? (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                انتخاب فایل اکسل (.xlsx, .xls)
                            </label>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                                className="w-full px-3 py-2 border rounded-lg"
                                disabled={importing}
                            />
                            {file && (
                                <p className="mt-2 text-sm text-gray-600">
                                    فایل انتخاب شده: {file.name}
                                </p>
                            )}
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                            <strong>ستون‌های مورد نیاز:</strong>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li><strong>اسم شهر</strong> (اجباری) - نام‌های قابل قبول: "اسم شهر", "شهر", "cityName", "city_name"</li>
                                <li><strong>استان</strong> (اجباری) - نام‌های قابل قبول: "استان", "province"</li>
                                <li><strong>ماموریت مصوب</strong> (اختیاری) - نام‌های قابل قبول: "ماموریت مصوب", "approvedMissionDays", "approved_mission_days"</li>
                                <li><strong>کیلومتر شهر</strong> (اختیاری) - نام‌های قابل قبول: "کیلومتر شهر", "cityKilometers", "city_kilometers"</li>
                            </ul>
                            <p className="mt-2 text-xs text-blue-700">
                                ⚠️ توجه: اگر شهر با اسم شهر و استان موجود باشد، اطلاعات به‌روزرسانی می‌شود
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                وارد کردن داده JSON
                            </label>
                            <textarea
                                value={jsonData}
                                onChange={(e) => onJsonChange(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                                rows={10}
                                placeholder='[{"cityName": "تهران", "province": "تهران", "approvedMissionDays": 5, "cityKilometers": 100}]'
                                disabled={importing}
                            />
                        </div>

                        <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800">
                            <strong>فرمت JSON:</strong>
                            <pre className="mt-2 bg-white p-2 rounded text-xs overflow-x-auto">
{`[
  {
    "cityName": "تهران",
    "province": "تهران",
    "approvedMissionDays": 5,
    "cityKilometers": 100
  },
  {
    "cityName": "اصفهان",
    "province": "اصفهان",
    "approvedMissionDays": 3,
    "cityKilometers": 80
  }
]`}
                            </pre>
                            <p className="mt-2 text-xs text-purple-700">
                                <strong>نکات:</strong>
                            </p>
                            <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                                <li><strong>cityName</strong> و <strong>province</strong> اجباری هستند</li>
                                <li><strong>approvedMissionDays</strong> و <strong>cityKilometers</strong> اختیاری هستند</li>
                                <li>اگر شهر با cityName و province موجود باشد، اطلاعات به‌روزرسانی می‌شود</li>
                                <li>می‌توانید از نام‌های snake_case هم استفاده کنید: city_name, province, approved_mission_days, city_kilometers</li>
                            </ul>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 justify-end mt-4 pt-4 border-t">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        disabled={importing}
                    >
                        انصراف
                    </button>
                    <button
                        onClick={onImport}
                        disabled={importing || (type === 'excel' ? !file : !jsonData.trim())}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {importing ? 'در حال import...' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CityManagement;

