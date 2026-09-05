import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiUrl, isAuthFailureStatus } from '../utils/apiConfig';
import { User, UserRole, View } from '../types';
import WorkflowRules from './WorkflowRules';

type BaleChannel = {
    slot_number: number;
    chat_id: number | null;
    vehicle_category: string | null;
    label: string | null;
    is_active: boolean;
};

type QueueEntry = {
    id?: string;
    driverId?: string;
    driver_id?: string;
    vehicleId?: string;
    vehicle_id?: string;
    driver?: { name?: string; employeeId?: string };
    driver_name?: string;
};

type SessionAnnouncement = {
    id: string;
    lineType?: string;
    originCity?: string;
    origin_city?: string;
    destinationCities?: string;
    destination?: { id?: string; city?: string };
    destinationId?: string;
    brand?: string;
};

type BaleSession = {
    id: string;
    status: string;
    mode: string;
    modeLabel: string;
    stage: string;
    stageLabel?: string;
    vehicleCategory: string | null;
    currentTurnIndex: number;
    turnTimeoutSec: number;
    turnDeadlineAt: string | null;
    queueSnapshot: unknown[] | string;
    eligibleAnnouncements?: unknown[] | string;
};

type RuntimeEnvironment = 'test' | 'production';

type DriverOutreach = {
    driver_id: string;
    driver_name: string;
    employee_id: string;
    mobile?: string | null;
    outreach_chat_id: number | null;
    bale_user_id?: number | null;
    is_test_simulation?: boolean | null;
    notes?: string | null;
    outreach_updated_at?: string | null;
};

type BaleStatus = {
    configured: boolean;
    bot: { username?: string; first_name?: string; error?: string } | null;
    runtime?: { environment: RuntimeEnvironment };
    activeSession: BaleSession | null;
    activeSessions?: BaleSession[];
    channels: BaleChannel[];
    channelPlans?: Array<{ category: string; slot: number; chatId: string; pilotCombined: boolean }>;
    categoryQueues?: Array<{ category: string; queueCount: number }>;
};

const MODES = [
    { value: 'hybrid', label: 'هیبرید' },
    { value: 'manual', label: 'دستی' },
];

const STATUS_FA: Record<string, string> = {
    running: 'در حال اعلام',
    awaiting_confirm: 'منتظر تأیید راننده',
    awaiting_admin: 'منتظر تصمیم شما',
    assigning: 'در حال ثبت تخصیص',
};

function parseJsonArray<T>(raw: unknown): T[] {
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function queueDriverId(entry: QueueEntry | undefined): string {
    return String(entry?.driverId || entry?.driver_id || '');
}

function queueDriverName(entry: QueueEntry | undefined): string {
    return entry?.driver?.name || entry?.driver_name || '—';
}

function announcementLine(ann: SessionAnnouncement, index: number): string {
    const dest = ann.destinationCities || ann.destination?.city || '—';
    const origin = ann.originCity || ann.origin_city || '—';
    return `${index + 1}. ${ann.lineType || 'بار'} — ${origin} → ${dest}`;
}

function formatRemain(deadlineAt: string | null | undefined, now: number): string {
    if (!deadlineAt) return '—';
    const ms = new Date(deadlineAt).getTime() - now;
    if (ms <= 0) return '۰:۰۰';
    const total = Math.ceil(ms / 1000);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
}

const CATEGORY_SLOTS = [
    { slot: 2, category: 'تریلی', label: 'تریلی', channelLabel: 'کانال تریلی (اسلات ۲)' },
    { slot: 3, category: 'مینی تریلی', label: 'مینی تریلی', channelLabel: 'کانال مینی تریلی (اسلات ۳)' },
    { slot: 4, category: 'ده چرخ', label: 'ده چرخ', channelLabel: 'کانال ده چرخ (اسلات ۴)' },
];

const EXTEND_MINUTE_OPTIONS = [2, 4, 6] as const;

const WORKSPACE_TABS: { value: RuntimeEnvironment; label: string; hint: string }[] = [
    {
        value: 'test',
        label: 'تستی',
        hint: 'گروه مشترک، ابزار seed، لینک تست راننده',
    },
    {
        value: 'production',
        label: 'عملیاتی',
        hint: 'کانال واقعی هر دسته و chat اختصاصی راننده',
    },
];

const WORKSPACE_STORAGE_KEY = 'bale-dispatch-workspace';
const DRIVERS_TABLE_HIDDEN_KEY = 'bale-dispatch-drivers-hidden';
const CATEGORY_SETTINGS_KEY = 'bale-dispatch-category-settings';

type CategorySessionSettings = {
    mode: string;
    stage: string;
    turnTimeoutSec: number;
};

const DEFAULT_CATEGORY_SETTINGS: CategorySessionSettings = {
    mode: 'hybrid',
    stage: 'stage1',
    turnTimeoutSec: 180,
};

function defaultAllCategorySettings(): Record<string, CategorySessionSettings> {
    return Object.fromEntries(
        CATEGORY_SLOTS.map(({ category }) => [category, { ...DEFAULT_CATEGORY_SETTINGS }])
    );
}

function readCategorySettings(): Record<string, CategorySessionSettings> {
    const base = defaultAllCategorySettings();
    try {
        const raw = localStorage.getItem(CATEGORY_SETTINGS_KEY);
        if (!raw) return base;
        const parsed = JSON.parse(raw) as Record<string, Partial<CategorySessionSettings>>;
        CATEGORY_SLOTS.forEach(({ category }) => {
            const row = parsed[category];
            if (!row) return;
            const mode =
                row.mode === 'manual' || row.mode === 'hybrid'
                    ? row.mode
                    : DEFAULT_CATEGORY_SETTINGS.mode;
            base[category] = {
                mode,
                stage: row.stage || DEFAULT_CATEGORY_SETTINGS.stage,
                turnTimeoutSec: Number(row.turnTimeoutSec) || DEFAULT_CATEGORY_SETTINGS.turnTimeoutSec,
            };
        });
    } catch {
        /* ignore */
    }
    return base;
}

function readStoredWorkspace(): RuntimeEnvironment {
    try {
        return localStorage.getItem(WORKSPACE_STORAGE_KEY) === 'production' ? 'production' : 'test';
    } catch {
        return 'test';
    }
}

function readDriversTableHidden(tab: RuntimeEnvironment): boolean {
    try {
        return localStorage.getItem(`${DRIVERS_TABLE_HIDDEN_KEY}-${tab}`) === '1';
    } catch {
        return false;
    }
}

function driverLinkStatus(d: DriverOutreach): string {
    if (!d.outreach_chat_id) return 'بدون لینک';
    return d.is_test_simulation ? 'تست' : 'عملیاتی';
}

interface Props {
    currentUser: User;
}

async function readApiError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message || res.statusText || 'خطا در ارتباط با سرور';
}

