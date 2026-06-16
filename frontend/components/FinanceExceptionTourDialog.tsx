import React, { useEffect, useRef, useState } from 'react';
import { Driver, FreightAnnouncement, Vehicle } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import CityAutocomplete from './CityAutocomplete';
import {
    CompanyDriverSelect,
    CompanyVehicleSelect,
    CompanyDriverSelectHandle,
    CompanyVehicleSelectHandle,
} from './CompanyResourceSelect';

const FINANCE_EXCEPTION_LAST_SELECTION_KEY = 'finance_exception_last_selection';

/** همان گزینه‌های اعلام بار — مبنای محاسبه پورسانت/اجرت */
export const CALCULATION_VEHICLE_TYPES = [
    'تریلی',
    'مینی تریلی',
    'ده چرخ',
    'تک',
    'مینی تک',
    'خاور',
] as const;

export type FinanceExceptionDestinationRow = {
    city: string;
    cityValid: boolean;
    roundTripKm?: number;
};

export type FinanceExceptionFormState = {
    lineType: string;
    vehicleType: string;
    driverId: string;
    vehicleId: string;
    loadingDate: string;
    billOfLadingNumber: string;
    billOfLadingDate: string;
    destinations: FinanceExceptionDestinationRow[];
};

const emptyDestRow = (): FinanceExceptionDestinationRow => ({
    city: '',
    cityValid: false,
});

const LINE_OPTIONS = [
    { value: 'بستنی', label: 'بستنی' },
    { value: 'پاستوریزه', label: 'پاستوریزه' },
    { value: 'لبنیات-فروتلند', label: 'لبنیات-فروتلند' },
];

type FinanceExceptionPrefill = {
    driverId?: string;
    vehicleId?: string;
    lineType?: string;
    vehicleType?: string;
};

