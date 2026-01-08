import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DispatchBoardEntry } from '../types';
import { getApiUrl } from '../utils/apiConfig';

type BoardResponse = Record<string, DispatchBoardEntry[]>;

type TableRow = {
    rowNumber: number;
    city: string;
    driverName: string;
    vehicleCode: string;
    vehicleType: string;
    assignmentDate: string;
    daysSinceAssignment: number;
    expectedDays: number | null;
    entry: DispatchBoardEntry;
};

type SortColumn = 'city' | 'driverName' | 'vehicleCode' | 'vehicleType' | 'assignmentDate' | 'daysSinceAssignment' | null;
type SortDirection = 'asc' | 'desc';

const DispatchBoardView: React.FC = () => {
    const [board, setBoard] = useState<BoardResponse>({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const token = useMemo(() => localStorage.getItem('token') || '', []);
    const headers = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }),
        [token]
    );

    const loadBoard = async () => {
        try {
            setLoading(true);
            const res = await fetch(getApiUrl('dispatch/board'), { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as BoardResponse;
            setBoard(data || {});
        } catch (error) {
            console.error('Failed to load dispatch board', error);
            setBoard({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBoard();
    }, []);

    useEffect(() => {
        const handler = () => loadBoard();
        window.addEventListener('dispatch-board:update', handler);
        return () => {
            window.removeEventListener('dispatch-board:update', handler);
        };
    }, []);

    // تبدیل داده‌ها به فرمت جدول
    const tableRows = useMemo(() => {
        const rows: TableRow[] = [];
        let rowNumber = 1;
        
        Object.entries(board).forEach(([city, entries]) => {
            entries.forEach(entry => {
                const assignmentDate = entry.createdAt 
                    ? new Date(entry.createdAt).toLocaleDateString('fa-IR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    })
                    : '---';
                
                // محاسبه تعداد روز از تاریخ تخصیص تا امروز
                let daysSince = 0;
                if (entry.createdAt) {
                    const assignmentDateObj = new Date(entry.createdAt);
                    const today = new Date();
                    const diffTime = today.getTime() - assignmentDateObj.getTime();
                    daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                } else if (entry.daysSinceAssignment !== undefined) {
                    daysSince = entry.daysSinceAssignment;
                }
                
                // تشخیص نوع خودرو (کشنده یا ده چرخ)
                let vehicleType = 'نامشخص';
                if (entry.vehicleType) {
                    // اگر vehicleType از entry بیاید
                    if (entry.vehicleType === 'کشنده' || entry.vehicleType === 'تریلی' || entry.vehicleType === 'مینی تریلی') {
                        vehicleType = 'کشنده';
                    } else if (entry.vehicleType === 'ده چرخ') {
                        vehicleType = 'ده چرخ';
                    } else {
                        vehicleType = entry.vehicleType;
                    }
                } else if (entry.vehicle?.vehicleCategory) {
                    // اگر از vehicleCategory بیاید
                    const category = entry.vehicle.vehicleCategory;
                    if (category === 'trailer' || category === 'mini-trailer') {
                        vehicleType = 'کشنده';
                    } else if (category === 'ten-wheel') {
                        vehicleType = 'ده چرخ';
                    } else {
                        vehicleType = category;
                    }
                }
                
                rows.push({
                    rowNumber: rowNumber++,
                    city,
                    driverName: entry.driver?.name || 'نامشخص',
                    vehicleCode: entry.vehicle?.vehicleCode || entry.vehicle?.model || '---',
                    vehicleType,
                    assignmentDate,
                    daysSinceAssignment: daysSince,
                    expectedDays: entry.route?.expectedDays || null,
                    entry
                });
            });
        });
        return rows;
    }, [board]);

    // فیلتر کردن ردیف‌ها بر اساس جستجو
    const filteredRows = useMemo(() => {
        let filtered = tableRows;
        
        // فیلتر جستجو
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            filtered = filtered.filter(row => 
                row.city.toLowerCase().includes(term) ||
                row.driverName.toLowerCase().includes(term) ||
                row.vehicleCode.toLowerCase().includes(term) ||
                row.vehicleType.toLowerCase().includes(term)
            );
        }
        
        // سورت کردن
        if (sortColumn) {
            filtered = [...filtered].sort((a, b) => {
                let aVal: any = a[sortColumn];
                let bVal: any = b[sortColumn];
                
                // برای ستون‌های عددی
                if (sortColumn === 'daysSinceAssignment' || sortColumn === 'rowNumber') {
                    aVal = Number(aVal) || 0;
                    bVal = Number(bVal) || 0;
                }
                
                // برای ستون‌های متنی
                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = (bVal || '').toLowerCase();
                }
                
                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        return filtered;
    }, [tableRows, searchTerm, sortColumn, sortDirection]);
    
    // دسته‌بندی بر اساس شهر (رنک)
    const cityRank = useMemo(() => {
        const cityCounts = new Map<string, number>();
        filteredRows.forEach(row => {
            cityCounts.set(row.city, (cityCounts.get(row.city) || 0) + 1);
        });
        
        // مرتب‌سازی شهرها بر اساس تعداد
        const sortedCities = Array.from(cityCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([city], index) => ({ city, rank: index + 1 }));
        
        const rankMap = new Map<string, number>();
        sortedCities.forEach(({ city, rank }) => {
            rankMap.set(city, rank);
        });
        
        return rankMap;
    }, [filteredRows]);
    
    // رنگ‌بندی بر اساس رنک شهر
    const getCityColor = (city: string) => {
        const rank = cityRank.get(city) || 0;
        // رنگ‌های مختلف برای رنک‌های مختلف
        const colors = [
            'bg-blue-50 text-blue-900',      // رنک 1
            'bg-green-50 text-green-900',   // رنک 2
            'bg-yellow-50 text-yellow-900', // رنک 3
            'bg-orange-50 text-orange-900', // رنک 4
            'bg-purple-50 text-purple-900', // رنک 5
            'bg-pink-50 text-pink-900',     // رنک 6
            'bg-indigo-50 text-indigo-900', // رنک 7
            'bg-teal-50 text-teal-900',     // رنک 8
        ];
        return colors[(rank - 1) % colors.length] || 'bg-slate-50 text-slate-900';
    };
    
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };
    
    // رنگ‌بندی مدت زمان بر اساس ماموریت مصوب
    const getDaysColor = (daysSince: number, expectedDays: number | null) => {
        if (expectedDays === null || expectedDays === 0) {
            // اگر ماموریت مصوب نداشتیم، از منطق قبلی استفاده می‌کنیم
            if (daysSince > 7) return 'text-red-600';
            if (daysSince > 3) return 'text-orange-600';
            return 'text-green-600';
        }
        
        // بر اساس ماموریت مصوب
        if (daysSince < expectedDays) {
            return 'text-green-600'; // کمتر از ماموریت مصوب = سبز
        } else if (daysSince === expectedDays) {
            return 'text-yellow-600'; // برابر با ماموریت مصوب = زرد
        } else {
            return 'text-red-600'; // بیشتر از ماموریت مصوب = قرمز
        }
    };

    return (
        <div className="p-4 space-y-4">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">تابلو اعلام بار</h2>
                        <p className="text-xs text-slate-500">
                            فهرست تخصیص‌های ثبت شده به تفکیک شهر مقصد نمایش داده می‌شود.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="جستجوی شهر، راننده، کد خودرو یا نوع خودرو..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                        />
                        <button
                            onClick={loadBoard}
                            className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
                            disabled={loading}
                        >
                            بروزرسانی
                        </button>
                    </div>
                </header>
                {loading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">در حال بارگذاری...</div>
                ) : filteredRows.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        {searchTerm ? 'نتیجه‌ای یافت نشد.' : 'هنوز تخصیصی ثبت نشده است.'}
                    </div>
                ) : (
                    <>
                        {/* توضیحات رنگ‌بندی */}
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">راهنمای رنگ‌بندی مدت زمان:</span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                    <span>کمتر از ماموریت مصوب</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                                    <span>برابر با ماموریت مصوب</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                    <span>بیشتر از ماموریت مصوب</span>
                                </span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th 
                                        className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('rowNumber')}
                                    >
                                        ردیف
                                        {sortColumn === 'rowNumber' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('city')}
                                    >
                                        شهر مقصد
                                        {sortColumn === 'city' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('driverName')}
                                    >
                                        نام راننده
                                        {sortColumn === 'driverName' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('vehicleCode')}
                                    >
                                        کد خودرو
                                        {sortColumn === 'vehicleCode' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('vehicleType')}
                                    >
                                        نوع خودرو
                                        {sortColumn === 'vehicleType' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('assignmentDate')}
                                    >
                                        تاریخ تخصیص
                                        {sortColumn === 'assignmentDate' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                    <th 
                                        className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                                        onClick={() => handleSort('daysSinceAssignment')}
                                    >
                                        مدت زمان رفت (روز)
                                        {sortColumn === 'daysSinceAssignment' && (
                                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {filteredRows.map((row, index) => (
                                    <tr key={`${row.entry.assignmentId}-${index}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                            <div className="text-sm text-slate-600">{row.rowNumber}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className={`text-sm font-bold ${getCityColor(row.city)} px-2 py-1 rounded inline-block`}>
                                                {row.city}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-900">{row.driverName}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-900">{row.vehicleCode}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-900">{row.vehicleType}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-slate-600">{row.assignmentDate}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                            <div className={`text-sm font-medium ${getDaysColor(row.daysSinceAssignment, row.expectedDays)}`}>
                                                {row.daysSinceAssignment} روز
                                                {row.expectedDays && (
                                                    <span className="text-xs text-slate-500 mr-1">(مصوب: {row.expectedDays})</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};

export default DispatchBoardView;



