import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import FreightDashboard from './FreightDashboard';
import { DispatchRouteSuggestion, FreightAnnouncement, FreightAnnouncementStatus, User, UserRole } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { parseFreightApiErrorMessage, isFreightIntakeLockedError, fetchFreightIntakeLocks, lineTypeToIntakeLockKey, FREIGHT_INTAKE_LOCK_MESSAGE } from '../utils/freightIntakeLock';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { applyOptimisticUpdate } from '../utils/optimisticUpdates';
import { applyIceCreamDisplayOrderUpdates, IceCreamDisplayOrderItem, normalizeTonnageKg } from '../utils/freightDisplay';

const PLANNING_STATUS_MAP: Record<string, FreightAnnouncementStatus> = {
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
    Leftover: FreightAnnouncementStatus.Leftover,
    ReturnedToCreator: FreightAnnouncementStatus.ReturnedToCreator,
    ChangeRequested: FreightAnnouncementStatus.ChangeRequested,
    Archived: FreightAnnouncementStatus.Archived,
};

/** نرمال‌سازی از API یا payload realtime — بدون refetch کامل */
function normalizePlanningAnnouncement(a: any): FreightAnnouncement {
    return {
        id: a.id,
        announcementCode: a.announcement_code || a.announcementCode,
        createdAt: new Date(a.created_at || a.createdAt || Date.now()),
        loadingDate: (() => {
            const raw = a.loading_date ?? a.loadingDate;
            if (typeof raw === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(raw)) {
                return raw.replace(/-/g, '/') as any;
            }
            return new Date(raw || Date.now());
        })(),
        lineType: a.line_type || a.lineType,
        status: PLANNING_STATUS_MAP[a.status] || a.status,
        cargoValue: Number(a.cargo_value ?? a.cargoValue ?? 0),
        vehicleType: a.vehicle_type || a.vehicleType || '',
        deliveryDate: a.delivery_date || a.deliveryDate || null,
        notes: a.notes,
        rejectionReason: a.rejection_reason || a.rejectionReason,
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
        palletCount: a.pallet_count ?? a.palletCount,
        loadingType: a.loading_type || a.loadingType,
        displayPinned: !!(a.display_pinned ?? a.displayPinned),
        displaySortOrder:
            a.display_sort_order != null
                ? Number(a.display_sort_order)
                : a.displaySortOrder != null
                  ? Number(a.displaySortOrder)
                  : null,
        priority: a.priority,
        products: a.products || [],
        platformArrivalTime: a.platform_arrival_time || a.platformArrivalTime,
        announcementWeekDay: a.announcement_week_day || a.announcementWeekDay || undefined,
        creator_full_name: a.creator_full_name || a.creatorFullName,
        creator_username: a.creator_username || a.creatorUsername,
        creator_user_id: a.creator_user_id || a.creatorUserId,
        destinations: Array.isArray(a.destinations)
            ? a.destinations.map((d: any) => ({
                  id: d.id,
                  city: d.city,
                  representativeName: d.representative_name || d.representativeName,
                  tonnage:
                      d.tonnage === null || d.tonnage === undefined || d.tonnage === ''
                          ? d.tonnage
                          : normalizeTonnageKg(d.tonnage),
                  unloadTime: d.unload_time || d.unloadTime,
                  freightCost: d.freight_cost ?? d.freightCost,
                  cargoValue: Number(d.cargo_value ?? d.cargoValue ?? 0) || 0,
                  deliveryDate: d.delivery_date || d.deliveryDate,
                  loadingDate: d.loading_date || d.loadingDate || undefined,
                  platformArrivalTime:
                      d.platform_arrival_time || d.platformArrivalTime || undefined,
                  representativeType: d.representative_type || d.representativeType,
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
                        : [],
                  originalCreatedByUserId:
                      d.original_created_by_user_id ||
                      d.originalCreatedByUserId ||
                      d.original_creator_user_id ||
                      null,
                  originalCreatorFullName:
                      d.original_creator_full_name || d.originalCreatorFullName || null,
                  originalCreatorUsername:
                      d.original_creator_username || d.originalCreatorUsername || null,
              }))
            : [],
        history: a.history || [],
        destination_creator_names: a.destination_creator_names || a.destinationCreatorNames,
    } as any;
}
const FreightPlanningContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [loading, setLoading] = useState(false);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
    }), []);

    const isSalesExpertUser = useMemo(() => {
        const role = currentUser?.role;
        return (
            role === UserRole.SalesExpert ||
            role === 'sales_expert' ||
            role === 'SalesExpert' ||
            role === 'کارشناس فروش'
        );
    }, [currentUser?.role]);

    /** اگر لاین قفل باشد پیام می‌دهد و false برمی‌گرداند — بدون زدن API */
    const ensureIntakeOpenForLine = useCallback(async (lineType?: string | null): Promise<boolean> => {
        if (!lineType) return true;
        try {
            const locks = await fetchFreightIntakeLocks();
            const key = lineTypeToIntakeLockKey(lineType);
            if (locks[lineType] || locks[key]) {
                alert(FREIGHT_INTAKE_LOCK_MESSAGE);
                return false;
            }
        } catch {
            // اگر چک وضعیت قفل شکست خورد، بگذار سرور تصمیم بگیرد
        }
        return true;
    }, []);

    const fetchAnnouncements = useCallback(async (silent: boolean = false) => {
        try {
            if (!silent) {
                setLoading(true);
            }
            // includeLeftover=true برای نمایش بارهای مانده در برنامه ریزی
            const res = await fetch(getApiUrl('freight-announcements?includeLeftover=true'), { headers });
            if (!res.ok) throw new Error('Failed to fetch freight announcements');
            const raw = await res.json();
            const normalized: FreightAnnouncement[] = Array.isArray(raw)
                ? raw.map(normalizePlanningAnnouncement)
                : [];
            setAnnouncements(normalized);
        } catch (err) {
            console.error('[FreightPlanning] Failed to load announcements', err);
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, [headers]);

    // Auto-refresh به عنوان fallback (فقط وقتی SSE قطع است)
    const [sseConnected, setSseConnected] = useState(false);
    const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fetchAnnouncementsRef = useRef(fetchAnnouncements);
    fetchAnnouncementsRef.current = fetchAnnouncements;
    const pendingRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fetchChangeRequestsRef = useRef<() => void>(() => {});

    const scheduleDebouncedFullRefetch = useCallback(() => {
        if (pendingRefetchTimerRef.current) clearTimeout(pendingRefetchTimerRef.current);
        pendingRefetchTimerRef.current = setTimeout(() => {
            pendingRefetchTimerRef.current = null;
            fetchAnnouncementsRef.current(true).catch(() => undefined);
        }, 1500);
    }, []);

    // اتصال به Real-Time Updates (SSE)
    useRealtimeUpdates({
        onMessage: (message) => {
            if (message.type !== 'announcement_update') return;

            const { announcementId, updateType, data } = message;

            // اگر change_requested است، درخواست‌های تغییر و لیست اعلام‌بارها را refresh کن
            if (updateType === 'change_requested' || data?.status === 'ChangeRequested' || data?.status === 'درخواست تغییر') {
                fetchChangeRequestsRef.current?.();
                // وضعیت اعلام‌بار هم باید در کارتابل برنامه‌ریزی به‌روز شود
                setAnnouncements((prev) => {
                    const exists = prev.some((a) => a.id === announcementId);
                    if (!exists) {
                        scheduleDebouncedFullRefetch();
                        return prev;
                    }
                    return prev.map((a) =>
                        a.id === announcementId
                            ? {
                                  ...a,
                                  status: FreightAnnouncementStatus.ChangeRequested,
                                  assignedDriverId: undefined,
                                  assignedVehicleId: undefined,
                                  assignedDriverName: undefined,
                                  assignedVehiclePlate: undefined,
                              }
                            : a
                    );
                });
            }

            // اگر finalized است، فوراً از لیست حذف کن (دیگر در کارتابل نیست)
            if (updateType === 'finalized' || data?.status === 'Finalized') {
                setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
                return;
            }

            if (updateType === 'display_order_updated') {
                setAnnouncements((prev) =>
                    prev.map((a) =>
                        a.id === announcementId
                            ? {
                                  ...a,
                                  displayPinned: !!(data.displayPinned ?? data.display_pinned ?? a.displayPinned),
                                  displaySortOrder:
                                      data.displaySortOrder != null
                                          ? Number(data.displaySortOrder)
                                          : data.display_sort_order != null
                                            ? Number(data.display_sort_order)
                                            : a.displaySortOrder ?? null,
                              }
                            : a
                    )
                );
                return;
            }

            setAnnouncements((prev) => {
                const index = prev.findIndex((a) => a.id === announcementId);
                if (index === -1) {
                    // بار جدید: از payload بساز تا همه کلاینت‌ها همزمان لیست کامل نکشند
                    const hasUsablePayload =
                        data &&
                        (data.announcementCode ||
                            data.announcement_code ||
                            data.lineType ||
                            data.line_type ||
                            data.vehicleType ||
                            data.vehicle_type);
                    if (hasUsablePayload) {
                        const incoming = normalizePlanningAnnouncement({
                            ...data,
                            id: announcementId || data.id,
                        });
                        if (incoming.id && !prev.some((a) => a.id === incoming.id)) {
                            return [incoming, ...prev];
                        }
                        return prev;
                    }
                    scheduleDebouncedFullRefetch();
                    return prev;
                }

                // اگر payload غنی است (notes/مقاصد/ساعت)، نرمال کن و کامل جایگزین کن
                const hasRichPayload =
                    data &&
                    (Array.isArray(data.destinations) ||
                        data.notes != null ||
                        data.platformArrivalTime != null ||
                        data.platform_arrival_time != null ||
                        data.cargoValue != null ||
                        data.cargo_value != null);
                if (hasRichPayload) {
                    const incoming = normalizePlanningAnnouncement({
                        ...prev[index],
                        ...data,
                        id: announcementId,
                    });
                    return prev.map((a, i) => (i === index ? { ...prev[index], ...incoming } : a));
                }

                return applyOptimisticUpdate(prev, announcementId, {
                    status: data.status as FreightAnnouncementStatus,
                    assignmentType: data.assignmentType,
                    ...data,
                });
            });
        },
        onConnect: () => {
            setSseConnected(true);
        },
        onDisconnect: () => {
            setSseConnected(false);
        },
        onError: (error) => {
            console.error('❌ [FreightPlanningContainer] Real-time error:', error);
        },
        enabled: !!currentUser?.id,
    });

    // بارگذاری اولیه
    useEffect(() => {
        fetchAnnouncements();
    }, []); // فقط یک بار در mount

    // Fallback poll فقط وقتی SSE قطع است (قبلاً هر ۱۰ثانیه همیشه = اشباع سرور با ۱۵ کاربر)
    useEffect(() => {
        if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
        }
        if (sseConnected) return;

        refreshIntervalRef.current = setInterval(() => {
            if (!document.hidden) {
                fetchAnnouncementsRef.current(true);
            }
        }, 30000);

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
        };
    }, [sseConnected]);

    useEffect(() => {
        return () => {
            if (pendingRefetchTimerRef.current) clearTimeout(pendingRefetchTimerRef.current);
        };
    }, []);
    const searchRouteSuggestions = useCallback(async (query: string): Promise<DispatchRouteSuggestion[]> => {
        const trimmed = query.trim();
        if (!trimmed) {
            return [];
        }
        try {
            const res = await fetch(getApiUrl(`freight-announcements/routes/search?q=${encodeURIComponent(trimmed)}`), { headers });
            if (!res.ok) {
                throw new Error(`Failed to search routes: ${res.status}`);
            }
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('[FreightPlanning] Route search failed', error);
            return [];
        }
    }, [headers]);

    const handleAddAnnouncement = async (
        announcement: Omit<FreightAnnouncement, 'id' | 'status' | 'announcementCode' | 'createdAt' | 'history'>,
        isDraft: boolean,
    ) => {
        try {
            console.log('📝 [FreightPlanning] Submitting announcement:', { 
                announcement, 
                isDraft,
                loadingDate: announcement.loadingDate,
                loadingDateType: typeof announcement.loadingDate
            });
            if (!announcement.loadingDate || !announcement.vehicleType || !announcement.lineType) {
                console.warn('⚠️ [FreightPlanning] Missing required fields', announcement);
                alert('تاریخ بارگیری، نوع خودرو و نوع لاین الزامی است.');
                return;
            }
            // کارشناس فروش غیرپیش‌نویس = ورود مستقیم به ترابری
            if (!isDraft && isSalesExpertUser) {
                const open = await ensureIntakeOpenForLine(announcement.lineType);
                if (!open) return;
            }
            const res = await fetch(getApiUrl('freight-announcements'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...announcement, isDraft }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `Create failed: ${res.status}`);
            }
            const created = await res.json();
            console.log('✅ [FreightPlanning] Created announcement response:', created);
            await fetchAnnouncements();
        } catch (err) {
            alert(parseFreightApiErrorMessage(err, 'خطا در ایجاد اعلام بار'));
            if (isFreightIntakeLockedError(err)) return;
            console.error('[FreightPlanning] Create announcement failed', err);
        }
    };

    const handleUpdateAnnouncement = async (updated: FreightAnnouncement) => {
        try {
            console.log('✏️ [FreightPlanning] Update announcement:', { 
                updated,
                loadingDate: updated.loadingDate,
                loadingDateType: typeof updated.loadingDate,
                id: updated.id
            });
            // Fallback: if id is missing, treat as CREATE instead of PUT to avoid 404
            if (!updated.id) {
                console.warn('[FreightPlanning] Missing id → creating instead of updating');
                const createBody = {
                    loadingDate: updated.loadingDate,
                    lineType: updated.lineType,
                    cargoValue: updated.cargoValue,
                    vehicleType: updated.vehicleType,
                    notes: updated.notes,
                    originCity: updated.originCity,
                    brand: updated.brand,
                    representativeType: updated.representativeType,
                    representativeName: updated.representativeName,
                    cartonCount: updated.cartonCount,
                    palletCount: (updated as any).palletCount,
                    loadingType: (updated as any).loadingType,
                    priority: updated.priority,
                    products: updated.products,
                    platformArrivalTime: (updated as any).platformArrivalTime,
                    announcementWeekDay: (updated as any).announcementWeekDay,
                    destinations: updated.destinations,
                    isDraft: updated.status === FreightAnnouncementStatus.Draft,
                } as any;
                const resCreate = await fetch(getApiUrl('freight-announcements'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(createBody),
                });
                if (!resCreate.ok) throw new Error(await resCreate.text());
                await fetchAnnouncements();
                return;
            }

            // فوری در UI نشان بده تا کاربر تغییر را ببیند
            setAnnouncements((prev) =>
                prev.map((a) =>
                    a.id === updated.id
                        ? {
                              ...a,
                              ...updated,
                              destinations: Array.isArray(updated.destinations)
                                  ? updated.destinations
                                  : a.destinations,
                          }
                        : a
                )
            );

            const res = await fetch(getApiUrl(`freight-announcements/${updated.id}`) ,{
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    loadingDate: updated.loadingDate,
                    deliveryDate: (updated as any).deliveryDate || null, // تاریخ تحویل بار
                    lineType: updated.lineType,
                    cargoValue: updated.cargoValue,
                    vehicleType: updated.vehicleType,
                    notes: updated.notes,
                    originCity: updated.originCity,
                    brand: updated.brand,
                    representativeType: updated.representativeType,
                    representativeName: updated.representativeName,
                    cartonCount: updated.cartonCount,
                    palletCount: (updated as any).palletCount,
                    loadingType: (updated as any).loadingType,
                    priority: updated.priority,
                    products: updated.products,
                    platformArrivalTime: (updated as any).platformArrivalTime,
                    announcementWeekDay: (updated as any).announcementWeekDay,
                    status: updated.status,
                    destinations: updated.destinations,
                    lisCodeOnly: !!(updated as any).lisCodeOnly,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const savedRaw = await res.json().catch(() => null);
            if (savedRaw && savedRaw.id) {
                const saved = normalizePlanningAnnouncement(savedRaw);
                setAnnouncements((prev) =>
                    prev.map((a) => (a.id === saved.id ? { ...a, ...saved } : a))
                );
            }
            await fetchAnnouncements(true);
        } catch (e) {
            alert(parseFreightApiErrorMessage(e, 'خطا در ویرایش اعلام بار'));
            if (isFreightIntakeLockedError(e)) return;
            console.error('❌ [FreightPlanning] Update failed:', e);
            // برگرداندن لیست از سرور در صورت خطا
            await fetchAnnouncements(true).catch(() => undefined);
        }
    };

    const handleApprove = async (id: string) => {
        try {
            console.log('✅ [FreightPlanning] Approve request:', id);
            const ann = announcements.find((a) => a.id === id);
            const open = await ensureIntakeOpenForLine(ann?.lineType);
            if (!open) {
                // برای bulk به‌عنوان ناموفق (بدون درخواست ۴۰۳)
                throw new Error(FREIGHT_INTAKE_LOCK_MESSAGE);
            }
            const res = await fetch(getApiUrl(`freight-announcements/${id}/approve`), {
                method: 'POST',
                headers,
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'خطا در تایید');
            }
            await fetchAnnouncements();
        } catch (e) {
            // اگر از چک محلی آمده، قبلاً alert شده
            if (
                e instanceof Error &&
                e.message === FREIGHT_INTAKE_LOCK_MESSAGE
            ) {
                throw e;
            }
            alert(parseFreightApiErrorMessage(e, 'خطا در تایید اعلام بار'));
            if (isFreightIntakeLockedError(e)) {
                throw new Error(parseFreightApiErrorMessage(e));
            }
            console.error('❌ [FreightPlanning] Approve failed:', e);
            throw e;
        }
    };

    const handleReject = async (id: string, reason: string) => {
        try {
            console.log('⛔ [FreightPlanning] Reject request:', { id, reason });
            const res = await fetch(getApiUrl(`freight-announcements/${id}/reject`), {
                method: 'POST',
                headers,
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Reject failed:', e);
            console.error('❌ [FreightPlanning] Reject failed');
        }
    };

    // Switch assignment queue (manager or transport can re-route)
    const handleSwitchQueue = async (id: string, nextQueue: 'company' | 'personal') => {
        try {
            const res = await fetch(getApiUrl(`freight-announcements/${id}/assignment-queue`), {
                method: 'POST',
                headers,
                body: JSON.stringify({ nextQueue })
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Switch queue failed:', e);
            console.error('❌ [FreightPlanning] Switch queue failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            console.log('🗑️ [FreightPlanning] Delete announcement:', id);
            const res = await fetch(getApiUrl(`freight-announcements/${id}`), {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
            // Real-time update will handle the UI update
        } catch (e) {
            console.error('❌ [FreightPlanning] Delete failed:', e);
            console.error('❌ [FreightPlanning] Delete failed');
        }
    };

    const handleReAnnounce = async (id: string) => {
        try {
            console.log('🔄 [FreightPlanning] Re-announce request:', id);
            // پیدا کردن اعلام بار
            const announcement = announcements.find(a => a.id === id);
            if (!announcement) {
                console.warn('⚠️ [FreightPlanning] Announcement not found');
                return;
            }

            // کارشناس فروش: اعلام مجدد مستقیم به ترابری
            if (isSalesExpertUser) {
                const open = await ensureIntakeOpenForLine(announcement.lineType);
                if (!open) return;
            }

            // اعلام مجدد: باید اول به مدیر برنامه‌ریزی برود برای تایید مجدد
            // سپس مدیر می‌تواند تایید کند و بعد بر اساس lineType به ترابری مناسب ارسال شود
            const res = await fetch(getApiUrl(`freight-announcements/${id}`), {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    status: 'PendingManagerApproval',
                    // ارسال فیلدهای موجود برای جلوگیری از تغییرات ناخواسته
                    loadingDate: announcement.loadingDate,
                    lineType: announcement.lineType,
                    cargoValue: announcement.cargoValue,
                    vehicleType: announcement.vehicleType,
                    notes: announcement.notes,
                    originCity: announcement.originCity,
                    brand: announcement.brand,
                    representativeType: announcement.representativeType,
                    representativeName: announcement.representativeName,
                    cartonCount: announcement.cartonCount,
                    palletCount: (announcement as any).palletCount,
                    loadingType: (announcement as any).loadingType,
                    priority: announcement.priority,
                    products: announcement.products,
                    platformArrivalTime: (announcement as any).platformArrivalTime,
                    destinations: announcement.destinations,
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'خطا در اعلام مجدد');
            }
            await fetchAnnouncements();
            // Real-time update will handle the UI update
        } catch (e: any) {
            alert(parseFreightApiErrorMessage(e, 'خطا در اعلام مجدد'));
            if (isFreightIntakeLockedError(e)) return;
            console.error('❌ [FreightPlanning] Re-announce failed:', e);
        }
    };

    const handleSendForApproval = async (announcement: FreightAnnouncement, showNotification: boolean = true) => {
        try {
            console.log('📤 [FreightPlanning] Send for approval:', announcement.id);
            if (isSalesExpertUser) {
                const open = await ensureIntakeOpenForLine(announcement.lineType);
                if (!open) {
                    throw new Error(FREIGHT_INTAKE_LOCK_MESSAGE);
                }
            }
            const res = await fetch(getApiUrl(`freight-announcements/${announcement.id}`), {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    status: 'PendingManagerApproval',
                    // ارسال فیلدهای موجود برای جلوگیری از تغییرات ناخواسته
                    loadingDate: announcement.loadingDate,
                    lineType: announcement.lineType,
                    cargoValue: announcement.cargoValue,
                    vehicleType: announcement.vehicleType,
                    notes: announcement.notes,
                    originCity: announcement.originCity,
                    brand: announcement.brand,
                    representativeType: announcement.representativeType,
                    representativeName: announcement.representativeName,
                    cartonCount: announcement.cartonCount,
                    palletCount: (announcement as any).palletCount,
                    loadingType: (announcement as any).loadingType,
                    priority: announcement.priority,
                    products: announcement.products,
                    platformArrivalTime: (announcement as any).platformArrivalTime,
                    destinations: announcement.destinations,
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'خطا در ارجاع');
            }
            await fetchAnnouncements();
            // Real-time update will handle the UI update
        } catch (e: any) {
            if (e instanceof Error && e.message === FREIGHT_INTAKE_LOCK_MESSAGE) {
                throw e;
            }
            alert(parseFreightApiErrorMessage(e, 'خطا در ارجاع اعلام بار'));
            if (isFreightIntakeLockedError(e)) return;
            console.error('❌ [FreightPlanning] Send for approval failed:', e);
            throw e;
        }
    };

    const [changeRequests, setChangeRequests] = useState<any[]>([]);
    const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);

    const fetchChangeRequests = async () => {
        try {
            setLoadingChangeRequests(true);
            const res = await fetch(getApiUrl('freight-announcements/change-requests?status=requested'), { headers });
            if (!res.ok) throw new Error('Failed to fetch change requests');
            const data = await res.json();
            setChangeRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[FreightPlanning] Failed to load change requests', err);
        } finally {
            setLoadingChangeRequests(false);
        }
    };
    fetchChangeRequestsRef.current = fetchChangeRequests;

    // دریافت خودکار درخواست‌های تغییر هنگام بارگذاری
    useEffect(() => {
        fetchChangeRequests();
    }, []);

    const handleApproveChangeRequest = async (requestId: string, newAnnouncements?: any[]) => {
        try {
            const res = await fetch(getApiUrl(`freight-announcements/change-requests/${requestId}/approve`), {
                method: 'POST',
                headers,
                body: JSON.stringify({ newAnnouncements }),
            });
            if (!res.ok) throw new Error(await res.text());
            // Real-time update will handle the UI update
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Approve change request failed:', e);
            console.error('❌ [FreightPlanning] Approve change request failed:', e);
        }
    };

    const handleRejectChangeRequest = async (requestId: string, reviewNote?: string) => {
        try {
            const res = await fetch(getApiUrl(`freight-announcements/change-requests/${requestId}/reject`), {
                method: 'POST',
                headers,
                body: JSON.stringify({ reviewNote }),
            });
            if (!res.ok) throw new Error(await res.text());
            // Real-time update will handle the UI update
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Reject change request failed:', e);
            console.error('❌ [FreightPlanning] Reject change request failed:', e);
        }
    };

    const handleArchiveChangeRequest = async (requestId: string) => {
        try {
            const res = await fetch(getApiUrl(`freight-announcements/change-requests/${requestId}/archive`), {
                method: 'POST',
                headers,
            });
            if (!res.ok) {
                let message = 'خطا در خارج کردن از کارتابل';
                try {
                    const body = await res.json();
                    message = body.detail ? `${body.message}: ${body.detail}` : (body.message || message);
                } catch {
                    const text = await res.text();
                    if (text) message = text;
                }
                throw new Error(message);
            }
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Archive change request failed:', e);
            alert(e?.message || 'خطا در خارج کردن از کارتابل');
        }
    };

    const handleUpdateIceCreamDisplayOrder = async (items: IceCreamDisplayOrderItem[]) => {
        const previous = announcements;
        setAnnouncements((prev) => applyIceCreamDisplayOrderUpdates(prev, items));
        try {
            const res = await fetch(getApiUrl('freight-announcements/ice-cream-display-order'), {
                method: 'PUT',
                headers,
                body: JSON.stringify({ items }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'خطا در ذخیره ترتیب نمایش');
            }
        } catch (e: any) {
            setAnnouncements(previous);
            console.error('❌ [FreightPlanning] Ice cream display order failed:', e);
            alert(e?.message || 'خطا در ذخیره ترتیب نمایش بستنی');
            throw e;
        }
    };

    return (
        <div>
            {loading && <div className="mb-2 text-sm text-slate-500">در حال بارگذاری...</div>}
            <FreightDashboard
                announcements={announcements}
                onAddAnnouncement={handleAddAnnouncement}
                onUpdateAnnouncement={handleUpdateAnnouncement}
                onApprove={handleApprove}
                onReject={handleReject as any}
                onDelete={handleDelete as any}
                onReAnnounce={handleReAnnounce}
                onSendForApproval={handleSendForApproval}
                onSearchRoutes={searchRouteSuggestions}
                currentUser={currentUser}
                onSwitchQueue={handleSwitchQueue as any}
                changeRequests={changeRequests}
                loadingChangeRequests={loadingChangeRequests}
                onFetchChangeRequests={fetchChangeRequests}
                onApproveChangeRequest={handleApproveChangeRequest}
                onRejectChangeRequest={handleRejectChangeRequest}
                onArchiveChangeRequest={handleArchiveChangeRequest}
                onUpdateIceCreamDisplayOrder={handleUpdateIceCreamDisplayOrder}
            />
        </div>
    );
};

export default FreightPlanningContainer;


