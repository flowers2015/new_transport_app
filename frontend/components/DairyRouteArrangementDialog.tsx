import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FreightAnnouncement } from '../types';
import {
    DAIRY_ARRANGEMENT_DRAG_MIME,
    DAIRY_ARRANGEMENT_VEHICLE_TYPES,
    DairyArrangementRoute,
    DairyArrangementStop,
    DairyTransferOp,
    buildDairyAnnouncementIdsKey,
    buildInitialRoutes,
    buildReverseTransferOps,
    capacityStatus,
    capacityStatusTitle,
    cloneArrangementRoutes,
    collectApprovedRoutes,
    collectPendingRoutes,
    collectReorderOpsIfNeeded,
    collectTransferOpsForMove,
    clearPersistedArrangement,
    dedupeRoutesById,
    decodeDragPayload,
    encodeDragPayload,
    ensureRouteSlots,
    formatStopCardDetail,
    getMovingBlocksForDrag,
    groupRoutesByCity,
    loadPersistedArrangement,
    mergeNewAnnouncementsIntoRoutes,
    moveBlockBetweenRoutes,
    reconcileRoutesCore,
    resolveTargetAnnouncementId,
    resolveOwnerAnnouncementIdForDestination,
    routeMatchesSearch,
    savePersistedArrangement,
    setRouteApproved,
    setRouteVehicleType,
    refreshBlocksInRoutes,
    routeHasStops,
    routeStopsInOrder,
    splitStopInRoute,
    stopBlocks,
    stopDragKey,
    sumRouteTonnageKg,
    reapplyApprovalsFromIndex,
    buildApprovalIndex,
} from '../utils/dairyRouteArrangement';
import {
    logArrangement,
    logArrangementDrop,
    logArrangementRoutes,
    logArrangementSync,
    logArrangementTransferResult,
} from '../utils/dairyRouteArrangementDebug';
import DairyRouteSuggestionDialog from './DairyRouteSuggestionDialog';
import {
    DairyRouteSuggestion,
    applySuggestionToRoutes,
    buildSuggestionCandidatesFromRoutes,
    collectOpsForSuggestionApply,
    getRouteSeedInfo,
} from '../utils/dairyRouteSuggestions';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    announcements: FreightAnnouncement[];
    userId: string;
    onTransferDestination: (
        sourceAnnouncementId: string,
        destinationId: string,
        targetAnnouncementId: string,
        newPosition: number,
        options?: { silent?: boolean }
    ) => Promise<import('../utils/optimisticUpdates').TransferDestinationResult>;
    /** جدا کردن مقصد outlier به اعلام‌بار/ردیف کاملاً جدید */
    onSplitDestinationToNew?: (
        sourceAnnouncementId: string,
        destinationId: string,
        options?: { vehicleType?: string; silent?: boolean }
    ) => Promise<import('../utils/optimisticUpdates').SplitDestinationResult>;
    onChangeVehicleType?: (announcementId: string, vehicleType: string) => Promise<boolean>;
    onRefresh?: () => void;
};

type PanelDensity = 'compact' | 'detail';
type DragSource = { dragKey: string; routeId: string };

type UndoEntry = {
    routes: DairyArrangementRoute[];
    reverseOps?: DairyTransferOp[];
};

const MAX_UNDO = 40;
/** پس‌زمینه نرم — نزدیک سفید ولی کمتر خسته‌کننده برای چشم */
const PAGE_BG = 'bg-stone-100';
const SURFACE_BG = 'bg-stone-50';

const StopCard: React.FC<{
    stop: DairyArrangementStop;
    slotIndex: number;
    routeId: string;
    density: PanelDensity;
    announcementById: Map<string, FreightAnnouncement>;
    draggable?: boolean;
    onDragStart: (dragKey: string, routeId: string) => void;
    onSplit?: (routeId: string, stopKey: string) => void;
}> = ({ stop, slotIndex, routeId, density, announcementById, draggable = true, onDragStart, onSplit }) => {
    const mini = density === 'compact';
    const detail = formatStopCardDetail(stop, announcementById);
    const dragKey = stopDragKey(stop);

    return (
        <div
            draggable={draggable}
            onDragStart={(e) => {
                e.dataTransfer.setData(DAIRY_ARRANGEMENT_DRAG_MIME, encodeDragPayload(dragKey, routeId));
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(dragKey, routeId);
            }}
            className={`w-full h-full rounded border-2 border-black ${SURFACE_BG} cursor-grab active:cursor-grabbing relative ${
                detail.isMerged ? 'ring-2 ring-red-600' : ''
            } ${mini ? 'p-1' : 'p-1.5'}`}
            title={detail.codes}
        >
            <div className="flex items-center justify-between gap-0.5">
                <span className={`font-black text-black ${mini ? 'text-[9px]' : 'text-xs'}`}>
                    {slotIndex + 1}
                </span>
                {detail.isMerged ? (
                    <span
                        className={`bg-red-600 text-white font-black rounded-full flex items-center justify-center leading-none ${
                            mini ? 'text-[10px] min-w-[1.25rem] h-[1.25rem]' : 'text-xs min-w-[1.5rem] h-[1.5rem]'
                        }`}
                    >
                        ×{detail.mergeCount}
                    </span>
                ) : (
                    <span className={`text-black font-bold truncate ${mini ? 'text-[8px] max-w-[3rem]' : 'text-[10px] max-w-[4rem]'}`}>
                        #{detail.codes}
                    </span>
                )}
            </div>
            <div className={`font-black text-black truncate ${mini ? 'text-xs' : 'text-sm'}`}>{detail.city}</div>
            {detail.repType ? (
                <div className={`text-black font-bold truncate ${mini ? 'text-[9px]' : 'text-xs'}`}>{detail.repType}</div>
            ) : null}
            {detail.tonnage ? (
                <div className={`text-red-700 font-black truncate ${mini ? 'text-sm' : 'text-base'}`}>{detail.tonnage}</div>
            ) : null}
            {detail.lis ? (
                <div className={`text-red-600 font-bold truncate ${mini ? 'text-[9px]' : 'text-xs'}`}>LIS: {detail.lis}</div>
            ) : null}
            {detail.products ? (
                <div className={`text-black font-semibold truncate ${mini ? 'text-[8px]' : 'text-[10px]'}`}>{detail.products}</div>
            ) : null}
            {detail.isMerged && onSplit && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSplit(routeId, dragKey);
                    }}
                    className={`absolute bottom-0.5 left-0.5 rounded border-2 border-black ${SURFACE_BG} text-black font-bold hover:bg-stone-100 ${
                        mini ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                    }`}
                >
                    تفکیک
                </button>
            )}
        </div>
    );
};

