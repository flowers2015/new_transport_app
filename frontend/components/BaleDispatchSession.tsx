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

type BaleSession = {
    id: string;
    status: string;
    mode: string;
    modeLabel: string;
    stage: string;
    vehicleCategory: string | null;
    currentTurnIndex: number;
    turnTimeoutSec: number;
    turnDeadlineAt: string | null;
    queueSnapshot: unknown[];
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
};

const MODES = [
    { value: 'manual', label: 'دستی' },
    { value: 'hybrid', label: 'هیبرید' },
    { value: 'semi_auto', label: 'نیمه‌خودکار' },
    { value: 'auto', label: 'خودکار' },
];

const CATEGORY_SLOTS = [
    { slot: 2, category: 'تریلی', label: 'تریلی', channelLabel: 'کانال تریلی (اسلات ۲)' },
    { slot: 3, category: 'مینی تریلی', label: 'مینی تریلی', channelLabel: 'کانال مینی تریلی (اسلات ۳)' },
    { slot: 4, category: 'ده چرخ', label: 'ده چرخ', channelLabel: 'کانال ده چرخ (اسلات ۴)' },
];

const EXTEND_MINUTE_OPTIONS = [2, 4, 6] as const;

const RUNTIME_OPTIONS: { value: RuntimeEnvironment; label: string; hint: string }[] = [
    {
        value: 'test',
        label: 'پایلوت / تست',
        hint: 'یک گروه مشترک، chat مشترک رانندگان، ابزار seed',
    },
    {
        value: 'production',
        label: 'عملیاتی / واقعی',
        hint: 'هر راننده chat اختصاصی — کانال جدا برای هر دسته',
    },
];

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
    const [mode, setMode] = useState('hybrid');
    const [stage, setStage] = useState('stage1');
    const [turnTimeoutSec, setTurnTimeoutSec] = useState(180);
    const [runtimeEnv, setRuntimeEnv] = useState<RuntimeEnvironment>('test');
    const [testChatId, setTestChatId] = useState('');
    const [groupChatId, setGroupChatId] = useState('');
    const [channelChatIds, setChannelChatIds] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const [seedResult, setSeedResult] = useState<string | null>(null);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [showRulesDialog, setShowRulesDialog] = useState(false);
    const [drivers, setDrivers] = useState<DriverOutreach[]>([]);
    const [driverFilter, setDriverFilter] = useState('');
    const [editingChat, setEditingChat] = useState<Record<string, string>>({});
    const [savingDriverId, setSavingDriverId] = useState<string | null>(null);

    const isTestMode = runtimeEnv === 'test';

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

    const loadStatus = useCallback(async () => {
        if (authExpired) return;
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(getApiUrl('bale/status'), { skipAuthRedirect: true });
            if (isAuthFailureStatus(res.status)) {
                setAuthExpired(true);
                setError(
                    'نشست شما منقضی شده. جلسه بله ممکن است روی سرور ادامه داشته باشد — از منو خارج شوید و دوباره وارد شوید.'
                );
                return;
            }
            if (!res.ok) throw new Error(await readApiError(res));
            const data = (await res.json()) as BaleStatus;
            setStatus(data);
            if (data.runtime?.environment) setRuntimeEnv(data.runtime.environment);
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
            await loadDrivers();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
        } finally {
            setLoading(false);
        }
    }, [authExpired, loadDrivers]);

    useEffect(() => {
        if (authExpired) return;
        loadStatus();
        const t = setInterval(loadStatus, 10000);
        return () => clearInterval(t);
    }, [loadStatus, authExpired]);

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

    const startCategorySession = (vehicleCategory: string) =>
        runAction(`شروع ${vehicleCategory}`, async () => {
            const res = await apiFetch(getApiUrl('bale/sessions/start'), {
                method: 'POST',
                body: JSON.stringify({
                    mode,
                    stage,
                    turnTimeoutSec,
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
            const res = await apiFetch(getApiUrl('bale/sessions/start'), {
                method: 'POST',
                body: JSON.stringify({
                    mode,
                    stage,
                    turnTimeoutSec,
                    forceRestart: false,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            const data = await res.json();
            const notes: string[] = [`${data.started} جلسه شروع شد`];
            if (data.pilotCombined) notes.push('(گروه مشترک — اسلات ۱)');
            if (data.skipped?.length) {
                notes.push(
                    `رد شده: ${data.skipped.map((e: { category: string }) => e.category).join('، ')}`
                );
            }
            if (data.errors?.length) {
                notes.push(
                    `خطا: ${data.errors.map((e: { category: string; message: string }) => `${e.category}: ${e.message}`).join(' | ')}`
                );
            }
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

    const session =
        activeSessions.find(s => s.id === selectedSessionId) || activeSessions[0] || null;
    const queue = Array.isArray(session?.queueSnapshot) ? session.queueSnapshot : [];
    const currentTurn = session ? queue[session.currentTurnIndex] : null;

    const filteredDrivers = drivers.filter(d => {
        const q = driverFilter.trim().toLowerCase();
        if (!q) return true;
        return (
            d.driver_name?.toLowerCase().includes(q) ||
            d.employee_id?.includes(q) ||
            String(d.outreach_chat_id || '').includes(q)
        );
    });

    const linkedCount = drivers.filter(d => d.outreach_chat_id != null).length;
    const testLinkedCount = drivers.filter(d => d.is_test_simulation).length;

    const sessionForCategory = (category: string) =>
        activeSessions.find(s => s.vehicleCategory === category);

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">جلسه اعلام بار (بله)</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        مدیریت نوبت، کانال‌ها و لینک رانندگان شرکتی
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

            <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-2">
                <h2 className="font-semibold text-violet-900">حالت اجرا</h2>
                <div className="text-sm">
                    {RUNTIME_OPTIONS.find(o => o.value === runtimeEnv)?.label || runtimeEnv}
                    <span className="text-xs text-slate-500 mr-2">
                        — {RUNTIME_OPTIONS.find(o => o.value === runtimeEnv)?.hint}
                    </span>
                </div>
                <p className="text-xs text-slate-500">
                    تغییر حالت و شناسه کانال‌ها فقط از پنل ادمین (تنظیمات بله) انجام می‌شود.
                </p>
            </section>

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
                                لینک رانندگان: {linkedCount} از {drivers.length}
                                {testLinkedCount > 0 && (
                                    <span className="text-amber-600 mr-2">
                                        ({testLinkedCount} حالت تست)
                                    </span>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="font-semibold text-slate-700">رانندگان شرکتی — chat بله</h2>
                            <input
                                className="border rounded-md px-3 py-1.5 text-sm w-48"
                                placeholder="جستجو نام / کد / chat"
                                value={driverFilter}
                                onChange={e => setDriverFilter(e.target.value)}
                            />
                        </div>
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
                                    {filteredDrivers.map(d => (
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {isTestMode && (
                        <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-4">
                            <h2 className="font-semibold text-amber-900">
                                ابزار تست (فقط حالت پایلوت)
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
                        className={`rounded-xl border p-4 space-y-4 ${
                            isTestMode
                                ? 'border-amber-200 bg-amber-50/20'
                                : 'border-sky-200 bg-sky-50/20'
                        }`}
                    >
                        <h2 className="font-semibold text-slate-700">
                            {isTestMode ? 'جلسه هر دسته (گروه مشترک تست)' : 'جلسه هر کانال عملیاتی'}
                        </h2>
                        <p className="text-xs text-slate-500">
                            {isTestMode
                                ? `هر دسته جلسه جدا دارد ولی همه در یک گروه (اسلات ۱ — chat: ${groupChatId || 'تنظیم نشده'}) اعلام می‌شوند.`
                                : 'هر دسته خودرو کانال و جلسه مستقل دارد.'}
                        </p>
                        {CATEGORY_SLOTS.map(({ slot, category, label, channelLabel }) => {
                            const catSession = sessionForCategory(category);
                            const isActive = Boolean(catSession);
                            const canOperateTurn =
                                isActive &&
                                catSession &&
                                ['running', 'awaiting_confirm'].includes(catSession.status);
                            const q = Array.isArray(catSession?.queueSnapshot)
                                ? catSession.queueSnapshot
                                : [];
                            const turn = catSession
                                ? (q[catSession.currentTurnIndex] as { driver?: { name?: string } } | undefined)
                                : undefined;
                            return (
                                <div
                                    key={slot}
                                    className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="flex-1 min-w-[180px]">
                                            <div className="font-medium text-sm">{label}</div>
                                            <div className="text-xs text-slate-500">
                                                {isTestMode
                                                    ? 'گروه تست (اسلات ۱)'
                                                    : channelLabel}
                                            </div>
                                            {!isTestMode && (
                                                <div className="text-xs font-mono ltr text-slate-500 mt-0.5">
                                                    chat: {channelChatIds[slot] || '—'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={busy || isActive}
                                                onClick={() => startCategorySession(category)}
                                                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
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
                                    </div>
                                    {isActive && catSession && (
                                        <div className="text-xs text-sky-800 bg-sky-50 rounded-md p-2 space-y-1">
                                            <div>
                                                وضعیت: <strong>{catSession.status}</strong>
                                                {catSession.status === 'awaiting_admin' && (
                                                    <span className="text-amber-600 mr-1">
                                                        — منتظر اپراتور در تابلو
                                                    </span>
                                                )}
                                            </div>
                                            <div>نوبت: {turn?.driver?.name || '—'}</div>
                                            <div>
                                                انقضا:{' '}
                                                {catSession.turnDeadlineAt
                                                    ? new Date(catSession.turnDeadlineAt).toLocaleString('fa-IR')
                                                    : '—'}
                                            </div>
                                        </div>
                                    )}
                                    {canOperateTurn && catSession && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
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
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => skipTurnForSession(catSession.id)}
                                                className="px-2 py-1 rounded border border-amber-300 text-amber-800 text-xs hover:bg-amber-50 disabled:opacity-50"
                                            >
                                                رد نوبت
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <h2 className="font-semibold text-slate-700">جلسه نوبت</h2>
                        <div className="grid md:grid-cols-3 gap-3">
                            <label className="text-sm">
                                حالت تصمیم
                                <select
                                    className="mt-1 w-full border rounded-md px-2 py-2 text-sm"
                                    value={mode}
                                    onChange={e => setMode(e.target.value)}
                                >
                                    {MODES.map(m => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm">
                                مرحله شروع
                                <select
                                    className="mt-1 w-full border rounded-md px-2 py-2 text-sm"
                                    value={stage}
                                    onChange={e => setStage(e.target.value)}
                                >
                                    <option value="stage1">مرحله ۱ — خیلی‌دور (نوبت دور)</option>
                                    <option value="stage2">مرحله ۲</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                مهلت نوبت (ثانیه)
                                <input
                                    type="number"
                                    className="mt-1 w-full border rounded-md px-2 py-2 text-sm"
                                    value={turnTimeoutSec}
                                    onChange={e => setTurnTimeoutSec(Number(e.target.value) || 180)}
                                />
                            </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={startAllSessions}
                                className="px-4 py-2 rounded-md border border-emerald-600 text-emerald-700 text-sm disabled:opacity-50"
                            >
                                شروع همه کانال‌ها
                            </button>
                            {activeSessions.length > 0 && (
                                <span className="text-xs text-amber-700 self-center">
                                    {activeSessions.length} جلسه فعال — برای توقف یک کانال از دکمه
                                    بالا استفاده کنید
                                </span>
                            )}
                            <button
                                type="button"
                                disabled={busy || activeSessions.length === 0}
                                onClick={stopAllSessions}
                                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
                            >
                                توقف همه
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            تمدید نوبت و رد نوبت برای هر دسته در کارت همان دسته (بالا) است.
                        </p>
                    </section>

                    {activeSessions.length > 0 && (
                        <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3 text-sm">
                            <h2 className="font-semibold text-sky-900">
                                جلسات فعال ({activeSessions.length})
                            </h2>
                            {activeSessions.map(s => {
                                const q = Array.isArray(s.queueSnapshot) ? s.queueSnapshot : [];
                                const turn = q[s.currentTurnIndex] as
                                    | { driver?: { name?: string } }
                                    | undefined;
                                return (
                                    <div
                                        key={s.id}
                                        className={`rounded-lg border p-3 ${s.id === session?.id ? 'border-sky-400 bg-white' : 'border-slate-200 bg-white/60'}`}
                                    >
                                        <div className="font-medium text-sky-900">
                                            {s.vehicleCategory || '—'}
                                        </div>
                                        <div>وضعیت: {s.status}</div>
                                        <div>
                                            حالت: {s.modeLabel} —{' '}
                                            {(s as { stageLabel?: string }).stageLabel || s.stage}
                                        </div>
                                        <div>نوبت جاری: {turn?.driver?.name || '—'}</div>
                                        <div>
                                            انقضا:{' '}
                                            {s.turnDeadlineAt
                                                ? new Date(s.turnDeadlineAt).toLocaleString('fa-IR')
                                                : '—'}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    )}
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
