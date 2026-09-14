import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatJalali, formatJalaliDateTime } from '../utils/jalali';

export type BalePreviewLoad = {
    id: string;
    announcementCode?: string | null;
    lineType?: string | null;
    vehicleType?: string | null;
    originCity?: string | null;
    origin_city?: string | null;
    brand?: string | null;
    destinationCities?: string | null;
    destination?: { city?: string | null } | null;
    allDestinations?: Array<{ city?: string | null }>;
    loadingDate?: string | Date | null;
    createdAt?: string | Date | null;
    created_at?: string | Date | null;
    cargoValue?: number | null;
};

type SortKey =
    | 'createdAt'
    | 'loadingDate'
    | 'origin'
    | 'brand'
    | 'vehicleType'
    | 'lineType'
    | 'dest'
    | 'cargo';

type Props = {
    categoryLabel: string;
    queueCount: number;
    loads: BalePreviewLoad[];
    initialSelectedIds: string[];
    initialAllowExtra: boolean;
    locked: boolean;
    busy?: boolean;
    error?: string | null;
    onClose: () => void;
    onConfirm: (selectedIds: string[], allowExtra: boolean) => void;
};

function destText(ann: BalePreviewLoad): string {
    if (ann.destinationCities) return String(ann.destinationCities);
    if (ann.destination?.city) return String(ann.destination.city);
    const cities = (ann.allDestinations || []).map(d => d.city).filter(Boolean);
    return cities.length ? cities.join('، ') : '—';
}

function formatDateValue(raw?: string | Date | null): string {
    if (!raw) return '—';
    try {
        return formatJalali(raw as Date | string);
    } catch {
        return String(raw);
    }
}

function formatLoadingDate(ann: BalePreviewLoad): string {
    return formatDateValue(ann.loadingDate || null);
}

function formatAnnouncementDate(ann: BalePreviewLoad): string {
    const raw = ann.createdAt || ann.created_at || null;
    if (!raw) return '—';
    const formatted = formatJalaliDateTime(raw);
    return !formatted || formatted === '-' ? '—' : formatted;
}

function formatCargo(value?: number | null): string {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('fa-IR');
}

