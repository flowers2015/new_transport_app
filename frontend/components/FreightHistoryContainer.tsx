import React, { useEffect, useState, useCallback } from 'react';
import FreightHistory from './FreightHistory';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { pickAssignmentFieldsFromApi } from '../utils/freightDisplay';

const HISTORY_STATUS_MAP: Record<string, FreightAnnouncementStatus> = {
    Draft: FreightAnnouncementStatus.Draft,
    PendingManagerApproval: FreightAnnouncementStatus.PendingManagerApproval,
    Rejected: FreightAnnouncementStatus.Rejected,
    PendingPersonalAssignment: FreightAnnouncementStatus.PendingPersonalAssignment,
    PendingCompanyAssignment: FreightAnnouncementStatus.PendingCompanyAssignment,
    Assigned: FreightAnnouncementStatus.Assigned,
    InTransit: FreightAnnouncementStatus.InTransit,
    Finalized: FreightAnnouncementStatus.Finalized,
    Cancelled: FreightAnnouncementStatus.Cancelled,
    ReAnnounced: FreightAnnouncementStatus.ReAnnounced,
};

const normalizeHistoryAnnouncement = (a: any): FreightAnnouncement => {
    return {
        id: a.id,
        announcementCode: a.announcement_code || a.announcementCode,
        createdAt: new Date(a.created_at || a.createdAt || Date.now()),
        loadingDate:
            typeof a.loading_date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(a.loading_date)
                ? (a.loading_date.replace(/-/g, '/') as any)
                : new Date(a.loading_date || Date.now()),
        lineType: a.line_type || a.lineType,
        status: HISTORY_STATUS_MAP[a.status] || a.status,
        cargoValue: Number(a.cargo_value ?? a.cargoValue ?? 0),
        vehicleType: a.vehicle_type || a.vehicleType || '',
        notes: a.notes,
        ...pickAssignmentFieldsFromApi(a),
        originCity: a.origin_city || a.originCity,
        brand: a.brand,
        representativeType: a.representative_type || a.representativeType,
        representativeName: a.representative_name || a.representativeName,
        cartonCount: a.carton_count ?? a.cartonCount,
        palletCount: a.pallet_count ?? a.palletCount,
        loadingType: a.loading_type || a.loadingType,
        priority: a.priority,
        products: Array.isArray(a.products)
            ? a.products
            : typeof a.products === 'string'
              ? (() => {
                    try {
                        return JSON.parse(a.products);
                    } catch {
                        return [];
                    }
                })()
              : a.products && typeof a.products === 'object'
                ? a.products
                : [],
        platformArrivalTime: a.platform_arrival_time || a.platformArrivalTime,
        destinations: Array.isArray(a.destinations)
            ? a.destinations.map((d: any) => ({
                  id: d.id,
                  city: d.city,
                  representativeName: d.representative_name || d.representativeName,
                  representativeType: d.representative_type || d.representativeType,
                  tonnage: d.tonnage,
                  unloadTime: d.unload_time || d.unloadTime,
                  freightCost: d.freight_cost ?? d.freightCost,
                  cargoValue: Number(d.cargo_value ?? d.cargoValue ?? 0) || 0,
                  deliveryDate: d.delivery_date || d.deliveryDate,
                  loadingDate: d.loading_date || d.loadingDate || undefined,
                  platformArrivalTime:
                      d.platform_arrival_time || d.platformArrivalTime || undefined,
                  lisCode: d.lis_code || d.lisCode,
                  brandType: d.brand_type || d.brandType,
                  brand: d.brand,
                  brand2: d.brand2,
                  products: Array.isArray(d.products)
                      ? d.products
                      : typeof d.products === 'string'
                        ? (() => {
                              try {
                                  return JSON.parse(d.products);
                              } catch {
                                  return [];
                              }
                          })()
                        : d.products && typeof d.products === 'object'
                          ? d.products
                          : [],
              }))
            : [],
        history: a.history || [],
        creator_full_name: a.creator_full_name || a.creatorFullName,
        creator_username: a.creator_username || a.creatorUsername,
        creator_user_id: a.creator_user_id || a.creatorUserId,
        financeDisposition: a.finance_disposition || a.financeDisposition || null,
        financeRejectType: a.finance_reject_type || a.financeRejectType || null,
        financeRejectNote: a.finance_reject_note || a.financeRejectNote || null,
        financeRejectedAt: a.finance_rejected_at || a.financeRejectedAt || null,
        relatedExceptionId: a.related_exception_id || a.relatedExceptionId || null,
    } as FreightAnnouncement;
};

const FreightHistoryContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
    const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    
    // فیلترهای جستجو - بدون تاریخ پیش‌فرض (خالی باشد تا همه را نشان بده)
    const [filterDate, setFilterDate] = useState<string>(''); // تاریخ شمسی: خالی = همه
    const [filterDestination, setFilterDestination] = useState<string>('');
    const [filterBillOfLading, setFilterBillOfLading] = useState<string>(''); // شماره بارنامه
    const [filterDriverName, setFilterDriverName] = useState<string>(''); // نام راننده
    const [filterCreatorName, setFilterCreatorName] = useState<string>(''); // کارمند اعلام‌کننده
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const fetchHistoryData = async (date?: string, destination?: string, billOfLading?: string, driverName?: string, creatorName?: string, lineType?: FreightLineType, page: number = 1, limit: number = 50) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` } as any;
            
            // ساخت query string برای فیلترها - فقط اگر مقدار داشته باشند
            const params = new URLSearchParams();
            if (date && date.trim()) params.append('date', date.trim());
            if (destination && destination.trim()) params.append('destination', destination.trim());
            if (billOfLading && billOfLading.trim()) params.append('billOfLading', billOfLading.trim());
            if (driverName && driverName.trim()) params.append('driverName', driverName.trim());
            if (creatorName && creatorName.trim()) params.append('creatorName', creatorName.trim());
            if (lineType) params.append('lineType', lineType);
            params.append('page', page.toString());
            params.append('limit', limit.toString());
            
            const historyUrl = getApiUrl(`freight-announcements/history${params.toString() ? '?' + params.toString() : ''}`);
            
            console.log('🔍 [FreightHistoryContainer] Fetching:', historyUrl);
            
            // استفاده از cachedFetch برای بهبود عملکرد
            // Lazy Loading: personal-drivers و personal-vehicles فقط وقتی که نیاز است لود می‌شوند
            const { cachedFetch } = await import('../utils/apiCache');
            
            // بررسی اینکه آیا personal resources نیاز است (اگر announcement با assignmentType === 'personal' وجود دارد)
            // برای تاریخچه، همیشه لود می‌کنیم چون ممکن است در تاریخچه assignment های personal وجود داشته باشد
            // استفاده از Pagination: فقط 100 رکورد اول
            const [historyResponse, vehiclesData, driversData, personalDriversResponse, personalVehiclesResponse] = await Promise.all([
                cachedFetch(historyUrl, { headers }, 30 * 1000), // 30s cache for history
                cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000), // 10 min cache
                cachedFetch(getApiUrl('drivers'), { headers }, 10 * 60 * 1000), // 10 min cache
                cachedFetch(getApiUrl('personal-drivers?page=1&limit=100'), { headers }, 10 * 60 * 1000), // 10 min cache - با Pagination
                cachedFetch(getApiUrl('personal-vehicles?page=1&limit=100'), { headers }, 10 * 60 * 1000), // 10 min cache - با Pagination
            ]);
            
            // Handle paginated response for personal resources
            const personalDriversData = (personalDriversResponse && typeof personalDriversResponse === 'object' && 'data' in personalDriversResponse) 
                ? personalDriversResponse.data 
                : (Array.isArray(personalDriversResponse) ? personalDriversResponse : []);
            const personalVehiclesData = (personalVehiclesResponse && typeof personalVehiclesResponse === 'object' && 'data' in personalVehiclesResponse) 
                ? personalVehiclesResponse.data 
                : (Array.isArray(personalVehiclesResponse) ? personalVehiclesResponse : []);

            // Handle paginated response
            let historyRaw;
            if (historyResponse && typeof historyResponse === 'object' && 'data' in historyResponse) {
                // New paginated response format
                historyRaw = historyResponse.data;
                setTotalCount(historyResponse.pagination?.total || 0);
                setTotalPages(historyResponse.pagination?.totalPages || 0);
            } else {
                // Old format (backward compatibility)
                historyRaw = Array.isArray(historyResponse) ? historyResponse : [];
                setTotalCount(historyRaw.length);
                setTotalPages(1);
            }

            console.log(`✅ [FreightHistoryContainer] Received ${Array.isArray(historyRaw) ? historyRaw.length : 0} announcements (page ${page}, total: ${totalCount})`);

            const announcementsData: FreightAnnouncement[] = Array.isArray(historyRaw)
                ? historyRaw.map(normalizeHistoryAnnouncement)
                : [];

            setAnnouncements(announcementsData);
            setVehicles(vehiclesData);
            setDrivers(driversData);
            setPersonalDrivers(personalDriversData);
            setPersonalVehicles(personalVehiclesData);
        } catch (e: any) {
            console.error('❌ [FreightHistoryContainer] Error fetching data:', e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistoryForExcelExport = useCallback(
        async (opts: { dateFrom: string; dateTo: string }): Promise<FreightAnnouncement[]> => {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` } as HeadersInit;
            const pageSize = 100;
            const maxRows = 5000;
            const all: FreightAnnouncement[] = [];
            let page = 1;
            let totalPagesLocal = 1;

            while (page <= totalPagesLocal && all.length < maxRows) {
                const params = new URLSearchParams();
                if (opts.dateFrom?.trim()) params.append('dateFrom', opts.dateFrom.trim().replace(/-/g, '/'));
                if (opts.dateTo?.trim()) params.append('dateTo', opts.dateTo.trim().replace(/-/g, '/'));
                if (filterDestination?.trim()) params.append('destination', filterDestination.trim());
                if (filterBillOfLading?.trim()) params.append('billOfLading', filterBillOfLading.trim());
                if (filterDriverName?.trim()) params.append('driverName', filterDriverName.trim());
                if (filterCreatorName?.trim()) params.append('creatorName', filterCreatorName.trim());
                params.append('lineType', activeLine);
                params.append('page', String(page));
                params.append('limit', String(pageSize));

                const res = await fetch(
                    getApiUrl(`freight-announcements/history?${params.toString()}`),
                    { headers }
                );
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error(errText || 'خطا در دریافت داده برای خروجی اکسل');
                }
                const body = await res.json();
                const raw = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
                all.push(...raw.map(normalizeHistoryAnnouncement));
                totalPagesLocal = Number(body?.pagination?.totalPages) || 1;
                if (raw.length === 0) break;
                page += 1;
            }

            if (all.length >= maxRows) {
                console.warn(`⚠️ [FreightHistoryContainer] Excel export capped at ${maxRows} rows`);
            }
            return all.slice(0, maxRows);
        },
        [
            activeLine,
            filterDestination,
            filterBillOfLading,
            filterDriverName,
            filterCreatorName,
        ]
    );

    // جستجو - فقط یک بار در mount برای بارگذاری اولیه
    useEffect(() => {
        setCurrentPage(1); // Reset to first page when line changes
        fetchHistoryData(undefined, undefined, undefined, undefined, undefined, activeLine, 1, itemsPerPage); // بارگذاری اولیه بدون فیلتر اما با activeLine
    }, [activeLine]); // وقتی activeLine تغییر می‌کند، دوباره fetch کن
    
    // جستجو دستی با دکمه - فقط برای تب فعلی
    const handleSearch = () => {
        setCurrentPage(1); // Reset to first page on search
        fetchHistoryData(
            filterDate || undefined, 
            filterDestination?.trim() || undefined,
            filterBillOfLading?.trim() || undefined,
            filterDriverName?.trim() || undefined,
            filterCreatorName?.trim() || undefined,
            activeLine, // فقط برای تب فعلی
            1, // Reset to first page
            itemsPerPage
        );
    };

    const handleClearFilters = () => {
        setFilterDate('');
        setFilterDestination('');
        setFilterBillOfLading('');
        setFilterDriverName('');
        setFilterCreatorName('');
        setCurrentPage(1);
        fetchHistoryData(undefined, undefined, undefined, undefined, undefined, activeLine, 1, itemsPerPage);
    };
    
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchHistoryData(
            filterDate || undefined,
            filterDestination?.trim() || undefined,
            filterBillOfLading?.trim() || undefined,
            filterDriverName?.trim() || undefined,
            filterCreatorName?.trim() || undefined,
            activeLine,
            newPage,
            itemsPerPage
        );
    };
    
    const handleItemsPerPageChange = (newLimit: number) => {
        setItemsPerPage(newLimit);
        setCurrentPage(1);
        fetchHistoryData(
            filterDate || undefined,
            filterDestination?.trim() || undefined,
            filterBillOfLading?.trim() || undefined,
            filterDriverName?.trim() || undefined,
            filterCreatorName?.trim() || undefined,
            activeLine,
            1,
            newLimit
        );
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <FreightHistory
            announcements={announcements}
            vehicles={vehicles}
            drivers={drivers}
            personalDrivers={personalDrivers}
            personalVehicles={personalVehicles}
            currentUser={currentUser}
            activeLine={activeLine}
            setActiveLine={setActiveLine}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterDestination={filterDestination}
            setFilterDestination={setFilterDestination}
            filterBillOfLading={filterBillOfLading}
            setFilterBillOfLading={setFilterBillOfLading}
            filterDriverName={filterDriverName}
            setFilterDriverName={setFilterDriverName}
            filterCreatorName={filterCreatorName}
            setFilterCreatorName={setFilterCreatorName}
            onSearch={handleSearch}
            onClearFilters={handleClearFilters}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            onFetchForExcelExport={fetchHistoryForExcelExport}
        />
    );
};

export default FreightHistoryContainer;

