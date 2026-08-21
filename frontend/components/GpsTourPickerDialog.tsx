import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalaliDateTime } from '../utils/jalali';

export type GpsMileageSource = 'approved' | 'can' | 'gps' | 'track';

export interface GpsTourCandidate {
  index: number;
  tourId?: string;
  tourKey?: string;
  startHub: string;
  endHub: string;
  startTime: string;
  endTime: string;
  startDisplay?: { jalali?: string | null; time?: string | null };
  endDisplay?: { jalali?: string | null; time?: string | null };
  unloadStations: string;
  unloadCount: number;
  mileageCan: number | null;
  mileageGps: number | null;
  mileageGpsTrack?: number | null;
  diffCanMinusGps: number | null;
  mileageGo: number | null;
  mileageBack: number | null;
  hoursTotal: number | null;
  drivingHours: number | null;
  stopHours: number | null;
  overspeedCount: number;
  maxSpeed: number;
  blocked?: boolean;
  overlap?: boolean;
  zoneEvents?: unknown[];
  zoneMarkers?: unknown[];
  overspeedDetails?: unknown[];
  unloadDetails?: unknown[];
  fuelStartTotal?: number | null;
  fuelEndTotal?: number | null;
  fuelUsedTotal?: number | null;
  tankLevelStart?: number | null;
  tankLevelEnd?: number | null;
  engineTempStart?: number | null;
  engineTempEnd?: number | null;
  airTempStart?: number | null;
  airTempEnd?: number | null;
  overspeedCountEvents?: number;
  stoppedCountEvents?: number;
  rawFlags?: Record<string, unknown>;
  detailStatus?: 'none' | 'ready' | 'loading';
  detailSummary?: {
    drivingHours?: number | null;
    drivingPercent?: number | null;
    totalDurationHours?: number | null;
    stopTotalHours?: number | null;
    stopUnloadHours?: number | null;
    stopLegalHours?: number | null;
    stopEnRouteHours?: number | null;
    stopInsideHours?: number | null;
    stopOutsideHours?: number | null;
    overspeedRuleCount?: number | null;
    maxSpeed?: number | null;
    fuelLPer100Km?: number | null;
    mileageGpsTrack?: number | null;
    computedAt?: string | null;
    samplePoints?: Array<{ time: string; lat: number; lng: number; speed: number }>;
    unloadStops?: Array<{
      zone: string;
      fromJalali?: string | null;
      toJalali?: string | null;
      hours: number;
      legalHours?: number;
    }> | null;
    legalIntervals?: Array<{
      startJalali?: string | null;
      endJalali?: string | null;
      hours: number;
      insideZone?: string | null;
    }> | null;
  } | null;
}

