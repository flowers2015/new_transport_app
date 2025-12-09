import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Driver, Vehicle, PersonalDriver, PersonalVehicle, FreightAnnouncement } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { cachedFetch } from '../utils/apiCache';

interface AppDataContextType {
  // Data
  vehicles: Vehicle[];
  drivers: Driver[];
  personalDrivers: PersonalDriver[];
  personalVehicles: PersonalVehicle[];
  
  // Loading states
  loadingVehicles: boolean;
  loadingDrivers: boolean;
  loadingPersonalDrivers: boolean;
  loadingPersonalVehicles: boolean;
  
  // Error states
  errorVehicles: Error | null;
  errorDrivers: Error | null;
  errorPersonalDrivers: Error | null;
  errorPersonalVehicles: Error | null;
  
  // Refresh functions
  refreshVehicles: () => Promise<void>;
  refreshDrivers: () => Promise<void>;
  refreshPersonalDrivers: () => Promise<void>;
  refreshPersonalVehicles: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
};

interface AppDataProviderProps {
  children: ReactNode;
}

export const AppDataProvider: React.FC<AppDataProviderProps> = ({ children }) => {
  // Data states
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
  const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
  
  // Loading states
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [loadingPersonalDrivers, setLoadingPersonalDrivers] = useState(false);
  const [loadingPersonalVehicles, setLoadingPersonalVehicles] = useState(false);
  
  // Error states
  const [errorVehicles, setErrorVehicles] = useState<Error | null>(null);
  const [errorDrivers, setErrorDrivers] = useState<Error | null>(null);
  const [errorPersonalDrivers, setErrorPersonalDrivers] = useState<Error | null>(null);
  const [errorPersonalVehicles, setErrorPersonalVehicles] = useState<Error | null>(null);
  
  // Get headers
  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    } as HeadersInit;
  }, []);
  
  // Fetch vehicles
  const refreshVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    setErrorVehicles(null);
    try {
      const data = await cachedFetch(getApiUrl('vehicles'), { headers: getHeaders() }, 10 * 60 * 1000); // 10 minutes cache
      setVehicles(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorVehicles(error as Error);
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoadingVehicles(false);
    }
  }, [getHeaders]);
  
  // Fetch drivers
  const refreshDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    setErrorDrivers(null);
    try {
      const data = await cachedFetch(getApiUrl('drivers'), { headers: getHeaders() }, 10 * 60 * 1000); // 10 minutes cache
      setDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorDrivers(error as Error);
      console.error('Error fetching drivers:', error);
    } finally {
      setLoadingDrivers(false);
    }
  }, [getHeaders]);
  
  // Fetch personal drivers
  const refreshPersonalDrivers = useCallback(async () => {
    setLoadingPersonalDrivers(true);
    setErrorPersonalDrivers(null);
    try {
      const data = await cachedFetch(getApiUrl('personal-drivers'), { headers: getHeaders() }, 10 * 60 * 1000); // 10 minutes cache
      setPersonalDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorPersonalDrivers(error as Error);
      console.error('Error fetching personal drivers:', error);
    } finally {
      setLoadingPersonalDrivers(false);
    }
  }, [getHeaders]);
  
  // Fetch personal vehicles
  const refreshPersonalVehicles = useCallback(async () => {
    setLoadingPersonalVehicles(true);
    setErrorPersonalVehicles(null);
    try {
      const data = await cachedFetch(getApiUrl('personal-vehicles'), { headers: getHeaders() }, 10 * 60 * 1000); // 10 minutes cache
      setPersonalVehicles(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorPersonalVehicles(error as Error);
      console.error('Error fetching personal vehicles:', error);
    } finally {
      setLoadingPersonalVehicles(false);
    }
  }, [getHeaders]);
  
  // Refresh all
  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshVehicles(),
      refreshDrivers(),
      refreshPersonalDrivers(),
      refreshPersonalVehicles(),
    ]);
  }, [refreshVehicles, refreshDrivers, refreshPersonalDrivers, refreshPersonalVehicles]);
  
  // Initial load - only fetch if data is not in cache
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    // Try to get from cache first
    const cachedVehicles = cachedFetch(getApiUrl('vehicles'), { headers: getHeaders() }, 10 * 60 * 1000, true); // silent fetch
    const cachedDrivers = cachedFetch(getApiUrl('drivers'), { headers: getHeaders() }, 10 * 60 * 1000, true);
    const cachedPersonalDrivers = cachedFetch(getApiUrl('personal-drivers'), { headers: getHeaders() }, 10 * 60 * 1000, true);
    const cachedPersonalVehicles = cachedFetch(getApiUrl('personal-vehicles'), { headers: getHeaders() }, 10 * 60 * 1000, true);
    
    // If cache exists, use it immediately, then refresh in background
    Promise.all([
      cachedVehicles.then(data => {
        if (data && Array.isArray(data)) setVehicles(data);
        return refreshVehicles();
      }).catch(() => refreshVehicles()),
      cachedDrivers.then(data => {
        if (data && Array.isArray(data)) setDrivers(data);
        return refreshDrivers();
      }).catch(() => refreshDrivers()),
      cachedPersonalDrivers.then(data => {
        if (data && Array.isArray(data)) setPersonalDrivers(data);
        return refreshPersonalDrivers();
      }).catch(() => refreshPersonalDrivers()),
      cachedPersonalVehicles.then(data => {
        if (data && Array.isArray(data)) setPersonalVehicles(data);
        return refreshPersonalVehicles();
      }).catch(() => refreshPersonalVehicles()),
    ]);
  }, []); // Only run once on mount
  
  const value: AppDataContextType = {
    vehicles,
    drivers,
    personalDrivers,
    personalVehicles,
    loadingVehicles,
    loadingDrivers,
    loadingPersonalDrivers,
    loadingPersonalVehicles,
    errorVehicles,
    errorDrivers,
    errorPersonalDrivers,
    errorPersonalVehicles,
    refreshVehicles,
    refreshDrivers,
    refreshPersonalDrivers,
    refreshPersonalVehicles,
    refreshAll,
  };
  
  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

