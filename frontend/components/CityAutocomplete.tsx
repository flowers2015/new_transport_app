import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { getApiUrl } from '../utils/apiConfig';

interface CityAutocompleteProps {
    value?: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
    disabled?: boolean;
    requireSelection?: boolean;
    onValidityChange?: (valid: boolean) => void;
    /** پیشنهادها با position:fixed روی body رندر می‌شوند (برای دیالوگ/اسکرول) */
    inModal?: boolean;
}

interface CityOption {
    id: string;
    city: string;
    province?: string;
    roundTripKm?: number;
    expectedDays?: number;
}

const CityAutocomplete: React.FC<CityAutocompleteProps> = ({
    value,
    onChange,
    placeholder = 'نام شهر',
    className = 'input-style',
    required = false,
    disabled = false,
    requireSelection = false,
    onValidityChange,
    inModal = false,
}) => {
    const safeValue = value ?? '';
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
        setQuery(next);
        if (requireSelection && next.trim()) {
            onValidityChange?.(true);
            setInvalid(false);
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
        if (searchQuery.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
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
                    }) => {
                        if (item.city && !uniqueCities.has(item.city)) {
                            uniqueCities.set(item.city, {
                                id: item.id || item.city,
                                city: item.city,
                                province: item.province,
                                roundTripKm: item.roundTripKm,
                                expectedDays: item.expectedDays,
                            });
                        }
                    });
                    setSuggestions(Array.from(uniqueCities.values()));
                    setShowSuggestions(uniqueCities.size > 0);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        } catch {
            setSuggestions([]);
            setShowSuggestions(false);
        } finally {
            setIsLoading(false);
        }
    };

    const scheduleFetch = (searchQuery: string) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (searchQuery.length === 0) {
            setSuggestions([]);
            setShowSuggestions(false);
            setIsLoading(false);
            return;
        }
        if (searchQuery.length >= 2) {
            timeoutRef.current = setTimeout(() => fetchCities(searchQuery), 300);
        } else {
            setIsLoading(false);
        }
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
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleInputFocus = () => {
        const q = requireSelection ? query : safeValue;
        if (q.length >= 2 && suggestions.length > 0) {
            setShowSuggestions(true);
        } else if (q.length >= 2) {
            fetchCities(q);
        }
        if (inModal) updateMenuPosition();
    };

    const handleInputBlur = () => {
        setTimeout(() => {
            setShowSuggestions(false);
            if (requireSelection) {
                const committed = value ?? '';
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
                    <div className="font-medium text-gray-900 text-sm">{suggestion.city}</div>
                    {suggestion.province && (
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
                <p className="text-[10px] text-red-600 mt-0.5">شهر را از لیست پیشنهادها انتخاب کنید.</p>
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
