// This is a new file: components/TransportLive.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { FreightAnnouncement, Vehicle, Driver, FreightAnnouncementStatus, FreightLineType, Destination, UserRole, User, View } from '../types';
import { formatJalaliDateTime, formatJalali, formatPlateNumber } from '../utils/jalali';
import { TruckIcon } from './icons/CarIcon';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface TransportLiveProps {
    announcements: FreightAnnouncement[];
    vehicles: Vehicle[];
    drivers: Driver[];
    onUpdateAssignment: (announcementId: string, assignment: { 
        assignmentType: 'company' | 'personal';
        driverId?: string; 
        vehicleId?: string; 
        billOfLadingNumber?: string;
        // Personal driver info
        nationalId?: string;
        driverName?: string;
        driverContact?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        destinations?: Destination[];
    }) => void;
    onFinalize: (announcementIds: string[]) => void;
    onTransferDestination: (sourceAnnouncementId: string, destinationId: string, targetAnnouncementId: string, newPosition: number) => void;
    onForward: (announcementId: string) => void;
    onCancel: (announcementId: string) => void;
    currentUser: User;
}

const getDriverName = (id: string | undefined, drivers: Driver[]) => id ? drivers.find(d => d.id === id)?.name : '-';
const getDriverContact = (id: string | undefined, drivers: Driver[]) => id ? drivers.find(d => d.id === id)?.mobile : '-';
const getVehicleIdentifier = (id: string | undefined, vehicles: Vehicle[]) => {
    if (!id) {
        return '-';
    }
    const vehicle = vehicles.find(v => v.id === id);
    return vehicle ? (vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber || '-') : '-';
};