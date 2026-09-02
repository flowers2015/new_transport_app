import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { getApiUrl } from '../utils/apiConfig';

interface CityAutocompleteProps {
    value?: string | null;
    onChange: (value: string) => void;
    /** وقتی کاربر از لیست پیشنهادها یک مسیر مشخص انتخاب می‌کند */
    onRouteSelect?: (option: CityOption) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
    disabled?: boolean;
    requireSelection?: boolean;
    onValidityChange?: (valid: boolean) => void;
    /** پیشنهادها با position:fixed روی body رندر می‌شوند (برای دیالوگ/اسکرول) */
    inModal?: boolean;
    /** فقط نام شهر — بدون مسافت/دسته مسیر (مثلاً فرم اعلام بار برنامه‌ریزی) */
    cityOnlyLabels?: boolean;
    /** مقادیر از پیش‌تعیین‌شده که بدون انتخاب از لیست معتبرند (مثلاً مبدا پیش‌فرض کارخانه) */
    presetValues?: string[];
}

interface CityOption {
    id: string;
    city: string;
    province?: string;
    roundTripKm?: number;
    expectedDays?: number;
    distanceCategory?: string | null;
    routeCategory?: string | null;
}

export function formatCityRouteLabel(suggestion: CityOption, cityOnly = false): string {
    if (cityOnly) return suggestion.city;
    const distance =
        suggestion.distanceCategory?.trim() ||
        suggestion.routeCategory?.trim() ||
        '';
    const km =
        suggestion.roundTripKm != null && !Number.isNaN(Number(suggestion.roundTripKm))
            ? `${Math.round(Number(suggestion.roundTripKm))}`
            : '';
    if (distance && km) return `${suggestion.city} (${distance} — رفت‌وبرگشت ${km} کیلومتر)`;
    if (distance) return `${suggestion.city} (${distance})`;
    if (km) return `${suggestion.city} (رفت‌وبرگشت ${km} کیلومتر)`;
    return suggestion.city;
}

const EMPTY_PRESET_VALUES: string[] = [];

