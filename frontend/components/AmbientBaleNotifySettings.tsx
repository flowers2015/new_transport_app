import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiUrl, isAuthFailureStatus } from '../utils/apiConfig';
import { User } from '../types';

type AmbientNotifySettings = {
  enabled: boolean;
  chatId: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
  botConfigured?: boolean;
};

async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message || res.statusText || 'خطا در ارتباط با سرور';
}

interface Props {
  currentUser: User;
}

const AmbientBaleNotifySettings: React.FC<Props> = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<AmbientNotifySettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [chatIdInput, setChatIdInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(getApiUrl('bale/settings/ambient-notify'));
      if (isAuthFailureStatus(res.status)) return;
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as AmbientNotifySettings;
      setSettings(data);
      setEnabled(data.enabled);
      setChatIdInput(data.chatId != null ? String(data.chatId) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری تنظیمات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    const trimmed = chatIdInput.trim();
    const parsedChatId = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && !Number.isFinite(parsedChatId)) {
      setError('شناسه گروه (chat_id) باید عدد باشد.');
      setSaving(false);
      return;
    }
    try {
      const res = await apiFetch(getApiUrl('bale/settings/ambient-notify'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          chatId: parsedChatId,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as AmbientNotifySettings;
      setSettings(data);
      setMessage('تنظیمات ذخیره شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch(getApiUrl('bale/settings/ambient-notify/test'), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as { message?: string };
      setMessage(data.message || 'پیام تست ارسال شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال تست');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-600" dir="rtl">
        در حال بارگذاری تنظیمات...
      </div>
    );
  }

  const botOk = settings?.botConfigured === true;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">اعلان بله — لبنیات فروتلند</h1>
        <p className="text-sm text-slate-600 mt-2">
          پس از تخصیص یا لغو تخصیص در خط لبنیات-فروتلند، پیام جدید در گروه بله ارسال می‌شود.
          ارجاع به باربری (قبل از راننده) پیام ندارد.
        </p>
      </div>

      <div
        className={`rounded-lg border p-4 text-sm ${
          botOk ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {botOk
          ? 'ربات بله روی سرور پیکربندی شده است (BALE_BOT_TOKEN).'
          : 'توکن ربات بله روی سرور تنظیم نشده — تا زمان تنظیم BALE_BOT_TOKEN هیچ پیامی ارسال نمی‌شود.'}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-5 h-5 rounded border-slate-300"
          />
          <span className="font-medium text-slate-800">فعال‌سازی اعلان خودکار در گروه</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            شناسه گروه (chat_id)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={chatIdInput}
            onChange={(e) => setChatIdInput(e.target.value)}
            placeholder="مثلاً -1001234567890"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-left font-mono"
            dir="ltr"
          />
          <p className="text-xs text-slate-500 mt-2">
            همان chat_id گروه فروتلند — با فوروارد پیام به بازو یا از تنظیمات گروه در بله به‌دست می‌آید.
            ربات باید عضو گروه باشد.
          </p>
        </div>

        {settings?.updatedBy && (
          <p className="text-xs text-slate-500">
            آخرین ویرایش: {settings.updatedBy}
            {settings.updatedAt ? ` — ${new Date(settings.updatedAt).toLocaleString('fa-IR')}` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !enabled || !chatIdInput.trim()}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? 'در حال ارسال...' : 'ارسال پیام تست'}
          </button>
        </div>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
        <p className="font-medium text-slate-800">قالب پیام‌ها</p>
        <ul className="list-disc list-inside space-y-1">
          <li>ترابری شخصی: خودرو، مقصد، برند، مبدا بارگیری، ارزش بار، کرایه، نام باربری</li>
          <li>تخصیص باربری: همان موارد + راننده، تماس، بارنامه، پلاک</li>
          <li>لغو تخصیص: پیام جدید با برچسب لغو</li>
          <li>ویرایش تخصیص: بدون پیام</li>
        </ul>
      </div>

      <p className="text-xs text-slate-400">کاربر: {currentUser.username}</p>
    </div>
  );
};

export default AmbientBaleNotifySettings;
