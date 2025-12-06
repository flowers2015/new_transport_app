import React, { useEffect, useState, useMemo } from 'react';
import FreightHistory from './FreightHistory';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';
import { gregorianToJalali } from '../utils/jalali';
import { getApiUrl } from '../utils/apiConfig';

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

    const fetchHistoryData = async (date?: string, destination?: string, billOfLading?: string, driverName?: string, lineType?: FreightLineType) => {
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
            if (lineType) params.append('lineType', lineType);
            
            const historyUrl = getApiUrl(`freight-announcements/history${params.toString() ? '?' + params.toString() : ''}`);
            
            console.log('🔍 [FreightHistoryContainer] Fetching:', historyUrl);
            
            const [historyRes, vRes, dRes, pdRes, pvRes] = await Promise.all([
                fetch(historyUrl, { headers }),
                fetch(getApiUrl('vehicles'), { headers }),
                fetch(getApiUrl('drivers'), { headers }),
                fetch(getApiUrl('personal-drivers'), { headers }),
                fetch(getApiUrl('personal-vehicles'), { headers }),
            ]);
            
            if (!historyRes.ok) {
                const errorText = await historyRes.text();
                console.error('❌ [FreightHistoryContainer] History response error:', errorText);
                throw new Error('خطا در دریافت تاریخچه اعلام بارها');
            }
            if (!vRes.ok) throw new Error('خطا در دریافت خودروها');
            if (!dRes.ok) throw new Error('خطا در دریافت رانندگان');
            if (!pdRes.ok) throw new Error('خطا در دریافت رانندگان شخصی');
            if (!pvRes.ok) throw new Error('خطا در دریافت خودروهای شخصی');
            
            const [historyRaw, vehiclesData, driversData, personalDriversData, personalVehiclesData] = await Promise.all([
                historyRes.json(),
                vRes.json(),
                dRes.json(),
                pdRes.json(),
                pvRes.json()
            ]);

            console.log(`✅ [FreightHistoryContainer] Received ${Array.isArray(historyRaw) ? historyRaw.length : 0} announcements`);

            const statusMap: Record<string, FreightAnnouncementStatus> = {
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

            const normalize = (a: any): FreightAnnouncement => {
                return {
                    id: a.id,
                    announcementCode: a.announcement_code || a.announcementCode,
                    createdAt: new Date(a.created_at || a.createdAt || Date.now()),
                    // اگر loading_date یک رشته شمسی است (فرمت YYYY/MM/DD یا YYYY-MM-DD)، همان را نگه دار
                    loadingDate: (typeof a.loading_date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(a.loading_date)) 
                        ? (a.loading_date.replace(/-/g, '/') as any)
                        : new Date(a.loading_date || Date.now()),
                    lineType: a.line_type || a.lineType,
                    status: statusMap[a.status] || a.status,
                    cargoValue: Number(a.cargo_value ?? a.cargoValue ?? 0),
                    vehicleType: a.vehicle_type || a.vehicleType || '',
                    notes: a.notes,
                    assignmentType: a.assignment_type || a.assignmentType,
                    assignedDriverId: a.assigned_driver_id || a.assignedDriverId,
                    assignedVehicleId: a.assigned_vehicle_id || a.assignedVehicleId,
                    totalFreightCost: a.total_freight_cost ?? a.totalFreightCost,
                    billOfLadingNumber: a.bill_of_lading_number ?? a.billOfLadingNumber,
                    originCity: a.origin_city || a.originCity,
                    brand: a.brand,
                    representativeType: a.representative_type || a.representativeType,
                    representativeName: a.representative_name || a.representativeName,
                    cartonCount: a.carton_count ?? a.cartonCount,
                    priority: a.priority,
                    products: Array.isArray(a.products) ? a.products : (a.products ? JSON.parse(a.products) : []),
                    platformArrivalTime: a.platform_arrival_time || a.platformArrivalTime,
                    destinations: Array.isArray(a.destinations) ? a.destinations.map((d: any) => ({
                        id: d.id,
                        city: d.city,
                        representativeName: d.representative_name || d.representativeName,
                        tonnage: d.tonnage,
                        unloadTime: d.unload_time || d.unloadTime,
                        freightCost: d.freight_cost ?? d.freightCost,
                    })) : [],
                    history: a.history || [],
                    // اطلاعات کارمند اعلام‌کننده
                    creator_full_name: a.creator_full_name || a.creatorFullName,
                    creator_username: a.creator_username || a.creatorUsername,
                    creator_user_id: a.creator_user_id || a.creatorUserId,
                };
            };

            const announcementsData: FreightAnnouncement[] = Array.isArray(historyRaw) ? historyRaw.map(normalize) : [];

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

    // جستجو - فقط یک بار در mount برای بارگذاری اولیه
    useEffect(() => {
        fetchHistoryData(undefined, undefined, undefined, undefined, activeLine); // بارگذاری اولیه بدون فیلتر اما با activeLine
    }, [activeLine]); // وقتی activeLine تغییر می‌کند، دوباره fetch کن
    
    // جستجو دستی با دکمه - فقط برای تب فعلی
    const handleSearch = () => {
        fetchHistoryData(
            filterDate || undefined, 
            filterDestination?.trim() || undefined,
            filterBillOfLading?.trim() || undefined,
            filterDriverName?.trim() || undefined,
            activeLine // فقط برای تب فعلی
        );
    };

    const handleClearFilters = () => {
        setFilterDate('');
        setFilterDestination('');
        setFilterBillOfLading('');
        setFilterDriverName('');
        fetchHistoryData(undefined, undefined, undefined, undefined, activeLine);
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
            onSearch={handleSearch}
            onClearFilters={handleClearFilters}
        />
    );
};

export default FreightHistoryContainer;

