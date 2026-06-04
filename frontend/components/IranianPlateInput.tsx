import React from 'react';

export type IranianPlateParts = {
    part1: string;
    letter: string;
    part2: string;
    cityCode: string;
};

export const DEFAULT_PLATE_LETTER = 'ع';

export const PERSIAN_PLATE_LETTERS = [
    'الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض',
    'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی',
];

export function formatIranianPlateString(parts: IranianPlateParts): string {
    return `${parts.part1}${parts.letter}${parts.part2}-${parts.cityCode}`;
}

export function parseIranianPlateString(plate?: string | null): IranianPlateParts {
    const empty: IranianPlateParts = { part1: '', letter: DEFAULT_PLATE_LETTER, part2: '', cityCode: '' };
    if (!plate?.trim()) return empty;
    const match = plate.trim().match(/^(\d{2})([آ-یا-ی])(\d{3})-(\d{2})$/);
    if (!match) return empty;
    return {
        part1: match[1],
        letter: match[2],
        part2: match[3],
        cityCode: match[4],
    };
}

const SEGMENT_CLASS =
    'iranian-plate-segment shrink-0 flex-none text-center text-sm py-1.5 px-1 border border-slate-300 rounded-md bg-white shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:opacity-60';

type IranianPlateInputProps = {
    value: IranianPlateParts;
    onChange: (next: IranianPlateParts) => void;
    disabled?: boolean;
    /** دیگر برای عرض استفاده نمی‌شود — فقط سازگاری با فراخوانی‌های قبلی */
    inputClassName?: string;
};

/**
 * ورودی پلاک در یک ردیف — ترتیب (چپ به راست): دو رقم | حرف | سه رقم | - | دو رقم
 */
const IranianPlateInput: React.FC<IranianPlateInputProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    const patch = (partial: Partial<IranianPlateParts>) => onChange({ ...value, ...partial });

    return (
        <div className="iranian-plate-row flex flex-row flex-nowrap items-center gap-1" dir="ltr">
            <input
                type="text"
                value={value.part1}
                onChange={(e) => patch({ part1: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="12"
                className={`${SEGMENT_CLASS} w-10`}
                maxLength={2}
                disabled={disabled}
                autoComplete="off"
                aria-label="دو رقم اول پلاک"
            />
            <select
                value={value.letter || DEFAULT_PLATE_LETTER}
                onChange={(e) => patch({ letter: e.target.value })}
                className={`${SEGMENT_CLASS} w-10`}
                disabled={disabled}
                aria-label="حرف پلاک"
            >
                {PERSIAN_PLATE_LETTERS.map((l) => (
                    <option key={l} value={l}>
                        {l}
                    </option>
                ))}
            </select>
            <input
                type="text"
                value={value.part2}
                onChange={(e) => patch({ part2: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                placeholder="345"
                className={`${SEGMENT_CLASS} w-12`}
                maxLength={3}
                disabled={disabled}
                autoComplete="off"
                aria-label="سه رقم وسط پلاک"
            />
            <span className="shrink-0 font-bold text-slate-500 px-0.5 select-none" aria-hidden>
                -
            </span>
            <input
                type="text"
                value={value.cityCode}
                onChange={(e) => patch({ cityCode: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="67"
                className={`${SEGMENT_CLASS} w-10`}
                maxLength={2}
                disabled={disabled}
                autoComplete="off"
                aria-label="کد شهر پلاک"
            />
        </div>
    );
};

export default IranianPlateInput;