interface GpsDebugInfo {
  rawEventCount?: number;
  zoneEventCount?: number;
  tourCount?: number;
  baseOutCount?: number;
  baseInCount?: number;
  hubOutCount?: number;
  hubInCount?: number;
  nonBaseInCount?: number;
  uniqueZones?: string[];
  hubLikeZones?: string[];
  unmatchedZones?: string[];
  sampleZones?: Array<{
    type: string;
    zone: string;
    time?: string;
    isHub?: boolean;
    isBase?: boolean;
  }>;
  sampleRaw?: Array<{ type: string; desc: string; time?: string | null }>;
  eventTypeCounts?: Record<string, number>;
  hint?: string | null;
  timings?: { eventsMs?: number; messagesMs?: number; totalMs?: number };
  searchFrom?: string;
  searchTo?: string;
  kingUnreachable?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  vehicleCode: string;
  announcementId?: string;
  approvedKilometers: number;
  /** تاریخ شمسی شروع — پیش‌فرض تخصیص */
  defaultFromDate: string;
  /** تعداد روز پیش‌فرض تا تاریخ پایان */
  defaultDays?: number;
  onSelect: (payload: {
    source: GpsMileageSource;
    mileage: number;
    tour: GpsTourCandidate | null;
    meta: {
      imei: string;
      searchFrom: string;
      searchTo: string;
      vehicleCode: string;
    };
  }) => void;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const GpsTourPickerDialog: React.FC<Props> = ({
  open,
  onClose,
  vehicleCode,
  announcementId,
  approvedKilometers,
  defaultFromDate,
  defaultDays = 5,
  onSelect,
}) => {
  const [fromDate, setFromDate] = useState(defaultFromDate || '');
  const [toDate, setToDate] = useState('');
  const [days, setDays] = useState(defaultDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [tours, setTours] = useState<GpsTourCandidate[]>([]);
  const [debug, setDebug] = useState<GpsDebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [meta, setMeta] = useState<{
    imei: string;
    searchFrom: string;
    searchTo: string;
    vehicleCode: string;
    searchFromJalali?: string | null;
    searchToJalali?: string | null;
  } | null>(null);
  const [enrichingTourId, setEnrichingTourId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const formatGpsJalali = (value?: string | null) => {
    if (!value) return '—';
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return value;
    return formatJalaliDateTime(d);
  };

  useEffect(() => {
    if (!open) return;
    setFromDate(defaultFromDate || '');
    setDays(defaultDays);
    setToDate('');
    setError(null);
    setTours([]);
    setMeta(null);
    setDebug(null);
    setEnrichingTourId(null);
    abortRef.current?.abort();
    abortRef.current = null;
    fetch(getApiUrl('gps-finance/status'), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled !== false && d.kingConfigured !== false))
      .catch(() => setEnabled(false));
    return () => {
      abortRef.current?.abort();
    };
  }, [open, defaultFromDate, defaultDays]);

  const approvedLabel = useMemo(
    () => (Number(approvedKilometers) || 0).toLocaleString('fa-IR'),
    [approvedKilometers]
  );

  if (!open) return null;

  const stopCalculate = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError('دریافت متوقف شد.');
  };

  const formatFuelLabel = (t: GpsTourCandidate) => {
    if (t.fuelUsedTotal == null) return '—';
    const base = t.mileageCan ?? t.mileageGps;
    const lPer100 =
      t.detailSummary?.fuelLPer100Km ??
      (base && base > 0 ? Math.round((t.fuelUsedTotal / base) * 100 * 100) / 100 : null);
    const used = t.fuelUsedTotal.toLocaleString('fa-IR');
    return lPer100 != null ? `${used} (${lPer100} L/100km)` : used;
  };

  const formatOverspeedLabel = (t: GpsTourCandidate) => {
    if (t.detailStatus === 'ready' && t.detailSummary?.overspeedRuleCount != null) {
      const count = t.detailSummary.overspeedRuleCount;
      const max = t.detailSummary.maxSpeed ?? 0;
      return count > 0 ? `${count} (max ${max})` : '—';
    }
    if ((t.overspeedCountEvents ?? 0) > 0) {
      return `${t.overspeedCountEvents} رویداد`;
    }
    return '—';
  };

  /** فقط وقتی کاربر بخواهد — نه اتومات بعد از لیست تور */
  const enrichOneTour = async (tour: GpsTourCandidate): Promise<GpsTourCandidate | null> => {
    if (!meta?.imei) {
      alert('ابتدا محاسبه GPS را اجرا کنید.');
      return null;
    }
    const key = String(tour.tourId || tour.index);
    setEnrichingTourId(key);
    try {
      const res = await fetch(getApiUrl('gps-finance/enrich-driving'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          imei: meta.imei,
          tourId: tour.tourId,
          tour,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.detail) {
        alert(body.message || 'خطا در محاسبه جزئیات تور');
        return null;
      }
      const track =
        body.detail.mileageGpsTrack != null ? Number(body.detail.mileageGpsTrack) : null;
      const updated: GpsTourCandidate = {
        ...tour,
        mileageGpsTrack: Number.isFinite(track as number) ? track : null,
        drivingHours: body.detail.drivingHours ?? tour.drivingHours,
        stopHours: body.detail.stopTotalHours ?? tour.stopHours,
        detailStatus: 'ready',
        detailSummary: {
          ...(tour.detailSummary || {}),
          ...body.detail,
          mileageGpsTrack: Number.isFinite(track as number) ? track : null,
        },
      };
      setTours((prev) => prev.map((x) => (x.index === tour.index ? updated : x)));
      return updated;
    } catch (e: any) {
      alert(e?.message || 'خطا در محاسبه جزئیات');
      return null;
    } finally {
      setEnrichingTourId(null);
    }
  };

  const runCalculate = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setDebug(null);
    setEnrichingTourId(null);
    try {
      const res = await fetch(getApiUrl('gps-finance/calculate-tours'), {
        method: 'POST',
        headers: authHeaders(),
        signal: ac.signal,
        body: JSON.stringify({
          vehicleCode,
          fromDate,
          toDate: toDate || undefined,
          days: toDate ? undefined : days,
          announcementId,
          approvedKilometers,
          includeTelemetry: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.debug) setDebug(body.debug);
      if (!res.ok) {
        const msg =
          body.message ||
          (res.status === 502
            ? 'سرور به King GPS وصل نشد (502). اتصال اینترنت/VPN را چک کنید و دوباره بزنید.'
            : 'خطا در دریافت تورهای GPS');
        throw new Error(msg);
      }
      const nextTours: GpsTourCandidate[] = Array.isArray(body.tours) ? body.tours : [];
      setTours(nextTours);
      setMeta({
        imei: body.imei,
        searchFrom: body.searchFrom,
        searchTo: body.searchTo,
        vehicleCode: body.vehicleCode || vehicleCode,
        searchFromJalali: body.searchFromDisplay?.jalali || formatGpsJalali(body.searchFrom),
        searchToJalali: body.searchToDisplay?.jalali || formatGpsJalali(body.searchTo),
      });
      setDebug(body.debug || null);
      if (!nextTours.length) {
        const hint = body.debug?.hint ? ` ${body.debug.hint}` : '';
        setError(`در این بازه تور معتبری تشخیص داده نشد.${hint}`);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('دریافت متوقف شد.');
      } else {
        setError(e?.message || 'خطا');
      }
      setTours([]);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  };

  const pick = async (source: GpsMileageSource, tour: GpsTourCandidate | null) => {
    if (!meta && (source !== 'approved' || tour)) {
      alert('ابتدا محاسبه GPS را اجرا کنید.');
      return;
    }
    let working = tour;
    // مسافت مسیر: فقط با انتخاب کاربر جزئیات Messages گرفته می‌شود
    if (source === 'track' && working) {
      const hasTrack = working.mileageGpsTrack != null && working.mileageGpsTrack > 0;
      if (!hasTrack) {
        const enriched = await enrichOneTour(working);
        if (!enriched) return;
        working = enriched;
      }
    }

    let mileage = Number(approvedKilometers) || 0;
    if (source === 'can') mileage = Number(working?.mileageCan);
    if (source === 'gps') mileage = Number(working?.mileageGps);
    if (source === 'track') {
      mileage = Number(working?.mileageGpsTrack ?? working?.detailSummary?.mileageGpsTrack);
    }
    if (source !== 'approved' && (!Number.isFinite(mileage) || mileage <= 0)) {
      alert(
        source === 'track'
          ? 'مسافت مسیر برای این تور محاسبه نشد (نقاط GPS کافی نیست).'
          : 'عدد پیمایش این منبع معتبر نیست.'
      );
      return;
    }
    if (working?.blocked) {
      alert('این تور با ثبت قبلی همپوشانی دارد و قابل انتخاب نیست.');
      return;
    }
    onSelect({
      source,
      mileage: source === 'approved' ? Number(approvedKilometers) || 0 : mileage,
      tour: working,
      meta: meta || { imei: '', searchFrom: '', searchTo: '', vehicleCode },
    });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">محاسبه پیمایش از GPS</h3>
            <p className="text-xs text-slate-500 mt-1">
              کمکی کنار پیمایش مصوب — انتخاب CAN / GPS-ODO / مسافت مسیر / مصوب روی همان فیلد کیلومتر اعمال می‌شود.
            </p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm border rounded-md">
            بستن
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!enabled ? (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              سرویس GPS مالی غیرفعال است (`GPS_FINANCE_ENABLED` / `KING_GPS_API_KEY`).
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-600">از تاریخ (شمسی)</label>
                  <input
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    placeholder="1404/05/01"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">تا تاریخ (اختیاری)</label>
                  <input
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    placeholder="خالی = از + روز"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">تعداد روز (پیش‌فرض ۵)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    disabled={!!toDate}
                    onChange={(e) => setDays(Number(e.target.value) || 5)}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={loading || !fromDate || !vehicleCode}
                  onClick={runCalculate}
                  className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {loading ? 'در حال دریافت...' : 'دریافت از GPS'}
                </button>
                <button
                  type="button"
                  disabled={!loading}
                  onClick={stopCalculate}
                  className="px-4 py-2 bg-rose-600 text-white rounded-md text-sm hover:bg-rose-700 disabled:opacity-40"
                >
                  توقف
                </button>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 border rounded-md p-3 flex flex-wrap gap-4">
                <span>
                  کد خودرو: <strong>{vehicleCode || '—'}</strong>
                </span>
                <span>
                  مصوب فعلی: <strong>{approvedLabel}</strong> km
                </span>
                {meta?.imei && (
                  <span>
                    IMEI: <strong className="font-mono">{meta.imei}</strong>
                  </span>
                )}
                {meta?.searchFrom && (
                  <span>
                    بازه:{' '}
                    <strong>
                      {meta.searchFromJalali || formatGpsJalali(meta.searchFrom)} →{' '}
                      {meta.searchToJalali || formatGpsJalali(meta.searchTo)}
                    </strong>
                  </span>
                )}
                {debug?.timings?.totalMs != null && (
                  <span>
                    زمان: <strong>{(debug.timings.totalMs / 1000).toFixed(1)}s</strong>
                    {debug.timings.eventsMs != null && (
                      <span className="text-slate-400"> (رویداد {debug.timings.eventsMs}ms)</span>
                    )}
                  </span>
                )}
              </div>

              <div className="border rounded-lg p-3 bg-emerald-50 border-emerald-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-emerald-900 text-sm">پیمایش مصوب (فعلی)</div>
                    <div className="text-lg font-bold text-emerald-800">{approvedLabel} km</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => pick('approved', null)}
                    className="px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    انتخاب مصوب
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  <p>{error}</p>
                  {(debug?.kingUnreachable || /King GPS|TLS|Timeout/i.test(error)) && (
                    <p className="text-xs text-red-600/90">
                      این خطا از تشخیص تور نیست — سرور King از شبکه فعلی در دسترس نیست. چند دقیقه بعد دوباره
                      بزنید؛ اگر پایدار بود، VPN/فیلتر مسیر تا <span className="font-mono">mihan.kinggps.ir</span>{' '}
                      را بررسی کنید.
                    </p>
                  )}
                </div>
              )}

              {debug && !debug.kingUnreachable && (
                <div className="border border-amber-200 bg-amber-50/80 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-amber-900"
                    onClick={() => setShowDebug((v) => !v)}
                  >
                    <span>دیباگ تشخیص تور</span>
                    <span className="text-xs font-normal">{showDebug ? 'بستن' : 'نمایش'}</span>
                  </button>
                  {showDebug && (
                    <div className="px-3 pb-3 space-y-2 text-xs text-slate-700 border-t border-amber-100">
                      {debug.hint && (
                        <p className="mt-2 text-amber-900 font-medium leading-relaxed">{debug.hint}</p>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        <div className="bg-white/70 rounded px-2 py-1">رویداد خام: {debug.rawEventCount ?? 0}</div>
                        <div className="bg-white/70 rounded px-2 py-1">حصار parse: {debug.zoneEventCount ?? 0}</div>
                        <div className="bg-white/70 rounded px-2 py-1">خروج Hub: {debug.baseOutCount ?? 0}</div>
                        <div className="bg-white/70 rounded px-2 py-1">ورود مقصد: {debug.nonBaseInCount ?? 0}</div>
                        <div className="bg-white/70 rounded px-2 py-1">ورود Hub: {debug.baseInCount ?? 0}</div>
                        <div className="bg-white/70 rounded px-2 py-1">تور: {debug.tourCount ?? 0}</div>
                      </div>
                      {!!debug.hubLikeZones?.length && (
                        <div>
                          <div className="font-medium text-slate-800 mb-1">حصارهای Hub-مانند:</div>
                          <div className="text-slate-600">{debug.hubLikeZones.join(' | ')}</div>
                        </div>
                      )}
                      {!!debug.unmatchedZones?.length && (
                        <div>
                          <div className="font-medium text-slate-800 mb-1">
                            حصارهایی که Hub تشخیص داده نشدند (ممکن است باعث از دست رفتن تور شوند):
                          </div>
                          <div className="text-slate-600 break-words">{debug.unmatchedZones.join(' | ')}</div>
                        </div>
                      )}
                      {!!debug.sampleZones?.length && (
                        <div className="overflow-x-auto">
                          <div className="font-medium text-slate-800 mb-1">نمونه رویدادهای حصار:</div>
                          <table className="w-full text-[11px] border-collapse">
                            <thead>
                              <tr className="text-right text-slate-500">
                                <th className="p-1">نوع</th>
                                <th className="p-1">حصار</th>
                                <th className="p-1">زمان</th>
                                <th className="p-1">Hub</th>
                              </tr>
                            </thead>
                            <tbody>
                              {debug.sampleZones.map((z, i) => (
                                <tr key={i} className="border-t border-amber-100">
                                  <td className="p-1">{z.type}</td>
                                  <td className="p-1">{z.zone}</td>
                                  <td className="p-1 font-mono whitespace-nowrap">
                                    {formatGpsJalali(z.time)}
                                  </td>
                                  <td className="p-1">{z.isBase ? 'پایه' : z.isHub ? 'hub' : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {!!debug.sampleRaw?.length && !debug.sampleZones?.length && (
                        <div>
                          <div className="font-medium text-slate-800 mb-1">نمونه رویداد خام (parse نشد):</div>
                          <ul className="space-y-1 font-mono text-[11px]">
                            {debug.sampleRaw.map((r, i) => (
                              <li key={i}>
                                [{r.type}] {r.desc} @ {r.time || '—'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tours.map((t) => (
                <div
                  key={t.index}
                  className={`border rounded-lg p-3 ${t.blocked ? 'opacity-50 bg-slate-50' : 'bg-white'}`}
                >
                  <div className="flex flex-wrap justify-between gap-2 mb-2">
                    <div className="text-sm font-bold text-slate-800">
                      تور {t.index + 1}: {t.startHub} → {t.endHub}
                      {t.blocked && (
                        <span className="mr-2 text-xs font-normal text-red-600">(همپوشانی — غیرقابل انتخاب)</span>
                      )}
                      {t.detailStatus === 'ready' && (
                        <span className="mr-2 text-xs font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          جزئیات ذخیره‌شده
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.startDisplay?.jalali || t.startTime} {t.startDisplay?.time || ''} —{' '}
                      {t.endDisplay?.jalali || t.endTime} {t.endDisplay?.time || ''}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 mb-3">
                    <div>
                      CAN:{' '}
                      {t.mileageCan != null ? `${t.mileageCan.toLocaleString('fa-IR')} km` : 'ندارد'}
                    </div>
                    <div>
                      GPS-ODO:{' '}
                      {t.mileageGps != null ? `${t.mileageGps.toLocaleString('fa-IR')} km` : 'ندارد'}
                    </div>
                    <div>
                      مسافت مسیر:{' '}
                      {t.mileageGpsTrack != null
                        ? `${t.mileageGpsTrack.toLocaleString('fa-IR')} km`
                        : t.detailStatus === 'ready'
                          ? 'ندارد'
                          : 'پس از انتخاب محاسبه می‌شود'}
                    </div>
                    <div>
                      سوخت:{' '}
                      {t.fuelUsedTotal == null && t.tankLevelStart == null ? 'ندارد' : formatFuelLabel(t)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 mb-3">
                    <div>تخلیه: {t.unloadStations}</div>
                    <div>مدت کل: {t.hoursTotal ?? '—'} س</div>
                    <div>
                      رانندگی:{' '}
                      {t.drivingHours != null && t.drivingHours > 0
                        ? `${t.drivingHours} س`
                        : t.detailStatus === 'ready'
                          ? '—'
                          : 'پس از انتخاب'}
                    </div>
                    <div>سرعت غیرمجاز: {formatOverspeedLabel(t)}</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 mb-3">
                    <div>
                      سطح باک:{' '}
                      {t.tankLevelStart != null || t.tankLevelEnd != null
                        ? `${t.tankLevelStart ?? '—'} → ${t.tankLevelEnd ?? '—'}%`
                        : 'ندارد'}
                    </div>
                    <div>
                      دما موتور:{' '}
                      {t.engineTempStart != null || t.engineTempEnd != null
                        ? `${t.engineTempStart ?? '—'} → ${t.engineTempEnd ?? '—'}°C`
                        : 'ندارد'}
                    </div>
                    <div>
                      رویداد: overspeed {t.overspeedCountEvents ?? 0} | stopped {t.stoppedCountEvents ?? 0}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={t.blocked || enrichingTourId != null}
                      onClick={() => pick('approved', t)}
                      className="px-3 py-2 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-40"
                    >
                      انتخاب مصوب ({approvedLabel} km)
                    </button>
                    <button
                      type="button"
                      disabled={t.blocked || t.mileageCan == null || enrichingTourId != null}
                      onClick={() => pick('can', t)}
                      className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-40"
                    >
                      ثبت با CAN ({t.mileageCan != null ? t.mileageCan.toLocaleString('fa-IR') : '—'} km)
                    </button>
                    <button
                      type="button"
                      disabled={t.blocked || t.mileageGps == null || enrichingTourId != null}
                      onClick={() => pick('gps', t)}
                      className="px-3 py-2 text-sm rounded-md bg-violet-600 text-white disabled:opacity-40"
                    >
                      ثبت با GPS/ODO ({t.mileageGps != null ? t.mileageGps.toLocaleString('fa-IR') : '—'} km)
                    </button>
                    <button
                      type="button"
                      disabled={t.blocked || enrichingTourId != null}
                      onClick={() => pick('track', t)}
                      className="px-3 py-2 text-sm rounded-md bg-teal-600 text-white disabled:opacity-40"
                      title="با انتخاب، مسافت مسیر از نقاط GPS همین تور محاسبه و ثبت می‌شود"
                    >
                      {enrichingTourId === String(t.tourId || t.index)
                        ? 'در حال محاسبه مسافت مسیر…'
                        : t.mileageGpsTrack != null
                          ? `ثبت با مسافت مسیر (${t.mileageGpsTrack.toLocaleString('fa-IR')} km)`
                          : 'ثبت با مسافت مسیر (محاسبه با انتخاب)'}
                    </button>
                    {t.diffCanMinusGps != null && (
                      <span className="text-xs self-center text-slate-500">
                        اختلاف CAN−GPS: {t.diffCanMinusGps.toLocaleString('fa-IR')} km
                      </span>
                    )}
                  </div>
                  {t.detailSummary && t.detailStatus === 'ready' && (
                    <div className="mt-3 border-t pt-3 text-xs text-slate-600 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>درصد رانندگی: {t.detailSummary.drivingPercent ?? '—'}%</div>
                        <div>
                          توقف کل:{' '}
                          {t.detailSummary.stopTotalHours ??
                            t.detailSummary.stopInsideHours ??
                            '—'}{' '}
                          س
                        </div>
                        <div>
                          توقف بین راهی:{' '}
                          {t.detailSummary.stopEnRouteHours ??
                            t.detailSummary.stopOutsideHours ??
                            '—'}{' '}
                          س
                        </div>
                        <div>L/100km: {t.detailSummary.fuelLPer100Km ?? '—'}</div>
                      </div>

                      <div className="bg-slate-50 border rounded-md p-2 space-y-1">
                        <div className="font-medium text-slate-800">
                          توقف تخلیه:{' '}
                          {t.detailSummary.stopUnloadHours != null
                            ? `${t.detailSummary.stopUnloadHours} س`
                            : t.detailSummary.unloadStops?.length
                              ? `${t.detailSummary.unloadStops
                                  .reduce((s, u) => s + (u.hours || 0), 0)
                                  .toFixed(2)} س`
                              : '—'}
                        </div>
                        {!!t.detailSummary.unloadStops?.length &&
                          t.detailSummary.unloadStops.map((u, i) => (
                            <div key={`${u.zone}-${i}`} className="text-slate-600 pr-2">
                              • {u.zone}: {u.hours} س
                              {u.fromJalali || u.toJalali
                                ? ` (${u.fromJalali || '—'} → ${u.toJalali || '—'})`
                                : ''}
                              {u.legalHours != null && u.legalHours > 0
                                ? ` — از این مقدار ${u.legalHours} س در ساعت خواب`
                                : ''}
                            </div>
                          ))}
                      </div>

                      <div className="bg-amber-50/80 border border-amber-100 rounded-md p-2 space-y-1">
                        <div className="font-medium text-amber-900">
                          توقف قانونی (خواب ۲۳:۳۰–۰۵:۳۰):{' '}
                          {t.detailSummary.stopLegalHours ?? '—'} س
                        </div>
                        {!!t.detailSummary.legalIntervals?.length ? (
                          t.detailSummary.legalIntervals.map((iv, i) => (
                            <div key={i} className="text-amber-900/90 pr-2 font-mono text-[11px]">
                              • {iv.startJalali || '—'} → {iv.endJalali || '—'} ({iv.hours} س)
                              {iv.insideZone ? ` — داخل ${iv.insideZone}` : ''}
                            </div>
                          ))
                        ) : (
                          <div className="text-amber-800/80 pr-2">بازه‌ای ثبت نشده</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GpsTourPickerDialog;
