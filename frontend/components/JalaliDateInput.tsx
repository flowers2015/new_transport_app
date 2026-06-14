import React, { useEffect, useRef, useState } from 'react';
import { gregorianToJalali, parseJalaliDateString } from '../utils/jalali';

interface JalaliDateInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const isGregorianStoredValue = (value: string): boolean =>
    value.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(value);

const gregorianToJalaliString = (value: string): string => {
    const iso = (value.includes('T') ? value.split('T')[0] : value.split(' ')[0]).trim();
    const [gy, gm, gd] = iso.split('-').map(Number);
    if (!gy || !gm || !gd) return '';
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
};

const normalizeJalaliInput = (jalali: string): string => {
    const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(jalali.trim());
    if (!match) return jalali;
    return `${match[1]}/${pad2(Number(match[2]))}/${pad2(Number(match[3]))}`;
};

const jalaliToGregorianString = (jalali: string): string => {
    const date = parseJalaliDateString(jalali);
    if (!date) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toDisplayValue = (storedValue: string): string => {
    if (!storedValue) return '';
    if (isGregorianStoredValue(storedValue)) {
        return gregorianToJalaliString(storedValue);
    }
    return normalizeJalaliInput(storedValue.replace(/-/g, '/'));
};

const JalaliDateInput: React.FC<JalaliDateInputProps> = ({
    value,
    onChange,
    placeholder = 'مثال: 1403/01/15',
    className = 'input-style',
    required = false,
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const isFocusedRef = useRef(false);

    useEffect(() => {
        if (isFocusedRef.current) return;
        setDisplayValue(toDisplayValue(value));
    }, [value]);

    const commitJalaliValue = (jalaliInput: string) => {
        const trimmed = jalaliInput.trim();
        if (!trimmed) {
            onChange('');
            return;
        }

        if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
            return;
        }

        const normalized = normalizeJalaliInput(trimmed);
        const gregorianValue = jalaliToGregorianString(normalized);
        if (!gregorianValue) return;

        setDisplayValue(normalized);
        onChange(gregorianValue);
    };

    const handleChange = (jalaliInput: string) => {
        setDisplayValue(jalaliInput);
    };

    const handleBlur = () => {
        isFocusedRef.current = false;
        commitJalaliValue(displayValue);
    };

    return (
        <input
            type="text"
            value={displayValue}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
                isFocusedRef.current = true;
            }}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={className}
            required={required}
            dir="rtl"
            inputMode="numeric"
        />
    );
};

export default JalaliDateInput;
