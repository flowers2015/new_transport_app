import React, { useEffect, useState } from 'react';
import { gregorianToJalali, parseJalaliDateString } from '../utils/jalali';

interface JalaliDateInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const toGregorianInputValue = (value: string): string => {
    if (!value) return '';

    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(value)) {
        const date = parseJalaliDateString(value);
        if (!date) return '';
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    if (value.includes('T')) {
        return value.split('T')[0];
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.split(' ')[0];
    }

    return '';
};

const toJalaliDisplay = (value: string): string => {
    if (!value) return '';

    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(value) && !value.includes('T')) {
        const normalized = value.replace(/-/g, '/');
        const parts = normalized.split('/');
        if (parts.length === 3) {
            const [y, m, d] = parts;
            return `${y}/${pad2(Number(m))}/${pad2(Number(d))}`;
        }
        return normalized;
    }

    const gregorianValue = toGregorianInputValue(value);
    if (!gregorianValue) return '';

    const [gy, gm, gd] = gregorianValue.split('-').map(Number);
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
};

const JalaliDateInput: React.FC<JalaliDateInputProps> = ({
    value,
    onChange,
    placeholder = 'مثال: 1403/01/15',
    className = 'input-style',
    required = false,
}) => {
    const [jalaliValue, setJalaliValue] = useState('');

    useEffect(() => {
        setJalaliValue(toJalaliDisplay(value));
    }, [value]);

    const handleJalaliChange = (jalaliInput: string) => {
        setJalaliValue(jalaliInput);

        if (!jalaliInput.trim()) {
            onChange('');
            return;
        }

        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(jalaliInput)) {
            const date = parseJalaliDateString(jalaliInput);
            if (date) {
                onChange(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`);
            }
        }
    };

    return (
        <input
            type="text"
            value={jalaliValue}
            onChange={(e) => handleJalaliChange(e.target.value)}
            placeholder={placeholder}
            className={className}
            required={required}
            dir="rtl"
            inputMode="numeric"
        />
    );
};

export default JalaliDateInput;
