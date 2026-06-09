import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiUrl } from '../utils/apiConfig';
import { User, UserRole } from '../types';

type MetabaseConfig = {
  configured: boolean;
  title: string;
  description: string;
  publicUrl: string;
  embedUrl: string;
  adminUrl: string | null;
  embedEnabled: boolean;
};

interface Props {
  currentUser: User;
}

const MetabaseReports: React.FC<Props> = ({ currentUser }) => {
  const [config, setConfig] = useState<MetabaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useEmbed, setUseEmbed] = useState(true);

  const isAdmin =
    currentUser.role === UserRole.Admin || (currentUser as { role?: string }).role === 'admin';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(getApiUrl('reports/metabase'), { skipAuthRedirect: true });
      if (!res.ok) throw new Error('خطا در دریافت تنظیمات گزارش');
      setConfig((await res.json()) as MetabaseConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const openUrl = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">در حال بارگذاری گزارش‌ها...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!config?.configured) {
    return (
      <div className="p-6 max-w-2xl" dir="rtl">
        <h2 className="text-lg font-semibold text-slate-800">{config?.title || 'گزارش‌ها'}</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          سرویس گزارش (Metabase) هنوز روی سرور پیکربندی نشده است.
          {isAdmin ? (
            <>
              {' '}
              راهنمای نصب در فایل <code className="bg-slate-100 px-1 rounded">METABASE_SETUP.md</code>{' '}
              داخل پروژه است.
            </>
          ) : (
            ' لطفاً با ادمین سیستم تماس بگیرید.'
          )}
        </p>
        {isAdmin && (
          <p className="mt-3 text-xs text-slate-500">
            بعد از نصب، در <code className="bg-slate-100 px-1 rounded">backend/.env</code> مقدار{' '}
            <code className="bg-slate-100 px-1 rounded">METABASE_PUBLIC_URL</code> را تنظیم کنید و
            بک‌اند را restart کنید.
          </p>
        )}
      </div>
    );
  }

  const showEmbed = useEmbed && config.embedEnabled && config.embedUrl;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] min-h-[480px]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{config.title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config.embedEnabled && config.embedUrl && (
            <button
              type="button"
              onClick={() => setUseEmbed(v => !v)}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
            >
              {useEmbed ? 'باز کردن در تب جدید' : 'نمایش داخل صفحه'}
            </button>
          )}
          <button
            type="button"
            onClick={() => openUrl(config.publicUrl || config.embedUrl)}
            className="px-3 py-1.5 text-xs rounded-md bg-sky-600 text-white hover:bg-sky-700"
          >
            باز کردن گزارش
          </button>
          {isAdmin && config.adminUrl && (
            <button
              type="button"
              onClick={() => openUrl(config.adminUrl!)}
              className="px-3 py-1.5 text-xs rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              پنل Metabase (ادمین)
            </button>
          )}
        </div>
      </header>

      {showEmbed ? (
        <iframe
          title={config.title}
          src={config.embedUrl}
          className="flex-1 w-full border-0 bg-slate-50"
          allow="fullscreen"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
          <div className="text-center max-w-md space-y-3">
            <p className="text-sm text-slate-600">
              برای مشاهده گزارش روی «باز کردن گزارش» کلیک کنید یا حالت «نمایش داخل صفحه» را فعال
              کنید.
            </p>
            <button
              type="button"
              onClick={() => openUrl(config.publicUrl || config.embedUrl)}
              className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm hover:bg-sky-700"
            >
              باز کردن گزارش
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetabaseReports;
