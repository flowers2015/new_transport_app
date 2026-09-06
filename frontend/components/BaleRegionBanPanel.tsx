import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiUrl } from '../utils/apiConfig';
import JalaliDateInput from './JalaliDateInput';

type DriverOption = {
    driver_id: string;
    driver_name?: string | null;
    employee_id?: string | null;
};

type RegionBan = {
    id: string;
    driverId: string;
    driverName?: string | null;
    employeeId?: string | null;
    forbiddenProvinces: string[];
    exceptionCities: string[];
    startDate: string;
    endDate: string;
};

type GeoCatalog = {
    provinces: string[];
    citiesByProvince: Record<string, string[]>;
};

function normalizeQuery(value: string) {
    return value.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
}

async function readApiError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message || res.statusText || 'خطا';
}

function SearchMulti({
    items,
    value,
    onChange,
    placeholder,
}: {
    items: string[];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const filtered = useMemo(() => {
        const q = normalizeQuery(query);
        return items
            .filter(item => !value.includes(item))
            .filter(item => !q || normalizeQuery(item).includes(q))
            .slice(0, 20);
    }, [items, query, value]);

    return (
        <div className="relative">
            <div className="flex flex-wrap gap-1 mb-1 min-h-[22px]">
                {value.map(item => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => onChange(value.filter(v => v !== item))}
                        className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700"
                    >
                        {item} ×
                    </button>
                ))}
            </div>
            <input
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder={placeholder}
                value={query}
                onChange={e => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 180)}
            />
            {open && filtered.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-white shadow">
                    {filtered.map(item => (
                        <button
                            key={item}
                            type="button"
                            className="block w-full text-right px-2 py-1.5 text-sm hover:bg-slate-50"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                onChange([...value, item]);
                                setQuery('');
                            }}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function BaleRegionBanPanel({ drivers }: { drivers: DriverOption[] }) {
    const [geo, setGeo] = useState<GeoCatalog>({ provinces: [], citiesByProvince: {} });
    const [bans, setBans] = useState<RegionBan[]>([]);
    const [driverQuery, setDriverQuery] = useState('');
    const [driverOpen, setDriverOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null);
    const [provinces, setProvinces] = useState<string[]>([]);
    const [cities, setCities] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadBans = async () => {
        const res = await apiFetch(getApiUrl('bale/region-bans'));
        if (!res.ok) throw new Error(await readApiError(res));
        setBans((await res.json()) as RegionBan[]);
    };

    useEffect(() => {
        void (async () => {
            try {
                const [geoRes] = await Promise.all([
                    apiFetch(getApiUrl('bale/region-bans/geo')),
                    loadBans(),
                ]);
                if (geoRes.ok) {
                    setGeo((await geoRes.json()) as GeoCatalog);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'خطا در بارگذاری محدودیت‌ها');
            }
        })();
    }, []);

    const driverMatches = useMemo(() => {
        const q = normalizeQuery(driverQuery);
        if (!q) return drivers.slice(0, 12);
        return drivers
            .filter(d => {
                const name = normalizeQuery(d.driver_name || '');
                const emp = normalizeQuery(d.employee_id || '');
                return name.includes(q) || emp.includes(q);
            })
            .slice(0, 12);
    }, [drivers, driverQuery]);

    const exceptionCityOptions = useMemo(() => {
        const set = new Set<string>();
        for (const province of provinces) {
            for (const city of geo.citiesByProvince[province] || []) set.add(city);
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'fa'));
    }, [geo.citiesByProvince, provinces]);

    useEffect(() => {
        setCities(prev => prev.filter(city => exceptionCityOptions.includes(city)));
    }, [exceptionCityOptions]);

    const addBan = async () => {
        setError(null);
        if (!selectedDriver) {
            setError('راننده را انتخاب کنید.');
            return;
        }
        setBusy(true);
        try {
            const res = await apiFetch(getApiUrl('bale/region-bans'), {
                method: 'POST',
                body: JSON.stringify({
                    driverId: selectedDriver.driver_id,
                    forbiddenProvinces: provinces,
                    exceptionCities: cities,
                    startDate,
                    endDate,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            await loadBans();
            setSelectedDriver(null);
            setDriverQuery('');
            setProvinces([]);
            setCities([]);
            setStartDate('');
            setEndDate('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'ثبت ناموفق بود');
        } finally {
            setBusy(false);
        }
    };

    const removeBan = async (id: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await apiFetch(getApiUrl(`bale/region-bans/${id}`), { method: 'DELETE' });
            if (!res.ok) throw new Error(await readApiError(res));
            setBans(prev => prev.filter(b => b.id !== id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'حذف ناموفق بود');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div>
                <h2 className="font-semibold text-slate-700">محدودیت استان/شهر راننده</h2>
                <p className="text-xs text-slate-500 mt-1">
                    استان‌های غیرمجاز در نوبت خصوصی راننده از لیست حذف می‌شوند. شهرهای مستثنی همان استان
                    همچنان می‌آیند. لیست گروه کامل می‌ماند.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
                <label className="text-xs block relative">
                    راننده (نام یا کد پرسنلی)
                    <input
                        className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                        placeholder="جستجو..."
                        value={selectedDriver ? `${selectedDriver.driver_name || ''} — ${selectedDriver.employee_id || ''}` : driverQuery}
                        onChange={e => {
                            setSelectedDriver(null);
                            setDriverQuery(e.target.value);
                            setDriverOpen(true);
                        }}
                        onFocus={() => setDriverOpen(true)}
                        onBlur={() => setTimeout(() => setDriverOpen(false), 180)}
                    />
                    {driverOpen && !selectedDriver && (
                        <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto rounded-md border bg-white shadow">
                            {driverMatches.length === 0 ? (
                                <div className="px-2 py-2 text-xs text-slate-400">موردی نیست</div>
                            ) : (
                                driverMatches.map(d => (
                                    <button
                                        key={d.driver_id}
                                        type="button"
                                        className="block w-full text-right px-2 py-1.5 text-sm hover:bg-slate-50"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            setSelectedDriver(d);
                                            setDriverQuery('');
                                            setDriverOpen(false);
                                        }}
                                    >
                                        {d.driver_name || '—'}{' '}
                                        <span className="text-slate-400 text-xs">{d.employee_id}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </label>
                <div className="text-xs">
                    استان‌های غیرمجاز
                    <div className="mt-1">
                        <SearchMulti
                            items={geo.provinces}
                            value={provinces}
                            onChange={setProvinces}
                            placeholder="جستجو و انتخاب چند استان"
                        />
                    </div>
                </div>
                <div className="text-xs">
                    شهرهای مستثنی (از همین استان‌ها)
                    <div className="mt-1">
                        <SearchMulti
                            items={exceptionCityOptions}
                            value={cities}
                            onChange={setCities}
                            placeholder={
                                provinces.length ? 'جستجو و انتخاب چند شهر' : 'اول استان را انتخاب کنید'
                            }
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs block">
                        شروع بازه
                        <div className="mt-1">
                            <JalaliDateInput
                                value={startDate}
                                onChange={setStartDate}
                                className="w-full border rounded-md px-2 py-1.5 text-sm"
                            />
                        </div>
                    </label>
                    <label className="text-xs block">
                        پایان بازه
                        <div className="mt-1">
                            <JalaliDateInput
                                value={endDate}
                                onChange={setEndDate}
                                className="w-full border rounded-md px-2 py-1.5 text-sm"
                            />
                        </div>
                    </label>
                </div>
            </div>

            {error && <div className="text-xs text-red-600">{error}</div>}

            <button
                type="button"
                disabled={busy}
                onClick={() => void addBan()}
                className="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm disabled:opacity-50"
            >
                + افزودن
            </button>

            <div className="overflow-x-auto border rounded-lg max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="text-right p-2">راننده</th>
                            <th className="text-right p-2">استان غیرمجاز</th>
                            <th className="text-right p-2">شهر مستثنی</th>
                            <th className="text-right p-2">بازه</th>
                            <th className="p-2 w-16" />
                        </tr>
                    </thead>
                    <tbody>
                        {bans.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-3 text-slate-400">
                                    محدودیتی ثبت نشده است.
                                </td>
                            </tr>
                        ) : (
                            bans.map(ban => (
                                <tr key={ban.id} className="border-t border-slate-100">
                                    <td className="p-2">
                                        {ban.driverName || '—'}
                                        <div className="text-slate-400">{ban.employeeId}</div>
                                    </td>
                                    <td className="p-2">{ban.forbiddenProvinces.join('، ') || '—'}</td>
                                    <td className="p-2">{ban.exceptionCities.join('، ') || '—'}</td>
                                    <td className="p-2 whitespace-nowrap">
                                        {ban.startDate} تا {ban.endDate}
                                    </td>
                                    <td className="p-2">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void removeBan(ban.id)}
                                            className="text-red-600 hover:underline disabled:opacity-50"
                                        >
                                            حذف
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
