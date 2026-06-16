import React, { useEffect, useState, useCallback, useRef } from 'react';
import TransportLive from './TransportLive';
import { Driver, FreightAnnouncement, FreightAnnouncementStatus, User, Vehicle, PersonalDriver, PersonalVehicle, FreightLineType } from '../types';
import FreightHistoryDialog from './FreightHistoryDialog';
import { getApiUrl } from '../utils/apiConfig';
import { cachedFetch } from '../utils/apiCache';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { OptimisticUpdateManager, applyOptimisticUpdate } from '../utils/optimisticUpdates';
import {
    pickAssignmentFieldsFromApi,
    mergeAssignmentDisplayFields,
    clearAssignmentFromAnnouncement,
    isPendingAssignmentStatus,
    TransportLiveTab,
    lineTypeToBackend,
    isPendingBillOfLadingTab,
    isPersonalAssignmentType,
    hasBillOfLadingNumber,
    parseNumericField,
} from '../utils/freightDisplay';

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
    const [activeLine, setActiveLine] = useState<TransportLiveTab>(FreightLineType.IceCream);
    const [finalizePermissions, setFinalizePermissions] = useState<Record<string, boolean>>({});
    const [sseConnected, setSseConnected] = useState(false);

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

    const fetchData = useCallback(async (silent: boolean = false, includePersonal: boolean = false, forceRefresh: boolean = false) => {
            if (!silent) {
                setLoading(true);
                setError(null);
            }
            try {
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` } as any;
                
                const shouldLoadPersonal = includePersonal || 
                    currentUser?.role === 'Transportation_Personal_Vehicle_User' || 
                    currentUser?.role === 'کاربر ترابری (خودرو شخصی)';
                
                // فقط با دکمه «بروزرسانی» کش پاک شود — نه در هر بار ورود به صفحه
                if (forceRefresh) {
                    const transportLiveCacheKeys = [
                        `GET:${getApiUrl('freight-announcements')}`,
                        `GET:${getApiUrl('vehicles')}`,
                        `GET:${getApiUrl('drivers')}`,
                        `GET:${getApiUrl('personal-drivers?page=1&limit=500')}`,
                        `GET:${getApiUrl('personal-vehicles?page=1&limit=500')}`,
                    ];
                    try {
                        const { apiCache } = await import('../utils/apiCache');
                        for (const cacheKey of transportLiveCacheKeys) {
                            apiCache.invalidate(cacheKey);
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const fetchJson = async (url: string) => {
                    const response = await fetch(url, { headers });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                };

                const loadData = (url: string, ttl: number) =>
                    forceRefresh ? fetchJson(url) : cachedFetch(url, { headers }, ttl);

                // مرحله ۱: داده‌های اصلی (اعلام بار + راننده + خودرو) — بدون انتظار برای personal
                const [faRes, vRes, dRes] = await Promise.all([
                    loadData(getApiUrl('freight-announcements'), 30 * 1000),
                    loadData(getApiUrl('vehicles'), 10 * 60 * 1000),
                    loadData(getApiUrl('drivers'), 10 * 60 * 1000),
                ]);
                
                // console.log('📊 [TransportLive] API Response Status:', {
                //     freight: faRes.status,
                //     vehicles: vRes.status,
                //     drivers: dRes.status,
                //     personalDrivers: pdRes.status,
                //     personalVehicles: pvRes.status
                // });
                
                // Handle paginated response for personal resources (مرحله ۲ — غیرمسدودکننده)
                let personalDriversData: PersonalDriver[] = [];
                let personalVehiclesData: PersonalVehicle[] = [];
                if (shouldLoadPersonal) {
                    const [pdRes, pvRes] = await Promise.all([
                        loadData(getApiUrl('personal-drivers?page=1&limit=500'), 10 * 60 * 1000),
                        loadData(getApiUrl('personal-vehicles?page=1&limit=500'), 10 * 60 * 1000),
                    ]);
                    personalDriversData = (pdRes && typeof pdRes === 'object' && 'data' in pdRes)
                        ? pdRes.data
                        : (Array.isArray(pdRes) ? pdRes : []);
                    personalVehiclesData = (pvRes && typeof pvRes === 'object' && 'data' in pvRes)
                        ? pvRes.data
                        : (Array.isArray(pvRes) ? pvRes : []);
                }
                
                const announcementsRaw = faRes;
                const vehiclesData = vRes;
                const driversData = dRes;
                
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
                        ...pickAssignmentFieldsFromApi(a),
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
                            tonnage: d.tonnage != null && d.tonnage !== '' ? parseNumericField(d.tonnage) : undefined,
                            unloadTime: d.unload_time || d.unloadTime,
                            freightCost: d.freight_cost ?? d.freightCost,
                            deliveryDate: d.delivery_date || d.deliveryDate,
                            representativeType: d.representative_type || d.representativeType,
                        })) : [],
                        history: a.history || [],
                        assignmentFinalizedAt: a.assignment_finalized_at || a.assignmentFinalizedAt,
                        awaitingBillOfLadingAt: a.awaiting_bill_of_lading_at || a.awaitingBillOfLadingAt,
                        // اطلاعات کارمند اعلام‌کننده
                        creator_full_name: a.creator_full_name || a.creatorFullName,
                        creator_username: a.creator_username || a.creatorUsername,
                        creator_user_id: a.creator_user_id || a.creatorUserId,
                    };
                };

                const announcementsData: FreightAnnouncement[] = Array.isArray(announcementsRaw) ? announcementsRaw.map(normalize) : [];
                // فیلتر کردن ChangeRequested و Finalized از TransportLive
                // همچنین فیلتر کردن اعلام‌بارهایی که assignment_finalized_at دارند (دیگر در کارتابل نیستند)
                const filteredAnnouncements = announcementsData.filter(a => {
                    // حذف ChangeRequested (فقط برای planner نمایش داده می‌شود)
                    if (a.status === FreightAnnouncementStatus.ChangeRequested || a.status === 'ChangeRequested') {
                        return false;
                    }
                    // حذف Finalized (دیگر در کارتابل نیست)
                    if (a.status === FreightAnnouncementStatus.Finalized || a.status === 'Finalized') {
                        return false;
                    }
                    // حذف اعلام‌بارهایی که assignment_finalized_at دارند (تخصیص نهایی شده)
                    if (a.assignmentFinalizedAt) {
                        return false;
                    }
                    return true;
                });
                // Log breakdown قبل از فیلتر
                const beforeFilterBreakdown = {
                    PendingPersonalAssignment: announcementsData.filter(a => a.status === FreightAnnouncementStatus.PendingPersonalAssignment || a.status === 'PendingPersonalAssignment').length,
                    PendingCompanyAssignment: announcementsData.filter(a => a.status === FreightAnnouncementStatus.PendingCompanyAssignment || a.status === 'PendingCompanyAssignment').length,
                    Assigned: announcementsData.filter(a => a.status === FreightAnnouncementStatus.Assigned || a.status === 'Assigned').length,
                    InTransit: announcementsData.filter(a => a.status === FreightAnnouncementStatus.InTransit || a.status === 'InTransit').length,
                    Finalized: announcementsData.filter(a => a.status === FreightAnnouncementStatus.Finalized || a.status === 'Finalized').length,
                    ChangeRequested: announcementsData.filter(a => a.status === FreightAnnouncementStatus.ChangeRequested || a.status === 'ChangeRequested').length,
                    withAssignmentFinalizedAt: announcementsData.filter(a => a.assignmentFinalizedAt).length,
                };
                
                console.log('🧭 [TransportLive] Filtered Announcements:', {
                    total: announcementsData.length,
                    filtered: filteredAnnouncements.length,
                    removed: announcementsData.length - filteredAnnouncements.length,
                    beforeFilter: beforeFilterBreakdown,
                    afterFilter: {
                        PendingPersonalAssignment: filteredAnnouncements.filter(a => a.status === FreightAnnouncementStatus.PendingPersonalAssignment || a.status === 'PendingPersonalAssignment').length,
                        PendingCompanyAssignment: filteredAnnouncements.filter(a => a.status === FreightAnnouncementStatus.PendingCompanyAssignment || a.status === 'PendingCompanyAssignment').length,
                        Assigned: filteredAnnouncements.filter(a => a.status === FreightAnnouncementStatus.Assigned || a.status === 'Assigned').length,
                        InTransit: filteredAnnouncements.filter(a => a.status === FreightAnnouncementStatus.InTransit || a.status === 'InTransit').length,
                    },
                    lineTypeBreakdown: {
                        Dairy: filteredAnnouncements.filter(a => a.lineType === FreightLineType.Dairy || a.lineType === 'Dairy' || a.lineType === 'پاستوریزه').length,
                        Ambient: filteredAnnouncements.filter(a => a.lineType === FreightLineType.Ambient || a.lineType === 'Ambient' || a.lineType === 'لبنیات-فروتلند').length,
                        IceCream: filteredAnnouncements.filter(a => a.lineType === FreightLineType.IceCream || a.lineType === 'IceCream' || a.lineType === 'بستنی').length,
                    },
                    userRole: currentUser?.role,
                    userId: currentUser?.id
                });

                setAnnouncements((prev) =>
                    silent
                        ? filteredAnnouncements.map((ann) =>
                              mergeAssignmentDisplayFields(ann, prev.find((p) => p.id === ann.id))
                          )
                        : filteredAnnouncements
                );
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
                setDrivers(Array.isArray(driversData) ? driversData : []);

                // نمایش سریع جدول — قبل از لود personal (برای اکثر کاربران ترابری)
                if (!silent) {
                    setLoading(false);
                }

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
    
    // بارگذاری اولیه: کش برای سرعت + همگام‌سازی پس‌زمینه
    useEffect(() => {
        fetchDataRef.current(false, false, false);
        const syncTimer = setTimeout(() => {
            fetchDataRef.current(true, needsPersonalResourcesRef.current, false);
        }, 150);
        return () => clearTimeout(syncTimer);
    }, [currentUser?.id]);
    
    // Auto-refresh به عنوان fallback (همیشه فعال برای اطمینان از دریافت اعلام بارهای جدید)
    useEffect(() => {
        // کاهش interval برای به‌روزرسانی سریع‌تر
        // اگر SSE متصل است، 10 ثانیه برای fallback
        // اگر SSE قطع است، 5 ثانیه برای fallback قوی‌تر
        const interval = sseConnected ? 10000 : 5000; // 10s if SSE connected, 5s if disconnected
        
        if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
        }
        
        refreshIntervalRef.current = setInterval(() => {
            // فقط اگر صفحه visible است
            if (!document.hidden) {
                fetchDataRef.current(true, needsPersonalResourcesRef.current);
            }
        }, interval);
        
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
            if (message.type === 'announcement_update') {
                // به‌روزرسانی اعلام بار
                const { announcementId, updateType, data } = message;
                
                console.log('📨 [TransportLiveContainer] Processing update', { announcementId, updateType, data });
                
                // اگر finalized است، فوراً از لیست حذف کن (دیگر در کارتابل نیست)
                if (updateType === 'finalized' || data.status === 'Finalized' || data.status === 'finalized' || data.assignmentFinalizedAt) {
                    setAnnouncements(prev => prev.filter(a => a.id !== announcementId));
                    return;
                }
                
                // اعمال optimistic update - فوری اضافه کردن/حذف بدون تاخیر
                setAnnouncements(prev => {
                    const index = prev.findIndex(a => a.id === announcementId);
                    if (index === -1) {
                        // اگر اعلام بار جدید است (approved, created)
                        if (data && data.id && data.status && (updateType === 'created' || updateType === 'approved' || updateType === 'queue_changed')) {
                            try {
                                // Normalize data برای اضافه کردن به state
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
                                
                                const normalizedAnnouncement: FreightAnnouncement = {
                                    id: data.id || announcementId,
                                    announcementCode: data.announcementCode || data.announcement_code || `ANN-${Date.now()}`,
                                    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(data.created_at || Date.now()),
                                    loadingDate: (typeof data.loadingDate === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(data.loadingDate))
                                        ? (data.loadingDate.replace(/-/g, '/') as any)
                                        : (data.loading_date ? (typeof data.loading_date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(data.loading_date) ? data.loading_date.replace(/-/g, '/') as any : new Date(data.loading_date)) : new Date()),
                                    lineType: data.lineType || data.line_type,
                                    status: statusMap[data.status] || data.status,
                                    cargoValue: Number(data.cargoValue ?? data.cargo_value ?? 0),
                                    vehicleType: data.vehicleType || data.vehicle_type || '',
                                    notes: data.notes || null,
                                    ...pickAssignmentFieldsFromApi(data),
                                    originCity: data.originCity || data.origin_city || null,
                                    brand: data.brand || null,
                                    representativeType: data.representativeType || data.representative_type || null,
                                    representativeName: data.representativeName || data.representative_name || null,
                                    cartonCount: data.cartonCount ?? data.carton_count ?? null,
                                    priority: data.priority || null,
                                    products: Array.isArray(data.products) ? data.products : (data.products ? [data.products] : []),
                                    platformArrivalTime: data.platformArrivalTime || data.platform_arrival_time || null,
                                    deliveryDate: data.deliveryDate || data.delivery_date || null,
                                    destinations: Array.isArray(data.destinations) ? data.destinations.map((d: any) => ({
                                        id: d.id,
                                        city: d.city,
                                        representativeName: d.representativeName || d.representative_name,
                                        tonnage: d.tonnage != null && d.tonnage !== '' ? parseNumericField(d.tonnage) : undefined,
                                        unloadTime: d.unloadTime || d.unload_time,
                                        freightCost: d.freightCost ?? d.freight_cost,
                                        deliveryDate: d.deliveryDate || d.delivery_date,
                                        representativeType: d.representativeType || d.representative_type,
                                    })) : [],
                                    history: [],
                                    assignmentFinalizedAt: data.assignmentFinalizedAt || data.assignment_finalized_at || null,
                                    creator_full_name: data.creator_full_name || data.creatorFullName || null,
                                    creator_username: data.creator_username || data.creatorUsername || null,
                                    creator_user_id: data.creator_user_id || data.creatorUserId || null,
                                };
                                
                                // بررسی اینکه آیا باید در کارتابل نمایش داده شود
                                const shouldShow = !(
                                    normalizedAnnouncement.status === FreightAnnouncementStatus.ChangeRequested ||
                                    normalizedAnnouncement.status === FreightAnnouncementStatus.Finalized ||
                                    normalizedAnnouncement.status === 'ChangeRequested' ||
                                    normalizedAnnouncement.status === 'Finalized' ||
                                    normalizedAnnouncement.assignmentFinalizedAt
                                );
                                
                                if (shouldShow) {
                                    // اضافه کردن فوری به ابتدای لیست - بدون تاخیر
                                    return [normalizedAnnouncement, ...prev];
                                }
                            } catch (normalizeError) {
                                // Silent fail - اگر normalize نشد، fetch می‌کنیم
                            }
                        }
                        
                        // Fallback: اگر داده کامل نبود یا normalize نشد، fetch کن
                        // Invalidate cache و fetch با تاخیر کم
                        import('../utils/apiCache').then(({ apiCache }) => {
                            const cacheKey = `GET:${getApiUrl('freight-announcements')}`;
                            apiCache.invalidate(cacheKey);
                        }).catch(() => {});
                        
                        // Fetch فوری (50ms delay) برای sync با backend
                        setTimeout(() => {
                            fetchDataRef.current(true, needsPersonalResourcesRef.current);
                        }, 50);
                        
                        return prev;
                    }
                    
                    // به‌روزرسانی اعلام بار موجود
                    // اگر assignmentFinalizedAt set شده، فوراً از لیست حذف کن
                    if (data.assignmentFinalizedAt) {
                        return prev.filter(a => a.id !== announcementId);
                    }
                    
                    const existing = prev.find((a) => a.id === announcementId);
                    const assignmentPatch = pickAssignmentFieldsFromApi(data as Record<string, unknown>);
                    const awaitingFromFinalizeError =
                        updateType === 'finalize_error' &&
                        (data as { error?: string }).error === 'missing_bill_of_lading';

                    const statusFromEvent =
                        (data.status as FreightAnnouncementStatus) || existing?.status;

                    const cancelledOrUnassigned =
                        updateType === 'cancelled' ||
                        (isPendingAssignmentStatus(statusFromEvent) &&
                            existing &&
                            Boolean(existing.assignedDriverId || existing.assignedVehicleId) &&
                            !assignmentPatch.assignedDriverId &&
                            !assignmentPatch.assignedVehicleId);

                    if (cancelledOrUnassigned && existing) {
                        const cleared = clearAssignmentFromAnnouncement(existing, {
                            status: statusFromEvent || existing.status,
                            ...(awaitingFromFinalizeError
                                ? {
                                      awaitingBillOfLadingAt:
                                          (data as { awaitingBillOfLadingAt?: string })
                                              .awaitingBillOfLadingAt || new Date().toISOString(),
                                  }
                                : {}),
                        });
                        return prev.map((ann) => (ann.id === announcementId ? cleared : ann));
                    }

                    const updated = applyOptimisticUpdate(prev, announcementId, {
                        status: statusFromEvent,
                        ...assignmentPatch,
                        ...(awaitingFromFinalizeError
                            ? {
                                  awaitingBillOfLadingAt:
                                      (data as { awaitingBillOfLadingAt?: string }).awaitingBillOfLadingAt ||
                                      new Date().toISOString(),
                              }
                            : {}),
                    });
                    return updated.map((ann) =>
                        ann.id === announcementId
                            ? mergeAssignmentDisplayFields(ann, existing || null)
                            : ann
                    );
                });
            }
        },
        onConnect: () => {
            setSseConnected(true);
        },
        onDisconnect: () => {
            setSseConnected(false);
        },
        onError: () => {
            // Silent error handling
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
            assignedDriverName: assignment.assignedDriverName,
            assignedDriverContact: assignment.assignedDriverContact,
            assignedVehiclePlate: assignment.assignedVehiclePlate,
            totalFreightCost: assignment.totalFreightCost,
            billOfLadingNumber: assignment.billOfLadingNumber,
            notes: assignment.notes
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

            const fromApi = responseData?.announcement
                ? pickAssignmentFieldsFromApi(responseData.announcement as Record<string, unknown>)
                : {};

            // تثبیت نمایش در state قبل از refresh
            setAnnouncements((prev) =>
                prev.map((ann) => {
                    if (ann.id !== announcementId) return ann;
                    const merged = mergeAssignmentDisplayFields(
                        {
                            ...ann,
                            status: FreightAnnouncementStatus.Assigned,
                            assignmentType: assignment.assignmentType,
                            assignedDriverId: assignment.driverId || ann.assignedDriverId,
                            assignedVehicleId: assignment.vehicleId || ann.assignedVehicleId,
                            assignedDriverName: assignment.assignedDriverName,
                            assignedDriverContact: assignment.assignedDriverContact,
                            assignedVehiclePlate: assignment.assignedVehiclePlate,
                            billOfLadingNumber: assignment.billOfLadingNumber,
                            totalFreightCost: assignment.totalFreightCost,
                            notes: assignment.notes,
                            ...fromApi,
                            awaitingBillOfLadingAt:
                                ann.awaitingBillOfLadingAt ??
                                (fromApi as { awaitingBillOfLadingAt?: string }).awaitingBillOfLadingAt,
                        },
                        ann
                    );
                    return merged;
                })
            );
            
            // بعد از تخصیص موفق، داده‌ها را refresh کن تا تغییرات در UI نمایش داده شود
            // این برای اطمینان از نمایش صحیح در جدول و تابلو اعلام بار است
            console.log('🔄 [TransportLive] Refreshing data after assignment...');
            // اگر assignment شخصی است، personal resources را هم refresh کن
            const shouldIncludePersonal = assignment.assignmentType === 'personal' || 
                currentUser?.role === 'Transportation_Personal_Vehicle_User' || 
                currentUser?.role === 'personal_transport_user' ||
                currentUser?.role === 'کاربر ترابری (خودرو شخصی)';
            
            // Invalidate cache برای personal resources اگر assignment شخصی است
            if (shouldIncludePersonal) {
                try {
                    const { apiCache } = await import('../utils/apiCache');
                    apiCache.invalidate(`GET:${getApiUrl('personal-drivers?page=1&limit=500')}`);
                    apiCache.invalidate(`GET:${getApiUrl('personal-vehicles?page=1&limit=500')}`);
                    console.log('🗑️ [onUpdateAssignment] Cache invalidated for personal resources');
                } catch (err) {
                    console.warn('⚠️ [onUpdateAssignment] Failed to invalidate cache:', err);
                }
            }
            
            // حذف delay و استفاده از silent refresh برای تجربه کاربری بهتر
            // backend transaction معمولاً سریع commit می‌شود و نیازی به delay نیست
            // استفاده از silent: true برای جلوگیری از نمایش loading state در کل صفحه
            fetchDataRef.current(true, shouldIncludePersonal); // silent refresh برای نمایش تغییرات بدون loading
        } catch (e) { 
            console.error('❌ [TransportLive] Assignment error:', e);
            // در صورت خطا، rollback انجام شده است
        }
    };

    const onFinalize = async (announcementIds: string[], lineTypeOverride?: string) => {
        console.log('🏁 [TransportLive] Finalize Request:', {
            announcementIds,
            count: announcementIds.length,
            activeLine,
            lineTypeOverride,
            timestamp: new Date().toISOString()
        });
        
        if (announcementIds.length === 0) {
            console.warn('⚠️ [TransportLive] No announcements selected for finalize');
            return;
        }
        
        let lineTypeForBackend = lineTypeOverride || '';
        if (!lineTypeForBackend) {
            if (isPendingBillOfLadingTab(activeLine)) {
                console.warn('⚠️ [TransportLive] Finalize on pending tab requires lineTypeOverride');
                return;
            }
            lineTypeForBackend = lineTypeToBackend(activeLine as FreightLineType);
        }
        
        // Optimistic: فقط مواردی که احتمالاً finalize می‌شوند از لیست حذف شوند
        // (شخصی بدون بارنامه تا پاسخ سرور در تب خط می‌ماند)
        const originalAnnouncements = [...announcements];
        const idsForOptimisticRemove = announcementIds.filter((id) => {
            const ann = announcements.find((a) => a.id === id);
            if (!ann) return true;
            if (
                isPersonalAssignmentType(ann.assignmentType) &&
                !hasBillOfLadingNumber(ann)
            ) {
                return false;
            }
            return true;
        });
        setAnnouncements((prev) => {
            const filtered = prev.filter((a) => !idsForOptimisticRemove.includes(a.id));
            console.log('🗑️ [TransportLiveContainer] Optimistic: Removing finalized announcements', {
                before: prev.length,
                after: filtered.length,
                removedIds: idsForOptimisticRemove,
                skippedPersonalNoBill: announcementIds.filter((id) => !idsForOptimisticRemove.includes(id)),
            });
            return filtered;
        });
        
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
            
            // خواندن response body قبل از بررسی status
            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                console.error('❌ [TransportLiveContainer] Failed to parse finalize response:', parseError);
                // Rollback
                setAnnouncements(originalAnnouncements);
                alert('خطا در پردازش پاسخ سرور. لطفاً دوباره تلاش کنید.');
                return;
            }
            
            console.log('✅ [TransportLive] Finalize result:', result);
            
            if (!response.ok) {
                // Rollback در صورت خطا (فقط اگر هیچ کدام finalize نشدند)
                if (!result.partial) {
                    const failedIds = (result.missingBillOfLadingIds || []) as string[];
                    if (failedIds.length > 0) {
                        const nowIso = new Date().toISOString();
                        console.log(
                            '⚠️ [TransportLiveContainer] Finalize blocked: missing bill of lading — move to pending tab',
                            { failedIds }
                        );
                        setAnnouncements(
                            originalAnnouncements.map((a) =>
                                failedIds.includes(a.id)
                                    ? { ...a, awaitingBillOfLadingAt: nowIso }
                                    : a
                            )
                        );
                    } else {
                        console.log('❌ [TransportLiveContainer] Finalize failed completely, rolling back optimistic update');
                        setAnnouncements(originalAnnouncements);
                    }
                } else {
                    // اگر برخی finalize شدند، فقط آنهایی که finalize نشدند را برگردان
                    console.log('⚠️ [TransportLiveContainer] Partial finalize - some succeeded, some failed');
                    if (result.missingBillOfLadingIds && result.missingBillOfLadingIds.length > 0) {
                        const failedIds = result.missingBillOfLadingIds as string[];
                        const nowIso = new Date().toISOString();
                        setAnnouncements((prev) => {
                            const restored = originalAnnouncements
                                .filter((a) => failedIds.includes(a.id))
                                .map((a) => ({ ...a, awaitingBillOfLadingAt: nowIso }));
                            const merged = [...prev];
                            for (const r of restored) {
                                if (!merged.some((m) => m.id === r.id)) merged.push(r);
                            }
                            return merged.map((a) =>
                                failedIds.includes(a.id)
                                    ? { ...a, awaitingBillOfLadingAt: a.awaitingBillOfLadingAt || nowIso }
                                    : a
                            );
                        });
                    }
                }
                if (result.missingBillOfLadingIds?.length) {
                    setTimeout(() => {
                        fetchDataRef.current(true, needsPersonalResourcesRef.current);
                    }, 500);
                }
                throw new Error(result.message || 'خطا در اتمام تخصیص');
            }
            
            // نمایش پیام موفقیت
            if (result.partial) {
                // اگر برخی finalize شدند و برخی نه
                alert(`${result.message || `${result.finalizedCount || 0} اعلام بار نهایی شد. ${result.missingBillOfLadingCount || 0} اعلام بار بدون شماره بارنامه در کارتابل باقی ماند.`}`);
            } else {
                // اگر همه finalize شدند
                alert(`اتمام تخصیص انجام شد:\n${result.finalizedCount || result.finalized || 0} مورد نهایی شد${result.leftover ? `\n${result.leftover} مورد به بارهای مانده برگشت` : ''}`);
            }
            
            // Invalidate cache برای freight-announcements تا داده جدید fetch شود
            try {
                const { apiCache } = await import('../utils/apiCache');
                const cacheKey = `GET:${getApiUrl('freight-announcements')}`;
                apiCache.invalidate(cacheKey);
                console.log('🗑️ [TransportLiveContainer] Cache invalidated after finalize');
            } catch (err) {
                console.warn('⚠️ [TransportLiveContainer] Failed to invalidate cache:', err);
            }
            
            // Real-time updates باید finalized ها را از لیست حذف کنند
            // اما برای leftover ها یا missing bill of lading، ممکن است نیاز به refresh باشد
            if ((result.leftover && result.leftover > 0) || (result.missingBillOfLadingCount && result.missingBillOfLadingCount > 0)) {
                console.log('🔄 [TransportLiveContainer] Finalize completed, refreshing for leftover/missing bill of lading announcements...');
                // با کمی تاخیر برای اطمینان از به‌روزرسانی backend
                setTimeout(async () => {
                    await fetchDataRef.current(true, needsPersonalResourcesRef.current);
                }, 500);
            }
        } catch (error: any) {
            console.error('❌ [TransportLive] Finalize error:', error);
            alert(error.message || 'خطا در اتمام تخصیص');
        }
    };

    const onTransferDestination = async (
        sourceAnnouncementId: string,
        destinationId: string,
        targetAnnouncementId: string,
        newPosition: number
    ): Promise<boolean> => {
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
                return false;
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

            setAnnouncements(prev => {
                const sourceAnn = prev.find(a => a.id === sourceAnnouncementId);
                const updated = prev.map(ann => {
                    if (ann.id === sourceAnnouncementId) {
                        const updatedDestinations = ann.destinations.filter(d => d.id !== destinationId);
                        if (updatedDestinations.length === 0 || result.sourceAnnouncementDeleted) {
                            return null;
                        }
                        return { ...ann, destinations: updatedDestinations };
                    }
                    if (ann.id === targetAnnouncementId) {
                        const transferredDest = sourceAnn?.destinations.find(d => d.id === destinationId);
                        if (transferredDest) {
                            const newDestinations = [...ann.destinations];
                            const existingIndex = newDestinations.findIndex(d => d.id === destinationId);
                            if (existingIndex >= 0) {
                                newDestinations.splice(existingIndex, 1);
                            }
                            const insertIndex = Math.min(newPosition - 1, newDestinations.length);
                            newDestinations.splice(insertIndex, 0, transferredDest);
                            return { ...ann, destinations: newDestinations };
                        }
                    }
                    return ann;
                });
                return updated.filter((ann): ann is FreightAnnouncement => ann !== null);
            });

            void fetchData(true, needsPersonalResourcesRef.current, true);
            alert(result.message || 'انتقال مقصد با موفقیت انجام شد.');
            return true;
        } catch (error: any) {
            console.error('❌ [TransportLive] Transfer destination error:', error);
            let message = 'خطا در انتقال مقصد';
            try {
                message = JSON.parse(error?.message || '').message || message;
            } catch {
                if (error?.message) message = error.message;
            }
            alert(message);
            return false;
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
            await fetchData(true, needsPersonalResourcesRef.current);
            
            console.log('🔄 [TransportLive] Data refreshed after forward');
        } catch (e: any) {
            console.error('❌ [TransportLive] Forward error:', e);
            console.error('❌ [TransportLive] Forward error:', e);
        }
    };

    const onCancel = async (announcementId: string) => {
        const ann = announcements.find((a) => a.id === announcementId);
        const code = ann?.announcementCode || announcementId;
        if (
            !window.confirm(
                `آیا از لغو تخصیص اعلام بار «${code}» مطمئن هستید؟\nراننده، خودرو و کرایه پاک می‌شود و بار به صف تخصیص برمی‌گردد.`
            )
        ) {
            return;
        }

        const originalAnnouncements = [...announcements];
        const optimisticStatus =
            ann?.assignmentType === 'personal' ||
            ann?.status === FreightAnnouncementStatus.PendingPersonalAssignment
                ? FreightAnnouncementStatus.PendingPersonalAssignment
                : FreightAnnouncementStatus.PendingCompanyAssignment;

        setAnnouncements((prev) =>
            prev.map((row) =>
                row.id === announcementId
                    ? clearAssignmentFromAnnouncement(row, { status: optimisticStatus })
                    : row
            )
        );

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
            let payload: { message?: string; newStatus?: string } = {};
            try {
                payload = await res.json();
            } catch {
                payload = {};
            }
            if (!res.ok) {
                setAnnouncements(originalAnnouncements);
                console.error('❌ [TransportLive] Cancel API error:', payload);
                throw new Error(payload.message || 'خطا در لغو تخصیص');
            }
            console.log('✅ [TransportLive] Cancelled:', payload);

            const resolvedStatus =
                payload.newStatus === 'PendingPersonalAssignment'
                    ? FreightAnnouncementStatus.PendingPersonalAssignment
                    : payload.newStatus === 'PendingCompanyAssignment'
                      ? FreightAnnouncementStatus.PendingCompanyAssignment
                      : optimisticStatus;

            setAnnouncements((prev) =>
                prev.map((row) =>
                    row.id === announcementId
                        ? clearAssignmentFromAnnouncement(row, { status: resolvedStatus })
                        : row
                )
            );

            try {
                const { apiCache } = await import('../utils/apiCache');
                apiCache.invalidate(`GET:${getApiUrl('freight-announcements')}`);
            } catch {
                /* ignore */
            }

            alert(payload.message || 'تخصیص با موفقیت لغو شد.');
            window.dispatchEvent(new CustomEvent('dispatch-board:update'));
            await fetchData(true);
        } catch (e: any) {
            setAnnouncements(originalAnnouncements);
            console.error('❌ [TransportLive] Cancel error:', e);
            alert(e?.message || 'خطا در لغو تخصیص');
        }
    };

    const onChangeVehicleType = async (announcementId: string, vehicleType: string): Promise<boolean> => {
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
                return false;
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
            
            await res.json();

            setAnnouncements(prev =>
                prev.map(ann => (ann.id === announcementId ? { ...ann, vehicleType } : ann))
            );

            void fetchData(true, needsPersonalResourcesRef.current, true);
            return true;
        } catch (error: any) {
            console.error('❌ [TransportLive] Change vehicle type error:', error);
            alert(error?.message || 'خطا در تغییر نوع خودرو');
            return false;
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
            await fetchData(true, needsPersonalResourcesRef.current);
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
                onRefresh={() => fetchData(false, needsPersonalResources, true)}
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


