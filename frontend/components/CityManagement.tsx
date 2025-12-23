import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';

// ============================================
// Types
// ============================================
interface DispatchRoute {
    id: string;
    city: string;
    province: string;
    roundTripKm?: number | null;
    expectedDays?: number | null;
    approvedAllowance?: number | null;
    routeCategory?: string | null;
    distanceCategory?: string | null;
    isActive?: boolean;
}

// ============================================
// Main Component
// ============================================
const CityManagement: React.FC = () => {
    const [routes, setRoutes] = useState<DispatchRoute[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [selectedRoute, setSelectedRoute] = useState<DispatchRoute | null>(null);

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
    const fetchRoutes = async () => {
        setLoading(true);
        setError(null);
        try {
            const { cachedFetch } = await import('../utils/apiCache');
            const data = await cachedFetch(getApiUrl('cities'), { headers }, 5 * 60 * 1000); // 5 min cache
            setRoutes(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoutes();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // ============================================
    // CRUD Operations
    // ============================================
    const handleDelete = async (id: string) => {
        if (!confirm('آیا از حذف این مسیر اطمینان دارید؟')) return;

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
            fetchRoutes();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleSave = async (data: any) => {
        try {
            const url = modalMode === 'add' 
                ? getApiUrl('cities') 
                : getApiUrl(`cities/${selectedRoute?.id}`);
            
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
            setSelectedRoute(null);
            fetchRoutes();
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
            const successCount = result.results?.success || 0;
            const updatedCount = result.results?.updated || 0;
            const errorCount = result.results?.errors?.length || 0;
            const totalCount = result.results?.total || 0;

            alert(`✅ Import موفق!\n\nکل: ${totalCount}\nموفق: ${successCount}\nبه‌روزرسانی شده: ${updatedCount}\nخطا: ${errorCount}`);
            
            setImportFile(null);
            setShowImportDialog(false);
            fetchRoutes();
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

            const res = await fetch(getApiUrl('cities/import-json'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ cities: parsedData }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'خطا در import');
            }

            const result = await res.json();
            const successCount = result.results?.success || 0;
            const updatedCount = result.results?.updated || 0;
            const errorCount = result.results?.errors?.length || 0;
            const totalCount = result.results?.total || 0;

            alert(`✅ Import موفق!\n\nکل: ${totalCount}\nموفق: ${successCount}\nبه‌روزرسانی شده: ${updatedCount}\nخطا: ${errorCount}`);
            
            setJsonData('');
            setShowImportDialog(false);
            fetchRoutes();
        } catch (err: any) {
            alert(`❌ خطا: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    // ============================================
    // Filtering & Pagination
    // ============================================
    const filteredRoutes = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return routes.filter(route => 
            route.city?.toLowerCase().includes(query) ||
            route.province?.toLowerCase().includes(query) ||
            route.routeCategory?.toLowerCase().includes(query) ||
            route.distanceCategory?.toLowerCase().includes(query)
        );
    }, [routes, searchQuery]);

    const totalPages = Math.ceil(filteredRoutes.length / itemsPerPage);
    const paginatedRoutes = filteredRoutes.slice(
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
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">مدیریت مسیرها (dispatch_routes)</h1>
                    
                    {/* Search & Actions */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="جستجو (شهر، استان، دسته‌بندی)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <button
                            onClick={() => { setModalMode('add'); setSelectedRoute(null); setShowModal(true); }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                            + افزودن مسیر جدید
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
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('token');
                                    const res = await fetch(getApiUrl('cities/export/json'), {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (!res.ok) throw new Error('خطا در export');
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'dispatch_routes_export.json';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    window.URL.revokeObjectURL(url);
                                } catch (err: any) {
                                    alert(`❌ خطا: ${err.message}`);
                                }
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                            📤 Export به JSON
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('token');
                                    const res = await fetch(getApiUrl('cities/export/excel'), {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (!res.ok) throw new Error('خطا در export');
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'dispatch_routes_export.xlsx';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    window.URL.revokeObjectURL(url);
                                } catch (err: any) {
                                    alert(`❌ خطا: ${err.message}`);
                                }
                            }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                        >
                            📤 Export به Excel
                        </button>
                        <button
                            onClick={fetchRoutes}
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
                <div className="p-4 overflow-x-auto">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">در حال بارگذاری...</div>
                    ) : filteredRoutes.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">هیچ رکوردی یافت نشد</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-xs">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">ردیف</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">شهر</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">استان</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">کیلومتر رفت و برگشت</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">روزهای مورد انتظار</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">حق ماموریت مصوب</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">دسته‌بندی مسیر</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">دسته‌بندی فاصله</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">فعال</th>
                                            <th className="px-2 py-2 text-right font-medium text-gray-500">عملیات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {paginatedRoutes.map((route, idx) => (
                                            <tr key={route.id} className="hover:bg-gray-50">
                                                <td className="px-2 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                                <td className="px-2 py-2 font-medium">{route.city || '-'}</td>
                                                <td className="px-2 py-2">{route.province || '-'}</td>
                                                <td className="px-2 py-2">{route.roundTripKm?.toLocaleString('fa-IR') || '-'}</td>
                                                <td className="px-2 py-2">{route.expectedDays?.toLocaleString('fa-IR') || '-'}</td>
                                                <td className="px-2 py-2">{route.approvedAllowance?.toLocaleString('fa-IR') || '-'}</td>
                                                <td className="px-2 py-2">{route.routeCategory || '-'}</td>
                                                <td className="px-2 py-2">{route.distanceCategory || '-'}</td>
                                                <td className="px-2 py-2">
                                                    <span className={`px-2 py-1 rounded text-xs ${route.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {route.isActive ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => { setSelectedRoute(route); setModalMode('edit'); setShowModal(true); }}
                                                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(route.id)}
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
                                        صفحه {currentPage} از {totalPages} (کل: {filteredRoutes.length})
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
                <RouteFormModal
                    mode={modalMode}
                    route={selectedRoute}
                    onSave={handleSave}
                    onCancel={() => { setShowModal(false); setSelectedRoute(null); }}
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
// Route Form Modal
// ============================================
const RouteFormModal: React.FC<{
    mode: 'add' | 'edit';
    route: DispatchRoute | null;
    onSave: (data: any) => void;
    onCancel: () => void;
}> = ({ mode, route, onSave, onCancel }) => {
    const [form, setForm] = useState({
        city: route?.city || '',
        province: route?.province || '',
        roundTripKm: route?.roundTripKm?.toString() || '',
        expectedDays: route?.expectedDays?.toString() || '',
        approvedAllowance: route?.approvedAllowance?.toString() || '',
        routeCategory: route?.routeCategory || '',
        distanceCategory: route?.distanceCategory || '',
        isActive: route?.isActive !== undefined ? route.isActive : true,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.city || !form.province) {
            alert('شهر و استان الزامی است');
            return;
        }

        onSave({
            city: form.city,
            province: form.province,
            roundTripKm: form.roundTripKm ? parseFloat(form.roundTripKm) : null,
            expectedDays: form.expectedDays ? parseInt(form.expectedDays) : null,
            approvedAllowance: form.approvedAllowance ? parseFloat(form.approvedAllowance) : null,
            routeCategory: form.routeCategory || null,
            distanceCategory: form.distanceCategory || null,
            isActive: form.isActive,
        });
    };

    const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
    const labelClass = "block text-sm font-medium text-gray-700 mb-1";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">
                        {mode === 'add' ? 'افزودن مسیر جدید' : 'ویرایش مسیر'}
                    </h2>
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>شهر *</label>
                            <input
                                type="text"
                                value={form.city}
                                onChange={e => setForm({...form, city: e.target.value})}
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
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>کیلومتر رفت و برگشت</label>
                            <input
                                type="number"
                                value={form.roundTripKm}
                                onChange={e => setForm({...form, roundTripKm: e.target.value})}
                                className={inputClass}
                                min="0"
                                step="0.1"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>روزهای مورد انتظار</label>
                            <input
                                type="number"
                                value={form.expectedDays}
                                onChange={e => setForm({...form, expectedDays: e.target.value})}
                                className={inputClass}
                                min="0"
                                step="1"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>حق ماموریت مصوب</label>
                            <input
                                type="number"
                                value={form.approvedAllowance}
                                onChange={e => setForm({...form, approvedAllowance: e.target.value})}
                                className={inputClass}
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>دسته‌بندی مسیر</label>
                            <input
                                type="text"
                                value={form.routeCategory}
                                onChange={e => setForm({...form, routeCategory: e.target.value})}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>دسته‌بندی فاصله</label>
                            <input
                                type="text"
                                value={form.distanceCategory}
                                onChange={e => setForm({...form, distanceCategory: e.target.value})}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>وضعیت</label>
                            <select
                                value={form.isActive ? 'true' : 'false'}
                                onChange={e => setForm({...form, isActive: e.target.value === 'true'})}
                                className={inputClass}
                            >
                                <option value="true">فعال</option>
                                <option value="false">غیرفعال</option>
                            </select>
                        </div>
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
                                <li><strong>شهر</strong> (اجباری) - نام‌های قابل قبول: "شهر", "city", "cityName"</li>
                                <li><strong>استان</strong> (اجباری) - نام‌های قابل قبول: "استان", "province"</li>
                                <li><strong>کیلومتر رفت و برگشت</strong> (اختیاری) - نام‌های قابل قبول: "کیلومتر رفت و برگشت", "roundTripKm", "round_trip_km"</li>
                                <li><strong>روزهای مورد انتظار</strong> (اختیاری) - نام‌های قابل قبول: "روزهای مورد انتظار", "expectedDays", "expected_days", "ماموریت مصوب"</li>
                                <li><strong>حق ماموریت مصوب</strong> (اختیاری) - نام‌های قابل قبول: "حق ماموریت مصوب", "approvedAllowance", "approved_allowance"</li>
                                <li><strong>دسته‌بندی مسیر</strong> (اختیاری) - نام‌های قابل قبول: "دسته‌بندی مسیر", "routeCategory", "route_category"</li>
                                <li><strong>دسته‌بندی فاصله</strong> (اختیاری) - نام‌های قابل قبول: "دسته‌بندی فاصله", "distanceCategory", "distance_category"</li>
                                <li><strong>فعال</strong> (اختیاری) - نام‌های قابل قبول: "فعال", "isActive", "is_active"</li>
                            </ul>
                            <p className="mt-2 text-xs text-blue-700">
                                ⚠️ توجه: اگر مسیر با شهر و استان موجود باشد، اطلاعات به‌روزرسانی می‌شود
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
                                placeholder='[{"city": "تهران", "province": "تهران", "roundTripKm": 200, "expectedDays": 5}]'
                                disabled={importing}
                            />
                        </div>

                        <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800">
                            <strong>فرمت JSON:</strong>
                            <pre className="mt-2 bg-white p-2 rounded text-xs overflow-x-auto">
{`[
  {
    "city": "تهران",
    "province": "تهران",
    "roundTripKm": 200,
    "expectedDays": 5,
    "approvedAllowance": 1000000,
    "routeCategory": "اصلی",
    "distanceCategory": "دور",
    "isActive": true
  }
]`}
                            </pre>
                            <p className="mt-2 text-xs text-purple-700">
                                <strong>نکات:</strong>
                            </p>
                            <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                                <li><strong>city</strong> و <strong>province</strong> اجباری هستند</li>
                                <li>سایر فیلدها اختیاری هستند</li>
                                <li>اگر مسیر با city و province موجود باشد، اطلاعات به‌روزرسانی می‌شود</li>
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
