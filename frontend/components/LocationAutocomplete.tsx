import React, { useState, useEffect, useRef } from 'react';

interface LocationAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
}

interface GooglePlace {
    place_id: string;
    formatted_address: string;
    name?: string;
}

declare global {
    interface Window {
        google: any;
        initGooglePlaces: () => void;
    }
}

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
    value,
    onChange,
    placeholder = "موقعیت مکانی",
    className = "input-style",
    required = false
}) => {
    const [suggestions, setSuggestions] = useState<GooglePlace[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<any>(null);

    useEffect(() => {
        // Google Places API temporarily disabled
        console.log('📍 LocationAutocomplete: Using fallback mode (Google Places API disabled)');
    }, []);

    const initializeGooglePlaces = () => {
        if (window.google && inputRef.current) {
            autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
                types: ['establishment', 'geocode'],
                componentRestrictions: { country: 'ir' }, // Restrict to Iran
                fields: ['place_id', 'formatted_address', 'name', 'geometry']
            });

            autocompleteRef.current.addListener('place_changed', handlePlaceSelect);
        }
    };

    const handlePlaceSelect = () => {
        const place = autocompleteRef.current.getPlace();
        if (place.formatted_address) {
            onChange(place.formatted_address);
            setShowSuggestions(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        onChange(inputValue);
        
        if (inputValue.length > 2) {
            setIsLoading(true);
            // Use Google Places API for search
            if (window.google && window.google.maps && window.google.maps.places) {
                const service = new window.google.maps.places.PlacesService(document.createElement('div'));
                const request = {
                    query: inputValue,
                    fields: ['place_id', 'formatted_address', 'name'],
                    locationBias: { lat: 35.6892, lng: 51.3890 }, // Tehran coordinates
                    radius: 50000 // 50km radius
                };

                service.textSearch(request, (results: any[], status: any) => {
                    setIsLoading(false);
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                        setSuggestions(results.slice(0, 5)); // Limit to 5 suggestions
                        setShowSuggestions(true);
                    } else {
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }
                });
            } else {
                // Fallback: Show basic suggestions if Google Places API is not available
                setIsLoading(false);
                const basicSuggestions = [
                    { place_id: '1', formatted_address: `${inputValue}، تهران، ایران` },
                    { place_id: '2', formatted_address: `${inputValue}، اصفهان، ایران` },
                    { place_id: '3', formatted_address: `${inputValue}، شیراز، ایران` },
                    { place_id: '4', formatted_address: `${inputValue}، مشهد، ایران` },
                    { place_id: '5', formatted_address: `${inputValue}، تبریز، ایران` }
                ];
                setSuggestions(basicSuggestions);
                setShowSuggestions(true);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion: GooglePlace) => {
        onChange(suggestion.formatted_address);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleInputFocus = () => {
        if (suggestions.length > 0) {
            setShowSuggestions(true);
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
                            key={suggestion.place_id || index}
                            className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            <div className="font-medium text-gray-900">
                                {suggestion.name || suggestion.formatted_address}
                            </div>
                            {suggestion.name && suggestion.formatted_address !== suggestion.name && (
                                <div className="text-sm text-gray-600">
                                    {suggestion.formatted_address}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LocationAutocomplete;
