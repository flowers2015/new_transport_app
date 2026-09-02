import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    FreightAnnouncement,
    User,
    Vehicle,
    Driver,
    PersonalDriver,
    PersonalVehicle,
    FreightLineType,
} from '../types';
import FreightFinanceDashboard, { BranchFinanceSearchFilters } from './FreightFinanceDashboard';
import { normalizeHistoryAnnouncement } from './FreightHistoryContainer';
import { getApiUrl } from '../utils/apiConfig';
import { downloadFinanceSearchPdf } from '../utils/financeSearchPdf';

const ALL_LINE_TYPES = Object.values(FreightLineType);

const hasAnySearchCriterion = (f: BranchFinanceSearchFilters) =>
    Boolean(
        f.destination.trim() ||
            f.billOfLading.trim() ||
            f.loadingDateFrom.trim() ||
            f.loadingDateTo.trim()
    );

const buildHistoryParams = (
    filters: BranchFinanceSearchFilters,
    lineType: FreightLineType,
    page: number,
    limit: number
) => {
    const params = new URLSearchParams();
    params.append('skipBranchFilter', '1');
    if (filters.destination.trim()) params.append('destination', filters.destination.trim());
    if (filters.billOfLading.trim()) params.append('billOfLading', filters.billOfLading.trim());
    if (filters.loadingDateFrom.trim()) {
        params.append('dateFrom', filters.loadingDateFrom.trim().replace(/-/g, '/'));
    }
    if (filters.loadingDateTo.trim()) {
        params.append('dateTo', filters.loadingDateTo.trim().replace(/-/g, '/'));
    }
    params.append('lineType', lineType);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return params;
};

interface FreightFinanceContainerProps {
    currentUser: User;
}

