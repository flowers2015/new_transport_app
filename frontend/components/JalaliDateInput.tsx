import React, { useState, useEffect } from 'react';
import { parseJalaliDateString, jalaliToGregorian } from '../utils/jalali';

interface JalaliDateInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
}

const JalaliDateInput: React.FC<JalaliDateInputProps> = ({
    value,
    onChange,
    placeholder = "تاریخ شمسی",
    className = "input-style",
    required = false
}) => {
    const [jalaliValue, setJalaliValue] = useState('');
    const [gregorianValue, setGregorianValue] = useState('');

    // تبدیل میلادی به شمسی برای نمایش
    useEffect(() => {
        if (value) {
            try {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    const [jy, jm, jd] = jalaliToGregorian(
                        date.getFullYear(),
                        date.getMonth() + 1,
                        date.getDate()
                    );
                    setJalaliValue(`${jy}/${jm.toString().padStart(2, '0')}/${jd.toString().padStart(2, '0')}`);
                    setGregorianValue(value);
                }
            } catch (error) {
                console.warn('Error converting date to Jalali:', error);
            }
        } else {
            setJalaliValue('');
            setGregorianValue('');
        }
    }, [value]);

    const handleJalaliChange = (jalaliInput: string) => {
        setJalaliValue(jalaliInput);
        
        // تبدیل شمسی به میلادی
        if (jalaliInput.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
            try {
                const [jy, jm, jd] = jalaliInput.split('/').map(Number);
                const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
                const gregorianDate = new Date(gy, gm - 1, gd);
                const isoString = gregorianDate.toISOString().split('T')[0];
                setGregorianValue(isoString);
                onChange(isoString);
            } catch (error) {
                console.warn('Error converting Jalali to Gregorian:', error);
            }
        }
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={jalaliValue}
                onChange={(e) => handleJalaliChange(e.target.value)}
                placeholder={placeholder}
                className={className}
                required={required}
                dir="rtl"
            />
            <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                شمسی
            </div>
        </div>
    );
};

export default JalaliDateInput;
