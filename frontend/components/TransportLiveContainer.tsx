import React, { useEffect, useState, useCallback, useRef } from 'react';
import TransportLive from './TransportLive';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';
import FreightHistoryDialog from './FreightHistoryDialog';
import { getApiUrl } from '../utils/apiConfig';
import { cachedFetch } from '../utils/apiCache';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { OptimisticUpdateManager, applyOptimisticUpdate } from '../utils/optimisticUpdates';

const TransportLiveContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    console.log('🔄 [TransportLiveContainer] Component rendering', { 
        userId: currentUser?.id, 
        role: currentUser?.role,
        timestamp: new Date().toISOString()
    });
    
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
    const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    const [finalizePermissions, setFinalizePermissions] = useState<Record<string, boolean>>({});

    // بررسی دسترسی اتمام تخصیص (با Cache برای جلوگیری از درخواست‌های تکراری)
    const checkFinalizePermission = useCallback(async (lineType: FreightLineType): Promise<boolean> => {
        console.log('🔍 [checkFinalizePermission] Called', { lineType, userId: currentUser?.id });
        // اگر کاربر وجود ندارد، false برگردان
        if (!currentUser || !currentUser.id) {
            return false;
        }
        
        // ادمین همیشه دسترسی دارد
        if (currentUser.role === 'ادمین' || currentUser.role === 'Admin') {
            return true;
        }
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                return false;
            }
            
            const headers = { 'Authorization': `Bearer ${token}` } as any;
            
            // تبدیل lineType به فرمت backend
            let lineTypeForBackend = '';
            if (lineType === FreightLineType.IceCream || lineType === 'بستنی') {
                lineTypeForBackend = 'IceCream';
            } else if (lineType === FreightLineType.Dairy || lineType === 'پاستوریزه') {
                lineTypeForBackend = 'Dairy';
            } else if (lineType === FreightLineType.Ambient || lineType === 'لبنیات-فروتلند') {
                lineTypeForBackend = 'Ambient';
            } else {
                lineTypeForBackend = lineType;
            }
            
            // استفاده از cachedFetch برای جلوگیری از درخواست‌های تکراری
            // Cache برای 5 دقیقه (permissions معمولاً تغییر نمی‌کنند)
            const cacheKey = `finalize-permissions/check?userId=${currentUser.id}&lineType=${lineTypeForBackend}`;
            const data = await cachedFetch(getApiUrl(cacheKey), { headers }, 5 * 60 * 1000); // 5 minutes cache
            
            return data?.hasPermission || false;
        } catch (error) {
            console.error('Error checking finalize permission:', error);
            return false;
        }
    }, [currentUser]);

    const fetchData = useCallback(async (silent: boolean = false, includePersonal: boolean = false) => {
            console.log('🚀 [fetchData] Starting', { silent, includePersonal, userId: currentUser?.id });
            if (!silent) {
                setLoading(true);
                setError(null);
            }
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` } as any;
                
                // Lazy Loading: personal-drivers و personal-vehicles فقط وقتی که نیاز است لود می‌شوند
                // این داده‌ها فقط وقتی لود می‌شوند که:
                // 1. کاربر نقش "ترابری شخصی" دارد
                // 2. یا includePersonal = true باشد (مثلاً وقتی dialog assignment باز می‌شود)
                const shouldLoadPersonal = includePersonal || 
                    currentUser?.role === 'Transportation_Personal_Vehicle_User' || 
                    currentUser?.role === 'کاربر ترابری (خودرو شخصی)';
                
                // استفاده از cached fetch برای بهبود عملکرد
                // TTL: 30 ثانیه برای freight-announcements (داده‌های زنده)
                // TTL: 10 دقیقه برای vehicles, drivers (داده‌های static - افزایش یافت)
                const fetchPromises: Promise<any>[] = [
                    cachedFetch(getApiUrl('freight-announcements'), { headers }, 30 * 1000),
                    cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000), // 10 minutes
                    cachedFetch(getApiUrl('drivers'), { headers }, 10 * 60 * 1000), // 10 minutes
                ];
                
                // فقط اگر نیاز باشد، personal resources را لود کن
                // اما برای بهبود عملکرد، فقط وقتی که واقعاً نیاز است (مثلاً برای نمایش در جدول)
                // برای dropdown ها از Search API استفاده می‌شود
                if (shouldLoadPersonal) {
                    // فقط برای نمایش داده‌های موجود در جدول، personal resources را لود کن (با Pagination)
                    // برای dropdown ها از Search API استفاده می‌شود (در AssignmentDialog)
                    // فقط 100 رکورد اول را لود کن (برای نمایش در جدول)
                    fetchPromises.push(
                        cachedFetch(getApiUrl('personal-drivers?page=1&limit=100'), { headers }, 10 * 60 * 1000), // 10 minutes
                        cachedFetch(getApiUrl('personal-vehicles?page=1&limit=100'), { headers }, 10 * 60 * 1000) // 10 minutes
                    );
                } else {
                    // اگر لود نمی‌کنیم، empty arrays برگردان
                    fetchPromises.push(Promise.resolve([]), Promise.resolve([]));
                }
                
                const [faRes, vRes, dRes, pdRes, pvRes] = await Promise.all(fetchPromises);
                
                // console.log('📊 [TransportLive] API Response Status:', {
                //     freight: faRes.status,
                //     vehicles: vRes.status,
                //     drivers: dRes.status,
                //     personalDrivers: pdRes.status,
                //     personalVehicles: pvRes.status
                // });
                
                // Handle paginated response for personal resources
                let personalDriversData, personalVehiclesData;
                if (shouldLoadPersonal) {
                    // Check if response is paginated
                    personalDriversData = (pdRes && typeof pdRes === 'object' && 'data' in pdRes) ? pdRes.data : (Array.isArray(pdRes) ? pdRes : []);
                    personalVehiclesData = (pvRes && typeof pvRes === 'object' && 'data' in pvRes) ? pvRes.data : (Array.isArray(pvRes) ? pvRes : []);
                } else {
                    personalDriversData = [];
                    personalVehiclesData = [];
                }
                
                // cachedFetch خودش JSON.parse می‌کند
                const [announcementsRaw, vehiclesData, driversData] = [
                    faRes,
                    vRes,
                    dRes
                ];
                
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
                        deliveryDate: a.delivery_date || a.deliveryDate,
                        destinations: Array.isArray(a.destinations) ? a.destinations.map((d: any) => ({
                            id: d.id,
                            city: d.city,
                            representativeName: d.representative_name || d.representativeName,
                            tonnage: d.tonnage,
                            unloadTime: d.unload_time || d.unloadTime,
                            freightCost: d.freight_cost ?? d.freightCost,
                            deliveryDate: d.delivery_date || d.deliveryDate,
                            representativeType: d.representative_type || d.representativeType,
                        })) : [],
                        history: a.history || [],
                        assignmentFinalizedAt: a.assignment_finalized_at || a.assignmentFinalizedAt,
                        // اطلاعات کارمند اعلام‌کننده
                        creator_full_name: a.creator_full_name || a.creatorFullName,
                        creator_username: a.creator_username || a.creatorUsername,
                        creator_user_id: a.creator_user_id || a.creatorUserId,
                    };
                };

                const announcementsData: FreightAnnouncement[] = Array.isArray(announcementsRaw) ? announcementsRaw.map(normalize) : [];
                // فیلتر کردن ChangeRequested از TransportLive (فقط برای planner نمایش داده می‌شود)
                const filteredAnnouncements = announcementsData.filter(a => 
                    a.status !== FreightAnnouncementStatus.ChangeRequested && a.status !== 'ChangeRequested'
                );
                // console.log('🧭 [TransportLive] Normalized Announcements:', filteredAnnouncements);

                setAnnouncements(filteredAnnouncements);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setDrivers(Array.isArray(driversData) ? driversData : []);
                // فقط اگر personal resources لود شده باشند، set کن
                if (shouldLoadPersonal) {
                    setPersonalDrivers(Array.isArray(personalDriversData) ? personalDriversData : []);
                    setPersonalVehicles(Array.isArray(personalVehiclesData) ? personalVehiclesData : []);
                }
                
                // console.log('✅ [TransportLive] Data successfully loaded and set in state');
            } catch (e: any) {
                console.error('❌ [TransportLive] Error fetching data:', e);
                if (!silent) {
                    setError(e.message);
                }
            } finally {
                if (!silent) {
                    setLoading(false);
                }
            }
        }, [currentUser]);

    // State برای track کردن اینکه آیا personal resources نیاز است یا نه
    const [needsPersonalResources, setNeedsPersonalResources] = useState(false);
    
    // Auto-refresh refs (باید قبل از useEffect ها باشند)
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const fetchDataRef = useRef(fetchData);
    const needsPersonalResourcesRef = useRef(needsPersonalResources);
    
    console.log('🔄 [TransportLiveContainer] Hooks initialized', {
        needsPersonalResources,
        fetchDataExists: !!fetchData,
        timestamp: new Date().toISOString()
    });
    
    // به‌روزرسانی ref ها
    useEffect(() => {
        console.log('🔄 [useEffect] Updating refs', { 
            fetchDataExists: !!fetchData,
            needsPersonalResources 
        });
        fetchDataRef.current = fetchData;
        needsPersonalResourcesRef.current = needsPersonalResources;
    }, [fetchData, needsPersonalResources]);
    
    // بررسی اینکه آیا personal resources نیاز است
    useEffect(() => {
        const hasPersonalAssignment = announcements.some(ann => 
            ann.assignmentType === 'personal' || 
            ann.assignmentType === 'شخصی' ||
            ann.status === FreightAnnouncementStatus.PendingPersonalAssignment
        );
        const isPersonalUser = currentUser?.role === 'Transportation_Personal_Vehicle_User' || 
            currentUser?.role === 'کاربر ترابری (خودرو شخصی)';
        
        if (hasPersonalAssignment || isPersonalUser) {
            setNeedsPersonalResources(true);
        }
    }, [announcements, currentUser]);
    
    // Lazy load personal resources وقتی که نیاز است
    useEffect(() => {
        console.log('🔄 [useEffect] Lazy load check', { 
            needsPersonalResources, 
            personalDriversLength: personalDrivers.length,
            personalVehiclesLength: personalVehicles.length
        });
        if (needsPersonalResources && personalDrivers.length === 0 && personalVehicles.length === 0) {
            console.log('🔄 [TransportLive] Lazy loading personal resources...');
            fetchDataRef.current(true, true); // استفاده از ref به جای مستقیم
        }
    }, [needsPersonalResources, personalDrivers.length, personalVehicles.length]);
    
    // بارگذاری اولیه
    useEffect(() => {
        console.log('🚀 [useEffect] Initial load', { 
            fetchDataExists: !!fetchData,
            currentUser: currentUser?.id 
        });
        fetchDataRef.current(); // استفاده از ref به جای مستقیم
    }, [currentUser?.id]); // فقط وابسته به currentUser.id
    
    // Auto-refresh به عنوان fallback (فقط وقتی SSE قطع است)
    useEffect(() => {
        // اگر SSE متصل است، auto-refresh را خاموش کن
        if (sseConnected) {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
            return;
        }
        
        // اگر SSE قطع است، auto-refresh را فعال کن (fallback)
        if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
        }
        
        refreshIntervalRef.current = setInterval(() => {
            // فقط اگر صفحه visible است و داده‌ها وجود دارند
            if (!document.hidden && announcements.length > 0) {
                console.log('🔄 [Auto-refresh Fallback] SSE disconnected, using fallback refresh');
                fetchDataRef.current(true, needsPersonalResourcesRef.current);
            }
        }, 30000); // 30 seconds fallback (فقط وقتی SSE قطع است)
        
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
        };
    }, [sseConnected, announcements.length]);

    // بررسی دسترسی‌ها برای همه تب‌ها (با Promise.all برای parallel requests)
    useEffect(() => {
        const checkAllPermissions = async () => {
            console.log('🔍 [checkAllPermissions] Checking permissions for all lineTypes');
            const lineTypes = Object.values(FreightLineType);
            // استفاده از Promise.all برای parallel requests (با cache، درخواست‌های تکراری deduplicate می‌شوند)
            const permissionPromises = lineTypes.map(lineType => 
                checkFinalizePermission(lineType).then(hasPermission => ({ lineType, hasPermission }))
            );
            const results = await Promise.all(permissionPromises);
            const permissions: Record<string, boolean> = {};
            results.forEach(({ lineType, hasPermission }) => {
                permissions[lineType] = hasPermission;
            });
            console.log('✅ [checkAllPermissions] Permissions checked:', permissions);
            setFinalizePermissions(permissions);
        };
        
        if (currentUser) {
            checkAllPermissions();
        }
    }, [checkFinalizePermission, currentUser]);

    // اتصال به Real-Time Updates (SSE)
    useRealtimeUpdates({
        onMessage: (message) => {
            console.log('📨 [TransportLiveContainer] Real-time message received:', message);
            
            if (message.type === 'announcement_update') {
                // به‌روزرسانی اعلام بار
                const { announcementId, updateType, data } = message;
                
                // اعمال optimistic update
                setAnnouncements(prev => {
                    const index = prev.findIndex(a => a.id === announcementId);
                    if (index === -1) {
                        // اگر اعلام بار جدید است، باید fetch کنیم
                        console.log('🔄 [TransportLiveContainer] New announcement detected, refreshing...');
                        fetchDataRef.current(true, needsPersonalResourcesRef.current);
                        return prev;
                    }
                    
                    // به‌روزرسانی اعلام بار موجود
                    return applyOptimisticUpdate(prev, announcementId, {
                        status: data.status as FreightAnnouncementStatus,
                        assignmentType: data.assignmentType,
                        ...data
                    });
                });
            }
        },
        onConnect: () => {
            console.log('✅ [TransportLiveContainer] Real-time connection established');
            setSseConnected(true);
        },
        onDisconnect: () => {
            console.log('❌ [TransportLiveContainer] Real-time connection lost');
            setSseConnected(false);
        },
        onError: (error) => {
            console.error('❌ [TransportLiveContainer] Real-time error:', error);
        },
        enabled: !!currentUser?.id
    });

    const onUpdateAssignment = async (announcementId: string, assignment: any) => {
        // Optimistic Update: فوراً UI را به‌روزرسانی کن
        const originalAnnouncements = [...announcements];
        setAnnouncements(prev => applyOptimisticUpdate(prev, announcementId, {
            status: FreightAnnouncementStatus.Assigned,
            assignmentType: assignment.assignmentType,
            assignedDriverId: assignment.driverId,
            assignedVehicleId: assignment.vehicleId,
            totalFreightCost: assignment.totalFreightCost,
            billOfLadingNumber: assignment.billOfLadingNumber
        }));

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl(`freight-announcements/${announcementId}/assignment`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(assignment),
            });
            
            if (!res.ok) {
                // Rollback optimistic update در صورت خطا
                setAnnouncements(originalAnnouncements);
                const errorData = await res.text();
                console.error('❌ [TransportLive] Assignment failed:', errorData);
                throw new Error(errorData || 'ثبت تخصیص ناموفق بود');
            }
            
            const responseData = await res.json();
            console.log('✅ [TransportLive] Assignment successful:', responseData);
            
            // Real-time update will handle the UI update, no need for alert or refresh
            // console.log('🔄 [TransportLive] Refreshing all data after assignment...');
            // await fetchData(); // Removed to prevent double refresh
        } catch (e) { 
            console.error('❌ [TransportLive] Assignment error:', e);
            console.error('❌ [TransportLive] Assignment error:', e); 
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
            console.warn('⚠️ [TransportLive] No announcements selected for finalize');
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
            const response = await fetch(getApiUrl('freight-announcements/finalize-assignments'), {
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
            
            // Refresh data - با کمی تاخیر برای اطمینان از به‌روزرسانی backend
            setTimeout(async () => {
                await fetchData();
            }, 1000);
        } catch (error: any) {
            console.error('❌ [TransportLive] Finalize error:', error);
            // فقط alert برای خطا (نه موفقیت - آن را نگه می‌داریم)
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
            
            const res = await fetch(getApiUrl(`freight-announcements/${sourceAnnouncementId}/transfer-destination`), {
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
                const sourceAnn = prev.find(a => a.id === sourceAnnouncementId);
                const updated = prev.map(ann => {
                    if (ann.id === sourceAnnouncementId) {
                        // حذف مقصد از source
                        const updatedDestinations = ann.destinations.filter(d => d.id !== destinationId);
                        // اگر همه مقاصد جابجا شدند، ردیف را حذف کن (null برگردان تا بعداً فیلتر شود)
                        if (updatedDestinations.length === 0) {
                            return null; // علامت برای حذف
                        }
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
                // حذف ردیف‌هایی که null هستند (همه مقاصدشان جابجا شده)
                return updated.filter(ann => ann !== null);
            });
            
            console.log('✅ [TransportLive] State updated without full reload');
            
            // بدون refresh - state به‌روزرسانی شده است
        } catch (error: any) {
            console.error('❌ [TransportLive] Transfer error:', error);
            console.error('❌ [TransportLive] Transfer destination error:', error);
        }
    };

    const onForward = async (announcementId: string) => {
        try {
            const token = localStorage.getItem('token');
            const current = announcements.find(a => a.id === announcementId);
            if (!current) { 
                console.warn('⚠️ [TransportLive] Announcement not found'); 
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
            
            const res = await fetch(getApiUrl(`freight-announcements/${announcementId}/assignment-queue`), {
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
            
            // Real-time update will handle the UI update
            
            // بعد از ارجاع، باید داده‌ها را refresh کنیم
            // چون assignment_type تغییر کرده، اعلام بار از لیست ترابری فعلی حذف می‌شود
            // و در لیست ترابری دیگر ظاهر می‌شود
            await fetchData();
            
            console.log('🔄 [TransportLive] Data refreshed after forward');
        } catch (e: any) {
            console.error('❌ [TransportLive] Forward error:', e);
            console.error('❌ [TransportLive] Forward error:', e);
        }
    };

    const onCancel = async (announcementId: string) => {
        try {
            console.log('❌ [TransportLive] Cancel Request:', {
                announcementId,
                timestamp: new Date().toISOString()
            });
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl(`freight-announcements/${encodeURIComponent(announcementId)}/cancel`), {
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
            // Real-time update will handle the UI update
            // Refresh data to reflect new status (should now be Pending* and show "ارجاع" button)
            await fetchData();
        } catch (e: any) {
            console.error('❌ [TransportLive] Cancel error:', e);
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
            
            const res = await fetch(getApiUrl(`freight-announcements/${announcementId}/vehicle-type`), {
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
            
            // Real-time update will handle the UI update
            
            // Refresh data after successful change
            await fetchData();
        } catch (error: any) {
            console.error('❌ [TransportLive] Change Vehicle Type error:', error);
            console.error('❌ [TransportLive] Change vehicle type error:', error);
        }
    };

    const onChangeRequest = async (announcementId: string, body: { type: 'change' | 'split' | 'merge', targetQueue?: 'company' | 'personal', description?: string, payload?: any }) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl(`freight-announcements/${encodeURIComponent(announcementId)}/change-request`), {
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
            // Real-time update will handle the UI update
            await fetchData();
        } catch (e: any) {
            console.error('❌ [TransportLive] Change request error:', e);
        }
    };

    // همه hooks باید قبل از early returns باشند
    const [historyDialog, setHistoryDialog] = React.useState<{ isOpen: boolean; announcementId: string; announcementCode: string } | null>(null);

    // Callback برای لود کردن personal resources وقتی که dialog assignment باز می‌شود
    const onOpenAssignmentDialog = useCallback((announcement: FreightAnnouncement) => {
        // اگر assignmentType === 'personal' است، personal resources را لود کن
        if (announcement.assignmentType === 'personal' || announcement.assignmentType === 'شخصی' || 
            announcement.status === FreightAnnouncementStatus.PendingPersonalAssignment) {
            if (personalDrivers.length === 0 || personalVehicles.length === 0) {
                console.log('🔄 [TransportLive] Loading personal resources for assignment dialog...');
                fetchDataRef.current(true, true); // استفاده از ref
            }
        }
    }, [personalDrivers.length, personalVehicles.length]);

    const onOpenHistory = useCallback((announcementId: string, announcementCode: string) => {
        setHistoryDialog({ isOpen: true, announcementId, announcementCode });
    }, []);

    const onCloseHistory = useCallback(() => {
        setHistoryDialog(null);
    }, []);

    // Early returns بعد از همه hooks
    if (loading) return <div className="text-center p-8">در حال بارگذاری...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

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
                onOpenAssignmentDialog={onOpenAssignmentDialog}
                currentUser={currentUser}
                activeLine={activeLine}
                setActiveLine={setActiveLine}
                finalizePermissions={finalizePermissions}
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


