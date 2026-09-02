import React, { useState } from 'react';
import {
    FreightAnnouncement,
    User,
    Vehicle,
    Driver,
    PersonalDriver,
    PersonalVehicle,
    FreightLineType,
} from '../types';
import CityAutocomplete from './CityAutocomplete';
import FreightHistory from './FreightHistory';

export interface BranchFinanceSearchFilters {
    destination: string;
    billOfLading: string;
    loadingDateFrom: string;
    loadingDateTo: string;
}

interface FreightFinanceDashboardProps {
    currentUser: User;
    announcements: FreightAnnouncement[];
    vehicles: Vehicle[];
    drivers: Driver[];
    personalDrivers: PersonalDriver[];
    personalVehicles: PersonalVehicle[];
    loading: boolean;
    error: string | null;
    hasSearched: boolean;
    activeLine: FreightLineType;
    setActiveLine: (line: FreightLineType) => void;
    onSearch: (filters: BranchFinanceSearchFilters) => void;
    onClear: () => void;
    currentPage: number;
    itemsPerPage: number;
    totalCount: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (limit: number) => void;
    lineHitCounts: Partial<Record<FreightLineType, number>>;
    onExportPdf: () => void | Promise<void>;
    pdfExporting: boolean;
}

const FreightFinanceDashboard: React.FC<FreightFinanceDashboardProps> = ({
    currentUser,
    announcements,
    vehicles,
    drivers,
    personalDrivers,
    personalVehicles,
    loading,
    error,
    hasSearched,
    activeLine,
    setActiveLine,
    onSearch,
    onClear,
    currentPage,
    itemsPerPage,
    totalCount,
    totalPages,
    onPageChange,
    onItemsPerPageChange,
    lineHitCounts,
    onExportPdf,
    pdfExporting,
}) => {
    const [destination, setDestination] = useState('');
    const [billOfLading, setBillOfLading] = useState('');
    const [loadingDateFrom, setLoadingDateFrom] = useState('');
    const [loadingDateTo, setLoadingDateTo] = useState('');

    const submitSearch = () => {
        onSearch({
            destination,
            billOfLading,
            loadingDateFrom,
            loadingDateTo,
        });
    };

    const clearForm = () => {
        setDestination('');
        setBillOfLading('');
        setLoadingDateFrom('');
        setLoadingDateTo('');
        onClear();
    };

    return (
        <div className="max-w-screen-2xl mx-auto space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-md print:hidden">
                <h2 className="text-xl font-bold text-slate-800 mb-3">مالی حمل — جستجو</h2>
                <p className="text-xs text-slate-500 mb-4">
                    اعلام‌بارها تا وقتی جستجو نکنید نمایش داده نمی‌شوند. حداقل یکی از فیلدها را پر کنید.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">مقصد</label>
                        <CityAutocomplete
                            cityOnlyLabels
                            value={destination}
                            onChange={setDestination}
                            placeholder="جستجوی شهر مقصد..."
                            className="input-style w-full"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">شماره بارنامه</label>
                        <input
                            type="text"
                            value={billOfLading}
                            onChange={(e) => setBillOfLading(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    submitSearch();
                                }
                            }}
                            placeholder="شماره بارنامه"
                            className="input-style w-full"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">از تاریخ بارگیری</label>
                        <input
                            type="text"
                            value={loadingDateFrom}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\/]/g, '').slice(0, 10);
                                setLoadingDateFrom(value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    submitSearch();
                                }
                            }}
                            placeholder="1404/01/01"
                            className="input-style w-full"
                            dir="ltr"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">تا تاریخ بارگیری</label>
                        <input
                            type="text"
                            value={loadingDateTo}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\/]/g, '').slice(0, 10);
                                setLoadingDateTo(value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    submitSearch();
                                }
                            }}
                            placeholder="1404/12/29"
                            className="input-style w-full"
                            dir="ltr"
                        />
                    </div>
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        onClick={submitSearch}
                        disabled={loading}
                        className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 disabled:opacity-50"
                    >
                        {loading ? 'در حال جستجو...' : 'جستجو'}
                    </button>
                    <button
                        type="button"
                        onClick={clearForm}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300"
                    >
                        پاک کردن
                    </button>
                </div>
                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>

            {!hasSearched && !loading && (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-sm print:hidden">
                    نتایج پس از جستجو در سه تب بستنی / پاستوریزه / لبنیات-فروتلند، با جدول کامل همان تب نمایش داده می‌شود.
                </div>
            )}

            {hasSearched && (
                <FreightHistory
                    announcements={announcements}
                    vehicles={vehicles}
                    drivers={drivers}
                    personalDrivers={personalDrivers}
                    personalVehicles={personalVehicles}
                    currentUser={currentUser}
                    activeLine={activeLine}
                    setActiveLine={setActiveLine}
                    filterDate=""
                    setFilterDate={() => undefined}
                    filterLoadingDate=""
                    setFilterLoadingDate={() => undefined}
                    filterDestination=""
                    setFilterDestination={() => undefined}
                    filterBillOfLading=""
                    setFilterBillOfLading={() => undefined}
                    filterDriverName=""
                    setFilterDriverName={() => undefined}
                    filterCreatorName=""
                    setFilterCreatorName={() => undefined}
                    onSearch={submitSearch}
                    onClearFilters={clearForm}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalCount={totalCount}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                    onItemsPerPageChange={onItemsPerPageChange}
                    variant="financeSearch"
                    lineHitCounts={lineHitCounts}
                    onExportPdf={onExportPdf}
                    pdfExporting={pdfExporting}
                />
            )}
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default FreightFinanceDashboard;
