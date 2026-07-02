import React from 'react';
import { FreightAnnouncement } from '../types';
import { TransportLiveTab } from './freightDisplay';

export type ColumnFiltersState = Record<string, string>;

export type SortDirection = 'asc' | 'desc';

export type TransportLiveFilterPrefs = {
    columnFilters: ColumnFiltersState;
    quickSearch: string;
    iceCreamViewMode?: 'my' | 'planning';
    hideReferred?: boolean;
    sortColumn?: string | null;
    sortDirection?: SortDirection;
};

const STORAGE_PREFIX = 'transport-live-filters-v1';

export function transportLiveFilterStorageKey(
    userId: string,
    activeLine: TransportLiveTab,
    viewMode: 'compact' | 'full'
): string {
    return `${STORAGE_PREFIX}:${userId}:${activeLine}:${viewMode}`;
}

export function freightHistoryFilterStorageKey(
    userId: string,
    activeLine: string,
    viewMode: 'compact' | 'full'
): string {
    return `freight-history-filters-v1:${userId}:${activeLine}:${viewMode}`;
}

export function loadTransportLiveFilterPrefs(key: string): TransportLiveFilterPrefs {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return { columnFilters: {}, quickSearch: '' };
        }
        const parsed = JSON.parse(raw) as TransportLiveFilterPrefs;
        return {
            columnFilters: parsed.columnFilters || {},
            quickSearch: parsed.quickSearch || '',
            iceCreamViewMode: parsed.iceCreamViewMode,
            hideReferred: parsed.hideReferred,
            sortColumn: parsed.sortColumn ?? null,
            sortDirection: parsed.sortDirection ?? 'asc',
        };
    } catch {
        return { columnFilters: {}, quickSearch: '' };
    }
}

export function saveTransportLiveFilterPrefs(key: string, prefs: TransportLiveFilterPrefs): void {
    try {
        localStorage.setItem(key, JSON.stringify(prefs));
    } catch {
        /* ignore quota errors */
    }
}

export function extractTextFromReactNode(node: React.ReactNode): string {
    if (node === null || node === undefined || node === false) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) {
        return node.map(extractTextFromReactNode).join('').trim();
    }
    if (React.isValidElement(node)) {
        const children = (node.props as { children?: React.ReactNode }).children;
        if (children === undefined || children === null) return '';
        if (typeof children === 'string') return children;
        if (typeof children === 'number') return String(children);
        if (Array.isArray(children)) {
            return children.map(extractTextFromReactNode).join('').trim();
        }
        return extractTextFromReactNode(children);
    }
    return String(node);
}

export function getColumnCellText(
    header: string,
    ann: FreightAnnouncement,
    idx: number,
    columns: Array<{ header: string; render?: (ann: FreightAnnouncement, idx: number) => React.ReactNode }>
): string {
    const col = columns.find((c) => c.header === header);
    if (!col?.render) return '';
    try {
        const rendered = col.render(ann, idx);
        if (typeof rendered === 'string' || typeof rendered === 'number') {
            return String(rendered);
        }
        return extractTextFromReactNode(rendered).replace(/[📅🕐]/g, '').trim();
    } catch {
        return '';
    }
}

function normalizeFilterText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[\u200c]/g, '')
        .trim();
}

function getDestinationSubColumnText(
    ann: FreightAnnouncement,
    destIndex: number,
    sub: string
): string {
    const dest = ann.destinations?.[destIndex];
    if (!dest) return '';
    switch (sub) {
        case 'نماینده':
            return dest.representativeName || '';
        case 'مقصد':
            return dest.city || '';
        case 'تناژ':
            return dest.tonnage != null ? String(dest.tonnage) : '';
        case 'تاریخ تحویل':
            return dest.deliveryDate || '';
        case 'ساعت تخلیه':
            return dest.unloadTime || '';
        case 'کرایه (ریال)':
            return dest.freightCost != null ? String(dest.freightCost) : '';
        default:
            return '';
    }
}

