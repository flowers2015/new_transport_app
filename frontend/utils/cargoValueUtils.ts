export type CargoValueUnit = 'billion_toman' | 'million_toman' | 'million_rial' | 'rial';

export const CARGO_VALUE_UNIT_OPTIONS: { value: CargoValueUnit; label: string; rialsPerUnit: number }[] = [
  { value: 'billion_toman', label: 'میلیارد تومان', rialsPerUnit: 10_000_000_000 },
  { value: 'million_toman', label: 'میلیون تومان', rialsPerUnit: 10_000_000 },
  { value: 'million_rial', label: 'میلیون ریال', rialsPerUnit: 1_000_000 },
  { value: 'rial', label: 'ریال', rialsPerUnit: 1 },
];

const RIALS_PER_UNIT: Record<CargoValueUnit, number> = {
  billion_toman: 10_000_000_000,
  million_toman: 10_000_000,
  million_rial: 1_000_000,
  rial: 1,
};

const UNIT_LABEL: Record<CargoValueUnit, string> = {
  billion_toman: 'میلیارد تومان',
  million_toman: 'میلیون تومان',
  million_rial: 'میلیون ریال',
  rial: 'ریال',
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toWesternDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** نرمال‌سازی ورودی اعشاری — حداکثر ۲ رقم اعشار */
export function normalizeAmountInput(value: string): string {
  let cleaned = toWesternDigits(value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex !== -1) {
    const whole = cleaned.slice(0, dotIndex);
    const fraction = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    cleaned = fraction.length > 0 ? `${whole}.${fraction}` : whole + (cleaned.endsWith('.') ? '.' : '');
  }
  return cleaned;
}

function formatAmountNumber(amount: number, maxDecimals: number): string {
  const fixed = amount.toFixed(maxDecimals).replace(/\.?0+$/, '');
  return fixed || '0';
}

function isReadableInUnit(amount: number, unit: CargoValueUnit): boolean {
  if (unit === 'billion_toman' || unit === 'million_toman') return amount >= 0.1;
  return amount >= 1;
}

/** تبدیل مقدار + واحد به ریال (بدون خطای اعشاری) */
export function convertAmountToRials(amountStr: string, unit: CargoValueUnit): number {
  const cleaned = normalizeAmountInput(amountStr);
  if (!cleaned || cleaned === '.') return 0;

  const [wholePart, fractionPart = ''] = cleaned.split('.');
  const wholeNum = parseInt(wholePart || '0', 10);
  if (Number.isNaN(wholeNum) || wholeNum < 0) return 0;

  const fractionPadded = (fractionPart + '00').slice(0, 2);
  const fractionNum = parseInt(fractionPadded, 10) || 0;
  const amountHundredths = wholeNum * 100 + fractionNum;
  if (amountHundredths <= 0) return 0;

  const rialsPerUnit = RIALS_PER_UNIT[unit];
  return Math.round((amountHundredths * rialsPerUnit) / 100);
}

/** انتخاب بهترین واحد برای نمایش مقدار ذخیره‌شده به ریال */
export function rialsToAmountAndUnit(rials: number): { amount: string; unit: CargoValueUnit } {
  if (!rials || rials <= 0) {
    return { amount: '', unit: 'billion_toman' };
  }

  const unitOrder: CargoValueUnit[] = ['billion_toman', 'million_toman', 'million_rial', 'rial'];

  for (const unit of unitOrder) {
    const multiplier = RIALS_PER_UNIT[unit];
    for (let decimals = 0; decimals <= 2; decimals += 1) {
      const factor = 10 ** decimals;
      const scaled = rials / multiplier;
      const rounded = Math.round(scaled * factor) / factor;
      if (Math.round(rounded * multiplier) !== rials) continue;
      if (!isReadableInUnit(rounded, unit)) continue;
      return { amount: formatAmountNumber(rounded, decimals), unit };
    }
  }

  return { amount: String(rials), unit: 'rial' };
}

/** نمایش خلاصه مثل «۱۱.۴ میلیارد تومان» */
export function formatCargoValueShort(rials: number): string {
  if (!rials || rials <= 0) return '-';
  const { amount, unit } = rialsToAmountAndUnit(rials);
  if (!amount) return '-';
  const formattedAmount = Number(amount).toLocaleString('fa-IR', {
    maximumFractionDigits: 2,
  });
  return `${formattedAmount} ${UNIT_LABEL[unit]}`;
}

export function formatRialsPreview(rials: number): string {
  if (!rials || rials <= 0) return '';
  return `${rials.toLocaleString('fa-IR')} ریال`;
}
