import React, { useEffect, useMemo, useState } from 'react';
import FreightDashboard from './FreightDashboard';
import { FreightAnnouncement, FreightAnnouncementStatus, User } from '../types';

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
            };
            const normalize = (a: any): FreightAnnouncement => ({
                id: a.id,
                announcementCode: a.announcement_code || a.announcementCode,
                createdAt: new Date(a.created_at || a.createdAt || Date.now()),
                loadingDate: new Date(a.loading_date || a.loadingDate || Date.now()),
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
            console.log('🧭 [FreightPlanning] Normalized announcements sample:', normalized[0]);
            setAnnouncements(normalized);
        } catch (err) {
            console.error('[FreightPlanning] Failed to load announcements', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAnnouncements(); }, []);

    const handleAddAnnouncement = async (
        announcement: Omit<FreightAnnouncement, 'id' | 'status' | 'announcementCode' | 'createdAt' | 'history'>,
        isDraft: boolean,
    ) => {
        try {
            console.log('📝 [FreightPlanning] Submitting announcement:', { announcement, isDraft });
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
            console.log('✏️ [FreightPlanning] Update announcement:', updated);
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
                onReAnnounce={() => {}}
                currentUser={currentUser}
                onSwitchQueue={handleSwitchQueue as any}
            />
        </div>
    );
};

export default FreightPlanningContainer;


