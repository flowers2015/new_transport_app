import React, { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { User, UserRole } from '../types';

type BaleChannel = {
    slot_number: number;
    chat_id: number | null;
    vehicle_category: string | null;
    label: string | null;
    is_active: boolean;
};

type RuntimeEnvironment = 'test' | 'production';

type BaleStatus = {
    configured: boolean;
    bot: { username?: string; first_name?: string; error?: string } | null;
    runtime?: { environment: RuntimeEnvironment };
    channels: BaleChannel[];
};

const SLOT_CONFIG = [
    { slot: 1, category: null, label: 'گروه پایلوت / تست (اسلات ۱)', hint: 'حالت تست — یک گروه مشترک برای هر سه دسته' },
    { slot: 2, category: 'تریلی', label: 'کانال تریلی (اسلات ۲)', hint: 'عملیاتی' },
    { slot: 3, category: 'مینی تریلی', label: 'کانال مینی تریلی (اسلات ۳)', hint: 'عملیاتی' },
    { slot: 4, category: 'ده چرخ', label: 'کانال ده چرخ (اسلات ۴)', hint: 'عملیاتی' },
];

const RUNTIME_OPTIONS: { value: RuntimeEnvironment; label: string; hint: string }[] = [
    { value: 'test', label: 'پایلوت / تست', hint: 'گروه مشترک + ابزار seed برای اپراتور' },
    { value: 'production', label: 'عملیاتی / واقعی', hint: '۳ کانال جدا + PV اختصاصی هر راننده' },
];

interface Props {
    currentUser: User;
}

const BaleAdminSettings: React.FC<Props> = ({ currentUser }) => {
    const token = localStorage.getItem('token') || '';
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const [status, setStatus] = useState<BaleStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [runtimeEnv, setRuntimeEnv] = useState<RuntimeEnvironment>('test');
    const [channelDrafts, setChannelDrafts] = useState<Record<number, string>>({});
    const [confirmClear, setConfirmClear] = useState<Record<number, boolean>>({});
    const [webhookUrl, setWebhookUrl] = useState('');

    const isAdmin =
        currentUser.role === UserRole.Admin || currentUser.role === 'admin';

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl('bale/status'), { headers });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as BaleStatus;
            setStatus(data);
            if (data.runtime?.environment) setRuntimeEnv(data.runtime.environment);
            const drafts: Record<number, string> = {};
            SLOT_CONFIG.forEach(({ slot }) => {
                const ch = data.channels?.find(c => c.slot_number === slot);
                drafts[slot] = ch?.chat_id != null ? String(ch.chat_id) : '';
            });
            setChannelDrafts(drafts);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const runAction = async (label: string, fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        setSuccess(null);
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
            setSuccess('حالت اجرا ذخیره شد');
        });

    const saveChannel = (slot: number, category: string | null) =>
        runAction(`اسلات ${slot}`, async () => {
            const raw = channelDrafts[slot]?.trim() ?? '';
            const body: Record<string, unknown> = {
                vehicleCategory: category,
                label: SLOT_CONFIG.find(s => s.slot === slot)?.label,
                isActive: Boolean(raw),
            };
            if (raw) {
                body.chatId = Number(raw);
            } else if (confirmClear[slot]) {
                body.chatId = null;
                body.confirmClear = true;
            } else if (!raw) {
                throw new Error('برای خالی کردن، گزینه «تأیید حذف chat_id» را بزنید');
            }
            const res = await fetch(getApiUrl(`bale/channels/${slot}`), {
                method: 'PUT',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || (await res.text()));
            }
            setSuccess(`اسلات ${slot} ذخیره شد`);
            setConfirmClear(prev => ({ ...prev, [slot]: false }));
        });

    const registerWebhook = () =>
        runAction('وب‌هوک', async () => {
            if (!webhookUrl.trim()) throw new Error('URL وب‌هوک را وارد کنید');
            const res = await fetch(getApiUrl('bale/webhook/register'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ url: webhookUrl.trim() }),
            });
            if (!res.ok) throw new Error(await res.text());
            setSuccess('وب‌هوک در بله ثبت شد');
        });

    if (!isAdmin) {
        return (
            <div className="p-6 text-center text-red-600" dir="rtl">
                فقط ادمین به این صفحه دسترسی دارد.
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
            <div>
                <h1 className="text-xl font-bold text-slate-800">تنظیمات بله (ادمین)</h1>
                <p className="text-sm text-slate-500 mt-1">
                    شناسه کانال‌ها و حالت اجرا — اپراتور فقط جلسه را مدیریت می‌کند
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">
                    {success}
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
                                توکن:{' '}
                                {status?.configured ? (
                                    <span className="text-emerald-600">تنظیم شده در .env</span>
                                ) : (
                                    <span className="text-amber-600">BALE_BOT_TOKEN لازم است</span>
                                )}
                            </div>
                            {status?.bot && !status.bot.error && (
                                <div>بازو: @{status.bot.username || status.bot.first_name}</div>
                            )}
                        </div>
                    </section>

                    <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                        <h2 className="font-semibold text-violet-900">حالت اجرا</h2>
                        <div className="flex flex-col sm:flex-row gap-4">
                            {RUNTIME_OPTIONS.map(opt => (
                                <label
                                    key={opt.value}
                                    className={`flex items-start gap-2 flex-1 rounded-lg border p-3 cursor-pointer transition ${
                                        runtimeEnv === opt.value
                                            ? 'border-violet-500 bg-white ring-1 ring-violet-300'
                                            : 'border-slate-200 bg-white/70'
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
                                        <span className="font-medium block">{opt.label}</span>
                                        <span className="text-xs text-slate-500">{opt.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-4">
                        <h2 className="font-semibold text-amber-900">شناسه کانال‌های بله (chat_id)</h2>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            chat_id گروه را از getUpdates یا لاگ سرور بگیرید. برای پاک کردن، ابتدا
                            «تأیید حذف» را بزنید تا اشتباهی پاک نشود.
                        </p>
                        {SLOT_CONFIG.map(({ slot, category, label, hint }) => {
                            const saved = status?.channels?.find(c => c.slot_number === slot);
                            return (
                                <div
                                    key={slot}
                                    className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
                                >
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <span className="text-sm font-medium">{label}</span>
                                        <span className="text-xs text-slate-500">{hint}</span>
                                    </div>
                                    {saved?.chat_id != null && (
                                        <div className="text-xs text-emerald-700 font-mono ltr text-left">
                                            ذخیره‌شده: {saved.chat_id}
                                        </div>
                                    )}
                                    <input
                                        className="w-full border rounded-md px-3 py-2 text-sm ltr text-left font-mono"
                                        value={channelDrafts[slot] ?? ''}
                                        onChange={e =>
                                            setChannelDrafts(prev => ({
                                                ...prev,
                                                [slot]: e.target.value,
                                            }))
                                        }
                                        placeholder="chat_id گروه بله"
                                    />
                                    <label className="flex items-center gap-2 text-xs text-red-700">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(confirmClear[slot])}
                                            onChange={e =>
                                                setConfirmClear(prev => ({
                                                    ...prev,
                                                    [slot]: e.target.checked,
                                                }))
                                            }
                                        />
                                        تأیید حذف chat_id (فقط وقتی فیلد خالی است)
                                    </label>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => saveChannel(slot, category)}
                                        className="px-3 py-1.5 rounded-md bg-slate-700 text-white text-sm disabled:opacity-50"
                                    >
                                        ذخیره اسلات {slot}
                                    </button>
                                </div>
                            );
                        })}
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <h2 className="font-semibold text-slate-700">وب‌هوک</h2>
                        <p className="text-xs text-slate-500">
                            اگر BALE_ENABLE_POLLING=true است، polling و webhook همزمان تداخل دارند —
                            یکی را انتخاب کنید.
                        </p>
                        <input
                            className="w-full border rounded-md px-3 py-2 text-sm ltr text-left"
                            value={webhookUrl}
                            onChange={e => setWebhookUrl(e.target.value)}
                            placeholder="https://your-server/api/v1/bale/webhook"
                        />
                        <button
                            type="button"
                            disabled={busy}
                            onClick={registerWebhook}
                            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
                        >
                            ثبت وب‌هوک در بله
                        </button>
                    </section>
                </>
            )}

            <p className="text-xs text-slate-400">ادمین: {currentUser.name || currentUser.username}</p>
        </div>
    );
};

export default BaleAdminSettings;