function toTime(value?: string | Date | null): number {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function sortValue(ann: BalePreviewLoad, key: SortKey): string | number {
    if (key === 'createdAt') return toTime(ann.createdAt || ann.created_at || null);
    if (key === 'loadingDate') return toTime(ann.loadingDate || null);
    if (key === 'origin') return String(ann.originCity || ann.origin_city || '');
    if (key === 'brand') return String(ann.brand || '');
    if (key === 'vehicleType') return String(ann.vehicleType || '');
    if (key === 'lineType') return String(ann.lineType || '');
    if (key === 'dest') return destText(ann);
    return Number(ann.cargoValue) || 0;
}

const BaleSessionLoadPickerDialog: React.FC<Props> = ({
    categoryLabel,
    queueCount,
    loads,
    initialSelectedIds,
    initialAllowExtra,
    locked,
    busy,
    error,
    onClose,
    onConfirm,
}) => {
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(initialSelectedIds.length ? initialSelectedIds : loads.map(l => l.id))
    );
    const [allowExtra, setAllowExtra] = useState(initialAllowExtra);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const selectionReadyRef = useRef(false);

    useEffect(() => {
        selectionReadyRef.current = false;
    }, [categoryLabel, locked]);

    useEffect(() => {
        if (selectionReadyRef.current) return;
        if (!loads.length && !initialSelectedIds.length) return;
        setSelected(new Set(initialSelectedIds.length ? initialSelectedIds : loads.map(l => l.id)));
        setAllowExtra(initialAllowExtra);
        selectionReadyRef.current = true;
    }, [categoryLabel, initialAllowExtra, initialSelectedIds, loads, locked]);

    const sortedLoads = useMemo(() => {
        if (!sortKey) return loads;
        const copy = [...loads];
        copy.sort((a, b) => {
            const va = sortValue(a, sortKey);
            const vb = sortValue(b, sortKey);
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            const cmp = String(va).localeCompare(String(vb), 'fa');
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return copy;
    }, [loads, sortDir, sortKey]);

    const selectedCount = selected.size;
    const extraNeeded = selectedCount > queueCount;
    const shortOnLoads = selectedCount > 0 && selectedCount < queueCount;
    const canConfirm = !locked;

    const allChecked = loads.length > 0 && selectedCount === loads.length;

    const warning = useMemo(() => {
        if (!loads.length) return 'بار قابل اعلامی برای این دسته نیست.';
        if (selectedCount === 0) return 'حداقل یک بار را تیک بزنید.';
        if (extraNeeded) {
            return `${selectedCount.toLocaleString('fa-IR')} بار و ${queueCount.toLocaleString('fa-IR')} راننده (صف دور و نزدیک) — ${
                (selectedCount - queueCount).toLocaleString('fa-IR')
            } بار اضافه است.`;
        }
        if (shortOnLoads) {
            return `${queueCount.toLocaleString('fa-IR')} راننده در صف دور و نزدیک و ${selectedCount.toLocaleString('fa-IR')} بار — ${
                (queueCount - selectedCount).toLocaleString('fa-IR')
            } راننده بدون بار می‌ماند.`;
        }
        return null;
    }, [loads.length, queueCount, selectedCount, extraNeeded, shortOnLoads]);

    const toggle = (id: string) => {
        if (locked) return;
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (locked) return;
        if (allChecked) setSelected(new Set());
        else setSelected(new Set(loads.map(l => l.id)));
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortKey(key);
        setSortDir('asc');
    };

    const renderSortableHeader = (key: SortKey, label: string) => (
        <button
            type="button"
            onClick={() => handleSort(key)}
            className="inline-flex items-center justify-center gap-0.5 w-full hover:text-sky-700 focus:outline-none"
            title="مرتب‌سازی"
        >
            <span>{label}</span>
            {sortKey === key ? (
                <span className="text-sky-600 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
            ) : (
                <span className="text-slate-300 text-[10px]">⇅</span>
            )}
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" dir="rtl">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-800">
                            انتخاب بار جلسه {categoryLabel}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            همه بارهای منتظر تخصیص این دسته. تیک یعنی داخل این جلسه؛ برداشتن تیک بار را لغو
                            نمی‌کند.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-md"
                    >
                        بستن
                    </button>
                </div>

                <div className="px-4 py-2 text-xs text-slate-600 flex flex-wrap gap-3 border-b border-slate-100">
                    <span>
                        راننده صف (دور و نزدیک):{' '}
                        <strong>{queueCount.toLocaleString('fa-IR')}</strong>
                    </span>
                    <span>
                        بار این دسته:{' '}
                        <strong>{loads.length.toLocaleString('fa-IR')}</strong>
                    </span>
                    <span>
                        انتخاب‌شده:{' '}
                        <strong>{selectedCount.toLocaleString('fa-IR')}</strong>
                    </span>
                    {locked && <span className="text-amber-700">سبد این جلسه قفل است.</span>}
                </div>

                {error && (
                    <div className="mx-4 mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        {error}
                    </div>
                )}
                {warning && (
                    <div
                        className={`mx-4 mt-3 text-sm rounded-md px-3 py-2 border ${
                            extraNeeded || selectedCount === 0 || !loads.length
                                ? 'text-amber-800 bg-amber-50 border-amber-200'
                                : 'text-sky-800 bg-sky-50 border-sky-200'
                        }`}
                    >
                        {warning}
                    </div>
                )}

                <div className="flex-1 overflow-auto p-4">
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full text-xs border-collapse">
                            <thead className="bg-slate-100 sticky top-0 z-10">
                                <tr className="text-slate-700">
                                    <th className="p-2 border border-slate-200 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allChecked}
                                            disabled={locked || !loads.length}
                                            onChange={toggleAll}
                                            aria-label="انتخاب همه"
                                        />
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">ردیف</th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('createdAt', 'تاریخ اعلام بار')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('loadingDate', 'تاریخ بارگیری')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('origin', 'مبدا بارگیری')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('brand', 'برند')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('vehicleType', 'نوع خودرو')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('lineType', 'لاین')}
                                    </th>
                                    <th className="p-2 border border-slate-200">
                                        {renderSortableHeader('dest', 'مقاصد')}
                                    </th>
                                    <th className="p-2 border border-slate-200 whitespace-nowrap">
                                        {renderSortableHeader('cargo', 'ارزش بار')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedLoads.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="p-6 text-center text-slate-500">
                                            باری برای انتخاب نیست
                                        </td>
                                    </tr>
                                ) : (
                                    sortedLoads.map((ann, idx) => {
                                        const checked = selected.has(ann.id);
                                        return (
                                            <tr
                                                key={ann.id}
                                                className={`hover:bg-sky-50 ${checked ? 'bg-white' : 'bg-slate-50 text-slate-500'}`}
                                            >
                                                <td className="p-2 border border-slate-200 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        disabled={locked}
                                                        onChange={() => toggle(ann.id)}
                                                    />
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {(idx + 1).toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center whitespace-nowrap">
                                                    {formatAnnouncementDate(ann)}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center whitespace-nowrap">
                                                    {formatLoadingDate(ann)}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {ann.originCity || ann.origin_city || '—'}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {ann.brand || '—'}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {ann.vehicleType || '—'}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {ann.lineType || '—'}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-right">
                                                    {destText(ann)}
                                                </td>
                                                <td className="p-2 border border-slate-200 text-center">
                                                    {formatCargo(ann.cargoValue)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <label className={`flex items-center gap-2 text-xs ${extraNeeded ? 'text-amber-800' : 'text-slate-500'}`}>
                        <input
                            type="checkbox"
                            checked={allowExtra || extraNeeded}
                            disabled={locked}
                            onChange={e => setAllowExtra(e.target.checked)}
                        />
                        اعلام با بار بیشتر از تعداد راننده
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm"
                        >
                            انصراف
                        </button>
                        <button
                            type="button"
                            disabled={!canConfirm || busy}
                            onClick={() => onConfirm(Array.from(selected), extraNeeded || allowExtra)}
                            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
                        >
                            تأیید سبد این جلسه
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BaleSessionLoadPickerDialog;
