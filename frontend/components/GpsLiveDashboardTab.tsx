import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';

type LiveData = {
  imei: string;
  name: string;
  groupName: string;
  moving: boolean;
  statusLabel: string;
  lastEventDesc: string;
  lastEventDisplay?: { jalali?: string | null; time?: string | null };
  address: string;
  nearestZoneName: string;
  nearestZoneDistance: number | null;
  lat: number | null;
  lng: number | null;
  angle: number | null;
  altitude: number | null;
  speed: number;
  wheelSpeed: number | null;
  gpslev: number | null;
  hdop: number | null;
  gsmlev: number | null;
  odometer: number | null;
  odometerSourceLabel: string;
  tankLevel: number | null;
  fuelTotal: number | null;
  fuelRate: number | null;
  engineTemp: number | null;
  engineHours: number | null;
  airTemp: number | null;
  ignitionApprox: number | null;
  alerts: Array<{ type: string; label: string; value: unknown }>;
};

type DriverOption = {
  id?: string | null;
  name: string;
  code?: string | null;
  kind?: string;
  label: string;
};

type AssignmentRow = {
  announcementId: string;
  lineType?: string;
  status?: string;
  driverName?: string;
  vehiclePlate?: string;
  vehicleCode?: string;
  assignmentDisplay?: { jalali?: string | null; time?: string | null };
  assignedDestinationsLabel?: string;
  destinationMatchWeak?: boolean;
  assignedDestinations?: Array<{
    city?: string;
    representativeName?: string;
    tonnageKg?: number | null;
  }>;
  finance?: {
    approvedKilometers?: number | null;
    mileageSource?: string | null;
    totalKilometers?: number | null;
  } | null;
  gpsTour?: {
    selectedSource?: string | null;
    selectedMileage?: number | null;
    mileageCan?: number | null;
    mileageGps?: number | null;
    mileageGpsTrack?: number | null;
    drivingHours?: number | null;
    stopTotalHours?: number | null;
    stopEnRouteHours?: number | null;
    stopLegalHours?: number | null;
    stopLegalOutsideHours?: number | null;
    stopSpeedInsideFenceHours?: number | null;
    stopUnloadHours?: number | null;
    fuelUsedTotal?: number | null;
    fuelLPer100Km?: number | null;
    maxSpeed?: number | null;
    overspeedRuleCount?: number | null;
    hoursTotal?: number | null;
    tourStart?: string | null;
    tourEnd?: string | null;
    startHub?: string | null;
    endHub?: string | null;
    unloadStations?: string | null;
    startDisplay?: { jalali?: string | null; time?: string | null };
    endDisplay?: { jalali?: string | null; time?: string | null };
    unloadStops?: Array<{
      zone?: string;
      fromJalali?: string | null;
      toJalali?: string | null;
      fromTime?: string | null;
      toTime?: string | null;
      hours?: number | null;
      legalHours?: number | null;
    }>;
  } | null;
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const val = (v: unknown, suffix = '') => {
  if (v === null || v === undefined || v === '') return 'ندارد';
  if (typeof v === 'number' && !Number.isFinite(v)) return 'ندارد';
  return `${v}${suffix}`;
};

const lineLabel = (line?: string) => {
  if (!line) return '—';
  if (line === 'IceCream' || line === 'بستنی') return 'بستنی';
  if (line === 'Dairy' || line === 'پاستوریزه') return 'پاستوریزه';
  if (line === 'Ambient' || line === 'لبنیات') return 'لبنیات-فروتلند';
  return line;
};

const sourceLabelFa = (src?: string | null) => {
  const s = String(src || '').toLowerCase();
  if (s === 'approved' || s === 'مصوب') return 'مصوب';
  if (s === 'can') return 'CAN';
  if (s === 'gps' || s === 'odo') return 'GPS/ODO';
  if (s === 'track' || s === 'مسیر') return 'مسافت مسیر';
  return src || '—';
};

const fmtHoursDays = (hours: number | null | undefined) => {
  if (hours == null || !Number.isFinite(hours)) return '—';
  const h = Math.round(hours * 100) / 100;
  const d = Math.round((hours / 24) * 100) / 100;
  return `${h.toLocaleString('fa-IR')} س / ${d.toLocaleString('fa-IR')} روز`;
};

const pickTourMileage = (a: AssignmentRow): { km: number | null; source: string } => {
  const t = a.gpsTour;
  const fin = a.finance;
  if (t?.selectedMileage != null && Number.isFinite(t.selectedMileage)) {
    return { km: Number(t.selectedMileage), source: sourceLabelFa(t.selectedSource) };
  }
  if (fin?.approvedKilometers != null && Number.isFinite(fin.approvedKilometers)) {
    return { km: Number(fin.approvedKilometers), source: 'مصوب' };
  }
  if (fin?.mileageSource === 'approved' && fin.totalKilometers != null) {
    return { km: Number(fin.totalKilometers), source: 'مصوب' };
  }
  if (t?.mileageCan != null && Number.isFinite(t.mileageCan)) {
    return { km: Number(t.mileageCan), source: 'CAN' };
  }
  if (t?.mileageGps != null && Number.isFinite(t.mileageGps)) {
    return { km: Number(t.mileageGps), source: 'GPS/ODO' };
  }
  if (t?.mileageGpsTrack != null && Number.isFinite(t.mileageGpsTrack)) {
    return { km: Number(t.mileageGpsTrack), source: 'مسافت مسیر' };
  }
  return { km: null, source: '—' };
};

/** نرمال توقف هر تور — داده ناقص قدیمی را هم پوشش می‌دهد */
const normalizeStops = (t: NonNullable<AssignmentRow['gpsTour']>) => {
  let stopTotal = t.stopTotalHours ?? null;
  let stopEnRoute = t.stopEnRouteHours ?? null;
  let stopLegal = t.stopLegalHours ?? null;
  let stopLegalOutside = t.stopLegalOutsideHours ?? null;
  let stopUnload = t.stopUnloadHours ?? null;
  let stopInsideFence = t.stopSpeedInsideFenceHours ?? null;

  if (stopTotal == null && stopEnRoute != null) {
    stopTotal = stopEnRoute;
    stopEnRoute = null;
  }
  if (stopTotal != null && stopEnRoute != null && stopEnRoute > stopTotal + 0.05) {
    stopEnRoute = null;
  }
  if (stopTotal != null && stopLegalOutside != null && stopLegalOutside > stopTotal + 0.05) {
    stopLegalOutside = null;
  }
  if (stopInsideFence == null && stopTotal != null && stopEnRoute != null) {
    const legalPart = stopLegalOutside ?? 0;
    stopInsideFence = Math.max(0, Math.round((stopTotal - stopEnRoute - legalPart) * 100) / 100);
  }
  return { stopTotal, stopEnRoute, stopLegal, stopLegalOutside, stopUnload, stopInsideFence };
};

const GpsLiveDashboardTab: React.FC = () => {
  const [mode, setMode] = useState<'vehicle' | 'driver'>('vehicle');
  const [query, setQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null);
  const [driverSuggestions, setDriverSuggestions] = useState<DriverOption[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ vehicleCode: string; plateNumber?: string; imei?: string }>>([]);
  const [resource, setResource] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [storedTours, setStoredTours] = useState<any[]>([]);
  const [latestAssignment, setLatestAssignment] = useState<any>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastEventLabel = useMemo(() => {
    if (!live?.lastEventDesc || live.lastEventDesc === 'ندارد') return 'ندارد';
    return live.lastEventDesc;
  }, [live]);

  const odometerLabel = useMemo(() => {
    if (live?.odometer == null) return 'بدون کیلومترشمار';
    return `${Number(live.odometer).toLocaleString('fa-IR')} (${live.odometerSourceLabel || '—'})`;
  }, [live]);

  const roundNum = (n: number | null | undefined, digits = 1) => {
    if (n == null || !Number.isFinite(n)) return null;
    const p = 10 ** digits;
    return Math.round(n * p) / p;
  };

  const periodSummary = useMemo(() => {
    // تورمحور: ردیف‌هایی که gpsTour دارند؛ تکراری‌ها با tourStart+tourEnd حذف می‌شوند
    const withTour = assignments.filter((a) => a.gpsTour);
    const seen = new Set<string>();
    const tours: AssignmentRow[] = [];
    for (const a of withTour) {
      const t = a.gpsTour!;
      const key =
        t.tourStart && t.tourEnd
          ? `${t.tourStart}|${t.tourEnd}`
          : `${a.announcementId}|${t.startDisplay?.jalali || ''}|${t.endDisplay?.jalali || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tours.push(a);
    }

    // اگر assignments خالی از تور بود، از storedTours استفاده کن
    if (!tours.length && storedTours.length) {
      for (const st of storedTours) {
        const key = `${st.tourStart || ''}|${st.tourEnd || ''}|${st.tourId || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tours.push({
          announcementId: st.announcementId || st.tourId || key,
          finance: null,
          gpsTour: {
            selectedSource: st.selectedSource,
            selectedMileage: st.selectedMileage,
            mileageCan: st.mileageCan,
            mileageGps: st.mileageGps,
            mileageGpsTrack: st.mileageGpsTrack,
            drivingHours: st.drivingHours,
            stopTotalHours: st.stopTotalHours,
            stopEnRouteHours: st.stopEnRouteHours,
            stopLegalHours: st.stopLegalHours,
            stopUnloadHours: st.stopUnloadHours,
            fuelUsedTotal: st.fuelUsedTotal,
            fuelLPer100Km: st.fuelLPer100Km,
            hoursTotal: st.hoursTotal,
            tourStart: st.tourStart,
            tourEnd: st.tourEnd,
            startHub: st.startHub,
            endHub: st.endHub,
            startDisplay: st.startDisplay,
            endDisplay: st.endDisplay,
            unloadStops: st.unloadStops,
          },
        });
      }
    }

    if (!tours.length) return null;

    const mileageBySource: Record<string, number> = {};
    let mileageTotal = 0;
    let mileageCount = 0;
    let hoursTotal = 0;
    let hoursTotalCount = 0;
    let drivingHours = 0;
    let drivingCount = 0;
    let stopTotal = 0;
    let stopTotalCount = 0;
    let stopEnRoute = 0;
    let stopEnRouteCount = 0;
    let stopLegal = 0;
    let stopLegalCount = 0;
    let stopLegalOutside = 0;
    let stopLegalOutsideCount = 0;
    let stopInsideFence = 0;
    let stopInsideFenceCount = 0;
    let stopBranch = 0;
    let stopBranchCount = 0;
    let fuelUsedSum = 0;
    let fuelUsedCount = 0;
    let fuelKmSum = 0;
    const branchMap = new Map<string, number>();

    for (const a of tours) {
      const t = a.gpsTour!;
      const stops = normalizeStops(t);
      const picked = pickTourMileage(a);
      if (picked.km != null) {
        mileageTotal += picked.km;
        mileageCount += 1;
        mileageBySource[picked.source] = (mileageBySource[picked.source] || 0) + picked.km;
      }

      let tourHours = t.hoursTotal;
      if (tourHours == null && t.tourStart && t.tourEnd) {
        const s = new Date(t.tourStart).getTime();
        const e = new Date(t.tourEnd).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
          tourHours = (e - s) / 3600000;
        }
      }
      if (tourHours != null && Number.isFinite(tourHours)) {
        hoursTotal += tourHours;
        hoursTotalCount += 1;
      }
      if (t.drivingHours != null && Number.isFinite(t.drivingHours)) {
        drivingHours += t.drivingHours;
        drivingCount += 1;
      }
      if (stops.stopTotal != null) {
        stopTotal += stops.stopTotal;
        stopTotalCount += 1;
      }
      if (stops.stopEnRoute != null) {
        stopEnRoute += stops.stopEnRoute;
        stopEnRouteCount += 1;
      }
      if (stops.stopLegal != null) {
        stopLegal += stops.stopLegal;
        stopLegalCount += 1;
      }
      if (stops.stopLegalOutside != null) {
        stopLegalOutside += stops.stopLegalOutside;
        stopLegalOutsideCount += 1;
      }
      if (stops.stopInsideFence != null) {
        stopInsideFence += stops.stopInsideFence;
        stopInsideFenceCount += 1;
      }

      let branchH = stops.stopUnload;
      if (branchH == null && t.unloadStops?.length) {
        branchH = t.unloadStops.reduce((s, u) => s + (u.hours || 0), 0);
      }
      if (branchH != null && Number.isFinite(branchH) && branchH > 0) {
        stopBranch += branchH;
        stopBranchCount += 1;
      }
      for (const u of t.unloadStops || []) {
        if (!u.zone || u.hours == null || !Number.isFinite(u.hours)) continue;
        branchMap.set(u.zone, (branchMap.get(u.zone) || 0) + u.hours);
      }

      if (t.fuelUsedTotal != null && Number.isFinite(t.fuelUsedTotal)) {
        fuelUsedSum += t.fuelUsedTotal;
        fuelUsedCount += 1;
        if (picked.km != null && picked.km > 0) fuelKmSum += picked.km;
      }
    }

    const drivingPlusStop =
      drivingCount || stopTotalCount
        ? Math.round((drivingHours + stopTotal) * 100) / 100
        : null;
    const unclassifiedHours =
      hoursTotalCount && drivingPlusStop != null
        ? Math.round((hoursTotal - drivingPlusStop) * 100) / 100
        : null;

    const drivingPercent =
      hoursTotal > 0 && drivingCount > 0
        ? Math.round((drivingHours / hoursTotal) * 1000) / 10
        : null;
    const classifiedPercent =
      hoursTotal > 0 && drivingPlusStop != null
        ? Math.round((drivingPlusStop / hoursTotal) * 1000) / 10
        : null;

    let avgFuelL100: number | null = null;
    if (fuelUsedSum > 0 && fuelKmSum > 0) {
      avgFuelL100 = Math.round((fuelUsedSum / fuelKmSum) * 100 * 100) / 100;
    } else {
      const rates = tours
        .map((a) => a.gpsTour?.fuelLPer100Km)
        .filter((x): x is number => x != null && Number.isFinite(x));
      if (rates.length) {
        avgFuelL100 = Math.round((rates.reduce((s, x) => s + x, 0) / rates.length) * 100) / 100;
      }
    }

    // فاصله پایان تور تا شروع تور بعدی (مرتب‌سازی صعودی)
    const ordered = [...tours].sort((a, b) => {
      const sa = a.gpsTour?.tourStart ? new Date(a.gpsTour.tourStart).getTime() : 0;
      const sb = b.gpsTour?.tourStart ? new Date(b.gpsTour.tourStart).getTime() : 0;
      return sa - sb;
    });
    const gaps: Array<{
      fromLabel: string;
      toLabel: string;
      hours: number;
      fromHub?: string | null;
      toHub?: string | null;
    }> = [];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const cur = ordered[i].gpsTour!;
      const next = ordered[i + 1].gpsTour!;
      const end = cur.tourEnd ? new Date(cur.tourEnd).getTime() : NaN;
      const start = next.tourStart ? new Date(next.tourStart).getTime() : NaN;
      if (!Number.isFinite(end) || !Number.isFinite(start) || start < end) continue;
      const gapH = Math.round(((start - end) / 3600000) * 100) / 100;
      gaps.push({
        fromLabel: `${cur.endDisplay?.jalali || '—'} ${cur.endDisplay?.time || ''}`.trim(),
        toLabel: `${next.startDisplay?.jalali || '—'} ${next.startDisplay?.time || ''}`.trim(),
        hours: gapH,
        fromHub: cur.endHub,
        toHub: next.startHub,
      });
    }
    const gapAvg =
      gaps.length > 0
        ? Math.round((gaps.reduce((s, g) => s + g.hours, 0) / gaps.length) * 100) / 100
        : null;

    const branchBreakdown = [...branchMap.entries()]
      .map(([zone, hours]) => ({ zone, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours);

    return {
      tourCount: tours.length,
      mileageTotal: mileageCount ? Math.round(mileageTotal * 10) / 10 : null,
      mileageBySource,
      hoursTotal: hoursTotalCount ? Math.round(hoursTotal * 100) / 100 : null,
      drivingHours: drivingCount ? Math.round(drivingHours * 100) / 100 : null,
      drivingPercent,
      classifiedPercent,
      drivingPlusStop,
      unclassifiedHours,
      stopTotal: stopTotalCount ? Math.round(stopTotal * 100) / 100 : null,
      stopEnRoute: stopEnRouteCount ? Math.round(stopEnRoute * 100) / 100 : null,
      stopLegal: stopLegalCount ? Math.round(stopLegal * 100) / 100 : null,
      stopLegalOutside: stopLegalOutsideCount ? Math.round(stopLegalOutside * 100) / 100 : null,
      stopInsideFence: stopInsideFenceCount ? Math.round(stopInsideFence * 100) / 100 : null,
      stopBranch: stopBranchCount ? Math.round(stopBranch * 100) / 100 : null,
      avgFuelL100,
      fuelUsedSum: fuelUsedCount ? Math.round(fuelUsedSum * 10) / 10 : null,
      gaps,
      gapAvg,
      branchBreakdown,
    };
  }, [assignments, storedTours]);

  useEffect(() => {
    if (mode !== 'driver') {
      setDriverSuggestions([]);
      setSuggestError(null);
      return;
    }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!query.trim() || query.trim().length < 2 || selectedDriver?.name === query.trim()) {
      setDriverSuggestions([]);
      setSuggestError(null);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          getApiUrl(`gps-live/search-drivers?q=${encodeURIComponent(query.trim())}`),
          { headers: authHeaders() }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.warn('search-drivers failed', body);
          setDriverSuggestions([]);
          setSuggestError(
            res.status === 403
              ? 'دسترسی جستجوی راننده ندارید.'
              : body.message || 'خطا در پیشنهاد نام راننده'
          );
          return;
        }
        setSuggestError(null);
        setDriverSuggestions(Array.isArray(body.drivers) ? body.drivers : []);
      } catch (e) {
        console.warn('search-drivers error', e);
        setDriverSuggestions([]);
        setSuggestError('ارتباط با سرور برای پیشنهاد راننده برقرار نشد.');
      }
    }, 250);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [query, mode, selectedDriver]);

  const runSearch = async (forced?: { query?: string; driverId?: string | null; driverName?: string }) => {
    const q = (forced?.query ?? selectedDriver?.name ?? query).trim();
    if (!q) {
      setError(mode === 'vehicle' ? 'کد خودرو یا پلاک را وارد کنید.' : 'نام راننده را وارد کنید.');
      return;
    }
    setLoading(true);
    setError(null);
    setOptions([]);
    setDriverSuggestions([]);
    setShowExtras(false);
    try {
      const endpoint = mode === 'vehicle' ? 'gps-live/lookup-vehicle' : 'gps-live/lookup-driver';
      const res = await fetch(getApiUrl(endpoint), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          query: q,
          driverId: forced?.driverId ?? selectedDriver?.id ?? undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && Array.isArray(body.drivers)) {
        setDriverSuggestions(body.drivers);
        setError(body.message || 'چند راننده پیدا شد؛ یکی را از لیست انتخاب کنید.');
        setLive(null);
        setAssignments([]);
        setStoredTours([]);
        return;
      }
      if (res.status === 409 && Array.isArray(body.options)) {
        setOptions(body.options);
        setError(body.message || 'چند نتیجه پیدا شد.');
        setLive(null);
        setAssignments([]);
        return;
      }
      if (!res.ok) throw new Error(body.message || 'خطا در دریافت اطلاعات لحظه‌ای');

      setResource(body.resource || null);
      setCapabilities(body.capabilities || null);
      setLive(body.live || null);
      setAssignments(Array.isArray(body.assignments) ? body.assignments : []);
      setStoredTours(Array.isArray(body.storedTours) ? body.storedTours : []);
      setLatestAssignment(body.latestAssignment || null);
      if (body.message) setError(body.message);
    } catch (e: any) {
      setError(e?.message || 'خطا');
      setLive(null);
      setAssignments([]);
      setStoredTours([]);
      setResource(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('vehicle');
              setSelectedDriver(null);
              setDriverSuggestions([]);
            }}
            className={`px-3 py-2 text-sm rounded-md border ${
              mode === 'vehicle' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700'
            }`}
          >
            جستجو پلاک / کد خودرو
          </button>
          <button
            type="button"
            onClick={() => setMode('driver')}
            className={`px-3 py-2 text-sm rounded-md border ${
              mode === 'driver' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700'
            }`}
          >
            جستجو راننده
          </button>
        </div>
        <div className="flex-1 min-w-[220px] relative">
          <label className="text-xs text-slate-600">
            {mode === 'vehicle' ? 'پلاک یا کد خودرو' : 'نام / فامیلی راننده (پیشنهاد نام کامل)'}
          </label>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedDriver(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder={mode === 'vehicle' ? 'مثلاً کد کشنده یا پلاک' : 'مثلاً کیهانی'}
          />
          {mode === 'driver' && suggestError && (
            <div className="mt-1 text-[11px] text-rose-700">{suggestError}</div>
          )}
          {mode === 'driver' && driverSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto bg-white border rounded-md shadow-lg">
              {driverSuggestions.map((d, i) => (
                <button
                  key={`${d.kind}-${d.id}-${i}`}
                  type="button"
                  className="block w-full text-right px-3 py-2 text-sm hover:bg-sky-50 border-b last:border-0"
                  onClick={() => {
                    setSelectedDriver(d);
                    setQuery(d.name);
                    setDriverSuggestions([]);
                    setSuggestError(null);
                    runSearch({ query: d.name, driverId: d.id || null });
                  }}
                >
                  {d.label}
                  <span className="text-[10px] text-slate-400 mr-2">
                    {d.kind === 'company' ? 'شرکتی' : d.kind === 'personal' ? 'شخصی' : 'از تخصیص'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-600">از تاریخ (شمسی)</label>
          <input
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            placeholder="خالی = ۳۰/۶۰ روز اخیر"
            className="mt-1 w-40 border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-600">تا تاریخ</label>
          <input
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            placeholder="خالی = امروز"
            className="mt-1 w-36 border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => runSearch()}
          className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? 'در حال دریافت…' : 'جستجو'}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        در بازه انتخابی، تورهای GPS ذخیره‌شده و تخصیص ترابری هم‌زمان نشان داده می‌شوند. جزئیات رانندگی/توقف فقط اگر
        قبلاً در مالی ذخیره شده باشد پر می‌شود.
      </p>

      {error && (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{error}</div>
      )}

      {!!options.length && (
        <div className="border rounded-lg p-3 bg-white space-y-2">
          <div className="text-sm font-semibold text-slate-800">انتخاب یکی از نتایج خودرو:</div>
          {options.map((o) => (
            <button
              key={`${o.vehicleCode}-${o.imei}`}
              type="button"
              className="block w-full text-right text-sm px-3 py-2 border rounded-md hover:bg-sky-50"
              onClick={() => {
                setQuery(o.vehicleCode);
                setMode('vehicle');
                runSearch({ query: o.vehicleCode });
              }}
            >
              کد {o.vehicleCode}
              {o.plateNumber ? ` — پلاک ${o.plateNumber}` : ''}
              {o.imei ? ` — IMEI ${o.imei}` : ''}
            </button>
          ))}
        </div>
      )}

      {(resource || live) && (
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-slate-800 text-sm flex items-center justify-between gap-2">
            <span>وضعیت لحظه‌ای GPS</span>
            {latestAssignment?.driverName && (
              <span className="text-xs font-normal text-slate-500">
                آخرین تخصیص: {latestAssignment.driverName} — {lineLabel(latestAssignment.lineType)}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 whitespace-nowrap">مدل / پلاک</th>
                  <th className="p-2 whitespace-nowrap">وضعیت GPS</th>
                  <th className="p-2 whitespace-nowrap">سرعت لحظه‌ای</th>
                  <th className="p-2 whitespace-nowrap">نزدیک‌ترین حصار</th>
                  <th className="p-2 whitespace-nowrap">آخرین رویداد</th>
                  <th className="p-2 whitespace-nowrap">کیلومترشمار</th>
                  <th className="p-2 whitespace-nowrap">اطلاعات اضافی</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t align-middle">
                  <td className="p-2">
                    <div className="font-semibold text-slate-800">
                      {resource?.gpsModelName || live?.name || '—'}
                    </div>
                    <div className="text-slate-600">{resource?.plateNumber || '—'}</div>
                    {resource?.vehicleCode && (
                      <div className="text-[10px] text-slate-400">کد {resource.vehicleCode}</div>
                    )}
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        live?.moving ? 'text-emerald-700 font-semibold' : 'text-slate-800 font-semibold'
                      }
                    >
                      {live?.statusLabel || '—'}
                    </span>
                    {live?.groupName && live.groupName !== 'ندارد' && (
                      <div className="text-[10px] text-slate-500">گروه: {live.groupName}</div>
                    )}
                  </td>
                  <td className="p-2 font-semibold">
                    {live?.speed != null ? `${live.speed} km/h` : '—'}
                  </td>
                  <td className="p-2">
                    {live?.nearestZoneName && live.nearestZoneName !== 'ندارد'
                      ? live.nearestZoneName
                      : '—'}
                  </td>
                  <td className="p-2 max-w-[220px]">
                    <div className="truncate" title={lastEventLabel}>
                      {lastEventLabel}
                    </div>
                    {live?.lastEventDisplay?.jalali && (
                      <div className="text-[10px] text-slate-500">
                        {live.lastEventDisplay.jalali} {live.lastEventDisplay.time || ''}
                      </div>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">{odometerLabel}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => setShowExtras(true)}
                      className="px-3 py-1.5 rounded-md border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs"
                    >
                      اطلاعات اضافی
                    </button>
                    {!!storedTours.length && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        تور ذخیره‌شده در بازه: {storedTours.length}
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showExtras && (resource || live) && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowExtras(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">اطلاعات اضافی GPS</h3>
              <button
                type="button"
                className="text-sm px-2 py-1 border rounded-md"
                onClick={() => setShowExtras(false)}
              >
                بستن
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div>پلاک: {resource?.plateNumber || 'ندارد'}</div>
                <div>مدل GPS: {resource?.gpsModelName || live?.name || 'ندارد'}</div>
                <div>گروه: {live?.groupName || 'ندارد'}</div>
                <div>وضعیت: {live?.statusLabel || 'ندارد'}</div>
                <div className="col-span-2">
                  نزدیک‌ترین حصار: {live?.nearestZoneName || 'ندارد'}
                </div>
                <div>سرعت لحظه‌ای: {live?.speed != null ? `${live.speed} km/h` : 'ندارد'}</div>
                <div>
                  سرعت چرخ:{' '}
                  {roundNum(live?.wheelSpeed, 4) != null
                    ? `${roundNum(live?.wheelSpeed, 4)} km/h`
                    : 'ندارد'}
                </div>
                <div className="col-span-2">
                  سیگنال: gpslev={val(live?.gpslev)} | hdop={val(live?.hdop)} | gsm={val(live?.gsmlev)}
                </div>
                <div className="col-span-2">کیلومترشمار: {odometerLabel}</div>
                <div>سطح باک: {val(live?.tankLevel, '%')}</div>
                <div>سوخت تجمعی: {val(live?.fuelTotal)}</div>
                <div>دمای موتور: {val(live?.engineTemp, '°C')}</div>
                <div>ساعت موتور: {val(live?.engineHours)}</div>
                <div className="col-span-2">آخرین رویداد: {lastEventLabel}</div>
                <div className="col-span-2">تور ذخیره‌شده در بازه: {storedTours.length}</div>
              </div>

              <div className="border-t pt-3">
                <div className="font-semibold text-slate-800 mb-2">هشدارهای لحظه‌ای</div>
                {live?.alerts?.length ? (
                  <ul className="space-y-1">
                    {live.alerts.map((a, i) => (
                      <li
                        key={`${a.type}-${i}`}
                        className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-amber-950"
                      >
                        {a.label}
                        {a.value != null && a.value !== '' ? `: ${String(a.value)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">هشداری نیست</div>
                )}
              </div>

              {capabilities?.hint && (
                <div className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded p-2">
                  {capabilities.hint}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {periodSummary && (
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-slate-800 text-sm">
            خلاصه عملکرد در بازه
            <span className="text-xs font-normal text-slate-500 mr-2">
              (پیمایش ترکیبی از انتخاب مالی هر تور: مصوب / CAN / GPS / مسیر)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 whitespace-nowrap">پیمایش ترکیبی</th>
                  <th className="p-2 whitespace-nowrap">تعداد تور</th>
                  <th className="p-2 whitespace-nowrap">مدت کل تور (دیواری)</th>
                  <th className="p-2 whitespace-nowrap">رانندگی</th>
                  <th className="p-2 whitespace-nowrap">توقف سرعتی</th>
                  <th className="p-2 whitespace-nowrap">توقف شعب (حصار)</th>
                  <th className="p-2 whitespace-nowrap">تراز زمان</th>
                  <th className="p-2 whitespace-nowrap">میانگین مصرف</th>
                  <th className="p-2 whitespace-nowrap">فاصله بین تورها</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t align-top">
                  <td className="p-2">
                    {periodSummary.mileageTotal != null ? (
                      <>
                        <div className="font-semibold text-slate-800">
                          {periodSummary.mileageTotal.toLocaleString('fa-IR')} km
                        </div>
                        <div className="text-[10px] text-slate-500 space-y-0.5 mt-1">
                          {Object.entries(periodSummary.mileageBySource).map(([src, km]) => (
                            <div key={src}>
                              {src}: {Number(km).toLocaleString('fa-IR')}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2 font-semibold">
                    {periodSummary.tourCount.toLocaleString('fa-IR')}
                  </td>
                  <td className="p-2">
                    <div className="font-semibold">{fmtHoursDays(periodSummary.hoursTotal)}</div>
                    <div className="text-[10px] text-slate-500 mt-1">شروع تا پایان تورها</div>
                  </td>
                  <td className="p-2">
                    <div className="font-semibold">{fmtHoursDays(periodSummary.drivingHours)}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {periodSummary.drivingPercent != null
                        ? `${periodSummary.drivingPercent.toLocaleString('fa-IR')}٪ از مدت کل`
                        : '—'}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="font-semibold">{fmtHoursDays(periodSummary.stopTotal)}</div>
                    <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                      <div>بین‌راهی: {fmtHoursDays(periodSummary.stopEnRoute)}</div>
                      <div>
                        خواب قانونی (خارج حصار): {fmtHoursDays(periodSummary.stopLegalOutside)}
                      </div>
                      <div>سرعتی داخل حصار: {fmtHoursDays(periodSummary.stopInsideFence)}</div>
                      {periodSummary.stopLegal != null &&
                        periodSummary.stopLegalOutside != null &&
                        periodSummary.stopLegal > periodSummary.stopLegalOutside + 0.05 && (
                          <div>
                            خواب کل (با داخل حصار): {fmtHoursDays(periodSummary.stopLegal)}
                          </div>
                        )}
                      <div className="text-slate-400">زیرمجموعه توقف سرعتی ≈۰</div>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="font-semibold">{fmtHoursDays(periodSummary.stopBranch)}</div>
                    <div className="text-[10px] text-amber-800 mt-0.5">
                      جدا از توقف سرعتی — ورود/خروج حصار
                    </div>
                    {periodSummary.branchBreakdown.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1 space-y-0.5 max-h-28 overflow-auto">
                        {periodSummary.branchBreakdown.slice(0, 8).map((b) => (
                          <div key={b.zone}>
                            {b.zone}: {fmtHoursDays(b.hours)}
                          </div>
                        ))}
                        {periodSummary.branchBreakdown.length > 8 && (
                          <div>و {periodSummary.branchBreakdown.length - 8} مورد دیگر…</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-2 min-w-[160px]">
                    <div>
                      رانندگی+توقف سرعتی:{' '}
                      <span className="font-semibold">
                        {fmtHoursDays(periodSummary.drivingPlusStop)}
                      </span>
                    </div>
                    <div className="mt-1">
                      طبقه‌بندی‌نشده:{' '}
                      <span
                        className={`font-semibold ${
                          periodSummary.unclassifiedHours != null &&
                          periodSummary.unclassifiedHours > 1
                            ? 'text-amber-800'
                            : ''
                        }`}
                      >
                        {fmtHoursDays(periodSummary.unclassifiedHours)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {periodSummary.classifiedPercent != null
                        ? `${periodSummary.classifiedPercent.toLocaleString('fa-IR')}٪ پوشش GPS`
                        : '—'}
                      <div className="mt-0.5">
                        = مدت کل − (رانندگی + توقف سرعتی)
                      </div>
                      <div className="text-slate-400">
                        معمولاً قطع سیگنال / فاصله زیاد نقاط / سرعت بین ۰ تا ۵
                      </div>
                    </div>
                  </td>
                  <td className="p-2">
                    {periodSummary.avgFuelL100 != null
                      ? `${periodSummary.avgFuelL100.toLocaleString('fa-IR')} L/100km`
                      : '—'}
                    {periodSummary.fuelUsedSum != null && (
                      <div className="text-[10px] text-slate-500">
                        سوخت کل: {periodSummary.fuelUsedSum.toLocaleString('fa-IR')}
                      </div>
                    )}
                  </td>
                  <td className="p-2 min-w-[200px]">
                    {periodSummary.gapAvg != null ? (
                      <div className="mb-1">
                        میانگین:{' '}
                        <span className="font-semibold">{fmtHoursDays(periodSummary.gapAvg)}</span>
                      </div>
                    ) : (
                      <div className="text-slate-400 mb-1">تور متوالی کافی نیست</div>
                    )}
                    {periodSummary.gaps.length > 0 && (
                      <div className="text-[10px] text-slate-600 space-y-1 max-h-32 overflow-auto">
                        {periodSummary.gaps.map((g, i) => (
                          <div key={i} className="bg-slate-50 border rounded px-1.5 py-1">
                            <div>
                              تور {i + 1} → {i + 2}:{' '}
                              <span className="font-medium text-slate-800">
                                {fmtHoursDays(g.hours)}
                              </span>
                            </div>
                            <div className="text-slate-500">
                              پایان {g.fromLabel}
                              {g.fromHub ? ` (${g.fromHub})` : ''}
                            </div>
                            <div className="text-slate-500">
                              شروع بعدی {g.toLabel}
                              {g.toHub ? ` (${g.toHub})` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-slate-800 text-sm">
          تخصیص‌های ترابری در بازه + آمار ذخیره‌شده مالی/GPS
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-2">تاریخ تور/تخصیص</th>
                <th className="p-2">لاین</th>
                <th className="p-2">راننده</th>
                <th className="p-2">خودرو</th>
                <th className="p-2">مقاصد تخصیص‌شده</th>
                <th className="p-2">وضعیت</th>
                <th className="p-2">حصارهای ویزیت‌شده (رسیدن / معطل)</th>
                <th className="p-2">مصوب/منبع</th>
                <th className="p-2">رانندگی</th>
                <th className="p-2">توقف</th>
                <th className="p-2">سوخت</th>
                <th className="p-2">سرعت غیرمجاز</th>
              </tr>
            </thead>
            <tbody>
              {!assignments.length && (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-slate-500">
                    هنوز نتیجه‌ای نیست — خودرو/راننده و بازه را جستجو کنید
                  </td>
                </tr>
              )}
              {assignments.map((a) => (
                <tr key={a.announcementId} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">
                    <div>
                      {a.gpsTour?.startDisplay?.jalali || a.assignmentDisplay?.jalali || '—'}{' '}
                      {a.gpsTour?.startDisplay?.time || a.assignmentDisplay?.time || ''}
                    </div>
                    {a.gpsTour?.endDisplay?.jalali && (
                      <div className="text-[10px] text-slate-500">
                        تا {a.gpsTour.endDisplay.jalali} {a.gpsTour.endDisplay.time || ''}
                      </div>
                    )}
                  </td>
                  <td className="p-2">{lineLabel(a.lineType)}</td>
                  <td className="p-2">{a.driverName || '—'}</td>
                  <td className="p-2">
                    {a.vehicleCode || '—'}
                    {a.vehiclePlate ? ` / ${a.vehiclePlate}` : ''}
                  </td>
                  <td className="p-2 min-w-[140px]">
                    {a.assignedDestinationsLabel ? (
                      <div className="space-y-0.5">
                        <div className="font-medium text-slate-800">{a.assignedDestinationsLabel}</div>
                        {(a.assignedDestinations || []).slice(0, 4).map((d, i) => (
                          <div key={i} className="text-[10px] text-slate-500">
                            {d.city}
                            {d.representativeName ? ` — ${d.representativeName}` : ''}
                            {d.tonnageKg != null ? ` (${d.tonnageKg} kg)` : ''}
                          </div>
                        ))}
                        {a.destinationMatchWeak && (
                          <div className="text-[10px] text-amber-700">
                            هشدار: مقاصد اعلام‌بار با حصارهای این تور هم‌خوان نیست
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">تخصیص متصل نشد</span>
                    )}
                  </td>
                  <td className="p-2">{a.status || '—'}</td>
                  <td className="p-2 min-w-[220px]">
                    {a.gpsTour ? (
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-500">
                          {a.gpsTour.startHub || '—'} → {a.gpsTour.endHub || '—'}
                        </div>
                        {(a.gpsTour.unloadStops || []).length ? (
                          (a.gpsTour.unloadStops || []).map((u, i) => (
                            <div key={i} className="bg-slate-50 border rounded px-1.5 py-1">
                              <div className="font-medium text-slate-800">{u.zone || '—'}</div>
                              <div className="text-[10px] text-slate-600">
                                رسیدن: {u.fromJalali || '—'}
                                {u.fromTime ? ` ${u.fromTime}` : ''}
                              </div>
                              <div className="text-[10px] text-slate-600">
                                خروج: {u.toJalali || '—'}
                                {u.toTime ? ` ${u.toTime}` : ''}
                              </div>
                              <div className="text-[10px] text-amber-800">
                                معطل در حصار: {u.hours != null ? `${u.hours} س` : '—'}
                                {u.legalHours != null && u.legalHours > 0
                                  ? ` (از این مقدار خواب ${u.legalHours} س)`
                                  : ''}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500">{a.gpsTour.unloadStations || '—'}</div>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">
                    {a.finance?.approvedKilometers != null
                      ? `${Number(a.finance.approvedKilometers).toLocaleString('fa-IR')} (مصوب)`
                      : a.gpsTour?.selectedMileage != null
                        ? `${a.gpsTour.selectedMileage} (${a.gpsTour.selectedSource || 'انتخاب'})`
                        : a.gpsTour?.mileageCan != null
                          ? `${a.gpsTour.mileageCan} (can)`
                          : '—'}
                  </td>
                  <td className="p-2">
                    {a.gpsTour?.drivingHours != null ? `${a.gpsTour.drivingHours} س` : '—'}
                  </td>
                  <td className="p-2">
                    {a.gpsTour?.stopTotalHours != null ? `${a.gpsTour.stopTotalHours} س` : '—'}
                    {a.gpsTour?.stopUnloadHours != null ? (
                      <div className="text-[10px] text-slate-500">
                        تخلیه {a.gpsTour.stopUnloadHours} س
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {a.gpsTour?.fuelUsedTotal != null
                      ? `${a.gpsTour.fuelUsedTotal}${
                          a.gpsTour.fuelLPer100Km != null ? ` (${a.gpsTour.fuelLPer100Km} L/100)` : ''
                        }`
                      : 'ندارد'}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {a.gpsTour?.overspeedRuleCount != null && a.gpsTour.overspeedRuleCount > 0
                      ? `${a.gpsTour.overspeedRuleCount} بار`
                      : a.gpsTour
                        ? '۰'
                        : '—'}
                    {a.gpsTour?.maxSpeed != null && a.gpsTour.maxSpeed > 0 ? (
                      <div className="text-[10px] text-rose-700">max {a.gpsTour.maxSpeed}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GpsLiveDashboardTab;