export function applyTransportLiveFilters(
    rows: FreightAnnouncement[],
    options: {
        columnFilters: ColumnFiltersState;
        quickSearch: string;
        columns: Array<{ header: string; render?: (ann: FreightAnnouncement, idx: number) => React.ReactNode }>;
    }
): FreightAnnouncement[] {
    const activeColumnFilters = Object.entries(options.columnFilters).filter(
        ([, v]) => (v || '').trim() !== ''
    );
    const quick = normalizeFilterText(options.quickSearch);

    if (activeColumnFilters.length === 0 && !quick) {
        return rows;
    }

    return rows.filter((ann, idx) => {
        if (quick) {
            const fromCols = options.columns
                .map((col) => getColumnCellText(col.header, ann, idx, options.columns))
                .join(' ');
            const fromAnn = [
                ann.announcementCode,
                ann.vehicleType,
                ann.originCity,
                ann.brand,
                ann.notes,
                ann.billOfLadingNumber,
                ann.assignedDriverName,
                ann.assignedVehiclePlate,
                ...(ann.products || []),
                ...(ann.destinations || []).flatMap((d) => [
                    d.city,
                    d.representativeName,
                    d.tonnage != null ? String(d.tonnage) : '',
                ]),
            ]
                .filter(Boolean)
                .join(' ');
            const haystack = normalizeFilterText(`${fromCols} ${fromAnn}`);
            if (!haystack.includes(quick)) {
                return false;
            }
        }

        for (const [header, filterValue] of activeColumnFilters) {
            const needle = normalizeFilterText(filterValue);
            const destMatch = header.match(/^مقصد(\d)-(.+)$/);
            if (destMatch) {
                const destIndex = parseInt(destMatch[1], 10) - 1;
                const sub = destMatch[2];
                const cell = normalizeFilterText(
                    getDestinationSubColumnText(ann, destIndex, sub)
                );
                if (!cell.includes(needle)) {
                    return false;
                }
                continue;
            }
            const cell = normalizeFilterText(
                getColumnCellText(header, ann, idx, options.columns)
            );
            if (!cell.includes(needle)) {
                return false;
            }
        }
        return true;
    });
}

export function countActiveFilters(prefs: Pick<TransportLiveFilterPrefs, 'columnFilters' | 'quickSearch'>): number {
    const columnCount = Object.values(prefs.columnFilters).filter((v) => (v || '').trim()).length;
    return columnCount + (prefs.quickSearch.trim() ? 1 : 0);
}

function numericSortValue(header: string, ann: FreightAnnouncement): number | null {
    switch (header) {
        case 'کارتن':
            return ann.cartonCount != null ? Number(ann.cartonCount) : null;
        case 'پالت':
            return ann.palletCount != null ? Number(ann.palletCount) : null;
        case 'ارزش بار (ریال)':
        case 'ارزش بار':
            return ann.cargoValue != null ? Number(ann.cargoValue) : null;
        case 'کرایه کل (ریال)':
        case 'کرایه کل':
            return ann.totalFreightCost != null ? Number(ann.totalFreightCost) : null;
        case 'کرایه تعرفه (ریال)':
            return ann.tariffFreightCost != null ? Number(ann.tariffFreightCost) : null;
        case 'اختلاف کرایه (ریال)': {
            const reg = Number(ann.totalFreightCost) || 0;
            const tar = Number(ann.tariffFreightCost) || 0;
            if (reg <= 0 && tar <= 0) return null;
            return reg - tar;
        }
        case 'کل تناژ (کیلوگرم)':
            return ann.destinations?.reduce((sum, d) => {
                const t = d.tonnage != null && d.tonnage !== '' ? Number(d.tonnage) : 0;
                return sum + (Number.isFinite(t) ? t : 0);
            }, 0) ?? null;
        default:
            return null;
    }
}

function dateSortValue(header: string, ann: FreightAnnouncement): string | null {
    if (header === 'تاریخ اعلام بار') {
        const t = new Date(ann.createdAt as string | Date).getTime();
        return Number.isFinite(t) ? String(t) : null;
    }
    if (header === 'تاریخ تحویل بار') {
        return ann.deliveryDate ? String(ann.deliveryDate).replace(/-/g, '/') : null;
    }
    if (header === 'تاریخ بارگیری') {
        const ld = ann.loadingDate;
        if (ld instanceof Date) {
            return String(ld.getTime());
        }
        return ld ? String(ld).replace(/-/g, '/') : null;
    }
    return null;
}

export function applyTransportLiveSort(
    rows: FreightAnnouncement[],
    options: {
        sortColumn: string | null;
        sortDirection: SortDirection;
        columns: Array<{ header: string; render?: (ann: FreightAnnouncement, idx: number) => React.ReactNode }>;
    }
): FreightAnnouncement[] {
    const { sortColumn, sortDirection, columns } = options;
    if (!sortColumn || sortColumn === 'عملیات') {
        return rows;
    }

    const mult = sortDirection === 'asc' ? 1 : -1;
    const withIndex = rows.map((ann, idx) => ({ ann, idx }));

    withIndex.sort((a, b) => {
        const numA = numericSortValue(sortColumn, a.ann);
        const numB = numericSortValue(sortColumn, b.ann);
        if (numA != null && numB != null) {
            return (numA - numB) * mult;
        }

        const dateA = dateSortValue(sortColumn, a.ann);
        const dateB = dateSortValue(sortColumn, b.ann);
        if (dateA != null && dateB != null) {
            return dateA.localeCompare(dateB, 'fa', { numeric: true, sensitivity: 'base' }) * mult;
        }

        const textA = getColumnCellText(sortColumn, a.ann, a.idx, columns);
        const textB = getColumnCellText(sortColumn, b.ann, b.idx, columns);
        const cmp = textA.localeCompare(textB, 'fa', { numeric: true, sensitivity: 'base' });
        return cmp * mult;
    });

    return withIndex.map(({ ann }) => ann);
}
