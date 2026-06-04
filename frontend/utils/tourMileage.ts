import { getApiUrl } from './apiConfig';

export type ResolvedRouteMileage = {
    approvedKm: number;
    approvedDays: number;
};

type MileageRecord = {
    total_kilometers?: number;
    totalKilometers?: number;
    approved_kilometers?: number;
    approvedKilometers?: number;
    excess_kilometers?: number;
    excessKilometers?: number;
    depot_total_mileage?: number;
    depotTotalMileage?: number;
    roundTripKm?: number;
    isDataRecorded?: boolean;
};

/** پیمایش کل ذخیره‌شده در driver_calculations — منبع حقیقت برای پورسانت */
export function getStoredTourTotalKilometers(record: MileageRecord): number {
    const stored = Number(record.total_kilometers ?? record.totalKilometers);
    if (stored > 0) return stored;
    const approved = Number(record.approved_kilometers ?? record.approvedKilometers) || 0;
    const excess = Number(record.excess_kilometers ?? record.excessKilometers) || 0;
    const depot = Number(record.depot_total_mileage ?? record.depotTotalMileage) || 0;
    return approved + excess + depot;
}

/**
 * پیمایش نمایشی یک تور:
 * - اگر ثبت شده: فقط مقادیر ذخیره‌شده
 * - قبل از ثبت: مصوب/مسیر + مازاد + دپو
 */
export function getTourTotalKilometers(tour: MileageRecord): number {
    if (tour.isDataRecorded) {
        return getStoredTourTotalKilometers(tour);
    }
    const approved = Number(tour.approvedKilometers ?? tour.approved_kilometers) || 0;
    const excess = Number(tour.excessKilometers ?? tour.excess_kilometers) || 0;
    const depot = Number(tour.depotTotalMileage ?? tour.depot_total_mileage) || 0;
    const roundTrip = Number(tour.roundTripKm) || 0;
    const effectiveApproved = Math.max(approved, roundTrip);
    if (effectiveApproved > 0 || excess > 0 || depot > 0) {
        return effectiveApproved + excess + depot;
    }
    return 0;
}

/** alias برای رکوردهای API محاسبات راننده */
export function getTotalKilometersFromCalculation(calc: MileageRecord): number {
    return getStoredTourTotalKilometers(calc);
}

function pickRouteDays(route: Record<string, unknown>, fallback: number): number {
    if (route.approvedAllowance != null) return Number(route.approvedAllowance);
    if (route.approved_allowance != null) return Number(route.approved_allowance);
    if (route.expectedDays != null) return Number(route.expectedDays);
    if (route.expected_days != null) return Number(route.expected_days);
    return fallback;
}

/**
 * بیشترین کیلومتر رفت‌وبرگشت بین همه شهرهای مقصد (فقط هنگام ثبت هزینه تور)
 */
export async function resolveRouteMileageFromDestinations(
    destinationCities: string[]
): Promise<ResolvedRouteMileage> {
    let approvedKm = 0;
    let approvedDays = 1;
    const token = localStorage.getItem('token');
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const uniqueCities = [...new Set(destinationCities.map((c) => (c || '').trim()).filter(Boolean))];
    if (uniqueCities.length === 0) {
        return { approvedKm: 0, approvedDays: 1 };
    }

    for (const city of uniqueCities) {
        try {
            const res = await fetch(
                getApiUrl(
                    `freight-announcements/routes/search?city=${encodeURIComponent(city)}&limit=10`
                ),
                { headers }
            );
            if (!res.ok) continue;
            const routes = await res.json();
            if (!Array.isArray(routes) || routes.length === 0) continue;

            for (const route of routes) {
                const km = Number(route.roundTripKm ?? route.round_trip_km) || 0;
                if (km > approvedKm) {
                    approvedKm = km;
                    approvedDays = pickRouteDays(route, approvedDays);
                }
            }
        } catch {
            /* skip city */
        }
    }

    return { approvedKm, approvedDays };
}

export function getTourDestinationCities(tour: {
    destinations?: string[] | string;
}): string[] {
    if (Array.isArray(tour.destinations)) {
        return tour.destinations.map((c) => String(c).trim()).filter(Boolean);
    }
    if (typeof tour.destinations === 'string' && tour.destinations.trim()) {
        return tour.destinations
            .split(/[،,]/)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}

/** پیمایش مصوب از شهرهای مقصد — فقط برای دیالوگ ثبت/ویرایش هزینه تور */
export async function resolveTourRouteMileageForTour(tour: {
    announcementId?: string;
    destinations?: string[] | string;
}): Promise<ResolvedRouteMileage> {
    let cities = getTourDestinationCities(tour);
    if (cities.length === 0 && tour.announcementId) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl(`freight-announcements/${tour.announcementId}`), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const ann = await res.json();
                cities = (ann.destinations || [])
                    .map((d: { city?: string }) => (d.city || '').trim())
                    .filter(Boolean);
            }
        } catch {
            /* ignore */
        }
    }
    return resolveRouteMileageFromDestinations(cities);
}

export async function enrichAnnouncementsWithRouteMileage<T extends { destinations?: Array<{ city?: string }> }>(
    announcements: T[]
): Promise<(T & { route?: { round_trip_km: number; expected_days?: number } })[]> {
    return Promise.all(
        announcements.map(async (ann) => {
            const cities = (ann.destinations || []).map((d) => d.city || '').filter(Boolean);
            if (cities.length === 0) return ann;
            const { approvedKm, approvedDays } = await resolveRouteMileageFromDestinations(cities);
            if (approvedKm <= 0) return ann;
            return {
                ...ann,
                route: { round_trip_km: approvedKm, expected_days: approvedDays },
            };
        })
    );
}
