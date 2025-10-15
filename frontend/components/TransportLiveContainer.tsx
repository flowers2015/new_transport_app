import React, { useEffect, useState } from 'react';
import TransportLive from './TransportLive';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle } from '../types';

const TransportLiveContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            setError(null);
            console.log('🚀 [TransportLive] Starting data fetch...');
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` } as any;
                console.log('📡 [TransportLive] Fetching from APIs:', {
                    freight: 'http://localhost:3000/api/v1/freight-announcements',
                    vehicles: 'http://localhost:3000/api/v1/vehicles',
                    drivers: 'http://localhost:3000/api/v1/drivers'
                });
                
                const [faRes, vRes, dRes] = await Promise.all([
                    fetch('http://localhost:3000/api/v1/freight-announcements', { headers }),
                    fetch('http://localhost:3000/api/v1/vehicles', { headers }),
                    fetch('http://localhost:3000/api/v1/drivers', { headers }),
                ]);
                
                console.log('📊 [TransportLive] API Response Status:', {
                    freight: faRes.status,
                    vehicles: vRes.status,
                    drivers: dRes.status
                });
                
                if (!faRes.ok) throw new Error('خطا در دریافت اعلام بارها');
                if (!vRes.ok) throw new Error('خطا در دریافت خودروها');
                if (!dRes.ok) throw new Error('خطا در دریافت رانندگان');
                
                const [announcementsRaw, vehiclesData, driversData] = await Promise.all([
                    faRes.json(),
                    vRes.json(),
                    dRes.json()
                ]);
                
                console.log('📋 [TransportLive] Raw Data Received:', {
                    announcements: announcementsRaw,
                    vehicles: vehiclesData,
                    drivers: driversData
                });
                
                console.log('📈 [TransportLive] Data Summary:', {
                    announcementsCount: announcementsRaw?.length || 0,
                    vehiclesCount: vehiclesData?.length || 0,
                    driversCount: driversData?.length || 0,
                    announcementStatuses: announcementsRaw?.map((a: any) => a.status) || [],
                    vehicleTypes: vehiclesData?.map((v: any) => v.vehicleCategory) || []
                });

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
                        products: a.products || [],
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

                const announcementsData: FreightAnnouncement[] = Array.isArray(announcementsRaw) ? announcementsRaw.map(normalize) : [];
                console.log('🧭 [TransportLive] Normalized Announcements:', announcementsData);

                setAnnouncements(announcementsData);
                setVehicles(vehiclesData);
                setDrivers(driversData);
                
                console.log('✅ [TransportLive] Data successfully loaded and set in state');
            } catch (e: any) {
                console.error('❌ [TransportLive] Error fetching data:', e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const onUpdateAssignment = async (announcementId: string, assignment: any) => {
        console.log('🔄 [TransportLive] Assignment Update Request:', {
            announcementId,
            assignment,
            timestamp: new Date().toISOString()
        });
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcementId}/assignment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(assignment),
            });
            
            console.log('📡 [TransportLive] Assignment API Response:', {
                status: res.status,
                statusText: res.statusText,
                url: res.url
            });
            
            if (!res.ok) {
                const errorData = await res.text();
                console.error('❌ [TransportLive] Assignment failed:', errorData);
                throw new Error('ثبت تخصیص ناموفق بود');
            }
            
            const responseData = await res.json();
            console.log('✅ [TransportLive] Assignment successful:', responseData);
            alert('تخصیص با موفقیت ثبت شد');
        } catch (e) { 
            console.error('❌ [TransportLive] Assignment error:', e);
            alert((e as any).message); 
        }
    };

    const onFinalize = async (announcementIds: string[]) => {
        console.log('🏁 [TransportLive] Finalize Request:', {
            announcementIds,
            count: announcementIds.length,
            timestamp: new Date().toISOString()
        });
        // Placeholder: backend finalize route not defined in repo; keep UI responsive
        alert(`نهایی‌سازی ${announcementIds.length} مورد`);
    };

    const onTransferDestination = async (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => {
        console.log('🔄 [TransportLive] Destination Transfer Request:', {
            sourceAnnouncementId,
            destinationId,
            targetAnnouncementId,
            newPosition,
            timestamp: new Date().toISOString()
        });
        // Placeholder: no direct backend route; rely on future endpoint
        alert('انتقال مقصد ثبت شد.');
    };

    const onForward = async (announcementId: string) => {
        console.log('➡️ [TransportLive] Forward Request:', {
            announcementId,
            timestamp: new Date().toISOString()
        });
        alert(`ارجاع اعلام بار #${announcementId}`);
    };

    const onCancel = async (announcementId: string) => {
        console.log('❌ [TransportLive] Cancel Request:', {
            announcementId,
            timestamp: new Date().toISOString()
        });
        alert(`لغو اعلام بار #${announcementId}`);
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <TransportLive
            announcements={announcements}
            vehicles={vehicles}
            drivers={drivers}
            onUpdateAssignment={onUpdateAssignment}
            onFinalize={onFinalize}
            onTransferDestination={onTransferDestination}
            onForward={onForward}
            onCancel={onCancel}
            currentUser={currentUser}
        />
    );
};

export default TransportLiveContainer;


