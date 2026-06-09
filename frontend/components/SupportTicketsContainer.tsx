import React, { useCallback, useEffect, useState } from 'react';
import { SupportTicket, User, UserRole } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import SupportTickets from './SupportTickets';
import AdminSupportTickets from './AdminSupportTickets';

interface Props {
    currentUser: User;
}

function parseTicket(row: Record<string, unknown>): SupportTicket {
    return {
        id: String(row.id),
        ticketNumber: row.ticketNumber as number | undefined,
        subject: String(row.subject || ''),
        description: String(row.description || ''),
        priority: String(row.priority || 'عادی'),
        status: String(row.status || 'باز'),
        createdAt: row.createdAt ? new Date(String(row.createdAt)) : new Date(),
        updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : undefined,
        createdByUserId: String(row.createdByUserId || ''),
        createdByUserName: String(row.createdByUserName || ''),
        createdByRole: row.createdByRole ? String(row.createdByRole) : undefined,
        employeeId: row.employeeId ? String(row.employeeId) : null,
        contactPhone: row.contactPhone ? String(row.contactPhone) : null,
        contactExtension: String(row.contactExtension || ''),
        adminResponse: row.adminResponse ? String(row.adminResponse) : null,
        assignedToUserId: row.assignedToUserId ? String(row.assignedToUserId) : null,
        assignedToUserName: row.assignedToUserName ? String(row.assignedToUserName) : null,
        resolvedAt: row.resolvedAt ? new Date(String(row.resolvedAt)) : null,
    };
}

const SupportTicketsContainer: React.FC<Props> = ({ currentUser }) => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isAdmin =
        currentUser.role === UserRole.Admin || currentUser.role === 'admin';

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    };

    const loadTickets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl('support-tickets'), { headers });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg =
                    body.detail
                        ? `${body.message || 'خطا'}: ${body.detail}`
                        : body.message || (await res.text());
                throw new Error(msg);
            }
            const data = await res.json();
            setTickets(Array.isArray(data) ? data.map(parseTicket) : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری تیکت‌ها');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTickets();
    }, [loadTickets]);

    const handleAddTicket = async (payload: {
        subject: string;
        description: string;
        priority: string;
        contactPhone?: string;
        contactExtension: string;
        employeeId?: string;
    }) => {
        const res = await fetch(getApiUrl('support-tickets'), {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
                err.detail
                    ? `${err.message || 'خطا در ثبت تیکت'}: ${err.detail}`
                    : err.message || 'خطا در ثبت تیکت'
            );
        }
        await loadTickets();
    };

    const handleUpdateTicket = async (
        ticketId: string,
        updates: {
            status?: string;
            priority?: string;
            adminResponse?: string;
        }
    ) => {
        const res = await fetch(getApiUrl(`support-tickets/${ticketId}`), {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updates),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'خطا در به‌روزرسانی');
        }
        await loadTickets();
    };

    if (isAdmin) {
        return (
            <AdminSupportTickets
                tickets={tickets}
                currentUser={currentUser}
                loading={loading}
                error={error}
                onRefresh={loadTickets}
                onAddTicket={handleAddTicket}
                onUpdateTicket={handleUpdateTicket}
            />
        );
    }

    return (
        <SupportTickets
            tickets={tickets.filter(t => t.createdByUserId === currentUser.id)}
            currentUser={currentUser}
            loading={loading}
            error={error}
            onRefresh={loadTickets}
            onAddTicket={handleAddTicket}
        />
    );
};

export default SupportTicketsContainer;
