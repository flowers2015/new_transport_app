import React, { useEffect, useState } from 'react';
import TransportLive from './TransportLive';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';
import FreightHistoryDialog from './FreightHistoryDialog';

const TransportLiveContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
    const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);

    const fetchData = async () => {
            setLoading(true);
            setError(null);
            // console.log('🚀 [TransportLive] Starting data fetch...');
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` } as any;
                // console.log('📡 [TransportLive] Fetching from APIs:', {
                //     freight: 'http://localhost:3000/api/v1/freight-announcements',
                //     vehicles: 'http://localhost:3000/api/v1/vehicles',
                //     drivers: 'http://localhost:3000/api/v1/drivers',
                //     personalDrivers: 'http://localhost:3000/api/v1/personal-drivers',
                //     personalVehicles: 'http://localhost:3000/api/v1/personal-vehicles'
                // });
                
                const [faRes, vRes, dRes, pdRes, pvRes] = await Promise.all([
                    fetch('http://localhost:3000/api/v1/freight-announcements', { headers }),
                    fetch('http://localhost:3000/api/v1/vehicles', { headers }),
                    fetch('http://localhost:3000/api/v1/drivers', { headers }),
                    fetch('http://localhost:3000/api/v1/personal-drivers', { headers }),
                    fetch('http://localhost:3000/api/v1/personal-vehicles', { headers }),
                ]);
                
                // console.log('📊 [TransportLive] API Response Status:', {
                //     freight: faRes.status,
                //     vehicles: vRes.status,
                //     drivers: dRes.status,
                //     personalDrivers: pdRes.status,
                //     personalVehicles: pvRes.status
                // });
                
                if (!faRes.ok) throw new Error('خطا در دریافت اعلام بارها');
                if (!vRes.ok) throw new Error('خطا در دریافت خودروها');
                if (!dRes.ok) throw new Error('خطا در دریافت رانندگان');
                if (!pdRes.ok) throw new Error('خطا در دریافت رانندگان شخصی');
                if (!pvRes.ok) throw new Error('خطا در دریافت خودروهای شخصی');
                
                const [announcementsRaw, vehiclesData, driversData, personalDriversData, personalVehiclesData] = await Promise.all([
                    faRes.json(),
                    vRes.json(),
                    dRes.json(),
                    pdRes.json(),
                    pvRes.json()
                ]);
                
                // console.log('📋 [TransportLive] Raw Data Received:', {
                //     announcements: announcementsRaw,
                //     vehicles: vehiclesData,
                //     drivers: driversData,
                //     personalDrivers: personalDriversData,
                //     personalVehicles: personalVehiclesData
                // });
                
                // console.log('📈 [TransportLive] Data Summary:', {
                //     announcementsCount: announcementsRaw?.length || 0,
                //     vehiclesCount: vehiclesData?.length || 0,
                //     driversCount: driversData?.length || 0,
                //     personalDriversCount: personalDriversData?.length || 0,
                //     personalVehiclesCount: personalVehiclesData?.length || 0,
                //     announcementStatuses: announcementsRaw?.map((a: any) => a.status) || [],
                //     vehicleTypes: vehiclesData?.map((v: any) => v.vehicleCategory) || []
                // });

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
                // console.log('🧭 [TransportLive] Normalized Announcements:', announcementsData);

                setAnnouncements(announcementsData);
                setVehicles(vehiclesData);
                setDrivers(driversData);
                setPersonalDrivers(personalDriversData);
                setPersonalVehicles(personalVehiclesData);
                
                // console.log('✅ [TransportLive] Data successfully loaded and set in state');
            } catch (e: any) {
                console.error('❌ [TransportLive] Error fetching data:', e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

    useEffect(() => {
        fetchData();
    }, []);

    const onUpdateAssignment = async (announcementId: string, assignment: any) => {
        // console.log('🔄 [TransportLive] Assignment Update Request:', {
        //     announcementId,
        //     assignment,
        //     timestamp: new Date().toISOString()
        // });
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcementId}/assignment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(assignment),
            });
            
            // console.log('📡 [TransportLive] Assignment API Response:', {
            //     status: res.status,
            //     statusText: res.statusText,
            //     url: res.url
            // });
            
            if (!res.ok) {
                const errorData = await res.text();
                console.error('❌ [TransportLive] Assignment failed:', errorData);
                throw new Error('ثبت تخصیص ناموفق بود');
            }
            
            const responseData = await res.json();
            // console.log('✅ [TransportLive] Assignment successful:', responseData);
            
            // Update the announcements state with the new assignment data
            // Debug logs removed - total freight cost issue resolved
            setAnnouncements(prev => {
                const updated = prev.map(ann => 
                    ann.id === announcementId 
                        ? { 
                            ...ann, 
                            assignedDriverId: assignment.driverId,
                            assignedVehicleId: assignment.vehicleId,
                            billOfLadingNumber: assignment.billOfLadingNumber,
                            totalFreightCost: assignment.totalFreightCost,
                            destinations: assignment.destinations || ann.destinations,
                            status: 'Assigned' as any
                        }
                        : ann
                );
                // console.log('🔄 [TransportLive] State updated:', {
                //     announcementId,
                //     updatedAnnouncement: updated.find(ann => ann.id === announcementId),
                //     timestamp: new Date().toISOString()
                // });
                return updated;
            });
            
            alert('تخصیص با موفقیت ثبت شد');
            
            // Refresh all data after successful assignment - REMOVED to prevent double refresh
            // console.log('🔄 [TransportLive] Refreshing all data after assignment...');
            // await fetchData(); // Removed to prevent double refresh
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
        // console.log('🔄 [TransportLive] Destination Transfer Request:', {
        //     sourceAnnouncementId,
        //     destinationId,
        //     targetAnnouncementId,
        //     newPosition,
        //     timestamp: new Date().toISOString()
        // });
        // Placeholder: no direct backend route; rely on future endpoint
        alert('انتقال مقصد ثبت شد.');
    };

    const onForward = async (announcementId: string) => {
        try {
            const token = localStorage.getItem('token');
            const current = announcements.find(a => a.id === announcementId);
            if (!current) { alert('اعلام بار پیدا نشد'); return; }
            const nextQueue = current.assignmentType === 'company' ? 'personal' : 'company';
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcementId}/assignment-queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ nextQueue })
            });
            if (!res.ok) throw new Error(await res.text());
            alert('ارجاع با موفقیت انجام شد');
            // Full refresh from backend to keep item visible in both views
            const headers = { 'Authorization': `Bearer ${token}` } as any;
            const faRes = await fetch('http://localhost:3000/api/v1/freight-announcements', { headers });
            if (faRes.ok) {
                const raw = await faRes.json();
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
                const normalize = (a: any): FreightAnnouncement => ({
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
                });
                const normalized: FreightAnnouncement[] = Array.isArray(raw) ? raw.map(normalize) : [];
                setAnnouncements(normalized);
            }
        } catch (e) {
            console.error('❌ [TransportLive] Forward failed', e);
            alert('ارجاع ناموفق بود');
        }
    };

    const onCancel = async (announcementId: string) => {
        console.log('❌ [TransportLive] Cancel Request:', {
            announcementId,
            timestamp: new Date().toISOString()
        });
        alert(`لغو اعلام بار #${announcementId}`);
    };

    const [historyDialog, setHistoryDialog] = React.useState<{ isOpen: boolean; announcementId: string; announcementCode: string } | null>(null);

    const onOpenHistory = (announcementId: string, announcementCode: string) => {
        setHistoryDialog({ isOpen: true, announcementId, announcementCode });
    };

    const onCloseHistory = () => {
        setHistoryDialog(null);
    };

    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    // Debug logging
    // console.log('🔍 [TransportLiveContainer] Render data:', {
    //     announcementsCount: announcements.length,
    //     driversCount: drivers.length,
    //     vehiclesCount: vehicles.length,
    //     sampleDriver: drivers[0],
    //     sampleVehicle: vehicles[0]
    // });

    return (
        <>
            <TransportLive
                announcements={announcements}
                vehicles={vehicles}
                drivers={drivers}
                personalDrivers={personalDrivers}
                personalVehicles={personalVehicles}
                onUpdateAssignment={onUpdateAssignment}
                onFinalize={onFinalize}
                onTransferDestination={onTransferDestination}
                onForward={onForward}
                onCancel={onCancel}
                onOpenHistory={onOpenHistory}
                currentUser={currentUser}
                activeLine={activeLine}
                setActiveLine={setActiveLine}
            />
            {historyDialog && (
                <FreightHistoryDialog
                    isOpen={historyDialog.isOpen}
                    onClose={onCloseHistory}
                    announcementId={historyDialog.announcementId}
                    announcementCode={historyDialog.announcementCode}
                />
            )}
        </>
    );
};

export default TransportLiveContainer;


