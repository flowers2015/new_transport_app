import React, { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { User } from '../types';

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

type BaleStatus = {
    configured: boolean;
    bot: { username?: string; first_name?: string; error?: string } | null;
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
    const [testChatId, setTestChatId] = useState('');
    const [groupChatId, setGroupChatId] = useState('');
    const [channelChatIds, setChannelChatIds] = useState<Record<number, string>>({});
    const [webhookUrl, setWebhookUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [seedResult, setSeedResult] = useState<string | null>(null);
    const [selectedSessionId, setSelectedSessionId] = useState('');

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl('bale/status'), { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as BaleStatus;
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
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
        } finally {
            setLoading(false);
        }
    }, [token]);

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

    const saveGroupChannel = () =>
        runAction('ذخیره گروه', async () => {
            const res = await fetch(getApiUrl('bale/channels/1'), {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    chatId: groupChatId ? Number(groupChatId) : null,
                    label: 'گروه تست',
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
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setSeedResult(`${data.count} راننده با chat مشترک لینک شدند`);
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
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || (await res.text()));
            }
            const data = await res.json();
            const notes: string[] = [`${data.started} جلسه شروع شد`];
            if (data.pilotCombined) notes.push('(حالت پایلوت — فقط دسته‌های دارای صف)');
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

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
            <div>
                <h1 className="text-xl font-bold text-slate-800">جلسه اعلام بار (بله)</h1>
                <p className="text-sm text-slate-500 mt-1">
                    شروع همزمان سه دسته (تریلی، مینی تریلی، ده چرخ) — هر دسته در کانال جدا. در حالت
                    تست فقط اسلات ۱، هر سه دسته در یک گروه.
                </p>
            </div>

            <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 text-sm text-slate-700 space-y-2">
                <h2 className="font-semibold text-sky-900">چطور شروع کنم؟</h2>
                <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                    <li>
                        <strong>کانال‌ها:</strong> اسلات ۲–۴ را برای تولید پر کنید؛ یا فقط اسلات ۱ برای
                        تست (هر ۳ دسته همزمان در همان گروه).
                    </li>
                    <li>
                        <strong>شروع جلسه:</strong> سه جلسه موازی — هر کدام نوبت و بارهای همان دسته
                        خودرو.
                    </li>
                    <li>
                        <strong>در گروه:</strong> فقط نام راننده (بدون کد پرسنلی) — شماره بار مثل «۶.
                        بار …».
                    </li>
                </ol>
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
                            {status?.bot?.error && (
                                <div className="text-red-600">{status.bot.error}</div>
                            )}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <h2 className="font-semibold text-slate-700">تنظیمات تست (یک chat_id مشترک)</h2>
                        <p className="text-xs text-slate-500">
                            تا ۱۰ راننده واقعی — همه PV به یک chat_id. شناسایی با نوبت جاری هر جلسه است.
                        </p>
                        <div className="grid md:grid-cols-2 gap-3">
                            <label className="text-sm block">
                                chat_id خصوصی/تست (PV)
                                <input
                                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                                    value={testChatId}
                                    onChange={e => setTestChatId(e.target.value)}
                                    placeholder="مثلاً از /start یا getUpdates"
                                />
                            </label>
                            <label className="text-sm block">
                                chat_id گروه تست (اسلات ۱ — حالت پایلوت)
                                <input
                                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
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
                                لینک ۱۰ راننده صف به chat تست
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

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <h2 className="font-semibold text-slate-700">کانال‌های تولید (اسلات ۲–۴)</h2>
                        <p className="text-xs text-slate-500">
                            هر دسته خودرو کانال جدا — با «شروع جلسه» هر سه همزمان آغاز می‌شوند.
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

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                        <h2 className="font-semibold text-slate-700">جلسه نوبت</h2>
                        <div className="grid md:grid-cols-3 gap-3">
                            <label className="text-sm">
                                حالت
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
                                مرحله
                                <select
                                    className="mt-1 w-full border rounded-md px-2 py-2 text-sm"
                                    value={stage}
                                    onChange={e => setStage(e.target.value)}
                                >
                                    <option value="stage1">مرحله ۱ — دور</option>
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
                        <p className="text-xs text-slate-500">
                            دسته خودرو از صف نوبت خودکار است — تریلی، مینی تریلی و ده چرخ هر کدام جلسه
                            جدا.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={busy || activeSessions.length > 0}
                                onClick={startSession}
                                title={
                                    activeSessions.length > 0
                                        ? 'ابتدا جلسه‌های فعال را متوقف کنید'
                                        : undefined
                                }
                                className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
                            >
                                شروع جلسه (پایلوت / تولید)
                            </button>
                            {activeSessions.length > 0 && (
                                <span className="text-xs text-amber-700 self-center">
                                    {activeSessions.length} جلسه فعال — برای شروع مجدد اول «توقف همه»
                                    بزنید
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
                                رد نوبت / بعدی
                            </button>
                        </div>
                        <label className="text-sm block">
                            URL وب‌هوک (HTTPS عمومی)
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
                                            حالت: {s.modeLabel} — {s.stage}
                                        </div>
                                        <div>نوبت جاری: {turn?.driver?.name || '—'}</div>
                                        <div>
                                            انقضا:{' '}
                                            {s.turnDeadlineAt
                                                ? new Date(s.turnDeadlineAt).toLocaleString('fa-IR')
                                                : '—'}
                                        </div>
                                        {s.status === 'awaiting_admin' && (
                                            <p className="text-amber-700 font-medium mt-1">
                                                منتظر اپراتور
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    )}
                </>
            )}
            <p className="text-xs text-slate-400">کاربر: {currentUser.name || currentUser.username}</p>
        </div>
    );
};

export default BaleDispatchSession;