function readLastFinanceExceptionSelection(): FinanceExceptionPrefill | null {
    try {
        const raw = localStorage.getItem(FINANCE_EXCEPTION_LAST_SELECTION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed as FinanceExceptionPrefill;
    } catch {
        return null;
    }
}

function writeLastFinanceExceptionSelection(selection: FinanceExceptionPrefill) {
    try {
        localStorage.setItem(FINANCE_EXCEPTION_LAST_SELECTION_KEY, JSON.stringify(selection));
    } catch {
        // ignore
    }
}

type Props = {
    open: boolean;
    onClose: () => void;
    drivers: Driver[];
    vehicles: Vehicle[];
    editAnnouncement?: FreightAnnouncement | null;
    rejectedFromAnnouncementId?: string | null;
    initialPrefill?: FinanceExceptionPrefill | null;
    onSaved: (
        savedAnnouncement?: FreightAnnouncement,
        savedDestinations?: Array<{ city: string; roundTripKm?: number }>
    ) => void | Promise<void>;
};

const FinanceExceptionTourDialog: React.FC<Props> = ({
    open,
    onClose,
    drivers,
    vehicles,
    editAnnouncement,
    rejectedFromAnnouncementId,
    initialPrefill,
    onSaved,
}) => {
    const isEdit = Boolean(editAnnouncement?.id);
    const locked = Boolean(
        (editAnnouncement as any)?.finance_exception_metadata_locked ||
            (editAnnouncement as any)?.financeExceptionMetadataLocked
    );

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const driverSelectRef = useRef<CompanyDriverSelectHandle>(null);
    const vehicleSelectRef = useRef<CompanyVehicleSelectHandle>(null);
    const [form, setForm] = useState<FinanceExceptionFormState>({
        lineType: 'پاستوریزه',
        vehicleType: '',
        driverId: '',
        vehicleId: '',
        loadingDate: '',
        billOfLadingNumber: '',
        billOfLadingDate: '',
        destinations: [emptyDestRow()],
    });

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editAnnouncement) {
            const dests =
                editAnnouncement.destinations?.length > 0
                    ? editAnnouncement.destinations.map((d) => ({
                          city: d.city || '',
                          cityValid: Boolean(d.city?.trim()),
                      }))
                    : [emptyDestRow()];
            const raw = editAnnouncement as any;
            const savedType =
                editAnnouncement.vehicleType ||
                raw.vehicle_type ||
                '';
            const normalizedType = CALCULATION_VEHICLE_TYPES.includes(savedType as any)
                ? savedType
                : '';
            setForm({
                lineType: (editAnnouncement.lineType as string) || raw.line_type || 'پاستوریزه',
                vehicleType: normalizedType,
                driverId: editAnnouncement.assignedDriverId || raw.assigned_driver_id || '',
                vehicleId: editAnnouncement.assignedVehicleId || raw.assigned_vehicle_id || '',
                loadingDate:
                    typeof editAnnouncement.loadingDate === 'string'
                        ? editAnnouncement.loadingDate
                        : typeof raw.loading_date === 'string'
                          ? raw.loading_date
                          : '',
                billOfLadingNumber:
                    editAnnouncement.billOfLadingNumber || raw.bill_of_lading_number || '',
                billOfLadingDate: raw.bill_of_lading_date || raw.billOfLadingDate || '',
                destinations: dests,
            });
        } else {
            const last = readLastFinanceExceptionSelection();
            const vt = initialPrefill?.vehicleType || last?.vehicleType || '';
            const normalizedType = CALCULATION_VEHICLE_TYPES.includes(vt as any) ? vt : '';
            setForm({
                lineType: initialPrefill?.lineType || last?.lineType || 'پاستوریزه',
                vehicleType: normalizedType,
                driverId: initialPrefill?.driverId || last?.driverId || '',
                vehicleId: initialPrefill?.vehicleId || last?.vehicleId || '',
                loadingDate: '',
                billOfLadingNumber: '',
                billOfLadingDate: '',
                destinations: [emptyDestRow()],
            });
        }
    }, [open, editAnnouncement, initialPrefill]);

    const updateDestCity = (
        index: number,
        city: string,
        cityValid: boolean,
        roundTripKm?: number
    ) => {
        setForm((prev) => {
            const destinations = [...prev.destinations];
            destinations[index] = {
                city,
                cityValid,
                roundTripKm: roundTripKm ?? destinations[index]?.roundTripKm,
            };
            return { ...prev, destinations };
        });
    };

    const buildPayload = () => ({
        lineType: form.lineType,
        vehicleType: form.vehicleType.trim(),
        driverId: form.driverId,
        vehicleId: form.vehicleId,
        loadingDate: form.loadingDate.trim() || undefined,
        billOfLadingNumber: form.billOfLadingNumber.trim() || undefined,
        billOfLadingDate: form.billOfLadingDate.trim() || undefined,
        destinations: form.destinations
            .filter((d) => d.city.trim())
            .map((d) => ({
                city: d.city.trim(),
                ...(d.roundTripKm && d.roundTripKm > 0 ? { roundTripKm: d.roundTripKm } : {}),
            })),
        ...(rejectedFromAnnouncementId && !isEdit
            ? { rejectedFromAnnouncementId }
            : {}),
    });

    const handleSave = async () => {
        const resolvedDriverId = driverSelectRef.current?.resolvePending() || form.driverId;
        const resolvedVehicleId =
            (await vehicleSelectRef.current?.resolvePending()) || form.vehicleId;

        if (resolvedDriverId !== form.driverId || resolvedVehicleId !== form.vehicleId) {
            setForm((prev) => ({
                ...prev,
                driverId: resolvedDriverId,
                vehicleId: resolvedVehicleId,
            }));
        }

        if (!resolvedDriverId || !resolvedVehicleId) {
            setError(
                'انتخاب راننده و خودرو شرکتی الزامی است — لطفاً از لیست پیشنهادها انتخاب کنید (فقط تایپ کردن کافی نیست).'
            );
            return;
        }
        if (!form.vehicleType.trim()) {
            setError('انتخاب نوع خودرو (مبنای محاسبه) الزامی است.');
            return;
        }
        const withCity = form.destinations.filter((d) => d.city.trim());
        if (withCity.some((d) => !d.cityValid)) {
            setError('شهر مقصد را از لیست پیشنهادها انتخاب کنید.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            const payload = {
                ...buildPayload(),
                driverId: resolvedDriverId,
                vehicleId: resolvedVehicleId,
            };
            const url = isEdit
                ? getApiUrl(`freight-announcements/${editAnnouncement!.id}/finance-exception`)
                : getApiUrl('freight-announcements/finance-exception');
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'خطا در ذخیره');

            if (!isEdit) {
                writeLastFinanceExceptionSelection({
                    driverId: resolvedDriverId,
                    vehicleId: resolvedVehicleId,
                    lineType: form.lineType,
                    vehicleType: form.vehicleType,
                });
            }

            await onSaved(data.announcement, payload.destinations);
            onClose();
        } catch (e: any) {
            setError(e.message || 'خطا در ذخیره');
        } finally {
            setSaving(false);
        }
    };

    const handleFinalizeMetadata = async () => {
        if (!editAnnouncement?.id) return;
        if (
            !window.confirm(
                'اطلاعات پایه این تور قفل شود؟ بعد از این فقط از طریق «ثبت اطلاعات» محاسباتی قابل تکمیل است.'
            )
        ) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                getApiUrl(`freight-announcements/${editAnnouncement.id}/finance-exception/finalize-metadata`),
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'خطا در نهایی‌سازی');
            await onSaved(data.announcement);
            onClose();
        } catch (e: any) {
            setError(e.message || 'خطا در نهایی‌سازی');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 border-b flex justify-between items-start gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            {isEdit ? 'ویرایش تور استثنایی' : 'ثبت تور استثنایی (خارج از روال)'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            خط، نوع خودرو (مبنای محاسبه)، راننده و خودرو شرکتی الزامی است. جستجوی خودرو فقط
                            برای پلاک/کد است — نوع محاسباتی را جدا انتخاب کنید.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">
                        ×
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {locked && (
                        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                            اطلاعات پایه نهایی شده و قابل ویرایش نیست.
                        </div>
                    )}
                    {error && (
                        <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="text-slate-700 font-medium">خط *</span>
                            <select
                                disabled={locked}
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                value={form.lineType}
                                onChange={(e) => setForm((f) => ({ ...f, lineType: e.target.value }))}
                            >
                                {LINE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm">
                            <span className="text-slate-700 font-medium">نوع خودرو (مبنای محاسبه) *</span>
                            <select
                                disabled={locked}
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                value={form.vehicleType}
                                onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
                                required
                            >
                                <option value="">— انتخاب کنید —</option>
                                {CALCULATION_VEHICLE_TYPES.map((vt) => (
                                    <option key={vt} value={vt}>
                                        {vt}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm md:col-span-2">
                            <span className="text-slate-700 font-medium">راننده شرکتی *</span>
                            <div className="mt-1">
                                <CompanyDriverSelect
                                    ref={driverSelectRef}
                                    drivers={drivers}
                                    driverId={form.driverId}
                                    onSelect={(id) => setForm((f) => ({ ...f, driverId: id }))}
                                    disabled={locked}
                                />
                            </div>
                        </label>
                        <label className="block text-sm md:col-span-2">
                            <span className="text-slate-700 font-medium">خودرو شرکتی (پلاک / کد) *</span>
                            <div className="mt-1">
                                <CompanyVehicleSelect
                                    ref={vehicleSelectRef}
                                    vehicles={vehicles}
                                    vehicleId={form.vehicleId}
                                    onSelect={(id) => setForm((f) => ({ ...f, vehicleId: id }))}
                                    disabled={locked}
                                />
                            </div>
                        </label>
                        <label className="block text-sm">
                            <span className="text-slate-700">تاریخ بارگیری (اختیاری)</span>
                            <input
                                disabled={locked}
                                placeholder="1404/06/01"
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                value={form.loadingDate}
                                onChange={(e) => setForm((f) => ({ ...f, loadingDate: e.target.value }))}
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="text-slate-700">شماره بارنامه (اختیاری)</span>
                            <input
                                disabled={locked}
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                                value={form.billOfLadingNumber}
                                onChange={(e) => setForm((f) => ({ ...f, billOfLadingNumber: e.target.value }))}
                            />
                        </label>
                        <label className="block text-sm md:col-span-2">
                            <span className="text-slate-700">تاریخ بارنامه (اختیاری)</span>
                            <input
                                disabled={locked}
                                placeholder="1404/06/01"
                                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm max-w-xs"
                                value={form.billOfLadingDate}
                                onChange={(e) => setForm((f) => ({ ...f, billOfLadingDate: e.target.value }))}
                            />
                        </label>
                    </div>

                    <div className="overflow-visible">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-800">مقاصد (اختیاری)</h3>
                            {!locked && (
                                <button
                                    type="button"
                                    className="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                                    onClick={() =>
                                        setForm((f) => ({
                                            ...f,
                                            destinations:
                                                f.destinations.length < 4
                                                    ? [...f.destinations, emptyDestRow()]
                                                    : f.destinations,
                                        }))
                                    }
                                    disabled={form.destinations.length >= 4}
                                >
                                    + مقصد
                                </button>
                            )}
                        </div>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-600">
                                    <th className="border px-2 py-1 w-8 text-center">#</th>
                                    <th className="border px-2 py-1 text-right">شهر مقصد</th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.destinations.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="border px-2 py-1 text-center text-slate-500">{idx + 1}</td>
                                        <td className="border px-2 py-1 overflow-visible">
                                            <CityAutocomplete
                                                value={row.city}
                                                onChange={(city) => updateDestCity(idx, city, !!city.trim())}
                                                onRouteSelect={(option) =>
                                                    updateDestCity(
                                                        idx,
                                                        option.city,
                                                        true,
                                                        option.roundTripKm != null
                                                            ? Number(option.roundTripKm)
                                                            : undefined
                                                    )
                                                }
                                                onValidityChange={(valid) => {
                                                    setForm((prev) => {
                                                        const destinations = [...prev.destinations];
                                                        destinations[idx] = {
                                                            ...destinations[idx],
                                                            cityValid: valid,
                                                        };
                                                        return { ...prev, destinations };
                                                    });
                                                }}
                                                requireSelection
                                                inModal
                                                disabled={locked}
                                                placeholder="نام شهر را تایپ کنید..."
                                                className="w-full border rounded px-2 py-1 text-sm"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="px-5 py-3 border-t flex flex-wrap gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border">
                        انصراف
                    </button>
                    {isEdit && !locked && (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={handleFinalizeMetadata}
                            className="px-4 py-2 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                            نهایی‌سازی اطلاعات پایه
                        </button>
                    )}
                    {!locked && (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={handleSave}
                            className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                        >
                            {saving ? 'در حال ذخیره...' : isEdit ? 'ذخیره تغییرات' : 'ثبت تور استثنایی'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FinanceExceptionTourDialog;