const BaleDispatchSession: React.FC<Props> = ({ currentUser }) => {
    const [status, setStatus] = useState<BaleStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [authExpired, setAuthExpired] = useState(false);
    const [categorySettings, setCategorySettings] = useState(readCategorySettings);
    const [activeTab, setActiveTab] = useState<RuntimeEnvironment>(readStoredWorkspace);
    const [testChatId, setTestChatId] = useState('');
    const [groupChatId, setGroupChatId] = useState('');
    const [channelChatIds, setChannelChatIds] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const [seedResult, setSeedResult] = useState<string | null>(null);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [showRulesDialog, setShowRulesDialog] = useState(false);
    const [drivers, setDrivers] = useState<DriverOutreach[]>([]);
    const [driverFilter, setDriverFilter] = useState('');
    const [driversTableHidden, setDriversTableHidden] = useState(() =>
        readDriversTableHidden(readStoredWorkspace())
    );
    const [editingChat, setEditingChat] = useState<Record<string, string>>({});
    const [savingDriverId, setSavingDriverId] = useState<string | null>(null);
    const [assignOpenId, setAssignOpenId] = useState<string | null>(null);
    const [assignDriverId, setAssignDriverId] = useState('');
    const [assignAnnouncementId, setAssignAnnouncementId] = useState('');
    const [nowTs, setNowTs] = useState(() => Date.now());

    const isTestMode = activeTab === 'test';
    const serverEnv = status?.runtime?.environment;
    const tabMatchesServer = !serverEnv || serverEnv === activeTab;

    useEffect(() => {
        setDriversTableHidden(readDriversTableHidden(activeTab));
        setDriverFilter('');
    }, [activeTab]);

    useEffect(() => {
        const t = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const loadDrivers = useCallback(async () => {
        const res = await apiFetch(getApiUrl('bale/drivers/outreach'), { skipAuthRedirect: true });
        if (isAuthFailureStatus(res.status)) {
            setAuthExpired(true);
            throw new Error('نشست منقضی شده — دوباره وارد شوید.');
        }
        if (!res.ok) throw new Error(await readApiError(res));
        const data = (await res.json()) as DriverOutreach[];
        setDrivers(data);
        const draft: Record<string, string> = {};
        data.forEach(d => {
            draft[d.driver_id] =
                d.outreach_chat_id != null ? String(d.outreach_chat_id) : '';
        });
        setEditingChat(draft);
    }, []);

    const applyStatus = (data: BaleStatus) => {
        setStatus(data);
        const ch1 = data.channels?.find(c => c.slot_number === 1);
        if (ch1?.chat_id) setGroupChatId(String(ch1.chat_id));
        const ids: Record<number, string> = {};
        CATEGORY_SLOTS.forEach(({ slot }) => {
            const ch = data.channels?.find(c => c.slot_number === slot);
            if (ch?.chat_id) ids[slot] = String(ch.chat_id);
        });
        setChannelChatIds(prev => ({ ...ids, ...prev }));
        const sessions = data.activeSessions?.length
            ? data.activeSessions
            : data.activeSession
              ? [data.activeSession]
              : [];
        setSelectedSessionId(prev => {
            if (sessions.length === 0) return '';
            if (sessions.find(s => s.id === prev)) return prev;
            return sessions[0].id;
        });
    };

    const loadStatus = useCallback(
        async ({ silent = false, withDrivers = false } = {}) => {
            if (authExpired) return;
            if (!silent) setError(null);
            try {
                const path = silent ? 'bale/status?light=1' : 'bale/status';
                const res = await apiFetch(getApiUrl(path), { skipAuthRedirect: true });
                if (isAuthFailureStatus(res.status)) {
                    setAuthExpired(true);
                    setError(
                        'نشست شما منقضی شده. جلسه بله ممکن است روی سرور ادامه داشته باشد — از منو خارج شوید و دوباره وارد شوید.'
                    );
                    return;
                }
                if (!res.ok) throw new Error(await readApiError(res));
                applyStatus((await res.json()) as BaleStatus);
                if (withDrivers) await loadDrivers();
            } catch (e) {
                if (!silent) setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [authExpired, loadDrivers]
    );

    useEffect(() => {
        if (authExpired) return;
        let cancelled = false;
        (async () => {
            await loadStatus({ silent: false, withDrivers: false });
            if (!cancelled) void loadDrivers();
        })();
        const t = setInterval(() => void loadStatus({ silent: true, withDrivers: false }), 10000);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [loadStatus, loadDrivers, authExpired]);

    const activeSessions =
        status?.activeSessions?.length
            ? status.activeSessions
            : status?.activeSession
              ? [status.activeSession]
              : [];

    const runAction = async (label: string, fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await loadStatus();
        } catch (e) {
            setError(`${label}: ${e instanceof Error ? e.message : 'خطا'}`);
        } finally {
            setBusy(false);
        }
    };

    const switchWorkspaceTab = async (tab: RuntimeEnvironment) => {
        if (tab === activeTab && tabMatchesServer) return;
        if (
            tab !== activeTab &&
            activeSessions.length > 0 &&
            !window.confirm(
                'جلسه‌هایی در محیط فعلی فعال‌اند. عوض کردن تب، حالت سرور را هم عوض می‌کند. ادامه می‌دهید؟'
            )
        ) {
            return;
        }
        setActiveTab(tab);
        try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, tab);
        } catch {
            /* ignore */
        }
        await runAction(`فعال‌سازی ${tab === 'test' ? 'تستی' : 'عملیاتی'}`, async () => {
            const res = await apiFetch(getApiUrl('bale/settings/runtime'), {
                method: 'PUT',
                body: JSON.stringify({ environment: tab }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
        });
    };

    const seedDrivers = () =>
        runAction('seed', async () => {
            if (!testChatId.trim()) throw new Error('chat_id تست را وارد کنید');
            const res = await apiFetch(getApiUrl('bale/test/seed-drivers'), {
                method: 'POST',
                body: JSON.stringify({ outreachChatId: Number(testChatId), limit: 10 }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            const data = await res.json();
            setSeedResult(`${data.count} راننده با chat مشترک لینک شدند`);
        });

    const saveDriverOutreach = (driver: DriverOutreach) =>
        runAction('ذخیره chat راننده', async () => {
            const chatRaw = editingChat[driver.driver_id]?.trim();
            if (!chatRaw) throw new Error('chat_id را وارد کنید');
            setSavingDriverId(driver.driver_id);
            try {
                const res = await apiFetch(getApiUrl(`bale/drivers/${driver.driver_id}/outreach`), {
                    method: 'PUT',
                    body: JSON.stringify({
                        outreachChatId: Number(chatRaw),
                        employeeId: driver.employee_id,
                        isTestSimulation: isTestMode,
                        notes: isTestMode ? 'ثبت دستی — تست' : 'ثبت دستی — عملیاتی',
                    }),
                });
                if (!res.ok) throw new Error(await readApiError(res));
            } finally {
                setSavingDriverId(null);
            }
        });

    const ping = () =>
        runAction('ping', async () => {
            const chat = testChatId || groupChatId;
            if (!chat) throw new Error('chat_id وارد کنید');
            const res = await apiFetch(getApiUrl('bale/test/ping'), {
                method: 'POST',
                body: JSON.stringify({ chatId: Number(chat) }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
        });

    const settingsFor = (vehicleCategory: string): CategorySessionSettings =>
        categorySettings[vehicleCategory] || { ...DEFAULT_CATEGORY_SETTINGS };

    const patchCategorySettings = (vehicleCategory: string, patch: Partial<CategorySessionSettings>) => {
        setCategorySettings(prev => {
            const next = {
                ...prev,
                [vehicleCategory]: {
                    ...DEFAULT_CATEGORY_SETTINGS,
                    ...prev[vehicleCategory],
                    ...patch,
                },
            };
            try {
                localStorage.setItem(CATEGORY_SETTINGS_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const startCategorySession = (vehicleCategory: string) =>
        runAction(`شروع ${vehicleCategory}`, async () => {
            const settings = settingsFor(vehicleCategory);
            const res = await apiFetch(getApiUrl('bale/sessions/start'), {
                method: 'POST',
                body: JSON.stringify({
                    mode: settings.mode,
                    stage: settings.stage,
                    turnTimeoutSec: settings.turnTimeoutSec,
                    vehicleCategory,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            setSeedResult(`جلسه «${vehicleCategory}» شروع شد`);
        });

    const startAllSessions = () =>
        runAction('شروع همه', async () => {
            if (activeSessions.length > 0) {
                const ok = window.confirm(
                    'جلسه‌های فعال بدون توقف باقی می‌مانند. برای ری‌استارت کامل ابتدا «توقف همه» بزنید.\nادامه می‌دهید؟'
                );
                if (!ok) return;
            }
            const notes: string[] = [];
            let started = 0;
            for (const { category } of CATEGORY_SLOTS) {
                if (activeSessions.some(s => s.vehicleCategory === category)) {
                    notes.push(`${category}: از قبل فعال`);
                    continue;
                }
                const settings = settingsFor(category);
                const res = await apiFetch(getApiUrl('bale/sessions/start'), {
                    method: 'POST',
                    body: JSON.stringify({
                        mode: settings.mode,
                        stage: settings.stage,
                        turnTimeoutSec: settings.turnTimeoutSec,
                        vehicleCategory: category,
                    }),
                });
                if (!res.ok) {
                    notes.push(`${category}: ${await readApiError(res)}`);
                    continue;
                }
                started += 1;
            }
            notes.unshift(`${started} جلسه شروع شد`);
            setSeedResult(notes.join(' — '));
        });

    const stopCategorySession = (vehicleCategory: string) =>
        runAction(`توقف ${vehicleCategory}`, async () => {
            const res = await apiFetch(getApiUrl('bale/sessions/stop'), {
                method: 'POST',
                body: JSON.stringify({ vehicleCategory }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            setSeedResult(`جلسه «${vehicleCategory}» متوقف شد`);
        });

    const stopAllSessions = () =>
        runAction('توقف همه', async () => {
            if (
                activeSessions.length > 0 &&
                !window.confirm('همه جلسات فعال (حتی منتظر اپراتور) متوقف می‌شوند. ادامه؟')
            ) {
                return;
            }
            const res = await apiFetch(getApiUrl('bale/sessions/stop'), { method: 'POST' });
            if (!res.ok) throw new Error(await readApiError(res));
        });

    const skipTurnForSession = (sessionId: string) =>
        runAction('رد نوبت', async () => {
            const res = await apiFetch(getApiUrl('bale/sessions/skip-turn'), {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
        });

    const extendTurnForSession = (sessionId: string, minutes: number) =>
        runAction(`تمدید ${minutes} دقیقه`, async () => {
            const res = await apiFetch(getApiUrl('bale/sessions/extend-turn'), {
                method: 'POST',
                body: JSON.stringify({ sessionId, extraSec: minutes * 60 }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
        });

    const resumeTurnForSession = (sessionId: string) =>
        runAction('ادامه از همین‌جا', async () => {
            const res = await apiFetch(getApiUrl('bale/sessions/resume-turn'), {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            setSeedResult('نوبت جاری دوباره اعلام شد');
        });

    const openAssignPanel = (session: BaleSession) => {
        const q = parseJsonArray<QueueEntry>(session.queueSnapshot);
        const loads = parseJsonArray<SessionAnnouncement>(session.eligibleAnnouncements);
        const turn = q[session.currentTurnIndex];
        setAssignOpenId(session.id);
        setAssignDriverId(queueDriverId(turn) || queueDriverId(q[0]));
        setAssignAnnouncementId(loads[0]?.id ? String(loads[0].id) : '');
    };

    const assignFromSession = (session: BaleSession) =>
        runAction('تخصیص از جلسه', async () => {
            const q = parseJsonArray<QueueEntry>(session.queueSnapshot);
            const loads = parseJsonArray<SessionAnnouncement>(session.eligibleAnnouncements);
            const entry = q.find(e => queueDriverId(e) === assignDriverId);
            const ann = loads.find(a => String(a.id) === String(assignAnnouncementId));
            if (!entry || !ann) throw new Error('راننده و بار را از لیست همین جلسه انتخاب کنید');
            const res = await apiFetch(getApiUrl('bale/sessions/manual-assign'), {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: session.id,
                    freightAnnouncementId: ann.id,
                    destinationId: ann.destination?.id || ann.destinationId,
                    driverId: queueDriverId(entry),
                    vehicleId: entry.vehicleId || entry.vehicle_id,
                    queueEntryId: entry.id,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            setAssignOpenId(null);
            setSeedResult(`بار به ${queueDriverName(entry)} تخصیص شد`);
        });

    const session =
        activeSessions.find(s => s.id === selectedSessionId) || activeSessions[0] || null;
    const queue = Array.isArray(session?.queueSnapshot) ? session.queueSnapshot : [];
    const currentTurn = session ? queue[session.currentTurnIndex] : null;

    const workspaceDrivers = drivers.filter(d => {
        if (!d.outreach_chat_id) return true;
        return isTestMode ? Boolean(d.is_test_simulation) : !d.is_test_simulation;
    });

    const filteredDrivers = workspaceDrivers.filter(d => {
        const q = driverFilter.trim().toLowerCase();
        if (!q) return true;
        return (
            d.driver_name?.toLowerCase().includes(q) ||
            d.employee_id?.includes(q) ||
            String(d.outreach_chat_id || '').includes(q)
        );
    });

    const linkedCount = workspaceDrivers.filter(d => d.outreach_chat_id != null).length;
    const showDriversTable = !driversTableHidden || Boolean(driverFilter.trim());

    const toggleDriversTable = () => {
        setDriversTableHidden(prev => {
            const next = !prev;
            try {
                localStorage.setItem(`${DRIVERS_TABLE_HIDDEN_KEY}-${activeTab}`, next ? '1' : '0');
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const exportDriversExcel = async () => {
        const XLSX = await import('xlsx');
        const rows = (driverFilter.trim() ? filteredDrivers : workspaceDrivers).map(d => ({
            نام: d.driver_name || '',
            'کد پرسنلی': d.employee_id || '',
            chat_id: d.outreach_chat_id ?? '',
            وضعیت: driverLinkStatus(d),
            موبایل: d.mobile || '',
        }));
        const ws = XLSX.utils.json_to_sheet(
            rows.length ? rows : [{ نام: '', 'کد پرسنلی': '', chat_id: '', وضعیت: '', موبایل: '' }]
        );
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isTestMode ? 'تستی' : 'عملیاتی');
        XLSX.writeFile(wb, `رانندگان_بله_${isTestMode ? 'تستی' : 'عملیاتی'}.xlsx`);
    };

    const sessionForCategory = (category: string) =>
        activeSessions.find(s => s.vehicleCategory === category);

    const channelPlanForCategory = (category: string) =>
        status?.channelPlans?.find(p => p.category === category);

    const queueCountForCategory = (category: string) =>
        status?.categoryQueues?.find(q => q.category === category)?.queueCount ?? null;

    const channelRowForSlot = (slot: number) =>
        status?.channels?.find(c => c.slot_number === slot);

    const channelReadyHint = (slot: number, category: string) => {
        if (isTestMode) {
            if (!groupChatId) {
                return 'گروه تست (اسلات ۱) chat_id ندارد — ادمین تنظیم کند.';
            }
            return null;
        }
        const plan = channelPlanForCategory(category);
        if (plan) return null;
        const ch = channelRowForSlot(slot);
        if (ch?.chat_id != null && ch.is_active === false) {
            return 'کانال chat_id دارد ولی غیرفعال است — ادمین دوباره «ذخیره» بزند.';
        }
        if (!ch?.chat_id) {
            return 'chat_id کانال تنظیم نشده — از پنل ادمین (تنظیمات بله).';
        }
        return 'کانال برای شروع آماده نیست.';
    };

    const startBlockedReason = (slot: number, category: string) => {
        if (!tabMatchesServer) {
            return 'سرور روی تب دیگر است — روی همین تب کلیک کنید تا فعال شود.';
        }
        const channelHint = channelReadyHint(slot, category);
        if (channelHint) return channelHint;
        const queueCount = queueCountForCategory(category);
        if (queueCount === 0) {
            return 'صف نوبت این دسته خالی است — ابتدا در «ثبت نوبت» راننده اضافه کنید.';
        }
        return null;
    };

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">اعلام بار بله</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        تستی و عملیاتی جدا هستند — هر تب راننده، کانال و جلسه خودش را دارد
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowRulesDialog(true)}
                    className="px-3 py-1.5 text-sm rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-2"
                    title="قوانین و راهنما"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                    </svg>
                    قوانین و راهنما
                </button>
            </div>

            <div className="flex gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                {WORKSPACE_TABS.map(tab => {
                    const selected = activeTab === tab.value;
                    return (
                        <button
                            key={tab.value}
                            type="button"
                            disabled={busy}
                            onClick={() => void switchWorkspaceTab(tab.value)}
                            className={`flex-1 min-w-[140px] rounded-lg px-4 py-3 text-right transition ${
                                selected
                                    ? tab.value === 'test'
                                        ? 'bg-amber-500 text-white shadow'
                                        : 'bg-sky-600 text-white shadow'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <div className="text-base font-bold">{tab.label}</div>
                            <div className={`text-xs mt-0.5 ${selected ? 'text-white/90' : 'text-slate-500'}`}>
                                {tab.hint}
                            </div>
                        </button>
                    );
                })}
            </div>
            {!tabMatchesServer && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm space-y-2">
                    <p>
                        سرور الان روی «{serverEnv === 'production' ? 'عملیاتی' : 'تستی'}» است.
                        این تب هنوز فعال نشده — شروع جلسه روی محیط اشتباه می‌رود.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void switchWorkspaceTab(activeTab)}
                        className="px-3 py-1.5 rounded-md bg-amber-700 text-white text-sm disabled:opacity-50"
                    >
                        فعال‌سازی تب {isTestMode ? 'تستی' : 'عملیاتی'}
                    </button>
                </div>
            )}

            {authExpired && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm space-y-2">
                    <p className="font-medium">نشست شما منقضی شده است.</p>
                    <p>
                        جلسه بله روی سرور ممکن است هنوز فعال باشد. از منوی بالا خارج شوید و دوباره
                        وارد شوید تا پنل به‌روز شود.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            window.location.href = '/';
                        }}
                        className="px-3 py-1.5 rounded-md bg-amber-700 text-white text-sm"
                    >
                        ورود مجدد
                    </button>
                </div>
            )}
            {error && !authExpired && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
                    {error}
                </div>
            )}
            {seedResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">
                    {seedResult}
                </div>
            )}

            {loading && !status ? (
                <div className="text-slate-500 text-sm">در حال بارگذاری...</div>
            ) : (
                <>
                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <h2 className="font-semibold text-slate-700">وضعیت بازو</h2>
                        <div className="text-sm text-slate-600 grid gap-1">
                            <div>
                                توکن سرور:{' '}
                                {status?.configured ? (
                                    <span className="text-emerald-600">تنظیم شده</span>
                                ) : (
                                    <span className="text-amber-600">BALE_BOT_TOKEN در .env سرور</span>
                                )}
                            </div>
                            {status?.bot && !status.bot.error && (
                                <div>بازو: @{status.bot.username || status.bot.first_name || '—'}</div>
                            )}
                            <div>
                                لینک رانندگان این تب: {linkedCount} از {workspaceDrivers.length}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <h2 className="font-semibold text-slate-700">
                            رانندگان {isTestMode ? 'تستی' : 'عملیاتی'} — chat بله
                        </h2>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="text-sm flex-1 min-w-[220px]">
                                جستجو
                                <input
                                    className="mt-1 border rounded-md px-3 py-2 text-sm w-full"
                                    placeholder="نام، کد پرسنلی یا chat_id"
                                    value={driverFilter}
                                    onChange={e => setDriverFilter(e.target.value)}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={toggleDriversTable}
                                className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
                            >
                                {driversTableHidden ? 'نمایش جدول' : 'پنهان کردن جدول'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void exportDriversExcel()}
                                className="px-3 py-2 rounded-md border border-emerald-600 text-emerald-700 text-sm hover:bg-emerald-50"
                            >
                                خروجی اکسل
                            </button>
                        </div>
                        {showDriversTable && (
                            <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-900 leading-relaxed space-y-1">
                                <p className="font-medium">ثبت خودکار chat_id از راننده:</p>
                                <p>
                                    ۱. راننده در بله به بازوی اعلام بار پیام بدهد:{' '}
                                    <code className="bg-white px-1 rounded ltr">/start کدپرسنلی</code>{' '}
                                    — مثلاً <code className="bg-white px-1 rounded ltr">/start 44983</code>
                                </p>
                                <p>
                                    ۲. یا پیام: <code className="bg-white px-1 rounded">ثبت 44983</code>
                                </p>
                                <p>
                                    ۳. سیستم chat_id همان گفتگو را ذخیره می‌کند — نیازی به دستی نیست مگر
                                    تست.
                                </p>
                                <p className="text-slate-600">
                                    روش دستی: بعد از اولین پیام راننده به بازو، از getUpdates یا لاگ سرور
                                    chat_id را بردارید و اینجا وارد کنید.
                                </p>
                            </div>
                        )}
                        {!showDriversTable ? (
                            <p className="text-sm text-slate-500">
                                جدول پنهان است ({linkedCount} لینک از {workspaceDrivers.length} راننده).
                                برای پیدا کردن یک نفر جستجو کنید یا «نمایش جدول» را بزنید.
                            </p>
                        ) : (
                            <div className="overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="text-right p-2 font-medium">نام</th>
                                            <th className="text-right p-2 font-medium">کد پرسنلی</th>
                                            <th className="text-right p-2 font-medium">chat_id</th>
                                            <th className="text-right p-2 font-medium">وضعیت</th>
                                            <th className="p-2 w-24" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDrivers.length === 0 ? (
                                            <tr>
                                                <td className="p-3 text-slate-500" colSpan={5}>
                                                    راننده‌ای با این جستجو پیدا نشد.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredDrivers.map(d => (
                                                <tr key={d.driver_id} className="border-t border-slate-100">
                                                    <td className="p-2">{d.driver_name || '—'}</td>
                                                    <td className="p-2 font-mono text-xs">{d.employee_id}</td>
                                                    <td className="p-2">
                                                        <input
                                                            className="w-full min-w-[120px] border rounded px-2 py-1 text-xs ltr text-left"
                                                            value={editingChat[d.driver_id] ?? ''}
                                                            onChange={e =>
                                                                setEditingChat(prev => ({
                                                                    ...prev,
                                                                    [d.driver_id]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="chat_id"
                                                        />
                                                    </td>
                                                    <td className="p-2 text-xs">
                                                        {!d.outreach_chat_id ? (
                                                            <span className="text-red-600">بدون لینک</span>
                                                        ) : d.is_test_simulation ? (
                                                            <span className="text-amber-600">تست</span>
                                                        ) : (
                                                            <span className="text-emerald-600">عملیاتی</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2">
                                                        <button
                                                            type="button"
                                                            disabled={busy || savingDriverId === d.driver_id}
                                                            onClick={() => saveDriverOutreach(d)}
                                                            className="text-xs px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-50"
                                                        >
                                                            ذخیره
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {isTestMode && (
                        <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-4">
                            <h2 className="font-semibold text-amber-900">
                                ابزار تست (فقط تب تستی)
                            </h2>
                            <p className="text-xs text-slate-600">
                                تا ۱۰ راننده صف — همه PV به یک chat_id. شناسایی با نوبت جاری هر جلسه.
                            </p>
                            <div className="grid md:grid-cols-2 gap-3">
                                <label className="text-sm block">
                                    chat_id خصوصی/تست (PV)
                                    <input
                                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm ltr text-left"
                                        value={testChatId}
                                        onChange={e => setTestChatId(e.target.value)}
                                        placeholder="مثلاً از getUpdates"
                                    />
                                </label>
                                <div className="text-sm block">
                                    chat_id گروه (اسلات ۱)
                                    <div className="mt-1 border rounded-md px-3 py-2 text-sm ltr text-left font-mono bg-slate-50">
                                        {groupChatId || '— توسط ادمین تنظیم نشده'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={seedDrivers}
                                    className="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm disabled:opacity-50"
                                >
                                    لینک ۱۰ راننده به chat تست
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={ping}
                                    className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
                                >
                                    ارسال پیام تست
                                </button>
                            </div>
                        </section>
                    )}

                    <section
                        className={`rounded-xl border p-4 space-y-3 ${
                            isTestMode
                                ? 'border-amber-200 bg-amber-50/20'
                                : 'border-sky-200 bg-sky-50/20'
                        }`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-slate-700">
                                    {isTestMode ? 'جلسه هر دسته (گروه مشترک تست)' : 'جلسه هر کانال عملیاتی'}
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">
                                    {isTestMode
                                        ? `هر دسته جلسه، مرحله و مهلت جدا دارد؛ اعلام در یک گروه (اسلات ۱ — ${groupChatId || 'تنظیم نشده'}).`
                                        : 'هر دسته جلسه، مرحله و مهلت جدا دارد و منتظر دسته دیگر نمی‌ماند.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    disabled={busy || !tabMatchesServer}
                                    onClick={startAllSessions}
                                    className="px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-700 text-sm disabled:opacity-50"
                                >
                                    شروع همه
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || activeSessions.length === 0}
                                    onClick={stopAllSessions}
                                    className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
                                >
                                    توقف همه
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {CATEGORY_SLOTS.map(({ slot, category, label, channelLabel }) => {
                            const catSession = sessionForCategory(category);
                            const isActive = Boolean(catSession);
                            const blockedReason = startBlockedReason(slot, category);
                            const queueCount = queueCountForCategory(category);
                            const channelPlan = channelPlanForCategory(category);
                            const settings = settingsFor(category);
                            const canOperateTurn = Boolean(
                                isActive &&
                                    catSession &&
                                    ['running', 'awaiting_confirm', 'awaiting_admin'].includes(
                                        catSession.status
                                    )
                            );
                            const q = parseJsonArray<QueueEntry>(catSession?.queueSnapshot);
                            const loads = parseJsonArray<SessionAnnouncement>(
                                catSession?.eligibleAnnouncements
                            );
                            const turn = catSession ? q[catSession.currentTurnIndex] : undefined;
                            const remain = formatRemain(catSession?.turnDeadlineAt, nowTs);
                            const remainExpired =
                                Boolean(catSession?.turnDeadlineAt) && remain === '۰:۰۰';
                            return (
                                <div
                                    key={slot}
                                    className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
                                >
                                    <div className="font-medium text-sm">{label}</div>
                                    <div className="text-xs text-slate-500">
                                        {isTestMode ? 'گروه تست (اسلات ۱)' : channelLabel}
                                    </div>
                                    <div className="text-xs text-slate-500 space-y-0.5">
                                        {!isTestMode && (
                                            <div className="font-mono ltr">
                                                chat:{' '}
                                                {channelPlan?.chatId ||
                                                    channelChatIds[slot] ||
                                                    '—'}
                                            </div>
                                        )}
                                        {queueCount != null && (
                                            <div>
                                                صف نوبت:{' '}
                                                {queueCount > 0 ? (
                                                    <span className="text-emerald-700">
                                                        {queueCount} راننده
                                                    </span>
                                                ) : (
                                                    <span className="text-red-600">خالی</span>
                                                )}
                                            </div>
                                        )}
                                        {blockedReason && (
                                            <div className="text-amber-700">{blockedReason}</div>
                                        )}
                                    </div>
                                    <label className="text-xs block">
                                        حالت تصمیم
                                        <select
                                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                            value={settings.mode}
                                            disabled={isActive}
                                            onChange={e =>
                                                patchCategorySettings(category, { mode: e.target.value })
                                            }
                                        >
                                            {MODES.map(m => (
                                                <option key={m.value} value={m.value}>
                                                    {m.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="text-xs block">
                                        مرحله شروع
                                        <select
                                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                            value={settings.stage}
                                            disabled={isActive}
                                            onChange={e =>
                                                patchCategorySettings(category, { stage: e.target.value })
                                            }
                                        >
                                            <option value="stage1">مرحله ۱ — خیلی‌دور</option>
                                            <option value="stage2">مرحله ۲</option>
                                        </select>
                                    </label>
                                    <label className="text-xs block">
                                        مهلت نوبت (ثانیه)
                                        <input
                                            type="number"
                                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                            value={settings.turnTimeoutSec}
                                            disabled={isActive}
                                            onChange={e =>
                                                patchCategorySettings(category, {
                                                    turnTimeoutSec: Number(e.target.value) || 180,
                                                })
                                            }
                                        />
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={busy || isActive || Boolean(blockedReason)}
                                            onClick={() => startCategorySession(category)}
                                            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
                                            title={blockedReason || undefined}
                                        >
                                            شروع
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !isActive}
                                            onClick={() => stopCategorySession(category)}
                                            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
                                        >
                                            توقف
                                        </button>
                                    </div>
                                    {isActive && catSession && (
                                        <div className="text-xs text-sky-800 bg-sky-50 rounded-md p-2 space-y-1">
                                            <div>
                                                وضعیت:{' '}
                                                <strong>
                                                    {STATUS_FA[catSession.status] || catSession.status}
                                                </strong>
                                            </div>
                                            <div>
                                                مرحله: {catSession.stageLabel || catSession.stage}
                                            </div>
                                            <div>
                                                نوبت الان:{' '}
                                                <strong>{queueDriverName(turn)}</strong>
                                                {q.length > 0 && (
                                                    <span className="text-slate-500">
                                                        {' '}
                                                        ({(catSession.currentTurnIndex || 0) + 1} از{' '}
                                                        {q.length})
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                زمان مانده:{' '}
                                                <strong className={remainExpired ? 'text-red-600' : ''}>
                                                    {catSession.status === 'awaiting_admin' && remainExpired
                                                        ? 'تمام شد'
                                                        : remain}
                                                </strong>
                                            </div>
                                            <div className="pt-1">
                                                <div className="font-medium text-sky-900">
                                                    بار اعلام‌شده ({loads.length})
                                                </div>
                                                {loads.length === 0 ? (
                                                    <div className="text-amber-700">لیست بار خالی است</div>
                                                ) : (
                                                    <ul className="mt-1 max-h-28 overflow-y-auto space-y-0.5 text-slate-700">
                                                        {loads.slice(0, 8).map((ann, i) => (
                                                            <li key={String(ann.id || i)}>
                                                                {announcementLine(ann, i)}
                                                            </li>
                                                        ))}
                                                        {loads.length > 8 && (
                                                            <li className="text-slate-500">
                                                                و {loads.length - 8} بار دیگر
                                                            </li>
                                                        )}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {canOperateTurn && catSession && (
                                        <div className="space-y-2 pt-1 border-t border-slate-100">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => resumeTurnForSession(catSession.id)}
                                                    className="px-2 py-1 rounded border border-sky-400 text-sky-800 text-xs hover:bg-sky-50 disabled:opacity-50"
                                                >
                                                    ادامه از همین‌جا
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => skipTurnForSession(catSession.id)}
                                                    className="px-2 py-1 rounded border border-amber-300 text-amber-800 text-xs hover:bg-amber-50 disabled:opacity-50"
                                                >
                                                    رد نوبت
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        assignOpenId === catSession.id
                                                            ? setAssignOpenId(null)
                                                            : openAssignPanel(catSession)
                                                    }
                                                    className="px-2 py-1 rounded border border-violet-300 text-violet-800 text-xs hover:bg-violet-50 disabled:opacity-50"
                                                >
                                                    تخصیص به راننده
                                                </button>
                                            </div>
                                            {catSession.status !== 'awaiting_admin' && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-xs text-slate-500">وقت اضافه:</span>
                                                    {EXTEND_MINUTE_OPTIONS.map(min => (
                                                        <button
                                                            key={min}
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                extendTurnForSession(catSession.id, min)
                                                            }
                                                            className="px-2 py-1 rounded border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-50"
                                                        >
                                                            +{min} دقیقه
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {assignOpenId === catSession.id && (
                                                <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2 space-y-2">
                                                    <label className="text-xs block">
                                                        راننده
                                                        <select
                                                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm bg-white"
                                                            value={assignDriverId}
                                                            onChange={e => setAssignDriverId(e.target.value)}
                                                        >
                                                            {q.map(e => (
                                                                <option
                                                                    key={queueDriverId(e) || e.id}
                                                                    value={queueDriverId(e)}
                                                                >
                                                                    {queueDriverName(e)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="text-xs block">
                                                        بار
                                                        <select
                                                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm bg-white"
                                                            value={assignAnnouncementId}
                                                            onChange={e =>
                                                                setAssignAnnouncementId(e.target.value)
                                                            }
                                                        >
                                                            {loads.map((ann, i) => (
                                                                <option key={String(ann.id)} value={String(ann.id)}>
                                                                    {announcementLine(ann, i)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            busy || !assignDriverId || !assignAnnouncementId
                                                        }
                                                        onClick={() => assignFromSession(catSession)}
                                                        className="w-full px-2 py-1.5 rounded-md bg-violet-700 text-white text-xs disabled:opacity-50"
                                                    >
                                                        ثبت تخصیص در همین جلسه
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    </section>

                </>
            )}

            {showRulesDialog && (
                <div
                    className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4"
                    onClick={() => setShowRulesDialog(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <span>📋</span>
                                <span>قوانین اعلام بار بله</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowRulesDialog(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                        <WorkflowRules
                            view={View.TransportBaleSession}
                            userRole={currentUser?.role || UserRole.TransportationUser}
                        />
                        <div className="text-xs text-slate-500 mt-4 space-y-1 border-t pt-3">
                            <p className="font-medium text-slate-600">ثبت chat راننده</p>
                            <p>
                                راننده به بازو: <code className="ltr bg-slate-100 px-1 rounded">/start کدپرسنلی</code>{' '}
                                — یا ثبت دستی در جدول بالا.
                            </p>
                            <p>
                                قالب پیام گروه در بله: <code className="ltr bg-slate-100 px-1 rounded">*متن*</code> برای
                                بولد (نه HTML).
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <p className="text-xs text-slate-400">کاربر: {currentUser.name || currentUser.username}</p>
        </div>
    );
};

export default BaleDispatchSession;
