import React, { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
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
    { slot: 2, category: 'تریلی', label: 'کانال تریلی (اسلات ۲)' },
    { slot: 3, category: 'مینی تریلی', label: 'کانال مینی تریلی (اسلات ۳)' },
    { slot: 4, category: 'ده چرخ', label: 'کانال ده چرخ (اسلات ۴)' },
];

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

const BaleDispatchSession: React.FC<Props> = ({ currentUser }) => {
    const token = localStorage.getItem('token') || '';
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const [status, setStatus] = useState<BaleStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState('hybrid');
    const [stage, setStage] = useState('stage1');
    const [turnTimeoutSec, setTurnTimeoutSec] = useState(180);
    const [runtimeEnv, setRuntimeEnv] = useState<RuntimeEnvironment>('test');
    const [testChatId, setTestChatId] = useState('');
    const [groupChatId, setGroupChatId] = useState('');
    const [channelChatIds, setChannelChatIds] = useState<Record<number, string>>({});
    const [webhookUrl, setWebhookUrl] = useState('');
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
        const res = await fetch(getApiUrl('bale/drivers/outreach'), { headers });
        if (!res.ok) throw new Error('خطا در بارگذاری رانندگان');
        const data = (await res.json()) as DriverOutreach[];
        setDrivers(data);
        const draft: Record<string, string> = {};
        data.forEach(d => {
            draft[d.driver_id] =
                d.outreach_chat_id != null ? String(d.outreach_chat_id) : '';
        });
        setEditingChat(draft);
    }, [token]);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl('bale/status'), { headers });
            if (!res.ok) throw new Error(await res.text());
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
    }, [token, loadDrivers]);

    useEffect(() => {
        loadStatus();
        const t = setInterval(loadStatus, 10000);
        return () => clearInterval(t);
    }, [loadStatus]);

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

    const saveRuntime = (env: RuntimeEnvironment) =>
        runAction('حالت اجرا', async () => {
            const res = await fetch(getApiUrl('bale/settings/runtime'), {
                method: 'PUT',
                headers,
                body: JSON.stringify({ environment: env }),
            });
            if (!res.ok) throw new Error(await res.text());
            setRuntimeEnv(env);
        });

    const saveGroupChannel = () =>
        runAction('ذخیره گروه', async () => {
            const res = await fetch(getApiUrl('bale/channels/1'), {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    chatId: groupChatId ? Number(groupChatId) : null,
                    label: isTestMode ? 'گروه تست' : 'گروه پایلوت',
                    isActive: true,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const saveCategoryChannel = (slot: number, category: string) =>
        runAction(`ذخیره اسلات ${slot}`, async () => {
            const chatId = channelChatIds[slot];
            const res = await fetch(getApiUrl(`bale/channels/${slot}`), {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    chatId: chatId ? Number(chatId) : null,
                    vehicleCategory: category,
                    label: CATEGORY_SLOTS.find(c => c.slot === slot)?.label,
                    isActive: Boolean(chatId),
                }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const seedDrivers = () =>
        runAction('seed', async () => {
            if (!testChatId.trim()) throw new Error('chat_id تست را وارد کنید');
            const res = await fetch(getApiUrl('bale/test/seed-drivers'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ outreachChatId: Number(testChatId), limit: 10 }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || (await res.text()));
            }
            const data = await res.json();
            setSeedResult(`${data.count} راننده با chat مشترک لینک شدند`);
        });

    const saveDriverOutreach = (driver: DriverOutreach) =>
        runAction('ذخیره chat راننده', async () => {
            const chatRaw = editingChat[driver.driver_id]?.trim();
            if (!chatRaw) throw new Error('chat_id را وارد کنید');
            setSavingDriverId(driver.driver_id);
            try {
                const res = await fetch(getApiUrl(`bale/drivers/${driver.driver_id}/outreach`), {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        outreachChatId: Number(chatRaw),
                        employeeId: driver.employee_id,
                        isTestSimulation: isTestMode,
                        notes: isTestMode ? 'ثبت دستی — تست' : 'ثبت دستی — عملیاتی',
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || (await res.text()));
                }
            } finally {
                setSavingDriverId(null);
            }
        });

    const ping = () =>
        runAction('ping', async () => {
            const chat = testChatId || groupChatId;
            if (!chat) throw new Error('chat_id وارد کنید');
            const res = await fetch(getApiUrl('bale/test/ping'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ chatId: Number(chat) }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const registerWebhook = () =>
        runAction('webhook', async () => {
            if (!webhookUrl.trim()) throw new Error('URL وب‌هوک را وارد کنید');
            const res = await fetch(getApiUrl('bale/webhook/register'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ url: webhookUrl.trim() }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const startSession = () =>
        runAction('شروع جلسه', async () => {
            const res = await fetch(getApiUrl('bale/sessions/start'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    mode,
                    stage,
                    turnTimeoutSec,
                    forceRestart: true,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || (await res.text()));
            }
            const data = await res.json();
            const notes: string[] = [`${data.started} جلسه شروع شد`];
            if (data.stoppedPrior > 0) {
                notes.push(`(${data.stoppedPrior} جلسه قبلی متوقف شد)`);
            }
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
            if (notes.length > 1) setSeedResult(notes.join(' — '));
        });

    const stopSession = () =>
        runAction('توقف', async () => {
            const res = await fetch(getApiUrl('bale/sessions/stop'), { method: 'POST', headers });
            if (!res.ok) throw new Error(await res.text());
        });

    const skipTurn = () =>
        runAction('رد نوبت', async () => {
            if (!selectedSessionId) throw new Error('جلسه‌ای انتخاب نشده');
            const res = await fetch(getApiUrl('bale/sessions/skip-turn'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ sessionId: selectedSessionId }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const extendTurn = () =>
        runAction('تمدید', async () => {
            if (!selectedSessionId) throw new Error('جلسه‌ای انتخاب نشده');
            const res = await fetch(getApiUrl('bale/sessions/extend-turn'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ sessionId: selectedSessionId, extraSec: 120 }),
            });
            if (!res.ok) throw new Error(await res.text());
        });

    const activeSessions =
        status?.activeSessions?.length
            ? status.activeSessions
            : status?.activeSession
              ? [status.activeSession]
              : [];

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

            <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                <h2 className="font-semibold text-violet-900">حالت اجرا</h2>
                <div className="flex flex-col sm:flex-row gap-4">
                    {RUNTIME_OPTIONS.map(opt => (
                        <label
                            key={opt.value}
                            className={`flex items-start gap-2 flex-1 rounded-lg border p-3 cursor-pointer transition ${
                                runtimeEnv === opt.value
                                    ? 'border-violet-500 bg-white ring-1 ring-violet-300'
                                    : 'border-slate-200 bg-white/70 hover:border-violet-200'
                            }`}
                        >
                            <input
                                type="radio"
                                name="runtimeEnv"
                                className="mt-1"
                                checked={runtimeEnv === opt.value}
                                disabled={busy}
                                onChange={() => saveRuntime(opt.value)}
                            />
                            <span>
                                <span className="font-medium text-slate-800 block">{opt.label}</span>
                                <span className="text-xs text-slate-500">{opt.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            {error && (
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
                                <label className="text-sm block">
                                    chat_id گروه (اسلات ۱)
                                    <input
                                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm ltr text-left"
                                        value={groupChatId}
                                        onChange={e => setGroupChatId(e.target.value)}
                                    />
                                </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={saveGroupChannel}
                                    className="px-3 py-1.5 rounded-md bg-slate-700 text-white text-sm disabled:opacity-50"
                                >
                                    ذخیره گروه تست
                                </button>
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

                    {!isTestMode && (
                        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                            <h2 className="font-semibold text-slate-700">کانال‌های عملیاتی (اسلات ۲–۴)</h2>
                            <p className="text-xs text-slate-500">
                                هر دسته خودرو گروه جدا — با شروع جلسه هر سه همزمان آغاز می‌شوند.
                            </p>
                            {CATEGORY_SLOTS.map(({ slot, category, label }) => (
                                <div key={slot} className="flex flex-wrap items-end gap-2">
                                    <label className="text-sm flex-1 min-w-[200px]">
                                        {label}
                                        <input
                                            className="mt-1 w-full border rounded-md px-3 py-2 text-sm ltr text-left"
                                            value={channelChatIds[slot] || ''}
                                            onChange={e =>
                                                setChannelChatIds(prev => ({
                                                    ...prev,
                                                    [slot]: e.target.value,
                                                }))
                                            }
                                            placeholder="chat_id گروه بله"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => saveCategoryChannel(slot, category)}
                                        className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
                                    >
                                        ذخیره
                                    </button>
                                </div>
                            ))}
                        </section>
                    )}

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
                                onClick={startSession}
                                className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
                            >
                                شروع جلسه
                            </button>
                            {activeSessions.length > 0 && (
                                <span className="text-xs text-amber-700 self-center">
                                    {activeSessions.length} جلسه فعال — با شروع، قبلی‌ها متوقف می‌شوند
                                </span>
                            )}
                            <button
                                type="button"
                                disabled={busy || activeSessions.length === 0}
                                onClick={stopSession}
                                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
                            >
                                توقف همه
                            </button>
                            {activeSessions.length > 1 && (
                                <select
                                    className="border rounded-md px-2 py-2 text-sm"
                                    value={selectedSessionId}
                                    onChange={e => setSelectedSessionId(e.target.value)}
                                >
                                    {activeSessions.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.vehicleCategory || '—'} — {s.status}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                disabled={busy || !session}
                                onClick={extendTurn}
                                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
                            >
                                +۲ دقیقه
                            </button>
                            <button
                                type="button"
                                disabled={busy || !session}
                                onClick={skipTurn}
                                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
                            >
                                رد نوبت
                            </button>
                        </div>
                        <label className="text-sm block">
                            URL وب‌هوک (HTTPS)
                            <input
                                className="mt-1 w-full border rounded-md px-3 py-2 text-sm ltr text-left"
                                value={webhookUrl}
                                onChange={e => setWebhookUrl(e.target.value)}
                                placeholder="https://your-server/api/v1/bale/webhook"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={registerWebhook}
                            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
                        >
                            ثبت وب‌هوک در بله
                        </button>
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
