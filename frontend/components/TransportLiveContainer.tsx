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
                    ChangeRequested: FreightAnnouncementStatus.ChangeRequested,
                };

                const normalize = (a: any): FreightAnnouncement => {
                    // لاگ برای بررسی representative_type
                    if (a.representative_type || a.representativeType) {
                        console.log('🔍 [normalize] Found representative_type:', {
                            id: a.id,
                            representative_type: a.representative_type,
                            representativeType: a.representativeType,
                            representative_name: a.representative_name || a.representativeName
                        });
                    }
                    return {
                        id: a.id,
                        announcementCode: a.announcement_code || a.announcementCode,
                        createdAt: new Date(a.created_at || a.createdAt || a.loading_date || Date.now()),
                        // اگر loading_date یک رشته شمسی است (فرمت YYYY/MM/DD یا YYYY-MM-DD)، همان را نگه دار و `-` را به `/` تبدیل کن
                        loadingDate: (typeof a.loading_date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(a.loading_date)) 
                            ? (a.loading_date.replace(/-/g, '/') as any)  // تاریخ شمسی به صورت رشته - تبدیل `-` به `/`
                            : new Date(a.loading_date || a.loadingDate || Date.now()),
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
                        representativeType: a.representative_type || a.representativeType || null,
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
                        assignmentFinalizedAt: a.assignment_finalized_at || a.assignmentFinalizedAt,
                    };
                };

                const announcementsData: FreightAnnouncement[] = Array.isArray(announcementsRaw) ? announcementsRaw.map(normalize) : [];
                // فیلتر کردن ChangeRequested از TransportLive (فقط برای planner نمایش داده می‌شود)
                const filteredAnnouncements = announcementsData.filter(a => 
                    a.status !== FreightAnnouncementStatus.ChangeRequested && a.status !== 'ChangeRequested'
                );
                // console.log('🧭 [TransportLive] Normalized Announcements:', filteredAnnouncements);

                setAnnouncements(filteredAnnouncements);
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
            activeLine,
            timestamp: new Date().toISOString()
        });
        
        if (announcementIds.length === 0) {
            alert('هیچ اعلام باری انتخاب نشده است');
            return;
        }
        
        // تبدیل activeLine به فرمت backend (مثلاً 'IceCream' یا 'بستنی')
        let lineTypeForBackend = '';
        if (activeLine === FreightLineType.IceCream || activeLine === 'بستنی') {
            lineTypeForBackend = 'IceCream';
        } else if (activeLine === FreightLineType.Dairy || activeLine === 'پاستوریزه') {
            lineTypeForBackend = 'Dairy';
        } else if (activeLine === FreightLineType.Ambient || activeLine === 'لبنیات-فروتلند') {
            lineTypeForBackend = 'Ambient';
        } else {
            lineTypeForBackend = activeLine;
        }
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/v1/freight-announcements/finalize-assignments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    announcementIds,
                    lineType: lineTypeForBackend
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'خطا در اتمام تخصیص');
            }
            
            const result = await response.json();
            console.log('✅ [TransportLive] Finalize result:', result);
            
            // نمایش پیام موفقیت
            alert(`اتمام تخصیص انجام شد:\n${result.finalized} مورد نهایی شد\n${result.leftover} مورد به بارهای مانده برگشت`);
            
            // Refresh data
            await fetchData();
        } catch (error: any) {
            console.error('❌ [TransportLive] Finalize error:', error);
            alert(error.message || 'خطا در اتمام تخصیص');
        }
    };

    const onTransferDestination = async (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => {
        console.log('🔄 [TransportLive] Destination Transfer Request:', {
            sourceAnnouncementId,
            destinationId,
            targetAnnouncementId,
            newPosition,
            timestamp: new Date().toISOString()
        });
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('❌ [TransportLive] No token found');
                alert('لطفا دوباره وارد شوید');
                return;
            }
            
            // پیدا کردن source و target announcements برای لاگ
            const sourceAnn = announcements.find(a => a.id === sourceAnnouncementId);
            const targetAnn = announcements.find(a => a.id === targetAnnouncementId);
            const selectedDest = sourceAnn?.destinations.find(d => d.id === destinationId);
            
            console.log('📋 [TransportLive] Transfer details BEFORE:', {
                sourceAnnouncement: sourceAnn ? {
                    id: sourceAnn.id,
                    code: sourceAnn.announcementCode,
                    destinations: sourceAnn.destinations.map((d, idx) => ({
                        position: idx + 1,
                        id: d.id,
                        city: d.city
                    }))
                } : null,
                targetAnnouncement: targetAnn ? {
                    id: targetAnn.id,
                    code: targetAnn.announcementCode,
                    destinations: targetAnn.destinations.map((d, idx) => ({
                        position: idx + 1,
                        id: d.id,
                        city: d.city
                    })),
                    destinationsCount: targetAnn.destinations.length
                } : null,
                selectedDestination: selectedDest,
                requestedPosition: newPosition,
                expectedFinalPosition: newPosition
            });
            
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${sourceAnnouncementId}/transfer-destination`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    destinationId,
                    targetAnnouncementId,
                    newPosition
                })
            });
            
            console.log('📡 [TransportLive] Transfer API Response:', {
                status: res.status,
                statusText: res.statusText,
                ok: res.ok
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('❌ [TransportLive] Transfer API error:', {
                    status: res.status,
                    statusText: res.statusText,
                    errorText
                });
                throw new Error(errorText || 'خطا در انتقال مقصد');
            }
            
            const result = await res.json();
            console.log('✅ [TransportLive] Transfer API response:', result);
            
            // به‌روزرسانی state بدون reload کامل
            setAnnouncements(prev => {
                const updated = prev.map(ann => {
                    if (ann.id === sourceAnnouncementId) {
                        // حذف مقصد از source
                        const updatedDestinations = ann.destinations.filter(d => d.id !== destinationId);
                        return { ...ann, destinations: updatedDestinations };
                    } else if (ann.id === targetAnnouncementId) {
                        // اضافه کردن مقصد به target در موقعیت جدید
                        const transferredDest = sourceAnn?.destinations.find(d => d.id === destinationId);
                        if (transferredDest) {
                            const newDestinations = [...ann.destinations];
                            // حذف مقصد از موقعیت فعلی (اگر در همان ردیف است)
                            const existingIndex = newDestinations.findIndex(d => d.id === destinationId);
                            if (existingIndex >= 0) {
                                newDestinations.splice(existingIndex, 1);
                            }
                            // اضافه کردن در موقعیت جدید
                            const insertIndex = Math.min(newPosition - 1, newDestinations.length);
                            newDestinations.splice(insertIndex, 0, transferredDest);
                            return { ...ann, destinations: newDestinations };
                        }
                    }
                    return ann;
                });
                return updated;
            });
            
            console.log('✅ [TransportLive] State updated without full reload');
        } catch (error: any) {
            console.error('❌ [TransportLive] Transfer error:', error);
            alert(error.message || 'خطا در انتقال مقصد');
        }
    };

    const onForward = async (announcementId: string) => {
        try {
            const token = localStorage.getItem('token');
            const current = announcements.find(a => a.id === announcementId);
            if (!current) { 
                alert('اعلام بار پیدا نشد'); 
                return; 
            }
            
            const nextQueue = current.assignmentType === 'company' ? 'personal' : 'company';
            console.log('🔄 [TransportLive] Forward request:', {
                announcementId,
                currentAssignmentType: current.assignmentType,
                nextQueue,
                currentStatus: current.status,
                announcementCode: current.announcementCode
            });
            
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcementId}/assignment-queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ nextQueue })
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('❌ [TransportLive] Forward API error:', errorText);
                throw new Error(errorText || 'خطا در ارجاع');
            }
            
            const result = await res.json();
            console.log('✅ [TransportLive] Forward successful:', result);
            
            alert('ارجاع با موفقیت انجام شد');
            
            // بعد از ارجاع، باید داده‌ها را refresh کنیم
            // چون assignment_type تغییر کرده، اعلام بار از لیست ترابری فعلی حذف می‌شود
            // و در لیست ترابری دیگر ظاهر می‌شود
            await fetchData();
            
            console.log('🔄 [TransportLive] Data refreshed after forward');
        } catch (e: any) {
            console.error('❌ [TransportLive] Forward error:', e);
            alert(e.message || 'ارجاع ناموفق بود');
        }
    };

    const onCancel = async (announcementId: string) => {
        try {
            console.log('❌ [TransportLive] Cancel Request:', {
                announcementId,
                timestamp: new Date().toISOString()
            });
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${encodeURIComponent(announcementId)}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                const text = await res.text();
                console.error('❌ [TransportLive] Cancel API error:', text);
                throw new Error(JSON.parse(text)?.message || 'خطا در لغو تخصیص');
            }
            const data = await res.json();
            console.log('✅ [TransportLive] Cancelled:', data);
            alert('تخصیص با موفقیت لغو شد. امکان ارجاع مجدد فعال شد.');
            // Refresh data to reflect new status (should now be Pending* and show "ارجاع" button)
            await fetchData();
        } catch (e: any) {
            alert(e.message || 'لغو ناموفق بود');
        }
    };

    const onChangeVehicleType = async (announcementId: string, vehicleType: string) => {
        console.log('🔄 [TransportLive] Change Vehicle Type Request:', {
            announcementId,
            vehicleType,
            timestamp: new Date().toISOString()
        });
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('❌ [TransportLive] No token found');
                alert('لطفا دوباره وارد شوید');
                return;
            }
            
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcementId}/vehicle-type`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ vehicleType })
            });
            
            console.log('📡 [TransportLive] Change Vehicle Type API Response:', {
                status: res.status,
                statusText: res.statusText,
                ok: res.ok
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('❌ [TransportLive] Change Vehicle Type API error:', {
                    status: res.status,
                    statusText: res.statusText,
                    errorText
                });
                throw new Error(errorText || 'خطا در تغییر نوع خودرو');
            }
            
            const result = await res.json();
            console.log('✅ [TransportLive] Change Vehicle Type successful:', result);
            
            alert('نوع خودرو با موفقیت تغییر یافت');
            
            // Refresh data after successful change
            await fetchData();
        } catch (error: any) {
            console.error('❌ [TransportLive] Change Vehicle Type error:', error);
            alert(error.message || 'خطا در تغییر نوع خودرو');
        }
    };

    const onChangeRequest = async (announcementId: string, body: { type: 'change' | 'split' | 'merge', targetQueue?: 'company' | 'personal', description?: string, payload?: any }) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${encodeURIComponent(announcementId)}/change-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body || {})
            });
            if (!res.ok) {
                const text = await res.text();
                console.error('❌ [TransportLive] ChangeRequest API error:', text);
                throw new Error(JSON.parse(text)?.message || 'خطا در ثبت درخواست تغییر');
            }
            alert('درخواست تغییر/تقسیم ثبت شد و بار از کارتابل خارج شد.');
            await fetchData();
        } catch (e: any) {
            alert(e.message || 'ثبت درخواست ناموفق بود');
        }
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
                onChangeRequest={onChangeRequest}
                onChangeVehicleType={onChangeVehicleType}
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