const RouteRow: React.FC<{
    route: DairyArrangementRoute;
    rowIndex: number;
    announcementById: Map<string, FreightAnnouncement>;
    density: PanelDensity;
    dragSource: DragSource | null;
    onDragStart: (dragKey: string, routeId: string) => void;
    onDropOnRoute: (
        targetRouteId: string,
        targetIndex?: number,
        payload?: { dragKey: string; sourceRouteId: string }
    ) => void;
    onSplitStop: (routeId: string, stopKey: string) => void;
    onVehicleChange: (routeId: string, vehicleType: string) => void;
    onApprove: (routeId: string) => void;
    onUnapprove: (routeId: string) => void;
    onSuggest: (routeId: string) => void;
}> = ({
    route,
    rowIndex,
    announcementById,
    density,
    dragSource,
    onDragStart,
    onDropOnRoute,
    onSplitStop,
    onVehicleChange,
    onApprove,
    onUnapprove,
    onSuggest,
}) => {
    const mini = density === 'compact';
    const tonnage = sumRouteTonnageKg(route);
    const cap = capacityStatus(route.vehicleType, tonnage);
    const capClass =
        cap === 'over' ? 'text-red-700 bg-stone-100 border-red-600' : cap === 'warn' ? 'text-red-600 bg-stone-100 border-black' : 'text-black bg-stone-100 border-black';
    const capTitle = capacityStatusTitle(route.vehicleType, tonnage);
    const slots = ensureRouteSlots(route.stops);
    const firstStop = slots.find((s) => s != null);
    const firstBlock = firstStop ? stopBlocks(firstStop)[0] : undefined;
    const primaryCode = firstBlock?.announcementCode || '—';

    const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (route.approved) return;
        const mime = e.dataTransfer.getData(DAIRY_ARRANGEMENT_DRAG_MIME);
        const payload = decodeDragPayload(mime);
        onDropOnRoute(route.id, targetIndex, payload ?? undefined);
    };

    return (
        <div
            className={`rounded border-2 transition-colors ${SURFACE_BG} ${
                route.approved ? 'border-red-600 opacity-95' : 'border-black hover:border-red-700'
            } ${mini ? 'p-1' : 'p-2'}`}
            onDragOver={(e) => {
                if (route.approved) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => handleDrop(e)}
        >
            <div className={`flex flex-wrap items-center gap-1 ${mini ? 'mb-0.5' : 'mb-1.5'}`}>
                {!mini && (
                    <span className="font-black text-black shrink-0 text-xs w-5">
                        {rowIndex.toLocaleString('fa-IR')}
                    </span>
                )}
                <span
                    className={`font-black text-black shrink-0 truncate ${
                        mini ? 'text-[9px] max-w-[3.5rem]' : 'text-sm max-w-[6rem]'
                    }`}
                >
                    {primaryCode}
                </span>
                <select
                    value={route.vehicleType}
                    disabled={route.approved}
                    onChange={(e) => onVehicleChange(route.id, e.target.value)}
                    className={`border-2 border-black rounded ${SURFACE_BG} shrink-0 font-bold text-black ${
                        mini ? 'text-[8px] px-0.5 py-0 min-w-[3.5rem]' : 'text-xs px-1 py-0.5 min-w-[5rem]'
                    }`}
                    title="تغییر نوع خودرو — در سیستم ثبت می‌شود"
                >
                    {DAIRY_ARRANGEMENT_VEHICLE_TYPES.map((vt) => (
                        <option key={vt} value={vt}>
                            {vt}
                        </option>
                    ))}
                </select>
                <span
                    className={`font-black px-1 rounded border-2 shrink-0 ${capClass} ${mini ? 'text-[9px]' : 'text-sm'}`}
                    title={capTitle}
                >
                    {tonnage.toLocaleString('fa-IR')} kg
                </span>
                {!route.approved && (
                    <button
                        type="button"
                        onClick={() => onSuggest(route.id)}
                        className={`shrink-0 rounded border-2 border-red-600 text-red-700 font-black hover:bg-red-50 ${
                            mini ? 'text-[8px] px-1 py-0' : 'text-xs px-2 py-0.5'
                        }`}
                        title="پیشنهاد ترکیب مقصد بر اساس محور جاده"
                    >
                        پیشنهاد
                    </button>
                )}
                {!mini && (
                    <div className="mr-auto shrink-0">
                        {route.approved ? (
                            <button
                                type="button"
                                onClick={() => onUnapprove(route.id)}
                                className="text-xs px-2 py-0.5 rounded border-2 border-black font-bold hover:bg-red-50"
                            >
                                باز
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={!routeHasStops(route)}
                                onClick={() => onApprove(route.id)}
                                title="قفل ردیف در دیالوگ"
                                className="text-xs px-2 py-0.5 rounded border-2 border-black bg-black text-white font-bold hover:bg-red-700 disabled:opacity-40"
                            >
                                تأیید
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className={`flex flex-row gap-1 ${mini ? 'min-h-[4rem]' : 'min-h-[5.5rem]'}`}>
                {slots.map((stop, idx) => (
                    <div
                        key={`slot-${route.id}-${idx}`}
                        className={`flex-1 min-w-0 rounded border border-dashed border-black/70 bg-stone-200/30 flex items-stretch ${
                            mini ? 'min-h-[3.75rem]' : 'min-h-[5rem]'
                        }`}
                        onDragOver={(e) => {
                            if (route.approved) return;
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onDrop={(e) => handleDrop(e, idx)}
                    >
                        {stop ? (
                            <StopCard
                                stop={stop}
                                slotIndex={idx}
                                routeId={route.id}
                                density={density}
                                announcementById={announcementById}
                                draggable={!route.approved}
                                onDragStart={onDragStart}
                                onSplit={onSplitStop}
                            />
                        ) : (
                            <span className={`text-black font-bold m-auto ${mini ? 'text-[8px]' : 'text-xs'}`}>{idx + 1}</span>
                        )}
                    </div>
                ))}
            </div>
            {dragSource && dragSource.routeId !== route.id && !route.approved && (
                <p className={`text-red-700 font-bold mt-0.5 ${mini ? 'text-[8px]' : 'text-xs'}`}>
                    رها کنید — جابجایی در سیستم ثبت می‌شود
                </p>
            )}
            {route.approved && (
                <p className={`text-red-700 mt-0.5 font-black ${mini ? 'text-[8px]' : 'text-xs'}`}>
                    تأیید شده — جابجایی غیرفعال
                </p>
            )}
        </div>
    );
};

const CitySection: React.FC<{
    city: string;
    routes: DairyArrangementRoute[];
    density: PanelDensity;
    announcementById: Map<string, FreightAnnouncement>;
    dragSource: DragSource | null;
    onDragStart: (dragKey: string, routeId: string) => void;
    onDropOnRoute: (
        targetRouteId: string,
        targetIndex?: number,
        payload?: { dragKey: string; sourceRouteId: string }
    ) => void;
    onSplitStop: (routeId: string, stopKey: string) => void;
    onVehicleChange: (routeId: string, vehicleType: string) => void;
    onApprove: (routeId: string) => void;
    onUnapprove: (routeId: string) => void;
    onSuggest: (routeId: string) => void;
}> = ({
    city,
    routes,
    density,
    announcementById,
    dragSource,
    onDragStart,
    onDropOnRoute,
    onSplitStop,
    onVehicleChange,
    onApprove,
    onUnapprove,
    onSuggest,
}) => {
    const mini = density === 'compact';
    const totalTonnage = routes.reduce((sum, r) => sum + sumRouteTonnageKg(r), 0);

    return (
        <section className={`rounded border-2 border-black ${SURFACE_BG} overflow-hidden ${mini ? 'mb-1' : 'mb-4'}`}>
            <header
                className={`flex flex-wrap items-center gap-2 border-b-2 border-black/80 bg-stone-200/40 ${
                    mini ? 'px-1 py-1' : 'px-3 py-2'
                }`}
            >
                <h3 className={`font-black text-black truncate ${mini ? 'text-sm' : 'text-xl'}`}>{city}</h3>
                <span
                    className={`text-black font-bold border-2 border-black rounded-full shrink-0 ${SURFACE_BG} ${
                        mini ? 'text-[9px] px-1.5' : 'text-xs px-2 py-0.5'
                    }`}
                >
                    {routes.length.toLocaleString('fa-IR')} مسیر
                </span>
                <span className={`text-red-700 font-black truncate ${mini ? 'text-[9px]' : 'text-sm'}`}>
                    {totalTonnage.toLocaleString('fa-IR')} kg
                </span>
            </header>
            <div className={`flex flex-col ${mini ? 'gap-1 p-1' : 'gap-2 p-2'}`}>
                {routes.map((route, idx) => (
                    <RouteRow
                        key={`${density}-${route.id}-${idx}`}
                        route={route}
                        rowIndex={idx + 1}
                        announcementById={announcementById}
                        density={density}
                        dragSource={dragSource}
                        onDragStart={onDragStart}
                        onDropOnRoute={onDropOnRoute}
                        onSplitStop={onSplitStop}
                        onVehicleChange={onVehicleChange}
                        onApprove={onApprove}
                        onUnapprove={onUnapprove}
                        onSuggest={onSuggest}
                    />
                ))}
            </div>
        </section>
    );
};

const DairyRouteArrangementDialog: React.FC<Props> = ({
    isOpen,
    onClose,
    announcements,
    userId,
    onTransferDestination,
    onSplitDestinationToNew,
    onChangeVehicleType,
    onRefresh,
}) => {
    const [routes, setRoutes] = useState<DairyArrangementRoute[]>([]);
    const routesRef = useRef<DairyArrangementRoute[]>([]);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [dragSource, setDragSource] = useState<DragSource | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [detailPanelPercent, setDetailPanelPercent] = useState(67);
    const [suggestRouteId, setSuggestRouteId] = useState<string | null>(null);
    const panelContainerRef = useRef<HTMLDivElement>(null);
    const panelDragRef = useRef<{ startX: number; startPct: number } | null>(null);
    const wasOpenRef = useRef(false);
    const announcementsRef = useRef(announcements);
    const syncedIdsRef = useRef('');

    routesRef.current = routes;
    announcementsRef.current = announcements;

    const pushUndo = useCallback((entry: UndoEntry) => {
        setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), entry]);
    }, []);

    const announcementById = useMemo(() => {
        const m = new Map<string, FreightAnnouncement>();
        announcementsRef.current.forEach((a) => m.set(a.id, a));
        return m;
    }, [announcements]);

    const dairyAnnouncementIdsKey = useMemo(
        () => buildDairyAnnouncementIdsKey(announcements),
        [announcements]
    );

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            syncedIdsRef.current = '';
            setUndoStack([]);
            return;
        }
        if (!wasOpenRef.current) {
            const ann = announcementsRef.current;
            const persisted = loadPersistedArrangement(userId, ann);
            const initial =
                persisted && persisted.length > 0 ? persisted : buildInitialRoutes(ann);
            logArrangementRoutes('INIT', initial);
            logArrangementSync('INIT announcements', dairyAnnouncementIdsKey, ann);
            setRoutes(initial);
            if (initial.length > 0) {
                savePersistedArrangement(userId, initial);
            }
            syncedIdsRef.current = dairyAnnouncementIdsKey;
            setDragSource(null);
            setSearchQuery('');
            setCityFilter('');
            setUndoStack([]);
            wasOpenRef.current = true;
            return;
        }
        if (isApplying) return;

        const ann = announcementsRef.current;
        const prevIds = syncedIdsRef.current;
        if (dairyAnnouncementIdsKey === prevIds) {
            return;
        }

        const prevIdSet = new Set(prevIds ? prevIds.split('|') : []);
        const newIdSet = new Set(dairyAnnouncementIdsKey ? dairyAnnouncementIdsKey.split('|') : []);
        const removed = [...prevIdSet].filter((id) => !newIdSet.has(id));
        const added = [...newIdSet].filter((id) => !prevIdSet.has(id));

        if (removed.length > 0) {
            logArrangement('PRUNE removed announcements', { removed });
            setRoutes((prev) => {
                const idx = buildApprovalIndex(prev);
                return dedupeRoutesById(reapplyApprovalsFromIndex(reconcileRoutesCore(prev, ann), idx));
            });
        } else if (added.length > 0) {
            logArrangement('MERGE new announcements', { added });
            setRoutes((prev) => {
                const idx = buildApprovalIndex(prev);
                return dedupeRoutesById(reapplyApprovalsFromIndex(mergeNewAnnouncementsIntoRoutes(prev, ann), idx));
            });
        }

        syncedIdsRef.current = dairyAnnouncementIdsKey;
    }, [isOpen, dairyAnnouncementIdsKey, userId, isApplying]);

    useEffect(() => {
        if (!isOpen || routes.length === 0) return;
        savePersistedArrangement(userId, routes);
    }, [isOpen, routes, userId]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!panelDragRef.current || !panelContainerRef.current) return;
            const width = panelContainerRef.current.getBoundingClientRect().width;
            if (width <= 0) return;
            const deltaPx = panelDragRef.current.startX - e.clientX;
            const deltaPct = (deltaPx / width) * 100;
            const next = Math.min(82, Math.max(38, panelDragRef.current.startPct + deltaPct));
            setDetailPanelPercent(next);
        };
        const onUp = () => {
            panelDragRef.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    const handlePanelResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        panelDragRef.current = { startX: e.clientX, startPct: detailPanelPercent };
    };

    const cityOptions = useMemo(() => {
        const cities = new Set(routes.map((r) => r.anchorCity).filter(Boolean));
        return Array.from(cities).sort((a, b) => a.localeCompare(b, 'fa'));
    }, [routes]);

    const filteredRoutes = useMemo(() => {
        let list = routes;
        if (cityFilter) list = list.filter((r) => r.anchorCity === cityFilter);
        if (searchQuery.trim()) {
            list = list.filter((r) => routeMatchesSearch(r, searchQuery, announcementById));
        }
        return list;
    }, [routes, cityFilter, searchQuery, announcementById]);

    const citySections = useMemo(() => groupRoutesByCity(filteredRoutes), [filteredRoutes]);
    const pendingRoutes = useMemo(() => collectPendingRoutes(routes), [routes]);
    const approvedRoutes = useMemo(() => collectApprovedRoutes(routes), [routes]);

    const runTransferOps = useCallback(
        async (ops: DairyTransferOp[]) => {
            let latestAnnouncements = announcementsRef.current;
            for (const op of ops) {
                const result = await onTransferDestination(
                    op.sourceAnnouncementId,
                    op.destinationId,
                    op.targetAnnouncementId,
                    op.newPosition,
                    { silent: true }
                );
                logArrangementTransferResult({
                    ok: result.ok,
                    op,
                    announcementCount: result.ok ? result.announcements.length : undefined,
                });
                if (!result.ok) return false;
                latestAnnouncements = result.announcements;
                announcementsRef.current = latestAnnouncements;
            }
            return true;
        },
        [onTransferDestination]
    );

    const applyTransferOps = useCallback(
        async (
            prevRoutes: DairyArrangementRoute[],
            nextRoutes: DairyArrangementRoute[],
            ops: DairyTransferOp[],
            undoEntry?: UndoEntry
        ) => {
            if (undoEntry) pushUndo(undoEntry);

            if (ops.length === 0) {
                logArrangementRoutes('DROP local only (no API)', nextRoutes);
                setRoutes(nextRoutes);
                savePersistedArrangement(userId, nextRoutes);
                return true;
            }

            setIsApplying(true);
            setRoutes(nextRoutes);

            try {
                const ok = await runTransferOps(ops);
                if (!ok) {
                    logArrangementRoutes('ROLLBACK after API fail', prevRoutes);
                    setRoutes(prevRoutes);
                    if (undoEntry) setUndoStack((s) => s.slice(0, -1));
                    return false;
                }
                const reconciled = refreshBlocksInRoutes(nextRoutes, announcementsRef.current);
                syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                logArrangementRoutes('DROP success reconciled', reconciled);
                setRoutes(reconciled);
                savePersistedArrangement(userId, reconciled);
                return true;
            } finally {
                setIsApplying(false);
            }
        },
        [onTransferDestination, userId, pushUndo, runTransferOps]
    );

    const handleDropOnRoute = useCallback(
        async (
            targetRouteId: string,
            targetIndex?: number,
            payload?: { dragKey: string; sourceRouteId: string }
        ) => {
            if (isApplying) {
                logArrangement('DROP blocked', { reason: 'isApplying' });
                return;
            }
            const source = payload ?? dragSource;
            if (!source) {
                logArrangement('DROP blocked', { reason: 'no drag source', payload, dragSource });
                return;
            }
            if (source.sourceRouteId === targetRouteId && targetIndex == null) {
                logArrangement('DROP ignored', { reason: 'same route background' });
                return;
            }

            const currentRoutes = routesRef.current;
            const sourceRoute = currentRoutes.find((r) => r.id === source.sourceRouteId);
            const targetRouteBefore = currentRoutes.find((r) => r.id === targetRouteId);
            if (targetRouteBefore?.approved) {
                logArrangement('DROP blocked', { reason: 'target route approved', targetRouteId });
                return;
            }
            if (sourceRoute?.approved) {
                logArrangement('DROP blocked', { reason: 'source route approved', sourceRouteId: source.sourceRouteId });
                return;
            }

            const movingBlocks = getMovingBlocksForDrag(currentRoutes, source.dragKey);
            if (movingBlocks.length === 0) {
                logArrangement('DROP blocked', { reason: 'no moving blocks', dragKey: source.dragKey });
                return;
            }

            const prevRoutes = cloneArrangementRoutes(currentRoutes);
            const nextRoutes = moveBlockBetweenRoutes(
                currentRoutes,
                source.dragKey,
                source.sourceRouteId,
                targetRouteId,
                targetIndex
            );
            const layoutChanged = nextRoutes !== currentRoutes;

            const targetRoute = nextRoutes.find((r) => r.id === targetRouteId);
            const targetAnnId = targetRoute ? resolveTargetAnnouncementId(targetRoute) : null;

            const annMap = new Map(announcementsRef.current.map((a) => [a.id, a]));
            let ops = targetAnnId
                ? collectTransferOpsForMove(nextRoutes, targetRouteId, movingBlocks, annMap).sort(
                      (a, b) => a.newPosition - b.newPosition
                  )
                : [];
            if (ops.length === 0) {
                ops = collectReorderOpsIfNeeded(nextRoutes, movingBlocks, targetRouteId, annMap).sort(
                    (a, b) => a.newPosition - b.newPosition
                );
            }

            logArrangementDrop({
                sourceRouteId: source.sourceRouteId,
                targetRouteId,
                targetIndex,
                dragKey: source.dragKey,
                movingBlocks: movingBlocks.map((b) => ({
                    destinationId: b.destinationId,
                    announcementId: b.announcementId,
                    city: b.destination.city,
                })),
                targetAnnId,
                ops,
                layoutChanged,
            });

            setDragSource(null);

            if (!layoutChanged) {
                logArrangement('DROP failed', { reason: 'moveBlockBetweenRoutes returned unchanged layout' });
                return;
            }

            const undoEntry: UndoEntry = {
                routes: prevRoutes,
                reverseOps: ops.length > 0 ? buildReverseTransferOps(prevRoutes, ops) : undefined,
            };
            await applyTransferOps(prevRoutes, nextRoutes, ops, undoEntry);
        },
        [dragSource, isApplying, applyTransferOps]
    );

    const handleSplitStop = useCallback(
        (routeId: string, stopKey: string) => {
            pushUndo({ routes: cloneArrangementRoutes(routesRef.current) });
            setRoutes((prev) => splitStopInRoute(prev, routeId, stopKey));
        },
        [pushUndo]
    );

    const handleVehicleChange = useCallback(
        async (routeId: string, vehicleType: string) => {
            const currentRoutes = routesRef.current;
            const route = currentRoutes.find((r) => r.id === routeId);
            if (!route || route.approved || route.vehicleType === vehicleType) return;

            const annId = resolveTargetAnnouncementId(route);
            if (!annId) return;

            const prevRoutes = cloneArrangementRoutes(currentRoutes);
            const optimistic = setRouteVehicleType(currentRoutes, routeId, vehicleType);
            setRoutes(optimistic);

            if (!onChangeVehicleType) {
                pushUndo({ routes: prevRoutes });
                savePersistedArrangement(userId, optimistic);
                return;
            }

            setIsApplying(true);
            try {
                const ok = await onChangeVehicleType(annId, vehicleType);
                if (!ok) {
                    setRoutes(prevRoutes);
                    return;
                }
                pushUndo({ routes: prevRoutes });
                savePersistedArrangement(userId, optimistic);
                onRefresh?.();
            } finally {
                setIsApplying(false);
            }
        },
        [onChangeVehicleType, onRefresh, pushUndo, userId]
    );

    const handleApprove = useCallback(
        (routeId: string) => {
            pushUndo({ routes: cloneArrangementRoutes(routesRef.current) });
            setRoutes((prev) => {
                const next = setRouteApproved(prev, routeId, true);
                savePersistedArrangement(userId, next);
                return next;
            });
        },
        [pushUndo, userId]
    );

    const handleUnapprove = useCallback(
        (routeId: string) => {
            pushUndo({ routes: cloneArrangementRoutes(routesRef.current) });
            setRoutes((prev) => {
                const next = setRouteApproved(prev, routeId, false);
                savePersistedArrangement(userId, next);
                return next;
            });
        },
        [pushUndo, userId]
    );

    const handleUndo = useCallback(async () => {
        if (isApplying || undoStack.length === 0) return;
        const entry = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));

        if (entry.reverseOps?.length) {
            setIsApplying(true);
            try {
                const ok = await runTransferOps(entry.reverseOps);
                if (!ok) {
                    setUndoStack((prev) => [...prev, entry]);
                    alert('برگشت آخرین جابجایی در سیستم ناموفق بود.');
                    return;
                }
                const reconciled = refreshBlocksInRoutes(entry.routes, announcementsRef.current);
                syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                setRoutes(reconciled);
                savePersistedArrangement(userId, reconciled);
                onRefresh?.();
            } finally {
                setIsApplying(false);
            }
            return;
        }

        setRoutes(entry.routes);
        savePersistedArrangement(userId, entry.routes);
    }, [isApplying, undoStack, runTransferOps, userId, onRefresh]);

    const handleClearSavedLayout = useCallback(() => {
        if (!window.confirm('چیدمان ذخیره‌شده در مرورگر پاک شود و از اول ساخته شود؟')) return;
        clearPersistedArrangement(userId);
        const ann = announcementsRef.current;
        const fresh = buildInitialRoutes(ann);
        setRoutes(fresh);
        setUndoStack([]);
        syncedIdsRef.current = buildDairyAnnouncementIdsKey(ann);
    }, [userId]);

    const suggestRoute = useMemo(
        () => (suggestRouteId ? routes.find((r) => r.id === suggestRouteId) || null : null),
        [routes, suggestRouteId]
    );

    const suggestSeed = useMemo(
        () => (suggestRoute ? getRouteSeedInfo(suggestRoute) : null),
        [suggestRoute]
    );

    const suggestCandidates = useMemo(() => {
        if (!suggestRouteId) return [];
        return buildSuggestionCandidatesFromRoutes(routes, suggestRouteId, announcementById);
    }, [routes, suggestRouteId, announcementById]);

    const handleOpenSuggest = useCallback((routeId: string) => {
        const route = routesRef.current.find((r) => r.id === routeId);
        if (!route || route.approved) return;
        setSuggestRouteId(routeId);
    }, []);

    const handleConfirmSuggestion = useCallback(
        async (suggestion: DairyRouteSuggestion, vehicleType: string) => {
            if (!suggestRouteId) return;
            const currentRoutes = routesRef.current;
            const target = currentRoutes.find((r) => r.id === suggestRouteId);
            if (!target || target.approved) return;

            const removeIds = new Set((suggestion.removeStops || []).map((s) => s.destinationId));
            const alreadyIds = new Set(
                routeStopsInOrder(target)
                    .flatMap(stopBlocks)
                    .map((b) => b.destinationId)
            );
            const neededAdds = suggestion.stops.filter((s) => !alreadyIds.has(s.destinationId));
            const emptyCount = ensureRouteSlots(target.stops).filter((s) => s == null).length;
            const emptyAfterRemove = emptyCount + [...removeIds].filter((id) => alreadyIds.has(id)).length;
            if (neededAdds.length > emptyAfterRemove) {
                alert(
                    emptyAfterRemove === 0
                        ? 'این ردیف پر است (۴ مقصد). ابتدا یک مقصد را خالی کنید.'
                        : `این ردیف فقط ${emptyAfterRemove.toLocaleString('fa-IR')} اسلات آزاد خواهد داشت.`
                );
                return;
            }

            const toRemove = (suggestion.removeStops || []).filter((s) => alreadyIds.has(s.destinationId));
            if (toRemove.length > 0 && !onSplitDestinationToNew) {
                alert('جداسازی به ردیف جدید در این محیط پشتیبانی نمی‌شود.');
                return;
            }

            const prevRoutes = cloneArrangementRoutes(currentRoutes);
            const relocateAnnouncementByDestId = new Map<
                string,
                { announcementId: string; announcementCode?: string }
            >();

            setIsApplying(true);
            try {
                // اول outlierها را به اعلام‌بار کاملاً جدید جدا کن
                if (toRemove.length > 0) {
                    const annMapLive = new Map(announcementsRef.current.map((a) => [a.id, a]));
                    for (const stop of toRemove) {
                        const ownerId = resolveOwnerAnnouncementIdForDestination(
                            stop.destinationId,
                            currentRoutes,
                            annMapLive
                        );
                        if (!ownerId) {
                            alert(
                                `مالک مقصد «${stop.city}» در دادهٔ زنده پیدا نشد. یک‌بار رفرش کنید و دوباره تلاش کنید.`
                            );
                            return;
                        }
                        const splitResult = await onSplitDestinationToNew!(ownerId, stop.destinationId, {
                            vehicleType,
                            silent: true,
                        });
                        if (!splitResult.ok) {
                            alert(`جداسازی «${stop.city}» به ردیف جدید ناموفق بود.`);
                            return;
                        }
                        announcementsRef.current = splitResult.announcements;
                        annMapLive.clear();
                        splitResult.announcements.forEach((a) => annMapLive.set(a.id, a));
                        relocateAnnouncementByDestId.set(stop.destinationId, {
                            announcementId: splitResult.newAnnouncementId,
                            announcementCode: splitResult.newAnnouncementCode,
                        });
                    }
                    // جلوی merge همزمان effect که ردیف تکراری می‌سازد
                    syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                }

                const { nextRoutes, movedBlocks, moveTargets, splitHandledDestIds, error, expectedMoveCount } =
                    applySuggestionToRoutes(currentRoutes, suggestRouteId, vehicleType, suggestion, {
                        relocateAnnouncementByDestId,
                    });

                if (error) {
                    alert(error);
                    return;
                }
                if (expectedMoveCount > 0 && movedBlocks.length === 0) {
                    alert('اعمال پیشنهاد ممکن نیست؛ مقصدی جابجا نشد.');
                    return;
                }

                const safeNextRoutes = dedupeRoutesById(nextRoutes);

                const annMap = new Map<string, FreightAnnouncement>();
                announcementsRef.current.forEach((a) => annMap.set(a.id, a));
                const ops = collectOpsForSuggestionApply(
                    safeNextRoutes,
                    moveTargets,
                    annMap,
                    new Set(splitHandledDestIds)
                );

                // تغییر نوع خودرو در سیستم
                const targetAfter = safeNextRoutes.find((r) => r.id === suggestRouteId);
                const annId = targetAfter ? resolveTargetAnnouncementId(targetAfter) : null;
                if (onChangeVehicleType && annId && vehicleType !== target.vehicleType) {
                    const okVt = await onChangeVehicleType(annId, vehicleType);
                    if (!okVt) {
                        alert('تغییر نوع خودرو ناموفق بود.');
                        return;
                    }
                }

                // فقط split انجام شده / یا فقط تغییر خودرو — بدون transfer اضافه
                if (ops.length === 0) {
                    setRoutes(safeNextRoutes);
                    savePersistedArrangement(userId, safeNextRoutes);
                    syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                    setSuggestRouteId(null);
                    onRefresh?.();
                    return;
                }

                const reverseOps = ops.length ? buildReverseTransferOps(prevRoutes, ops) : undefined;
                const ok = await applyTransferOps(prevRoutes, safeNextRoutes, ops, {
                    routes: prevRoutes,
                    reverseOps,
                });
                if (ok) {
                    syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                    setSuggestRouteId(null);
                    onRefresh?.();
                } else {
                    alert('اعمال پیشنهاد ناموفق بود. مقصد جابجا نشد.');
                }
            } finally {
                setIsApplying(false);
            }
        },
        [suggestRouteId, applyTransferOps, onChangeVehicleType, onRefresh, userId, onSplitDestinationToNew]
    );

    const handlers = {
        onDragStart: (dragKey: string, routeId: string) => setDragSource({ dragKey, routeId }),
        onDropOnRoute: handleDropOnRoute,
        onSplitStop: handleSplitStop,
        onVehicleChange: handleVehicleChange,
        onApprove: handleApprove,
        onUnapprove: handleUnapprove,
        onSuggest: handleOpenSuggest,
    };

    if (!isOpen) return null;

    const renderCitySections = (density: PanelDensity) =>
        citySections.map((section) => (
            <CitySection
                key={`${density}-${section.city}`}
                city={section.city}
                routes={section.routes}
                density={density}
                announcementById={announcementById}
                dragSource={dragSource}
                {...handlers}
            />
        ));

    return (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/60" dir="rtl">
            <div className={`flex flex-col h-full w-full ${PAGE_BG} shadow-2xl`}>
                <header className={`flex flex-wrap items-center gap-2 px-3 py-2 ${PAGE_BG} border-b-2 border-black shrink-0`}>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-black">چیدمان مسیر — پاستوریزه</h2>
                        <p className="text-xs text-black font-semibold">
                            جابجایی مقصد بلافاصله در سیستم ثبت می‌شود · «تأیید» = قفل ردیف در دیالوگ
                            {isApplying ? ' · در حال ثبت...' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 mr-auto flex-wrap">
                        <input
                            type="search"
                            placeholder="جستجو..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="text-xs border-2 border-black rounded-md px-2 py-1 w-32 font-semibold"
                        />
                        <select
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="text-xs border-2 border-black rounded-md px-2 py-1 max-w-[7rem] font-semibold"
                        >
                            <option value="">همه شهرها</option>
                            {cityOptions.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                        <span className={`text-xs text-black font-bold border-2 border-black px-1.5 py-0.5 rounded ${SURFACE_BG}`}>
                            {pendingRoutes.length.toLocaleString('fa-IR')} باز
                        </span>
                        <span className={`text-xs text-red-700 font-black border-2 border-red-600 px-1.5 py-0.5 rounded ${SURFACE_BG}`}>
                            {approvedRoutes.length.toLocaleString('fa-IR')} تأیید
                        </span>
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={undoStack.length === 0 || isApplying}
                            className={`px-2 py-1 text-xs font-black rounded-md border-2 border-black ${SURFACE_BG} hover:bg-stone-100 disabled:opacity-40`}
                            title="برگشت آخرین تغییر"
                        >
                            آندو ({undoStack.length.toLocaleString('fa-IR')})
                        </button>
                        <button
                            type="button"
                            onClick={handleClearSavedLayout}
                            className="px-2 py-1 text-xs font-black rounded-md border-2 border-red-600 text-red-700 hover:bg-red-50"
                            title="پاک کردن چیدمان ذخیره‌شده در مرورگر"
                        >
                            پاک کردن حافظه
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1 text-xs font-black rounded-md border-2 border-black bg-black text-white hover:bg-red-700"
                        >
                            بستن
                        </button>
                    </div>
                </header>

                <div ref={panelContainerRef} className={`flex-1 min-h-0 flex p-2 gap-0 ${PAGE_BG}`}>
                    {filteredRoutes.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-black font-bold text-sm">
                            {routes.length === 0
                                ? 'اعلام بار پاستوریزه‌ای برای چیدمان یافت نشد.'
                                : 'با این فیلتر ردیفی یافت نشد.'}
                        </div>
                    ) : (
                        <>
                            <div
                                className={`min-w-0 flex flex-col rounded border-2 border-black ${SURFACE_BG} overflow-hidden`}
                                style={{ width: `${detailPanelPercent}%` }}
                            >
                                <div className={`shrink-0 px-2 py-1 ${PAGE_BG} border-b-2 border-black text-xs font-black text-black`}>
                                    پنل جزئیات — {filteredRoutes.length.toLocaleString('fa-IR')} ردیف
                                </div>
                                <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 ${PAGE_BG}`}>
                                    {renderCitySections('detail')}
                                </div>
                            </div>

                            <div
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="تغییر اندازه پنل‌ها"
                                onMouseDown={handlePanelResizeStart}
                                className={`w-2 shrink-0 cursor-col-resize flex items-center justify-center group touch-none ${PAGE_BG}`}
                                title="بکشید برای تغییر عرض پنل‌ها"
                            >
                                <div className="w-1 h-12 rounded-full bg-black group-hover:bg-red-600 transition-colors" />
                            </div>

                            <div className={`flex-1 min-w-0 flex flex-col rounded border-2 border-black ${SURFACE_BG} overflow-hidden`}>
                                <div className={`shrink-0 px-2 py-1 ${PAGE_BG} border-b-2 border-black text-xs font-black text-black`}>
                                    نمای فشرده
                                </div>
                                <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1 ${PAGE_BG}`}>
                                    {renderCitySections('compact')}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <footer className={`shrink-0 px-3 py-1.5 ${PAGE_BG} border-t-2 border-black text-[10px] text-black font-semibold`}>
                    هر جابجایی در پیگیری زنده منعکس می‌شود · آندو تا {MAX_UNDO.toLocaleString('fa-IR')} مرحله
                </footer>
            </div>

            {suggestRoute && suggestSeed && (
                <DairyRouteSuggestionDialog
                    isOpen={!!suggestRouteId}
                    onClose={() => setSuggestRouteId(null)}
                    seedCities={suggestSeed.cities}
                    seedTonnageKg={suggestSeed.tonnageKg}
                    seedStopCount={suggestSeed.stopCount}
                    seedDestinationIds={suggestSeed.destinationIds}
                    seedStops={suggestSeed.seedStops}
                    initialVehicleType={suggestRoute.vehicleType}
                    candidates={suggestCandidates}
                    onConfirm={handleConfirmSuggestion}
                    isApplying={isApplying}
                />
            )}
        </div>
    );
};

export default DairyRouteArrangementDialog;
