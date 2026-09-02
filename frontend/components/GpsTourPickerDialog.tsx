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
    overspeedDetails?: Array<{
      startTime?: string;
      endTime?: string;
      maxSpeed?: number;
      durationSec?: number;
    }> | null;
    fuelEvents?: Array<{
      kind?: string;
      labelFa?: string;
      liters?: number | null;
      deltaPercent?: number | null;
      atJalali?: string | null;
      atTime?: string | null;
      tankPctFrom?: number | null;
      tankPctTo?: number | null;
    }> | null;
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
  const [meta, setMeta] = useState<{
    imei: string;
    searchFrom: string;
    searchTo: string;
    vehicleCode: string;
    searchFromJalali?: string | null;
    searchToJalali?: string | null;
  } | null>(null);
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

  const runCalculate = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setDebug(null);
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
        setError('در این بازه تور معتبری پیدا نشد.');
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
    const working = tour;
    let mileage = Number(approvedKilometers) || 0;
    if (source === 'can') mileage = Number(working?.mileageCan);
    if (source === 'gps') mileage = Number(working?.mileageGps);
    if (source !== 'approved' && (!Number.isFinite(mileage) || mileage <= 0)) {
      alert('عدد پیمایش این منبع معتبر نیست.');
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
              کمکی کنار پیمایش مصوب — انتخاب CAN / GPS-ODO / مصوب روی همان فیلد کیلومتر اعمال می‌شود.
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
              </div>

              <div className="border rounded-lg p-3 bg-emerald-50 border-emerald-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-emerald-900 text-sm">پیمایش مصوب (فعلی)</div>
                    <div className="text-lg font-bold text-emerald-800">{approvedLabel} km</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = tours.find((x) => !x.blocked) || tours[0] || null;
                      pick('approved', fallback);
                    }}
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
                      سوخت:{' '}
                      {t.fuelUsedTotal == null && t.tankLevelStart == null ? 'ندارد' : formatFuelLabel(t)}
                    </div>
                    <div>تخلیه: {t.unloadStations}</div>
                    <div>مدت کل: {t.hoursTotal ?? '—'} س</div>
                  </div>
                  {t.detailSummary?.fuelEvents && t.detailSummary.fuelEvents.length > 0 && (
                    <div className="mb-3 text-xs rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-950">
                      <div className="font-semibold mb-1">سوخت ناگهانی در توقف (نامزد)</div>
                      {t.detailSummary.fuelEvents.map((ev, i) => (
                        <div key={`${ev.kind}-${i}`}>
                          {ev.labelFa || ev.kind}
                          {ev.deltaPercent != null
                            ? `: ${ev.deltaPercent.toLocaleString('fa-IR')}٪ باک`
                            : ''}
                          {ev.liters != null ? ` (${ev.liters.toLocaleString('fa-IR')} L)` : ''}
                          {' — '}
                          {ev.atJalali || ''} {ev.atTime || ''}
                          {ev.tankPctFrom != null || ev.tankPctTo != null
                            ? ` (${ev.tankPctFrom ?? '—'}٪ → ${ev.tankPctTo ?? '—'}٪)`
                            : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={t.blocked}
                      onClick={() => pick('approved', t)}
                      className="px-3 py-2 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-40"
                    >
                      انتخاب مصوب ({approvedLabel} km)
                    </button>
                    <button
                      type="button"
                      disabled={t.blocked || t.mileageCan == null}
                      onClick={() => pick('can', t)}
                      className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-40"
                    >
                      ثبت با CAN ({t.mileageCan != null ? t.mileageCan.toLocaleString('fa-IR') : '—'} km)
                    </button>
                    <button
                      type="button"
                      disabled={t.blocked || t.mileageGps == null}
                      onClick={() => pick('gps', t)}
                      className="px-3 py-2 text-sm rounded-md bg-violet-600 text-white disabled:opacity-40"
                    >
                      ثبت با GPS/ODO ({t.mileageGps != null ? t.mileageGps.toLocaleString('fa-IR') : '—'} km)
                    </button>
                    {t.diffCanMinusGps != null && (
                      <span className="text-xs self-center text-slate-500">
                        اختلاف CAN−GPS: {t.diffCanMinusGps.toLocaleString('fa-IR')} km
                      </span>
                    )}
                  </div>
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
