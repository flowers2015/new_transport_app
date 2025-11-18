import React, { useEffect, useMemo, useState } from 'react';
import FreightDashboard from './FreightDashboard';
import { DispatchRouteSuggestion, FreightAnnouncement, FreightAnnouncementStatus, User } from '../types';
import { useCallback } from 'react';

const FreightPlanningContainer: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [loading, setLoading] = useState(false);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
    }), []);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
            // includeLeftover=true برای نمایش بارهای مانده در برنامه ریزی
            const res = await fetch('http://localhost:3000/api/v1/freight-announcements?includeLeftover=true', { headers });
            if (!res.ok) throw new Error('Failed to fetch freight announcements');
            const raw = await res.json();
            console.log('📦 [FreightPlanning] Fetched raw announcements count:', Array.isArray(raw)? raw.length : -1);
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
                Leftover: FreightAnnouncementStatus.Leftover,
                ChangeRequested: FreightAnnouncementStatus.ChangeRequested,
                Archived: FreightAnnouncementStatus.Archived,
            };
            const normalize = (a: any): FreightAnnouncement => ({
                id: a.id,
                announcementCode: a.announcement_code || a.announcementCode,
                createdAt: new Date(a.created_at || a.createdAt || Date.now()),
                                    // اگر loading_date یک رشته شمسی است (فرمت YYYY/MM/DD یا YYYY-MM-DD)، همان را نگه دار و `-` را به `/` تبدیل کن
                    loadingDate: (() => {
                        if (typeof a.loading_date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(a.loading_date)) {
                            const result = a.loading_date.replace(/-/g, '/');
                            if (a.loading_date !== result) {
                                console.log(`📅 [FreightPlanningContainer] normalize - Converted date: "${a.loading_date}" → "${result}"`);
                            }
                            return result as any;
                        } else {
                            const dateResult = new Date(a.loading_date || a.loadingDate || Date.now());
                            console.log(`📅 [FreightPlanningContainer] normalize - Created Date object:`, {
                                input: a.loading_date || a.loadingDate,
                                result: dateResult.toISOString()
                            });
                            return dateResult;
                        }
                    })(),
                lineType: a.line_type || a.lineType,
                status: statusMap[a.status] || a.status,
                cargoValue: Number(a.cargo_value ?? a.cargoValue ?? 0),
                vehicleType: a.vehicle_type || a.vehicleType || '',
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
            console.log('🧭 [FreightPlanning] Normalized announcements:', {
                total: normalized.length,
                byStatus: normalized.reduce((acc, ann) => {
                    const status = ann.status || 'unknown';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>),
                leftoverCount: normalized.filter(a => a.status === FreightAnnouncementStatus.Leftover || a.status === 'Leftover' || a.status === 'بار مانده').length
            });
            setAnnouncements(normalized);
        } catch (err) {
            console.error('[FreightPlanning] Failed to load announcements', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAnnouncements(); }, []);

    const searchRouteSuggestions = useCallback(async (query: string): Promise<DispatchRouteSuggestion[]> => {
        const trimmed = query.trim();
        if (!trimmed) {
            return [];
        }
        try {
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/routes/search?q=${encodeURIComponent(trimmed)}`, { headers });
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
            const res = await fetch('http://localhost:3000/api/v1/freight-announcements', {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...announcement, isDraft }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Create failed: ${res.status} ${txt}`);
            }
            const created = await res.json();
            console.log('✅ [FreightPlanning] Created announcement response:', created);
            await fetchAnnouncements();
        } catch (err) {
            console.error('[FreightPlanning] Create announcement failed', err);
            alert('ثبت اعلام بار ناموفق بود.');
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
                    priority: updated.priority,
                    products: updated.products,
                    platformArrivalTime: (updated as any).platformArrivalTime,
                    destinations: updated.destinations,
                    isDraft: updated.status === FreightAnnouncementStatus.Draft,
                } as any;
                const resCreate = await fetch('http://localhost:3000/api/v1/freight-announcements', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(createBody),
                });
                if (!resCreate.ok) throw new Error(await resCreate.text());
                await fetchAnnouncements();
                return;
            }
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${updated.id}` ,{
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    loadingDate: updated.loadingDate,
                    lineType: updated.lineType,
                    cargoValue: updated.cargoValue,
                    vehicleType: updated.vehicleType,
                    notes: updated.notes,
                    originCity: updated.originCity,
                    brand: updated.brand,
                    status: updated.status,
                    destinations: updated.destinations,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Update failed:', e);
            alert('به‌روزرسانی ناموفق بود');
        }
    };

    const handleApprove = async (id: string) => {
        try {
            console.log('✅ [FreightPlanning] Approve request:', id);
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${id}/approve`, {
                method: 'POST',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Approve failed:', e);
            alert('تایید ناموفق بود');
        }
    };

    const handleReject = async (id: string, reason: string) => {
        try {
            console.log('⛔ [FreightPlanning] Reject request:', { id, reason });
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${id}/reject`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Reject failed:', e);
            alert('رد کردن ناموفق بود');
        }
    };

    // Switch assignment queue (manager or transport can re-route)
    const handleSwitchQueue = async (id: string, nextQueue: 'company' | 'personal') => {
        try {
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${id}/assignment-queue`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ nextQueue })
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
        } catch (e) {
            console.error('❌ [FreightPlanning] Switch queue failed:', e);
            alert('تغییر صف تخصیص ناموفق بود');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            console.log('🗑️ [FreightPlanning] Delete announcement:', id);
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchAnnouncements();
            try { alert('آیتم با موفقیت حذف شد.'); } catch {}
        } catch (e) {
            console.error('❌ [FreightPlanning] Delete failed:', e);
            alert('حذف ناموفق بود');
        }
    };

    const handleReAnnounce = async (id: string) => {
        try {
            console.log('🔄 [FreightPlanning] Re-announce request:', id);
            // پیدا کردن اعلام بار
            const announcement = announcements.find(a => a.id === id);
            if (!announcement) {
                alert('اعلام بار یافت نشد');
                return;
            }

            // اعلام مجدد: باید اول به مدیر برنامه‌ریزی برود برای تایید مجدد
            // سپس مدیر می‌تواند تایید کند و بعد بر اساس lineType به ترابری مناسب ارسال شود
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${id}`, {
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
            alert('اعلام بار با موفقیت برای تایید مجدد مدیر ارسال شد');
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Re-announce failed:', e);
            alert(e.message || 'اعلام مجدد ناموفق بود');
        }
    };

    const handleSendForApproval = async (announcement: FreightAnnouncement, showNotification: boolean = true) => {
        try {
            console.log('📤 [FreightPlanning] Send for approval:', announcement.id);
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/${announcement.id}`, {
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
            if (showNotification) {
                alert('اعلام بار با موفقیت برای تایید ارسال شد');
            }
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Send for approval failed:', e);
            if (showNotification) {
                alert(e.message || 'ارجاع ناموفق بود');
            }
            throw e; // پرتاب خطا برای مدیریت در bulk operation
        }
    };

    const [changeRequests, setChangeRequests] = useState<any[]>([]);
    const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);

    const fetchChangeRequests = async () => {
        try {
            setLoadingChangeRequests(true);
            const res = await fetch('http://localhost:3000/api/v1/freight-announcements/change-requests?status=requested', { headers });
            if (!res.ok) throw new Error('Failed to fetch change requests');
            const data = await res.json();
            setChangeRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[FreightPlanning] Failed to load change requests', err);
        } finally {
            setLoadingChangeRequests(false);
        }
    };

    // دریافت خودکار درخواست‌های تغییر هنگام بارگذاری
    useEffect(() => {
        fetchChangeRequests();
    }, []);

    const handleApproveChangeRequest = async (requestId: string, newAnnouncements?: any[]) => {
        try {
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/change-requests/${requestId}/approve`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ newAnnouncements }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert('درخواست با موفقیت تأیید شد');
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Approve change request failed:', e);
            alert(e.message || 'تأیید ناموفق بود');
        }
    };

    const handleRejectChangeRequest = async (requestId: string, reviewNote?: string) => {
        try {
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/change-requests/${requestId}/reject`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ reviewNote }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert('درخواست رد شد');
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Reject change request failed:', e);
            alert(e.message || 'رد ناموفق بود');
        }
    };

    const handleArchiveChangeRequest = async (requestId: string) => {
        try {
            const res = await fetch(`http://localhost:3000/api/v1/freight-announcements/change-requests/${requestId}/archive`, {
                method: 'POST',
                headers,
            });
            if (!res.ok) throw new Error(await res.text());
            alert('درخواست از کارتابل خارج شد');
            await fetchChangeRequests();
            await fetchAnnouncements();
        } catch (e: any) {
            console.error('❌ [FreightPlanning] Archive change request failed:', e);
            alert(e.message || 'خارج کردن از کارتابل ناموفق بود');
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
            />
        </div>
    );
};

export default FreightPlanningContainer;


