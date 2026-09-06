import React, { useCallback, useEffect, useState } from 'react';
import { User, View } from '../types';
import { apiFetch, getApiUrl } from '../utils/apiConfig';
import { canManageBaleRegionBans } from '../utils/roleAccess';
import BaleRegionBanPanel from './BaleRegionBanPanel';
import WorkflowRules from './WorkflowRules';

type DriverOption = {
    driver_id: string;
    driver_name?: string | null;
    employee_id?: string | null;
};

const InspectionWorkbench: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [drivers, setDrivers] = useState<DriverOption[]>([]);
    const [error, setError] = useState<string | null>(null);
    const canManage = canManageBaleRegionBans(currentUser.role);

    const loadDrivers = useCallback(async () => {
        const res = await apiFetch(getApiUrl('bale/region-bans/drivers'));
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(body.message || 'خطا در دریافت رانندگان');
        }
        setDrivers((await res.json()) as DriverOption[]);
    }, []);

    useEffect(() => {
        void loadDrivers().catch(e => {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری کارتابل');
        });
    }, [loadDrivers]);

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div>
                <h1 className="text-xl font-bold text-slate-800">کارتابل بازرسی</h1>
                <p className="text-sm text-slate-500 mt-1">
                    تعریف اعمال محدودیت و تخصیص آن به راننده از اینجا انجام می‌شود.
                </p>
            </div>
            <WorkflowRules view={View.InspectionWorkbench} userRole={currentUser.role} />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <BaleRegionBanPanel drivers={drivers} canManage={canManage} tableMaxClass="max-h-[60vh]" />
        </div>
    );
};

export default InspectionWorkbench;