const CityAutocomplete: React.FC<CityAutocompleteProps> = ({
    value,
    onChange,
    placeholder = 'نام شهر',
    className = 'input-style',
    required = false,
    disabled = false,
    requireSelection = false,
    onValidityChange,
    onRouteSelect,
    inModal = false,
    cityOnlyLabels = false,
    presetValues: presetValuesProp,
}) => {
    const safeValue = value ?? '';
    const presetValues = presetValuesProp ?? EMPTY_PRESET_VALUES;
    const isPresetValue = (text: string) =>
        presetValues.some((p) => p.trim() === text.trim());

    const presetOptionsFor = (searchQuery: string): CityOption[] => {
        const q = searchQuery.trim();
        const qKey = q.replace(/\s+/g, '');
        return presetValues
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => {
                if (!q) return true;
                const pKey = p.replace(/\s+/g, '');
                return p.includes(q) || pKey.includes(qKey);
            })
            .map((p) => ({ id: `preset:${p}`, city: p }));
    };

    const mergeWithPresets = (apiItems: CityOption[], searchQuery: string): CityOption[] => {
        const merged = new Map<string, CityOption>();
        for (const p of presetOptionsFor(searchQuery)) merged.set(p.city, p);
        for (const item of apiItems) {
            if (item.city && !merged.has(item.city)) merged.set(item.city, item);
        }
        return Array.from(merged.values());
    };

    const [query, setQuery] = useState(safeValue);
    const [suggestions, setSuggestions] = useState<CityOption[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const inputRef = useRef<HTMLInputElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const next = value ?? '';
        // هنگام تایپ کاربر query را با value همگام نکن (جلوگیری از چشمک‌زدن)
        if (inputRef.current === document.activeElement) {
            return;
        }
        setQuery(next);
        if (requireSelection) {
            const ok = !!next.trim() && isPresetValue(next);
            if (ok) {
                onValidityChange?.(true);
                setInvalid(false);
            }
        }
    }, [value, requireSelection]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const updateMenuPosition = () => {
        if (!inModal || !inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const menuMaxH = 220;
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropUp = spaceBelow < menuMaxH + 16 && rect.top > menuMaxH + 16;
        setMenuStyle({
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            zIndex: 10000,
            maxHeight: menuMaxH,
            ...(dropUp
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
        });
    };

    useLayoutEffect(() => {
        if (showSuggestions && inModal) {
            updateMenuPosition();
            const onScroll = () => updateMenuPosition();
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onScroll);
            return () => {
                window.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', onScroll);
            };
        }
    }, [showSuggestions, inModal, suggestions]);

    const fetchCities = async (searchQuery: string) => {
        const applyLocal = (apiItems: CityOption[] = []) => {
            const merged = mergeWithPresets(apiItems, searchQuery);
            setSuggestions(merged);
            setShowSuggestions(merged.length > 0);
        };

        if (searchQuery.trim().length < 2) {
            applyLocal([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                getApiUrl(`freight-announcements/routes/search?q=${encodeURIComponent(searchQuery)}&limit=10`),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                const uniqueCities = new Map<string, CityOption>();
                if (Array.isArray(data)) {
                    data.forEach((item: {
                        id?: string;
                        city?: string;
                        province?: string;
                        roundTripKm?: number;
                        expectedDays?: number;
                        distanceCategory?: string | null;
                        routeCategory?: string | null;
                    }) => {
                        if (!item.city) return;
                        const km = item.roundTripKm != null ? Number(item.roundTripKm) : 0;
                        const existing = uniqueCities.get(item.city);
                        if (!existing || (km > (existing.roundTripKm || 0))) {
                            uniqueCities.set(item.city, {
                                id: item.id || item.city,
                                city: item.city,
                                province: item.province,
                                roundTripKm: item.roundTripKm,
                                expectedDays: item.expectedDays,
                                distanceCategory: item.distanceCategory,
                                routeCategory: item.routeCategory,
                            });
                        }
                    });
                }
                applyLocal(Array.from(uniqueCities.values()));
            } else {
                applyLocal([]);
            }
        } catch {
            applyLocal([]);
        } finally {
            setIsLoading(false);
        }
    };

    const scheduleFetch = (searchQuery: string) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (searchQuery.trim().length < 2) {
            const merged = mergeWithPresets([], searchQuery);
            setSuggestions(merged);
            setShowSuggestions(merged.length > 0);
            setIsLoading(false);
            return;
        }
        timeoutRef.current = setTimeout(() => fetchCities(searchQuery), 300);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;

        if (requireSelection) {
            setQuery(inputValue);
            onValidityChange?.(false);
            setInvalid(false);
            if (!inputValue.trim()) {
                onChange('');
            }
            scheduleFetch(inputValue);
            return;
        }

        onChange(inputValue);
        scheduleFetch(inputValue);
    };

    const handleSuggestionClick = (suggestion: CityOption) => {
        if (requireSelection) {
            setQuery(suggestion.city);
            onChange(suggestion.city);
            onValidityChange?.(true);
            setInvalid(false);
        } else {
            onChange(suggestion.city);
        }
        onRouteSelect?.(suggestion);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleInputFocus = () => {
        const q = requireSelection ? query : safeValue;
        const local = mergeWithPresets(suggestions, q);
        if (local.length > 0) {
            setSuggestions(local);
            setShowSuggestions(true);
        }
        if (q.trim().length >= 2) {
            fetchCities(q);
        }
        if (inModal) updateMenuPosition();
    };

    const handleInputBlur = () => {
        setTimeout(() => {
            setShowSuggestions(false);
            if (requireSelection) {
                const committed = value ?? '';
                if (isPresetValue(committed)) {
                    onValidityChange?.(true);
                    setInvalid(false);
                    return;
                }
                if (query.trim() && query.trim() !== committed.trim()) {
                    setQuery(committed);
                    setInvalid(true);
                    onValidityChange?.(false);
                }
            }
        }, 200);
    };

    const displayValue = requireSelection ? query : safeValue;

    const suggestionsList = showSuggestions && suggestions.length > 0 && (
        <div
            className={`bg-white border border-gray-300 rounded-md shadow-xl overflow-y-auto ${
                inModal ? '' : 'absolute z-[200] w-full mt-1 max-h-60'
            }`}
            style={inModal ? menuStyle : undefined}
        >
            {suggestions.map((suggestion, index) => (
                <div
                    key={suggestion.id || index}
                    className="px-3 py-2 hover:bg-sky-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSuggestionClick(suggestion)}
                >
                    <div className="font-medium text-gray-900 text-sm">
                        {formatCityRouteLabel(suggestion, cityOnlyLabels)}
                    </div>
                    {!cityOnlyLabels && suggestion.province && (
                        <div className="text-xs text-gray-600">{suggestion.province}</div>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={displayValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={placeholder}
                className={`${className}${invalid ? ' border-red-500 ring-1 ring-red-300' : ''}`}
                required={required}
                disabled={disabled}
                autoComplete="off"
            />

            {invalid && (
                <p className="text-[10px] text-red-600 mt-0.5">از لیست پیشنهادها انتخاب کنید.</p>
            )}

            {isLoading && (
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                </div>
            )}

            {inModal && suggestionsList
                ? createPortal(suggestionsList, document.body)
                : suggestionsList}
        </div>
    );
};

export default CityAutocomplete;
