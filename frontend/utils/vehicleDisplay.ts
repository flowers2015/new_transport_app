import { Driver, Vehicle } from '../types';
import { formatPlateNumber } from './jalali';
import { getApiUrl } from './apiConfig';

export function formatCompanyVehiclePlate(vehicle: Vehicle): string {
    if (vehicle.plateNumber) {
        if (typeof vehicle.plateNumber === 'string') return vehicle.plateNumber;
        return formatPlateNumber(vehicle.plateNumber);
    }
    const v = vehicle as Record<string, unknown>;
    const p1 = v.plate_part1 as string | undefined;
    const letter = v.plate_letter as string | undefined;
    const p2 = v.plate_part2 as string | undefined;
    const city = v.plate_city_code as string | undefined;
    if (p1 && letter && p2) {
        return city ? `${p1}${letter}${p2}-${city}` : `${p1}${letter}${p2}`;
    }
    return '';
}

export function getCompanyVehicleTypeLabel(vehicle: Vehicle): string {
    const v = vehicle as Record<string, unknown>;
    return (
        (vehicle.currentVehicleType as string) ||
        (v.current_vehicle_type as string) ||
        (vehicle.vehicleType as string) ||
        (vehicle.type as string) ||
        (vehicle.vehicleCategory as string) ||
        (v.vehicle_category as string) ||
        '—'
    );
}

/** کد خودرو — نوع — پلاک */
export function formatCompanyVehicleOptionLabel(vehicle: Vehicle): string {
    const code = vehicle.vehicleCode || vehicle.serialNumber || '—';
    const typeLabel = getCompanyVehicleTypeLabel(vehicle);
    const plate = formatCompanyVehiclePlate(vehicle) || 'بدون پلاک';
    return `${code} — ${typeLabel} — ${plate}`;
}

export function vehicleMatchesSearchQuery(vehicle: Vehicle, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const plate = formatCompanyVehiclePlate(vehicle).toLowerCase();
    const code = String(vehicle.vehicleCode || vehicle.serialNumber || '').toLowerCase();
    return code.includes(q) || plate.includes(q);
}

export function mapVehicleSearchApiRow(row: {
    id: string;
    vehicleCode?: string | null;
    vehicleType?: string | null;
    currentVehicleType?: string | null;
    vehicleCategory?: string | null;
    brand?: string | null;
    model?: string | null;
    plate?: {
        part1?: string | null;
        letter?: string | null;
        part2?: string | null;
        cityCode?: string | null;
    };
}): Vehicle {
    return {
        id: row.id,
        vehicleCode: row.vehicleCode || undefined,
        vehicleType: row.vehicleType || undefined,
        currentVehicleType: row.currentVehicleType || row.vehicleType || undefined,
        vehicleCategory: row.vehicleCategory || undefined,
        brand: row.brand || undefined,
        model: row.model || undefined,
        plateNumber: row.plate
            ? {
                  part1: row.plate.part1 || undefined,
                  letter: row.plate.letter || undefined,
                  part2: row.plate.part2 || undefined,
                  cityCode: row.plate.cityCode || undefined,
              }
            : undefined,
    } as Vehicle;
}

export function formatCompanyDriverOptionLabel(driver: Driver): string {
    return `${driver.employeeId || '—'} — ${driver.name || '—'}`;
}

export function resolveDriverIdFromQuery(drivers: Driver[], query: string, currentId?: string): string | null {
    if (currentId && drivers.some((d) => d.id === currentId)) return currentId;
    const q = query.trim();
    if (!q) return null;

    const exact = drivers.find((d) => formatCompanyDriverOptionLabel(d) === q);
    if (exact) return exact.id;

    const byEmployeeId = drivers.filter((d) => (d.employeeId || '').trim() === q);
    if (byEmployeeId.length === 1) return byEmployeeId[0].id;

    const qLower = q.toLowerCase();
    const partial = drivers.filter(
        (d) =>
            (d.employeeId || '').toLowerCase().includes(qLower) ||
            (d.name || '').toLowerCase().includes(qLower) ||
            formatCompanyDriverOptionLabel(d).toLowerCase().includes(qLower)
    );
    if (partial.length === 1) return partial[0].id;

    return null;
}

export function resolveVehicleIdFromLocalList(
    vehicles: Vehicle[],
    query: string,
    currentId?: string
): string | null {
    if (currentId && vehicles.some((v) => v.id === currentId)) return currentId;
    const q = query.trim();
    if (q.length < 2) return null;

    const exact = vehicles.find((v) => formatCompanyVehicleOptionLabel(v) === q);
    if (exact) return exact.id;

    const partial = vehicles.filter((v) => vehicleMatchesSearchQuery(v, q));
    if (partial.length === 1) return partial[0].id;

    return null;
}

export async function resolveVehicleIdFromQuery(
    vehicles: Vehicle[],
    query: string,
    currentId?: string
): Promise<string | null> {
    const local = resolveVehicleIdFromLocalList(vehicles, query, currentId);
    if (local) return local;

    const q = query.trim();
    if (q.length < 2) return null;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(getApiUrl(`vehicles/search?q=${encodeURIComponent(q)}`), {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const mapped = Array.isArray(data) ? data.map(mapVehicleSearchApiRow) : [];
        const exact = mapped.find((v) => formatCompanyVehicleOptionLabel(v) === q);
        if (exact) return exact.id;
        if (mapped.length === 1) return mapped[0].id;
    } catch {
        return null;
    }
    return null;
}

export async function fetchCompanyVehicleById(vehicleId: string): Promise<Vehicle | null> {
    if (!vehicleId) return null;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(getApiUrl(`vehicles/${vehicleId}`), {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) return null;
        const row = await res.json();
        return {
            id: row.id,
            vehicleCode: row.vehicleCode || undefined,
            vehicleType: row.vehicleType || row.type || undefined,
            currentVehicleType: row.vehicleType || row.type || undefined,
            vehicleCategory: row.vehicleCategory || undefined,
            brand: row.brand || undefined,
            model: row.model || undefined,
            plateNumber: row.plateNumber || undefined,
            serialNumber: row.serialNumber || undefined,
        } as Vehicle;
    } catch {
        return null;
    }
}
