import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils/apiConfig';

interface CityAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
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
    placeholder = "نام شهر",
    className = "input-style",
    required = false
}) => {
    const [suggestions, setSuggestions] = useState<CityOption[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const fetchCities = async (query: string) => {
        if (query.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                getApiUrl(`freight-announcements/search-routes?q=${encodeURIComponent(query)}&limit=10`),
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                // استخراج شهرهای منحصر به فرد از نتایج
                const uniqueCities = new Map<string, CityOption>();
                data.forEach((item: any) => {
                    if (item.city && !uniqueCities.has(item.city)) {
                        uniqueCities.set(item.city, {
                            id: item.id || item.city,
                            city: item.city,
                            province: item.province,
                            roundTripKm: item.roundTripKm,
                            expectedDays: item.expectedDays
                        });
                    }
                });
                setSuggestions(Array.from(uniqueCities.values()));
                setShowSuggestions(true);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        } catch (error) {
            console.error('Error fetching cities:', error);
            setSuggestions([]);
            setShowSuggestions(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        onChange(inputValue);
        
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Debounce API call
        timeoutRef.current = setTimeout(() => {
            fetchCities(inputValue);
        }, 300);
    };

    const handleSuggestionClick = (suggestion: CityOption) => {
        onChange(suggestion.city);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleInputFocus = () => {
        if (value.length >= 2 && suggestions.length > 0) {
            setShowSuggestions(true);
        } else if (value.length >= 2) {
            fetchCities(value);
        }
    };

    const handleInputBlur = () => {
        // Delay hiding suggestions to allow clicking on them
        setTimeout(() => {
            setShowSuggestions(false);
        }, 200);
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={placeholder}
                className={className}
                required={required}
                autoComplete="off"
            />
            
            {isLoading && (
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
            )}

            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion.id || index}
                            className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            <div className="font-medium text-gray-900">
                                {suggestion.city}
                            </div>
                            {suggestion.province && (
                                <div className="text-sm text-gray-600">
                                    {suggestion.province}
                                </div>
                            )}
                            {(suggestion.roundTripKm || suggestion.expectedDays) && (
                                <div className="text-xs text-gray-500 mt-1">
                                    {suggestion.roundTripKm && `کیلومتر: ${suggestion.roundTripKm.toLocaleString('fa-IR')}`}
                                    {suggestion.roundTripKm && suggestion.expectedDays && ' • '}
                                    {suggestion.expectedDays && `روز: ${suggestion.expectedDays}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CityAutocomplete;