const FreightFinanceContainer: React.FC<FreightFinanceContainerProps> = ({ currentUser }) => {
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
    const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeLine, setActiveLine] = useState<FreightLineType>(FreightLineType.IceCream);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [lineHitCounts, setLineHitCounts] = useState<Partial<Record<FreightLineType, number>>>({});
    const [pdfExporting, setPdfExporting] = useState(false);
    const lastFiltersRef = useRef<BranchFinanceSearchFilters | null>(null);

    const fetchSearchResults = useCallback(
        async (
            filters: BranchFinanceSearchFilters,
            lineType: FreightLineType,
            page: number,
            limit: number
        ) => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` } as HeadersInit;
                const params = buildHistoryParams(filters, lineType, page, limit);
                const historyUrl = getApiUrl(`freight-announcements/history?${params.toString()}`);
                const { cachedFetch } = await import('../utils/apiCache');

                const [historyResponse, vehiclesData, driversData, personalDriversResponse, personalVehiclesResponse] =
                    await Promise.all([
                        fetch(historyUrl, { headers }).then(async (res) => {
                            if (!res.ok) {
                                const errText = await res.text().catch(() => '');
                                throw new Error(errText || 'خطا در جستجوی اعلام بار');
                            }
                            return res.json();
                        }),
                        cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000),
                        cachedFetch(getApiUrl('drivers'), { headers }, 10 * 60 * 1000),
                        cachedFetch(getApiUrl('personal-drivers?page=1&limit=100'), { headers }, 10 * 60 * 1000),
                        cachedFetch(getApiUrl('personal-vehicles?page=1&limit=100'), { headers }, 10 * 60 * 1000),
                    ]);

                const personalDriversData =
                    personalDriversResponse &&
                    typeof personalDriversResponse === 'object' &&
                    'data' in personalDriversResponse
                        ? personalDriversResponse.data
                        : Array.isArray(personalDriversResponse)
                          ? personalDriversResponse
                          : [];
                const personalVehiclesData =
                    personalVehiclesResponse &&
                    typeof personalVehiclesResponse === 'object' &&
                    'data' in personalVehiclesResponse
                        ? personalVehiclesResponse.data
                        : Array.isArray(personalVehiclesResponse)
                          ? personalVehiclesResponse
                          : [];

                let historyRaw: any[] = [];
                if (historyResponse && typeof historyResponse === 'object' && 'data' in historyResponse) {
                    historyRaw = historyResponse.data;
                    setTotalCount(historyResponse.pagination?.total || 0);
                    setTotalPages(historyResponse.pagination?.totalPages || 0);
                } else {
                    historyRaw = Array.isArray(historyResponse) ? historyResponse : [];
                    setTotalCount(historyRaw.length);
                    setTotalPages(1);
                }

                setAnnouncements(
                    Array.isArray(historyRaw) ? historyRaw.map(normalizeHistoryAnnouncement) : []
                );
                setVehicles(vehiclesData);
                setDrivers(driversData);
                setPersonalDrivers(personalDriversData);
                setPersonalVehicles(personalVehiclesData);
                setHasSearched(true);
            } catch (e: any) {
                setError(e.message || 'خطا در جستجو');
            } finally {
                setLoading(false);
            }
        },
        []
    );

    const refreshLineHitCounts = async (filters: BranchFinanceSearchFilters) => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` } as HeadersInit;
        const counts = await Promise.all(
            ALL_LINE_TYPES.map(async (lt) => {
                const params = buildHistoryParams(filters, lt, 1, 1);
                const res = await fetch(getApiUrl(`freight-announcements/history?${params.toString()}`), {
                    headers,
                });
                if (!res.ok) return [lt, 0] as const;
                const body = await res.json();
                const total =
                    typeof body?.pagination?.total === 'number'
                        ? body.pagination.total
                        : Array.isArray(body?.data)
                          ? body.data.length
                          : Array.isArray(body)
                            ? body.length
                            : 0;
                return [lt, total] as const;
            })
        );
        setLineHitCounts(Object.fromEntries(counts));
    };

    const handleSearch = (filters: BranchFinanceSearchFilters) => {
        if (!hasAnySearchCriterion(filters)) {
            setError('حداقل یکی از فیلدهای مقصد، شماره بارنامه یا تاریخ بارگیری را پر کنید.');
            return;
        }
        lastFiltersRef.current = filters;
        setCurrentPage(1);
        void (async () => {
            await fetchSearchResults(filters, activeLine, 1, itemsPerPage);
            try {
                await refreshLineHitCounts(filters);
            } catch {
                setLineHitCounts({});
            }
        })();
    };

    const handleClear = () => {
        lastFiltersRef.current = null;
        setHasSearched(false);
        setAnnouncements([]);
        setError(null);
        setTotalCount(0);
        setTotalPages(0);
        setCurrentPage(1);
        setLineHitCounts({});
        setPdfExporting(false);
    };

    const handleExportPdf = async () => {
        if (!lastFiltersRef.current) return;
        setPdfExporting(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` } as HeadersInit;
            const pageSize = 100;
            const maxRows = 2000;
            const all: FreightAnnouncement[] = [];
            let page = 1;
            let pages = 1;
            while (page <= pages && all.length < maxRows) {
                const params = buildHistoryParams(lastFiltersRef.current, activeLine, page, pageSize);
                const res = await fetch(getApiUrl(`freight-announcements/history?${params.toString()}`), {
                    headers,
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error(errText || 'خطا در دریافت داده برای PDF');
                }
                const body = await res.json();
                const raw = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
                all.push(...raw.map(normalizeHistoryAnnouncement));
                pages = Number(body?.pagination?.totalPages) || 1;
                if (raw.length === 0) break;
                page += 1;
            }
            await downloadFinanceSearchPdf({
                announcements: all.slice(0, maxRows),
                lineLabel: activeLine,
                currentUser,
                vehicles,
                drivers,
                personalDrivers,
                personalVehicles,
            });
        } catch (e: any) {
            setError(e.message || 'خطا در تهیه PDF');
        } finally {
            setPdfExporting(false);
        }
    };

    useEffect(() => {
        if (!hasSearched || !lastFiltersRef.current) return;
        setCurrentPage(1);
        void fetchSearchResults(lastFiltersRef.current, activeLine, 1, itemsPerPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeLine]);

    const handlePageChange = (newPage: number) => {
        if (!lastFiltersRef.current) return;
        setCurrentPage(newPage);
        void fetchSearchResults(lastFiltersRef.current, activeLine, newPage, itemsPerPage);
    };

    const handleItemsPerPageChange = (newLimit: number) => {
        if (!lastFiltersRef.current) return;
        setItemsPerPage(newLimit);
        setCurrentPage(1);
        void fetchSearchResults(lastFiltersRef.current, activeLine, 1, newLimit);
    };

    return (
        <FreightFinanceDashboard
            currentUser={currentUser}
            announcements={announcements}
            vehicles={vehicles}
            drivers={drivers}
            personalDrivers={personalDrivers}
            personalVehicles={personalVehicles}
            loading={loading}
            error={error}
            hasSearched={hasSearched}
            activeLine={activeLine}
            setActiveLine={setActiveLine}
            onSearch={handleSearch}
            onClear={handleClear}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            lineHitCounts={lineHitCounts}
            onExportPdf={handleExportPdf}
            pdfExporting={pdfExporting}
        />
    );
};

export default FreightFinanceContainer;
