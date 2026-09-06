import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiUrl } from '../utils/apiConfig';
import { gregorianToJalali, maskJalaliDateTyping } from '../utils/jalali';

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
    holdReason?: string;
    title?: string;
    templateId?: string | null;
    cashFine?: number | null;
    appliedAtJalali?: string;
};

type BanTemplate = {
    id: string;
    title: string;
    forbiddenProvinces: string[];
    exceptionCities: string[];
    holdReason?: string;
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

function toEnglishDigits(value: string) {
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    return String(value || '').replace(/[۰-۹٠-٩]/g, ch => {
        const p = persian.indexOf(ch);
        if (p >= 0) return String(p);
        const a = arabic.indexOf(ch);
        return a >= 0 ? String(a) : ch;
    });
}

function jalaliMonthLength(jy: number, jm: number) {
    if (jm >= 1 && jm <= 6) return 31;
    if (jm >= 7 && jm <= 11) return 30;
    const r = (((jy + 2346) * 682) % 2816) < 682;
    return r ? 30 : 29;
}

function validateTypedJalali(raw: string, label: string): { ok: true; value: string } | { ok: false; message: string } {
    const trimmed = toEnglishDigits(raw).trim().replace(/-/g, '/');
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
    if (!m) {
        return { ok: false, message: `${label} را به صورت 1404/01/15 وارد کنید.` };
    }
    const jy = Number(m[1]);
    const jm = Number(m[2]);
    const jd = Number(m[3]);
    if (jy < 1300 || jy > 1500) {
        return { ok: false, message: `${label} نامعتبر است: سال شمسی درست نیست.` };
    }
    if (jm < 1 || jm > 12) {
        return { ok: false, message: `${label} نامعتبر است: ماه باید بین ۱ تا ۱۲ باشد.` };
    }
    const maxDay = jalaliMonthLength(jy, jm);
    if (jd < 1 || jd > maxDay) {
        return { ok: false, message: `${label} نامعتبر است: این ماه حداکثر ${maxDay} روز دارد.` };
    }
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return { ok: true, value: `${jy}/${pad(jm)}/${pad(jd)}` };
}

function jalaliDateKey(value: string) {
    const m = toEnglishDigits(value)
        .replace(/-/g, '/')
        .trim()
        .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return '';
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${m[1]}${pad(Number(m[2]))}${pad(Number(m[3]))}`;
}

function todayJalaliDateKey() {
    const now = new Date();
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${jy}${pad(jm)}${pad(jd)}`;
}

function formatFine(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toLocaleString('fa-IR')} ریال`;
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

export default function BaleRegionBanPanel({
    drivers,
    canManage = false,
    hideExpired = false,
    hideChrome = false,
    tableMaxClass = 'max-h-56',
}: {
    drivers: DriverOption[];
    canManage?: boolean;
    hideExpired?: boolean;
    hideChrome?: boolean;
    tableMaxClass?: string;
}) {
    const [geo, setGeo] = useState<GeoCatalog>({ provinces: [], citiesByProvince: {} });
    const [bans, setBans] = useState<RegionBan[]>([]);
    const [templates, setTemplates] = useState<BanTemplate[]>([]);
    const [driverQuery, setDriverQuery] = useState('');
    const [driverOpen, setDriverOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null);
    const [templateId, setTemplateId] = useState('');
    const [cashFine, setCashFine] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [provinces, setProvinces] = useState<string[]>([]);
    const [cities, setCities] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [holdReason, setHoldReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);

    const loadBans = async () => {
        const res = await apiFetch(getApiUrl('bale/region-bans'));
        if (!res.ok) throw new Error(await readApiError(res));
        setBans((await res.json()) as RegionBan[]);
    };

    const loadTemplates = async () => {
        const res = await apiFetch(getApiUrl('bale/region-ban-templates'));
        if (!res.ok) throw new Error(await readApiError(res));
        setTemplates((await res.json()) as BanTemplate[]);
    };

    useEffect(() => {
        void (async () => {
            try {
                const tasks: Promise<unknown>[] = [loadBans()];
                if (canManage) {
                    tasks.push(loadTemplates());
                    tasks.push(
                        apiFetch(getApiUrl('bale/region-bans/geo')).then(async geoRes => {
                            if (geoRes.ok) {
                                setGeo((await geoRes.json()) as GeoCatalog);
                            }
                        })
                    );
                }
                await Promise.all(tasks);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'خطا در بارگذاری محدودیت‌ها');
            }
        })();
    }, [canManage]);

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

    const selectedTemplate = templates.find(t => t.id === templateId) || null;

    const visibleBans = useMemo(() => {
        if (!hideExpired) return bans;
        const today = todayJalaliDateKey();
        return bans.filter(ban => {
            const end = jalaliDateKey(ban.endDate);
            return Boolean(end && end >= today);
        });
    }, [bans, hideExpired]);

    const resetAssignForm = () => {
        setEditingId(null);
        setSelectedDriver(null);
        setDriverQuery('');
        setTemplateId('');
        setCashFine('');
        setStartDate('');
        setEndDate('');
    };

    const resetDialog = () => {
        setEditingTemplateId(null);
        setTitle('');
        setProvinces([]);
        setCities([]);
        setHoldReason('');
        setDialogError(null);
    };

    const openCreateDialog = () => {
        resetDialog();
        setDialogOpen(true);
    };

    const openEditTemplate = (template: BanTemplate) => {
        setEditingTemplateId(template.id);
        setTitle(template.title);
        setProvinces(template.forbiddenProvinces);
        setCities(template.exceptionCities);
        setHoldReason(template.holdReason || '');
        setDialogError(null);
        setDialogOpen(true);
    };

    const saveTemplate = async () => {
        setDialogError(null);
        setBusy(true);
        try {
            const res = await apiFetch(
                editingTemplateId
                    ? getApiUrl(`bale/region-ban-templates/${editingTemplateId}`)
                    : getApiUrl('bale/region-ban-templates'),
                {
                    method: editingTemplateId ? 'PUT' : 'POST',
                    body: JSON.stringify({
                        title,
                        forbiddenProvinces: provinces,
                        exceptionCities: cities,
                        holdReason,
                    }),
                }
            );
            if (!res.ok) throw new Error(await readApiError(res));
            await loadTemplates();
            setDialogOpen(false);
            resetDialog();
        } catch (e) {
            setDialogError(e instanceof Error ? e.message : 'ثبت ناموفق بود');
        } finally {
            setBusy(false);
        }
    };

    const removeTemplate = async (id: string) => {
        setBusy(true);
        setDialogError(null);
        try {
            const res = await apiFetch(getApiUrl(`bale/region-ban-templates/${id}`), { method: 'DELETE' });
            if (!res.ok) throw new Error(await readApiError(res));
            await loadTemplates();
            if (templateId === id) setTemplateId('');
            if (editingTemplateId === id) resetDialog();
        } catch (e) {
            setDialogError(e instanceof Error ? e.message : 'حذف ناموفق بود');
        } finally {
            setBusy(false);
        }
    };

    const startEditBan = (ban: RegionBan) => {
        setError(null);
        setEditingId(ban.id);
        setSelectedDriver({
            driver_id: ban.driverId,
            driver_name: ban.driverName,
            employee_id: ban.employeeId,
        });
        setDriverQuery('');
        setTemplateId(ban.templateId || '');
        setCashFine(ban.cashFine != null ? String(ban.cashFine) : '');
        setStartDate(ban.startDate || '');
        setEndDate(ban.endDate || '');
    };

    const saveBan = async () => {
        setError(null);
        if (!selectedDriver) {
            setError('راننده را انتخاب کنید.');
            return;
        }
        if (!templateId) {
            setError('یک اعمال محدودیت از دیالوگ تعریف‌شده انتخاب کنید.');
            return;
        }
        const startCheck = validateTypedJalali(startDate, 'تاریخ شروع');
        if (!startCheck.ok) {
            setError(startCheck.message);
            return;
        }
        const endCheck = validateTypedJalali(endDate, 'تاریخ پایان');
        if (!endCheck.ok) {
            setError(endCheck.message);
            return;
        }
        if (startCheck.value > endCheck.value) {
            setError('تاریخ شروع نباید بعد از پایان باشد.');
            return;
        }
        setBusy(true);
        try {
            const res = await apiFetch(
                editingId ? getApiUrl(`bale/region-bans/${editingId}`) : getApiUrl('bale/region-bans'),
                {
                    method: editingId ? 'PUT' : 'POST',
                    body: JSON.stringify({
                        driverId: selectedDriver.driver_id,
                        templateId,
                        startDate: startCheck.value,
                        endDate: endCheck.value,
                        cashFine: cashFine.trim() || null,
                    }),
                }
            );
            if (!res.ok) throw new Error(await readApiError(res));
            await loadBans();
            resetAssignForm();
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
            if (editingId === id) resetAssignForm();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'حذف ناموفق بود');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={hideChrome ? 'space-y-3' : 'rounded-xl border border-slate-200 bg-white p-4 space-y-3'}>
            {!hideChrome && (
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="font-semibold text-slate-700">محدودیت استان/شهر راننده</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        {canManage
                            ? 'اول اعمال محدودیت را تعریف کنید؛ بازه زمانی را هنگام تخصیص به هر راننده جدا وارد کنید.'
                            : 'این جدول فقط برای مشاهده است. ثبت و ویرایش اعمال محدودیت در کارتابل بازرسی انجام می‌شود.'}
                    </p>
                </div>
                {canManage && (
                    <button
                        type="button"
                        onClick={openCreateDialog}
                        className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm"
                    >
                        تعریف اعمال محدودیت
                    </button>
                )}
            </div>
            )}

            {canManage && (
            <div className="grid md:grid-cols-2 gap-3">
                <label className="text-xs block relative">
                    راننده (نام یا کد پرسنلی)
                    <input
                        className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                        placeholder="جستجو..."
                        value={
                            selectedDriver
                                ? `${selectedDriver.driver_name || ''} — ${selectedDriver.employee_id || ''}`
                                : driverQuery
                        }
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
                <label className="text-xs block">
                    اعمال محدودیت
                    <select
                        className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm bg-white"
                        value={templateId}
                        onChange={e => setTemplateId(e.target.value)}
                    >
                        <option value="">انتخاب کنید...</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>
                                {t.title}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs block">
                        شروع بازه (تایپ شمسی)
                        <input
                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                            dir="ltr"
                            placeholder="1404/01/01"
                            value={startDate}
                            onChange={e => setStartDate(maskJalaliDateTyping(e.target.value))}
                        />
                    </label>
                    <label className="text-xs block">
                        پایان بازه (تایپ شمسی)
                        <input
                            className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                            dir="ltr"
                            placeholder="1404/01/20"
                            value={endDate}
                            onChange={e => setEndDate(maskJalaliDateTyping(e.target.value))}
                        />
                    </label>
                </div>
                <label className="text-xs block">
                    جریمه نقدی (ریال — اختیاری)
                    <input
                        className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                        inputMode="numeric"
                        placeholder="خالی = بدون جریمه"
                        value={cashFine}
                        onChange={e => setCashFine(e.target.value.replace(/[^\d]/g, ''))}
                    />
                </label>
                {selectedTemplate && (
                    <div className="text-[11px] text-slate-600 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div>استان غیرمجاز: {selectedTemplate.forbiddenProvinces.join('، ') || '—'}</div>
                        <div>شهر مستثنی: {selectedTemplate.exceptionCities.join('، ') || '—'}</div>
                        <div>توضیحات: {selectedTemplate.holdReason || '—'}</div>
                    </div>
                )}
            </div>
            )}

            {error && <div className="text-xs text-red-600">{error}</div>}

            {canManage && (
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveBan()}
                    className="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm disabled:opacity-50"
                >
                    {editingId ? 'ذخیره تخصیص' : 'تخصیص به راننده'}
                </button>
                {editingId && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={resetAssignForm}
                        className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 disabled:opacity-50"
                    >
                        انصراف
                    </button>
                )}
            </div>
            )}

            <div className={`overflow-x-auto border rounded-lg overflow-y-auto ${tableMaxClass}`}>
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="text-right p-2">راننده</th>
                            <th className="text-right p-2">عنوان اعمال</th>
                            <th className="text-right p-2">استان غیرمجاز</th>
                            <th className="text-right p-2">بازه</th>
                            <th className="text-right p-2">تاریخ اعمال</th>
                            <th className="text-right p-2">توضیحات</th>
                            <th className="text-right p-2">جریمه نقدی</th>
                            {canManage && <th className="p-2 w-28" />}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleBans.length === 0 ? (
                            <tr>
                                <td colSpan={canManage ? 8 : 7} className="p-3 text-slate-400">
                                    {hideExpired
                                        ? 'محدودیت فعالی برای نمایش وجود ندارد.'
                                        : 'هنوز محدودیتی به راننده‌ای تخصیص نشده است.'}
                                </td>
                            </tr>
                        ) : (
                            visibleBans.map(ban => (
                                <tr
                                    key={ban.id}
                                    className={`border-t border-slate-100 ${
                                        editingId === ban.id ? 'bg-sky-50' : ''
                                    }`}
                                >
                                    <td className="p-2">
                                        {ban.driverName || '—'}
                                        <div className="text-slate-400">{ban.employeeId}</div>
                                    </td>
                                    <td className="p-2 font-medium">{ban.title || '—'}</td>
                                    <td className="p-2">{ban.forbiddenProvinces.join('، ') || '—'}</td>
                                    <td className="p-2 whitespace-nowrap">
                                        {ban.startDate} تا {ban.endDate}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">{ban.appliedAtJalali || '—'}</td>
                                    <td className="p-2">{ban.holdReason || '—'}</td>
                                    <td className="p-2 whitespace-nowrap">{formatFine(ban.cashFine)}</td>
                                    {canManage && (
                                    <td className="p-2">
                                        <div className="flex flex-wrap gap-1.5 justify-end">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => startEditBan(ban)}
                                                className="text-sky-700 hover:underline disabled:opacity-50"
                                            >
                                                ویرایش
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => void removeBan(ban.id)}
                                                className="text-red-600 hover:underline disabled:opacity-50"
                                            >
                                                حذف
                                            </button>
                                        </div>
                                    </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {canManage && dialogOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-10"
                    onClick={() => {
                        setDialogOpen(false);
                        resetDialog();
                    }}
                >
                    <div
                        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto p-5 space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">
                                {editingTemplateId ? 'ویرایش اعمال محدودیت' : 'تعریف اعمال محدودیت'}
                            </h3>
                            <button
                                type="button"
                                className="text-sm text-slate-500"
                                onClick={() => {
                                    setDialogOpen(false);
                                    resetDialog();
                                }}
                            >
                                بستن
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            عنوان، استان‌های غیرمجاز و توضیحات را بنویسید. بازه زمانی مال هر راننده است و اینجا نیست.
                        </p>
                        <label className="text-xs block">
                            عنوان اعمال محدودیت
                            <input
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                placeholder="مثلاً محدودیت نوروز — فروردین ۱ تا ۲۰"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                maxLength={120}
                            />
                        </label>
                        <div className="grid md:grid-cols-2 gap-3">
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
                            <label className="text-xs block md:col-span-2">
                                توضیحات
                                <textarea
                                    className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm min-h-[64px]"
                                    placeholder="مثلاً محدودیت مسیر استان، درخواست راننده..."
                                    value={holdReason}
                                    onChange={e => setHoldReason(e.target.value)}
                                    maxLength={400}
                                />
                            </label>
                        </div>
                        {dialogError && <div className="text-xs text-red-600">{dialogError}</div>}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveTemplate()}
                                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50"
                            >
                                {editingTemplateId ? 'ذخیره ویرایش' : 'ذخیره اعمال محدودیت'}
                            </button>
                            {editingTemplateId && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={resetDialog}
                                    className="px-3 py-1.5 rounded-md border text-sm"
                                >
                                    اعمال جدید
                                </button>
                            )}
                        </div>
                        <div className="border-t pt-3">
                            <div className="text-xs font-medium text-slate-700 mb-2">اعمال‌های ذخیره‌شده</div>
                            {templates.length === 0 ? (
                                <div className="text-xs text-slate-400">هنوز موردی تعریف نشده.</div>
                            ) : (
                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {templates.map(t => (
                                        <div
                                            key={t.id}
                                            className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-[11px]"
                                        >
                                            <div>
                                                <div className="font-medium text-slate-800">{t.title}</div>
                                                <div className="text-slate-500">
                                                    {t.forbiddenProvinces.join('، ')}
                                                    {t.holdReason ? ` · ${t.holdReason}` : ''}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    className="text-sky-700"
                                                    onClick={() => openEditTemplate(t)}
                                                >
                                                    ویرایش
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-red-600"
                                                    onClick={() => void removeTemplate(t.id)}
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
