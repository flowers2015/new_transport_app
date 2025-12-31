import React, { useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';

const DebugDriverCalculations: React.FC = () => {
    const [driverId, setDriverId] = useState<string>('');
    const [announcementId, setAnnouncementId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [listData, setListData] = useState<any>(null);
    const [detailData, setDetailData] = useState<any>(null);

    // لیست رکوردهای پرداخت شده
    const fetchList = async () => {
        if (!driverId.trim()) {
            alert('لطفاً شناسه راننده یا کد پرسنلی را وارد کنید');
            return;
        }

        setLoading(true);
        setError(null);
        setListData(null);
        setDetailData(null);

        try {
            const token = localStorage.getItem('token');
            const searchValue = driverId.trim();
            
            // تشخیص اینکه UUID است (driver_id) یا کد پرسنلی (employee_id)
            // UUID فرمت: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 کاراکتر با خط تیره)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchValue);
            const queryParam = isUUID ? 'driverId' : 'employeeId';
            
            const response = await fetch(
                getApiUrl(`driver-calculations/debug/list-paid?${queryParam}=${encodeURIComponent(searchValue)}`),
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'خطا در دریافت اطلاعات' }));
                throw new Error(errorData.message || `خطای HTTP: ${response.status}`);
            }

            const data = await response.json();
            setListData(data);
            
            // نمایش در console برای کپی کردن
            console.log('📊 [DEBUG] لیست رکوردهای پرداخت شده:', data);
            console.log('📋 [DEBUG] تعداد رکوردها:', data.count);
            if (data.records && data.records.length > 0) {
                console.log('🔍 [DEBUG] اولین رکورد:', data.records[0]);
                console.log('📊 [DEBUG] فیلدهای پیمایش در اولین رکورد:', {
                    approved_kilometers: data.records[0].approved_kilometers,
                    excess_kilometers: data.records[0].excess_kilometers,
                    approved_mission_days: data.records[0].approved_mission_days,
                    excess_mission_days: data.records[0].excess_mission_days
                });
            }
        } catch (err: any) {
            setError(err.message || 'خطا در دریافت لیست');
            console.error('Error fetching list:', err);
        } finally {
            setLoading(false);
        }
    };

    // دریافت جزئیات یک رکورد
    const fetchDetail = async (selectedDriverId: string, selectedAnnouncementId: string) => {
        setLoading(true);
        setError(null);
        setDetailData(null);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                getApiUrl(`driver-calculations/debug/${encodeURIComponent(selectedDriverId)}/${encodeURIComponent(selectedAnnouncementId)}`),
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'خطا در دریافت اطلاعات' }));
                throw new Error(errorData.message || `خطای HTTP: ${response.status}`);
            }

            const data = await response.json();
            setDetailData(data);
            
            // نمایش در console برای کپی کردن
            console.log('📊 [DEBUG] جزئیات کامل رکورد:', data);
            console.log('📋 [DEBUG] فیلدهای پیمایش و ماموریت:', data.mileageAndMission);
            console.log('💾 [DEBUG] برای کپی کردن تمام داده‌ها، این کد را در console بزنید:');
            console.log(`
// کپی این کد و در console بزنید:
const debugData = ${JSON.stringify(data, null, 2)};
console.log('Driver ID:', '${selectedDriverId}');
console.log('Announcement ID:', '${selectedAnnouncementId}');
console.log('فیلدهای پیمایش و ماموریت:', debugData.mileageAndMission);
console.log('تمام داده‌ها:', debugData.record);
            `);
        } catch (err: any) {
            setError(err.message || 'خطا در دریافت جزئیات');
            console.error('Error fetching detail:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRowClick = (record: any) => {
        setAnnouncementId(record.announcement_id);
        fetchDetail(record.driver_id, record.announcement_id);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
                <h1 className="text-2xl font-bold text-slate-800 mb-6">🔍 Debug: بررسی محاسبات راننده</h1>

                {/* ورودی شناسه راننده */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        شناسه راننده (Driver ID) یا کد پرسنلی (Employee ID):
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={driverId}
                            onChange={(e) => setDriverId(e.target.value)}
                            placeholder="مثال: b144339d-c369-436b-8601-821b8905b055"
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    fetchList();
                                }
                            }}
                        />
                        <button
                            onClick={fetchList}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                            {loading ? 'در حال بارگذاری...' : 'جستجو'}
                        </button>
                    </div>
                </div>

                {/* نمایش خطا */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
                        ❌ {error}
                    </div>
                )}

                {/* لیست رکوردها */}
                {listData && (
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-slate-700 mb-4">
                            لیست رکوردهای پرداخت شده ({listData.count} رکورد)
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full border border-slate-300">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">کد اعلام بار</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">تاریخ بارگیری</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">پیمایش مصوب</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">پیمایش مازاد</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">ماموریت مصوب</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">ماموریت مازاد</th>
                                        <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {listData.records.map((record: any, index: number) => (
                                        <tr
                                            key={index}
                                            className="hover:bg-slate-50 cursor-pointer"
                                            onClick={() => handleRowClick(record)}
                                        >
                                            <td className="border border-slate-300 px-4 py-2 text-sm">{record.announcement_code || '-'}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm">{record.loading_date || '-'}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm text-center">
                                                {record.approved_kilometers != null ? record.approved_kilometers : '-'}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm text-center">
                                                {record.excess_kilometers != null ? record.excess_kilometers : '-'}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm text-center">
                                                {record.approved_mission_days != null ? record.approved_mission_days : '-'}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm text-center">
                                                {record.excess_mission_days != null ? record.excess_mission_days : '-'}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-sm text-center">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRowClick(record);
                                                    }}
                                                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                                >
                                                    نمایش جزئیات
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* جزئیات رکورد */}
                {detailData && (
                    <div className="mt-6">
                        <h2 className="text-xl font-semibold text-slate-700 mb-4">جزئیات کامل رکورد</h2>
                        
                        {/* فیلدهای پیمایش و ماموریت */}
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                            <h3 className="font-semibold text-blue-900 mb-2">📊 فیلدهای پیمایش و ماموریت:</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <strong>پیمایش مصوب:</strong> {detailData.mileageAndMission?.approved_kilometers ?? 'null'}
                                </div>
                                <div>
                                    <strong>پیمایش مازاد:</strong> {detailData.mileageAndMission?.excess_kilometers ?? 'null'}
                                </div>
                                <div>
                                    <strong>ماموریت مصوب:</strong> {detailData.mileageAndMission?.approved_mission_days ?? 'null'}
                                </div>
                                <div>
                                    <strong>ماموریت مازاد:</strong> {detailData.mileageAndMission?.excess_mission_days ?? 'null'}
                                </div>
                                <div>
                                    <strong>پیمایش مازاد راننده کمکی:</strong> {detailData.mileageAndMission?.helper_driver_excess_kilometers ?? 'null'}
                                </div>
                                <div>
                                    <strong>ماموریت مازاد راننده کمکی:</strong> {detailData.mileageAndMission?.helper_driver_excess_mission_days ?? 'null'}
                                </div>
                            </div>
                        </div>

                        {/* تمام فیلدها */}
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-slate-700">📋 تمام فیلدها:</h3>
                                <button
                                    onClick={() => {
                                        const dataToCopy = JSON.stringify(detailData.record, null, 2);
                                        navigator.clipboard.writeText(dataToCopy).then(() => {
                                            alert('✅ داده‌ها در کلیپ‌بورد کپی شد! حالا در Console این را بزنید تا نمایش داده شود:\n\nconsole.log(' + JSON.stringify(dataToCopy.substring(0, 100)) + '...)');
                                        });
                                    }}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                >
                                    کپی JSON
                                </button>
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <pre className="text-xs bg-white p-4 rounded border border-slate-300 overflow-x-auto">
                                    {JSON.stringify(detailData.record, null, 2)}
                                </pre>
                            </div>
                        </div>

                        {/* لیست کلیدها */}
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                            <h3 className="font-semibold text-yellow-900 mb-2">🔑 لیست کلیدها ({detailData.allKeys?.length} کلید):</h3>
                            <div className="text-sm text-yellow-800">
                                {detailData.allKeys?.join(', ')}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DebugDriverCalculations;

