import React, { useEffect, useState, useMemo } from 'react';
import FreightHistory from './FreightHistory';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';

const FreightHistoryContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
    const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    
    // فیلترهای جستجو
    const [filterDate, setFilterDate] = useState<string>(''); // تاریخ شمسی: 1403/10/15
    const [filterDestination, setFilterDestination] = useState<string>('');

    const fetchHistoryData = async (date?: string, destination?: string) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` } as any;
            
            // ساخت query string برای فیلترها
            const params = new URLSearchParams();
            if (date) params.append('date', date);
            if (destination) params.append('destination', destination);
            
            const historyUrl = `http://localhost:3000/api/v1/freight-announcements/history${params.toString() ? '?' + params.toString() : ''}`;
            
            const [historyRes, vRes, dRes, pdRes, pvRes] = await Promise.all([
                fetch(historyUrl, { headers }),
                fetch('http://localhost:3000/api/v1/vehicles', { headers }),
                fetch('http://localhost:3000/api/v1/drivers', { headers }),
                fetch('http://localhost:3000/api/v1/personal-drivers', { headers }),
                fetch('http://localhost:3000/api/v1/personal-vehicles', { headers }),
            ]);
            
            if (!historyRes.ok) throw new Error('خطا در دریافت تاریخچه اعلام بارها');
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
                    createdAt: new Date(a.created_at || a.createdAt || a.loading_date || Date.now()),
                    loadingDate: new Date(a.loading_date || a.loadingDate || Date.now()),
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
                };
            };

            const announcementsData: FreightAnnouncement[] = Array.isArray(historyRaw) ? historyRaw.map(normalize) : [];

            setAnnouncements(announcementsData);
            setVehicles(vehiclesData);
            setDrivers(driversData);
            setPersonalDrivers(personalDriversData);
            setPersonalVehicles(personalVehiclesData);
        } catch (e: any) {
            console.error('❌ [FreightHistory] Error fetching data:', e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // اگر فیلتر تاریخ خالی است، همه Finalized را نمایش می‌دهیم
        fetchHistoryData(filterDate || undefined, filterDestination || undefined);
    }, [filterDate, filterDestination]);

    const handleSearch = () => {
        fetchHistoryData(filterDate, filterDestination);
    };

    const handleClearFilters = () => {
        setFilterDate('');
        setFilterDestination('');
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
            onSearch={handleSearch}
            onClearFilters={handleClearFilters}
        />
    );
};

export default FreightHistoryContainer;

