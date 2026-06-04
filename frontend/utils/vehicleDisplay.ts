import { Vehicle } from '../types';
import { formatPlateNumber } from './jalali';

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
        vehicle.vehicleType ||
        vehicle.type ||
        '—'
    );
}

/** کد خودرو - نوع (ده‌چرخ/تریلی/…) - برند مدل */
export function formatCompanyVehicleOptionLabel(vehicle: Vehicle): string {
    const code = vehicle.vehicleCode || vehicle.serialNumber || '—';
    const typeLabel = getCompanyVehicleTypeLabel(vehicle);
    const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim() || '—';
    return `${code} - ${typeLabel} - ${brandModel}`;
}

export function vehicleMatchesSearchQuery(vehicle: Vehicle, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const plate = formatCompanyVehiclePlate(vehicle).toLowerCase();
    const haystack = [
        vehicle.vehicleCode,
        vehicle.serialNumber,
        vehicle.brand,
        vehicle.model,
        getCompanyVehicleTypeLabel(vehicle),
        plate,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
}
