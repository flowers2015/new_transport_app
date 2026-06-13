import { formatJalali, gregorianToJalali } from './jalali';

const usedFilenameBases = new Map<string, number>();

export function resetInvoiceDownloadFilenameCounter() {
    usedFilenameBases.clear();
}

function sanitizeFilenamePart(value: string): string {
    return (
        (value || '')
            .trim()
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'نامشخص'
    );
}

/** آخرین مقصد از لیست یا رشته «شهر۱، شهر۲» */
export function extractLastDestination(destinations: unknown): string {
    if (!destinations) return 'بدون_مقصد';

    if (Array.isArray(destinations)) {
        const cities = destinations
            .flatMap((item) => {
                if (typeof item === 'string') {
                    return item.split(/[،,]/).map((s) => s.trim());
                }
                if (item && typeof item === 'object' && 'city' in item) {
                    return [String((item as { city?: string }).city || '').trim()];
                }
                return [String(item).trim()];
            })
            .filter(Boolean);
        return cities.length > 0 ? cities[cities.length - 1] : 'بدون_مقصد';
    }

    if (typeof destinations === 'string') {
        const parts = destinations.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : 'بدون_مقصد';
    }

    return 'بدون_مقصد';
}

export function getJalaliDateForDownload(date?: Date | string | null): string {
    if (date) {
        const formatted = formatJalali(date);
        if (formatted && formatted !== '-') {
            return formatted.replace(/\//g, '-');
        }
    }
    const today = new Date();
    const [jy, jm, jd] = gregorianToJalali(
        today.getFullYear(),
        today.getMonth() + 1,
        today.getDate()
    );
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${jy}-${pad(jm)}-${pad(jd)}`;
}

export type InvoiceDownloadFilenameOptions = {
    driverName: string;
    destinations?: unknown;
    date?: Date | string | null;
    extension?: string;
    prefix?: string;
};

export function buildInvoiceDownloadFilename(options: InvoiceDownloadFilenameOptions): string {
    const prefix = options.prefix || 'صورتحساب';
    const ext = (options.extension || 'png').replace(/^\./, '');
    const driver = sanitizeFilenamePart(options.driverName);
    const destination = sanitizeFilenamePart(extractLastDestination(options.destinations));
    const jalaliDate = getJalaliDateForDownload(options.date);

    const base = `${prefix}_${driver}_${destination}_${jalaliDate}`;
    const count = (usedFilenameBases.get(base) || 0) + 1;
    usedFilenameBases.set(base, count);

    const suffix = count > 1 ? `_${count}` : '';
    return `${base}${suffix}.${ext}`;
}

export function resolveInvoiceDestinationsFromSources(sources: {
    tour?: { destinations?: unknown };
    calculation?: { destinations?: unknown };
    announcement?: { destinations?: Array<{ city?: string }> };
}): unknown {
    if (sources.tour?.destinations) return sources.tour.destinations;
    if (sources.calculation?.destinations) return sources.calculation.destinations;
    if (sources.announcement?.destinations?.length) {
        return sources.announcement.destinations.map((d) => d.city).filter(Boolean);
    }
    return undefined;
}

export function buildInvoiceFilenameFromContext(
    record: { driverName: string; calculationDate?: string | Date | null },
    calculations: any[],
    announcementsMap: Map<string, any>,
    extension: string
): string {
    const calc = calculations[0];
    const announcementId = calc?.announcement_id || calc?.announcementId;
    const announcement = announcementId ? announcementsMap.get(announcementId) : undefined;

    return buildInvoiceDownloadFilename({
        driverName: record.driverName,
        destinations: resolveInvoiceDestinationsFromSources({ calculation: calc, announcement }),
        date:
            record.calculationDate ||
            calc?.calculation_date ||
            calc?.calculationDate ||
            calc?.bill_of_lading_date,
        extension,
    });
}
