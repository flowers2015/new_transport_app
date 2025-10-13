import React from 'react';
import { Alert, Part, Vehicle } from '../types';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { formatJalaliDateTime, formatPlateNumber } from '../utils/jalali';

interface AlertsViewProps {
    alerts: Alert[];
    parts: Part[];
    vehicles: Vehicle[];
}

const AlertsView: React.FC<AlertsViewProps> = ({ alerts, parts, vehicles }) => {

    const getPartName = (partId: string) => {
        return parts.find(p => p.id === partId)?.name || 'قطعه نامشخص';
    }
    
    const getVehicleIdentifier = (vehicleId?: string) => {
        if (!vehicleId) return '-';
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return 'خودرو نامشخص';
        return vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || 'نامشخص';
    }

    return (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-lg">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                <ExclamationTriangleIcon className="w-6 h-6 mr-2 text-red-600" />
                مرکز هشدارها
            </h2>
            <div className="space-y-4">
                {alerts.length > 0 ? alerts.map(alert => (
                    <div key={alert.id} className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
                        <div className="flex justify-between items-start">
                           <p className="text-yellow-800 font-semibold">{alert.message}</p>
                           <span className="text-xs text-yellow-600 whitespace-nowrap">{formatJalaliDateTime(alert.date)}</span>
                        </div>
                        <div className="mt-2 text-sm text-yellow-700">
                            {alert.vehicleId && (
                                <>
                                    <span>شناسه خودرو: </span>
                                    <span className="font-mono">{getVehicleIdentifier(alert.vehicleId)}</span>
                                    <span className="mx-2">|</span>
                                </>
                            )}
                            <span>قطعه: </span>
                            <span className="font-mono">{getPartName(alert.partId)}</span>
                        </div>
                    </div>
                )) : (
                    <p className="text-slate-500 text-center py-8">در حال حاضر هیچ هشدار فعالی وجود ندارد.</p>
                )}
            </div>
        </div>
    );
};

export default AlertsView;
