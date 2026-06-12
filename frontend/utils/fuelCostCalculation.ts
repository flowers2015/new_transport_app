type VehicleLike = {
    brand?: string;
    model?: string;
    vehicleCode?: string;
    vehicle_code?: string;
    vehicleType?: string;
    vehicleTip?: string;
    plateNumber?: {
        part1?: string;
        letter?: string;
        part2?: string;
        cityCode?: string;
    };
};

type VehicleSpecLike = {
    brand?: string;
    model?: string;
    vehicleType?: string;
    tip?: string;
    fuelConsumptionPercentage?: number;
    fuelPricePerLiter?: number;
};

type FuelRegulation = {
    consumptionPercentage: number;
    fuelPrice: number;
};

export type ComputeTourFuelCostParams = {
    approvedKilometers: number;
    excessKilometers: number;
    depotTotalMileage?: number;
    vehicleCode?: string;
    vehiclePlate?: string;
    vehicleType?: string;
    vehicles: VehicleLike[];
    vehicleSpecs: VehicleSpecLike[];
    fuelConsumptionRegulations?: Record<string, FuelRegulation>;
};

function mapTrailerToTractor(vehicleType: string): string {
    if (vehicleType.includes('تریلی') || vehicleType.includes('مینی تریلی')) {
        return 'کشنده';
    }
    return vehicleType;
}

function findVehicleByCodeOrPlate(
    vehicles: VehicleLike[],
    vehicleCode: string,
    plateNumber: string
): VehicleLike | null {
    if (vehicleCode) {
        const found = vehicles.find((v) => {
            const vCode = String(v.vehicleCode || v.vehicle_code || '').trim();
            return vCode === vehicleCode;
        });
        if (found) return found;
    }

    if (plateNumber) {
        const found = vehicles.find((v) => {
            if (!v.plateNumber) return false;
            const vehiclePlateStr = `${v.plateNumber.part1}${v.plateNumber.letter}${v.plateNumber.part2}-${v.plateNumber.cityCode}`;
            return (
                vehiclePlateStr === plateNumber ||
                vehiclePlateStr.replace(/-/g, '') === plateNumber.replace(/-/g, '') ||
                `${v.plateNumber.part1}-${v.plateNumber.part2}${v.plateNumber.letter}${v.plateNumber.cityCode}` === plateNumber
            );
        });
        if (found) return found;
    }

    return null;
}

function findVehicleSpec(
    vehicle: VehicleLike | null,
    vehicleType: string,
    vehicleSpecs: VehicleSpecLike[]
): VehicleSpecLike | null {
    if (vehicle) {
        const byVehicle = vehicleSpecs.find(
            (spec) =>
                spec.brand === vehicle.brand &&
                spec.model === vehicle.model &&
                spec.vehicleType === vehicle.vehicleType &&
                spec.tip === vehicle.vehicleTip
        );
        if (byVehicle) return byVehicle;
    }

    if (vehicleType) {
        const vehicleTypeForSpec = mapTrailerToTractor(vehicleType);
        const byType = vehicleSpecs.find((spec) => spec.vehicleType === vehicleTypeForSpec);
        if (byType) return byType;
    }

    return null;
}

/** محاسبه هزینه سوخت تور — همان منطق ثبت/ذخیره در محاسبه هزینه */
export function computeTourFuelCost(params: ComputeTourFuelCostParams): number {
    const approvedKm = Number(params.approvedKilometers) || 0;
    const excessKm = Number(params.excessKilometers) || 0;
    const depotKm = Number(params.depotTotalMileage) || 0;
    const totalKmForFuel = approvedKm + excessKm + depotKm;

    const vehicleCode = String(params.vehicleCode || '').trim();
    const plateNumber = params.vehiclePlate || '';
    const vehicleType = params.vehicleType || '';

    const vehicle = findVehicleByCodeOrPlate(params.vehicles, vehicleCode, plateNumber);
    const matchedSpec = findVehicleSpec(vehicle, vehicleType, params.vehicleSpecs);

    if (matchedSpec?.fuelConsumptionPercentage && matchedSpec?.fuelPricePerLiter) {
        return (
            Math.round(
                totalKmForFuel *
                    (matchedSpec.fuelConsumptionPercentage / 100) *
                    matchedSpec.fuelPricePerLiter
            ) || 0
        );
    }

    const mappedVehicleType = mapTrailerToTractor(vehicleType);
    const fuelReg =
        params.fuelConsumptionRegulations?.[mappedVehicleType] ||
        params.fuelConsumptionRegulations?.[vehicleType];

    if (fuelReg) {
        return (
            Math.round((totalKmForFuel / 100) * fuelReg.consumptionPercentage * fuelReg.fuelPrice) || 0
        );
    }

    return 0;
}
