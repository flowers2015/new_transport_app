import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Driver, Vehicle } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import {
    formatCompanyVehicleOptionLabel,
    mapVehicleSearchApiRow,
    vehicleMatchesSearchQuery,
} from '../utils/vehicleDisplay';

type DriverSelectProps = {
    drivers: Driver[];
    driverId: string;
    onSelect: (driverId: string) => void;
    disabled?: boolean;
    className?: string;
};

export const CompanyDriverSelect: React.FC<DriverSelectProps> = ({
    drivers,
    driverId,
    onSelect,
    disabled,
    className = 'w-full border rounded-md px-2 py-1.5 text-sm',
}) => {
    const selected = drivers.find((d) => d.id === driverId);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (selected) {
            setQuery(`${selected.employeeId} — ${selected.name}`);
        } else if (!driverId) {
            setQuery('');
        }
    }, [driverId, selected]);

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 1) return drivers.slice(0, 15);
        return drivers
            .filter(
                (d) =>
                    (d.employeeId || '').toLowerCase().includes(q) ||
                    (d.name || '').toLowerCase().includes(q) ||
                    `${d.employeeId} — ${d.name}`.toLowerCase().includes(q)
            )
            .slice(0, 15);
    }, [drivers, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    return (
        <div ref={wrapRef} className="relative">
            <input
                type="text"
                disabled={disabled}
                className={className}
                placeholder="کد پرسنلی یا نام راننده..."
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    onSelect('');
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                autoComplete="off"
            />
            {open && !disabled && suggestions.length > 0 && (
                <div className="absolute z-[80] w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((d) => (
                        <button
                            key={d.id}
                            type="button"
                            className="w-full text-right px-3 py-2 text-sm hover:bg-slate-100 border-b last:border-b-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onSelect(d.id);
                                setQuery(`${d.employeeId} — ${d.name}`);
                                setOpen(false);
                            }}
                        >
                            <span className="font-mono text-slate-600">{d.employeeId}</span>
                            <span className="mx-1">—</span>
                            <span>{d.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

type VehicleSelectProps = {
    vehicles: Vehicle[];
    vehicleId: string;
    onSelect: (vehicleId: string) => void;
    disabled?: boolean;
    className?: string;
};

export const CompanyVehicleSelect: React.FC<VehicleSelectProps> = ({
    vehicles,
    vehicleId,
    onSelect,
    disabled,
    className = 'w-full border rounded-md px-2 py-1.5 text-sm',
}) => {
    const selectedFromList = vehicles.find((v) => v.id === vehicleId);
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const [apiResults, setApiResults] = useState<Vehicle[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selected = selectedVehicle || selectedFromList;

    useEffect(() => {
        if (selectedFromList) {
            setSelectedVehicle(selectedFromList);
        }
    }, [selectedFromList]);

    useEffect(() => {
        if (selected) {
            setQuery(formatCompanyVehicleOptionLabel(selected));
        } else if (!vehicleId) {
            setQuery('');
        }
    }, [vehicleId, selected]);

    const localSuggestions = useMemo(() => {
        if (query.trim().length < 2) return [];
        return vehicles.filter((v) => vehicleMatchesSearchQuery(v, query)).slice(0, 15);
    }, [vehicles, query]);

    const suggestions =
        query.trim().length >= 2 && apiResults.length > 0
            ? apiResults
            : query.trim().length >= 2
              ? localSuggestions
              : [];

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);

        const q = query.trim();
        if (q.length < 2 || disabled) {
            setApiResults([]);
            setSearching(false);
            setSearchError(null);
            return;
        }

        if (selected && formatCompanyVehicleOptionLabel(selected) === query) {
            return;
        }

        setSearching(true);
        setSearchError(null);
        timerRef.current = setTimeout(async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(getApiUrl(`vehicles/search?q=${encodeURIComponent(q)}`), {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'خطا در جستجوی خودرو');
                }
                const data = await res.json();
                const mapped = Array.isArray(data) ? data.map(mapVehicleSearchApiRow) : [];
                setApiResults(mapped);
            } catch (e) {
                console.error('Vehicle API search failed', e);
                setApiResults([]);
                setSearchError(e instanceof Error ? e.message : 'خطا در جستجو');
            } finally {
                setSearching(false);
            }
        }, 280);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [query, disabled, selected]);

    return (
        <div ref={wrapRef} className="relative">
            <input
                type="text"
                disabled={disabled}
                className={className}
                placeholder="کد خودرو یا بخشی از پلاک (حداقل ۲ کاراکتر)..."
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    onSelect('');
                    setSelectedVehicle(null);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                autoComplete="off"
                dir="ltr"
                style={{ textAlign: 'right' }}
            />
            {searching && (
                <div className="text-[11px] text-slate-400 mt-1">در حال جستجو...</div>
            )}
            {searchError && (
                <div className="text-[11px] text-red-500 mt-1">{searchError}</div>
            )}
            {open && !disabled && query.trim().length >= 2 && !searching && suggestions.length > 0 && (
                <div className="absolute z-[80] w-full mt-1 bg-white border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {suggestions.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            className="w-full text-right px-3 py-2 text-xs hover:bg-slate-100 border-b last:border-b-0 leading-relaxed font-mono"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onSelect(v.id);
                                setSelectedVehicle(v);
                                setQuery(formatCompanyVehicleOptionLabel(v));
                                setOpen(false);
                            }}
                        >
                            {formatCompanyVehicleOptionLabel(v)}
                        </button>
                    ))}
                </div>
            )}
            {open &&
                !disabled &&
                query.trim().length >= 2 &&
                !searching &&
                suggestions.length === 0 &&
                !searchError && (
                    <div className="absolute z-[80] w-full mt-1 bg-white border rounded-md shadow-lg px-3 py-2 text-xs text-slate-500">
                        نتیجه‌ای یافت نشد — فقط کد خودرو یا پلاک جستجو می‌شود.
                    </div>
                )}
        </div>
    );
};
