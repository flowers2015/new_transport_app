/**
 * تابع برای فرمت کردن اعداد با جداکننده 3 رقمی
 */
export function formatNumberWithSeparator(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    const numValue = typeof value === 'string' ? value.replace(/,/g, '') : String(value);
    if (!numValue || numValue === '0') {
        return '';
    }
    // تبدیل به عدد و سپس فرمت با جداکننده
    const num = Number(numValue);
    if (isNaN(num)) {
        return '';
    }
    return num.toLocaleString('fa-IR');
}

/**
 * تابع برای حذف جداکننده‌ها و تبدیل به عدد
 */
export function parseNumberFromFormatted(value: string): number {
    if (!value) return 0;
    const cleaned = value.replace(/,/g, '').replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned) : 0;
}

/**
 * تابع برای فرمت کردن در حین تایپ (هر 3 رقم جدا می‌کند)
 */
export function formatNumberWhileTyping(value: string): string {
    // حذف تمام جداکننده‌ها و کاراکترهای غیرعددی
    const cleaned = value.replace(/,/g, '').replace(/[^\d]/g, '');
    if (!cleaned) return '';
    
    // تبدیل به عدد و سپس فرمت با جداکننده
    const num = Number(cleaned);
    if (isNaN(num)) {
        return '';
    }
    return num.toLocaleString('fa-IR');
}

