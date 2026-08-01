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
    loadPersistedArrangementWithMeta,
    applyNewAnnouncementRowsToRoutes,
    isRouteAssignmentLocked,
    moveBlockBetweenRoutes,
    reconcileRoutesCore,
    resolveTargetAnnouncementId,
    resolveLiveTargetAnnouncementId,
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
    reconcileRoutesWithAnnouncements,
} from '../utils/dairyRouteArrangement';
import {
    logArrangement,
    logArrangementDrop,
    logArrangementRoutes,
    logArrangementSync,
    logArrangementTransferResult,
} from '../utils/dairyRouteArrangementDebug';
import {
    ArrangementLock,
    fetchDairyArrangementState,
    saveDairyArrangementState,
    updateDairyArrangementLockApi,
} from '../utils/dairyArrangementSync';
import { dairyArrangementStateId } from '../utils/freightDisplay';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
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
    /** نام نمایشی برای قفل ردیف */
    userName?: string;
    /** شیت اعلام‌بار روز — چیدمان جدا per روز */
    arrangementWeekDay?: string | null;
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
    /** برگشت کل اعلام‌بار به اعلام‌کننده */
    onReturnToCreator?: (announcementId: string, reason: string) => Promise<boolean>;
    /** برگشت فقط یک مقصد به اعلام‌کننده */
    onReturnDestinationToCreator?: (
        sourceAnnouncementId: string,
        destinationId: string,
        reason: string
    ) => Promise<{
        ok: boolean;
        mode?: 'whole' | 'split';
        sourceAnnouncementId?: string;
        returnedAnnouncementId?: string;
        destinationId?: string;
    }>;
};

type PanelDensity = 'compact' | 'detail';
type DragSource = { dragKey: string; routeId: string };

type UndoEntry = {
    routes: DairyArrangementRoute[];
    reverseOps?: DairyTransferOp[];
};

const MAX_UNDO = 40;
const ZOOM_STEPS = [0.7, 0.85, 1, 1.15, 1.3] as const;
/** زوم پنل فشرده — حداقل خیلی کوچک تا همه ردیف‌ها در یک نما جا شوند */

function buildAnnouncementMap(list: FreightAnnouncement[]): Map<string, FreightAnnouncement> {
    const m = new Map<string, FreightAnnouncement>();
    for (const a of list) {
        m.set(a.id, a);
    }
    return m;
}
const COMPACT_ZOOM_STEPS = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1, 1.15] as const;
/** اندیس پیش‌فرض ≈ 55٪ تا ردیف‌های بیشتری دیده شود */
const DEFAULT_COMPACT_ZOOM_INDEX = 3;
/** پس‌زمینه نرم — نزدیک سفید ولی کمتر خسته‌کننده برای چشم */
const PAGE_BG = 'bg-stone-100';
const SURFACE_BG = 'bg-stone-50';

const isReturnableAnnouncementStatus = (status?: string) => {
    const s = String(status || '');
    return (
        !s ||
        s === 'PendingPersonalAssignment' ||
        s === 'PendingCompanyAssignment' ||
        s.includes('در انتظار تخصیص')
    );
};

const collectReturnableAnnouncementIds = (
    stop: DairyArrangementStop,
    announcementById: Map<string, FreightAnnouncement>
): string[] => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const block of stopBlocks(stop)) {
        if (seen.has(block.announcementId)) continue;
        const ann = announcementById.get(block.announcementId);
        if (!isReturnableAnnouncementStatus(ann?.status as string | undefined)) continue;
        seen.add(block.announcementId);
        ids.push(block.announcementId);
    }
    return ids;
};

const StopCard: React.FC<{
    stop: DairyArrangementStop;
    slotIndex: number;
    routeId: string;
    density: PanelDensity;
    announcementById: Map<string, FreightAnnouncement>;
    draggable?: boolean;
    onDragStart: (dragKey: string, routeId: string) => void;
    onSplit?: (routeId: string, stopKey: string) => void;
    onRequestReturn?: (routeId: string, stopKey: string) => void;
    onRequestSplitToNew?: (routeId: string, stopKey: string) => void;
    canShowReturn?: boolean;
    canShowSplitToNew?: boolean;
}> = ({
    stop,
    slotIndex,
    routeId,
    density,
    announcementById,
    draggable = true,
    onDragStart,
    onSplit,
    onRequestReturn,
    onRequestSplitToNew,
    canShowReturn = false,
    canShowSplitToNew = false,
}) => {
    const mini = density === 'compact';
    const detail = formatStopCardDetail(stop, announcementById);
    const dragKey = stopDragKey(stop);
    const returnableIds = collectReturnableAnnouncementIds(stop, announcementById);
    const showReturn = canShowReturn && !!onRequestReturn && returnableIds.length > 0;
    const blocks = stopBlocks(stop);
    const canSplitToNew =
        canShowSplitToNew &&
        !!onRequestSplitToNew &&
        blocks.some((b) => {
            const ann = announcementById.get(b.announcementId);
            return (ann?.destinations?.length || 0) > 1;
        });

    return (
        <div
            draggable={draggable}
            onDragStart={(e) => {
                e.dataTransfer.setData(DAIRY_ARRANGEMENT_DRAG_MIME, encodeDragPayload(dragKey, routeId));
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(dragKey, routeId);
            }}
            onDragEnd={() => {
                // drop موفق خودش قفل را آزاد می‌کند؛ اینجا برای لغو درگ
                window.dispatchEvent(
                    new CustomEvent('dairy-arrangement-drag-end', { detail: { routeId } })
                );
            }}
            className={`w-full h-full rounded border-2 ${
                draggable
                    ? `border-black ${SURFACE_BG} cursor-grab active:cursor-grabbing`
                    : 'border-stone-400 bg-stone-100 text-stone-500 cursor-not-allowed'
            } relative ${
                detail.isMerged ? 'ring-2 ring-red-600' : ''
            } ${mini ? 'p-1 pb-5' : 'p-1.5 pb-6'}`}
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
            <div className="absolute bottom-0.5 left-0.5 flex flex-wrap gap-0.5 max-w-full">
                {detail.isMerged && onSplit && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSplit(routeId, dragKey);
                        }}
                        className={`rounded border-2 border-black ${SURFACE_BG} text-black font-bold hover:bg-stone-100 ${
                            mini ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                        }`}
                    >
                        تفکیک
                    </button>
                )}
                {canSplitToNew && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRequestSplitToNew?.(routeId, dragKey);
                        }}
                        className={`rounded border-2 border-sky-700 text-sky-900 font-black hover:bg-sky-50 ${
                            mini ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                        }`}
                        title="جدا کردن این مقصد به ردیف/اعلام‌بار جدید در ترابری"
                    >
                        ردیف جدید
                    </button>
                )}
                {showReturn && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRequestReturn?.(routeId, dragKey);
                        }}
                        className={`rounded border-2 border-amber-700 text-amber-900 font-black hover:bg-amber-50 ${
                            mini ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                        }`}
                        title="برگشت فقط این مقصد به اعلام‌کننده"
                    >
                        برگشت
                    </button>
                )}
            </div>
        </div>
    );
};

const RouteRow: React.FC<{
    route: DairyArrangementRoute;
    rowIndex: number;
    announcementById: Map<string, FreightAnnouncement>;
    density: PanelDensity;
    dragSource: DragSource | null;
    routeLock?: ArrangementLock | null;
    currentUserId: string;
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
    onRequestReturn?: (routeId: string, stopKey: string) => void;
    onRequestSplitToNew?: (routeId: string, stopKey: string) => void;
}> = ({
    route,
    rowIndex,
    announcementById,
    density,
    dragSource,
    routeLock,
    currentUserId,
    onDragStart,
    onDropOnRoute,
    onSplitStop,
    onVehicleChange,
    onApprove,
    onUnapprove,
    onSuggest,
    onRequestReturn,
    onRequestSplitToNew,
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
    const assignmentLocked = isRouteAssignmentLocked(route, announcementById);
    const lockedByOther = Boolean(routeLock && routeLock.userId && routeLock.userId !== currentUserId);
    const interactionLocked = route.approved || assignmentLocked || lockedByOther;

    const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (interactionLocked) return;
        const mime = e.dataTransfer.getData(DAIRY_ARRANGEMENT_DRAG_MIME);
        const payload = decodeDragPayload(mime);
        onDropOnRoute(route.id, targetIndex, payload ?? undefined);
    };

    const assignedAnn = firstBlock ? announcementById.get(firstBlock.announcementId) : undefined;
    const assignedLabel = assignmentLocked
        ? [assignedAnn?.assignedDriverName, assignedAnn?.assignedVehiclePlate].filter(Boolean).join(' · ') ||
          'تخصیص خودرو و راننده'
        : '';

    return (
        <div
            className={`rounded border-2 transition-colors ${
                lockedByOther
                    ? 'bg-amber-50 border-amber-500 opacity-90'
                    : assignmentLocked
                      ? 'bg-stone-200 border-stone-400 opacity-80'
                      : route.approved
                        ? `${SURFACE_BG} border-red-600 opacity-95`
                        : `${SURFACE_BG} border-black hover:border-red-700`
            } ${mini ? 'p-1' : 'p-2'}`}
            onDragOver={(e) => {
                if (interactionLocked) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => handleDrop(e)}
        >
            {lockedByOther && (
                <p className={`text-amber-800 font-black mb-0.5 ${mini ? 'text-[8px]' : 'text-[10px]'}`}>
                    در حال ویرایش توسط {routeLock?.userName || 'کاربر دیگر'}
                </p>
            )}
            <div className={`flex flex-wrap items-center gap-1 ${mini ? 'mb-0.5' : 'mb-1.5'}`}>
                {!mini && (
                    <span className={`font-black shrink-0 text-xs w-5 ${assignmentLocked ? 'text-stone-500' : 'text-black'}`}>
                        {rowIndex.toLocaleString('fa-IR')}
                    </span>
                )}
                <span
                    className={`font-black shrink-0 truncate ${
                        assignmentLocked ? 'text-stone-500' : 'text-black'
                    } ${mini ? 'text-[9px] max-w-[3.5rem]' : 'text-sm max-w-[6rem]'}`}
                >
                    {primaryCode}
                </span>
                {assignmentLocked && (
                    <span
                        className={`shrink-0 rounded border border-stone-500 bg-stone-300 text-stone-700 font-black ${
                            mini ? 'text-[8px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'
                        }`}
                        title={assignedLabel}
                    >
                        تخصیص‌شده
                    </span>
                )}
                <select
                    value={route.vehicleType}
                    disabled={interactionLocked}
                    onChange={(e) => onVehicleChange(route.id, e.target.value)}
                    className={`border-2 rounded shrink-0 font-bold ${
                        assignmentLocked
                            ? 'border-stone-400 bg-stone-200 text-stone-500 cursor-not-allowed'
                            : `border-black ${SURFACE_BG} text-black`
                    } ${mini ? 'text-[8px] px-0.5 py-0 min-w-[3.5rem]' : 'text-xs px-1 py-0.5 min-w-[5rem]'}`}
                    title={assignmentLocked ? 'ردیف تخصیص‌شده — تغییر مجاز نیست' : 'تغییر نوع خودرو — در سیستم ثبت می‌شود'}
                >
                    {DAIRY_ARRANGEMENT_VEHICLE_TYPES.map((vt) => (
                        <option key={vt} value={vt}>
                            {vt}
                        </option>
                    ))}
                </select>
                <span
                    className={`font-black px-1 rounded border-2 shrink-0 ${
                        assignmentLocked
                            ? 'text-stone-500 bg-stone-200 border-stone-400'
                            : capClass
                    } ${mini ? 'text-[9px]' : 'text-sm'}`}
                    title={capTitle}
                >
                    {tonnage.toLocaleString('fa-IR')} kg
                </span>
                {!interactionLocked && (
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
                {!mini && !assignmentLocked && (
                    <div className="mr-auto shrink-0">
                        {route.approved ? (
                            <button
                                type="button"
                                onClick={() => onUnapprove(route.id)}
                                className="text-xs px-2 py-0.5 rounded border-2 border-black font-bold hover:bg-red-50"
                            >
                                باز کن
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={!routeHasStops(route)}
                                onClick={() => onApprove(route.id)}
                                title="قفل ردیف در دیالوگ"
                                className="text-xs px-2 py-0.5 rounded border-2 border-black bg-black text-white font-bold hover:bg-red-700 disabled:opacity-40"
                            >
                                قفل کن
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className={`flex flex-row gap-1 ${mini ? 'min-h-[4rem]' : 'min-h-[5.5rem]'}`}>
                {slots.map((stop, idx) => (
                    <div
                        key={`slot-${route.id}-${idx}`}
                        className={`flex-1 min-w-0 rounded border border-dashed flex items-stretch ${
                            assignmentLocked
                                ? 'border-stone-400 bg-stone-300/40'
                                : 'border-black/70 bg-stone-200/30'
                        } ${mini ? 'min-h-[3.75rem]' : 'min-h-[5rem]'}`}
                        onDragOver={(e) => {
                            if (interactionLocked) return;
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
                                draggable={!interactionLocked}
                                onDragStart={onDragStart}
                                onSplit={interactionLocked ? undefined : onSplitStop}
                                onRequestReturn={onRequestReturn}
                                onRequestSplitToNew={onRequestSplitToNew}
                                canShowReturn={!interactionLocked}
                                canShowSplitToNew={!interactionLocked}
                            />
                        ) : (
                            <span
                                className={`font-bold m-auto ${
                                    assignmentLocked ? 'text-stone-400' : 'text-black'
                                } ${mini ? 'text-[8px]' : 'text-xs'}`}
                            >
                                {idx + 1}
                            </span>
                        )}
                    </div>
                ))}
            </div>
            {dragSource && dragSource.routeId !== route.id && !interactionLocked && (
                <p className={`text-red-700 font-bold mt-0.5 ${mini ? 'text-[8px]' : 'text-xs'}`}>
                    رها کنید — جابجایی در سیستم ثبت می‌شود
                </p>
            )}
            {assignmentLocked ? (
                <p className={`text-stone-600 mt-0.5 font-black ${mini ? 'text-[8px]' : 'text-xs'}`}>
                    تخصیص‌شده{assignedLabel ? ` — ${assignedLabel}` : ''} — همه فعالیت‌ها غیرفعال
                </p>
            ) : route.approved ? (
                <p className={`text-red-700 mt-0.5 font-black ${mini ? 'text-[8px]' : 'text-xs'}`}>
                    قفل شده — جابجایی غیرفعال
                </p>
            ) : null}
        </div>
    );
};

const CitySection: React.FC<{
    city: string;
    routes: DairyArrangementRoute[];
    density: PanelDensity;
    announcementById: Map<string, FreightAnnouncement>;
    dragSource: DragSource | null;
    locks: Record<string, ArrangementLock>;
    currentUserId: string;
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
    onRequestReturn?: (routeId: string, stopKey: string) => void;
    onRequestSplitToNew?: (routeId: string, stopKey: string) => void;
}> = ({
    city,
    routes,
    density,
    announcementById,
    dragSource,
    locks,
    currentUserId,
    onDragStart,
    onDropOnRoute,
    onSplitStop,
    onVehicleChange,
    onApprove,
    onUnapprove,
    onSuggest,
    onRequestReturn,
    onRequestSplitToNew,
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
                        routeLock={locks[route.id] || null}
                        currentUserId={currentUserId}
                        onDragStart={onDragStart}
                        onDropOnRoute={onDropOnRoute}
                        onSplitStop={onSplitStop}
                        onVehicleChange={onVehicleChange}
                        onApprove={onApprove}
                        onUnapprove={onUnapprove}
                        onSuggest={onSuggest}
                        onRequestReturn={onRequestReturn}
                        onRequestSplitToNew={onRequestSplitToNew}
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
    userName,
    arrangementWeekDay = null,
    onTransferDestination,
    onSplitDestinationToNew,
    onChangeVehicleType,
    onRefresh,
    onReturnToCreator,
    onReturnDestinationToCreator,
}) => {
    const arrangementWeekDayRef = useRef(arrangementWeekDay);
    arrangementWeekDayRef.current = arrangementWeekDay;
    const [routes, setRoutes] = useState<DairyArrangementRoute[]>([]);
    const routesRef = useRef<DairyArrangementRoute[]>([]);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [dragSource, setDragSource] = useState<DragSource | null>(null);
    const [detailSearchQuery, setDetailSearchQuery] = useState('');
    const [compactSearchQuery, setCompactSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [detailPanelPercent, setDetailPanelPercent] = useState(67);
    const [suggestRouteId, setSuggestRouteId] = useState<string | null>(null);
    const [detailZoomIndex, setDetailZoomIndex] = useState(2);
    const [compactZoomIndex, setCompactZoomIndex] = useState(DEFAULT_COMPACT_ZOOM_INDEX);
    const compactScrollRef = useRef<HTMLDivElement>(null);
    const compactContentRef = useRef<HTMLDivElement>(null);
    const [sharedVersion, setSharedVersion] = useState<number | null>(null);
    const sharedVersionRef = useRef<number | null>(null);
    const [locks, setLocks] = useState<Record<string, ArrangementLock>>({});
    const locksRef = useRef<Record<string, ArrangementLock>>({});
    const [syncLabel, setSyncLabel] = useState('در حال همگام‌سازی...');
    const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
    const applyingRemoteRef = useRef(false);
    const suppressSaveUntilRef = useRef(0);
    const saveInFlightRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pushSharedLayoutRef = useRef<
        ((nextRoutes: DairyArrangementRoute[], options?: { forceRetry?: boolean }) => Promise<void>) | null
    >(null);
    const heldLockRouteIdRef = useRef<string | null>(null);
    const dropInProgressRef = useRef(false);
    const [returnTarget, setReturnTarget] = useState<{
        routeId: string;
        stopKey: string;
        items: Array<{ announcementId: string; destinationId: string; city: string }>;
        cityLabel: string;
    } | null>(null);
    const [returnReason, setReturnReason] = useState('');
    const [isReturning, setIsReturning] = useState(false);
    const panelContainerRef = useRef<HTMLDivElement>(null);
    const panelDragRef = useRef<{ startX: number; startPct: number } | null>(null);
    const wasOpenRef = useRef(false);
    const announcementsRef = useRef<FreightAnnouncement[]>(announcements);
    const syncedIdsRef = useRef('');

    routesRef.current = routes;
    announcementsRef.current = announcements;
    sharedVersionRef.current = sharedVersion;
    locksRef.current = locks;

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
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            if (routesRef.current.length > 0 && !saveInFlightRef.current && pushSharedLayoutRef.current) {
                void pushSharedLayoutRef.current(routesRef.current, { forceRetry: true });
            }
            wasOpenRef.current = false;
            syncedIdsRef.current = '';
            setUndoStack([]);
            setRemoteNotice(null);
            setSyncLabel('قطع');
            setSharedVersion(null);
            setLocks({});
            if (heldLockRouteIdRef.current) {
                void updateDairyArrangementLockApi(heldLockRouteIdRef.current, 'release', arrangementWeekDayRef.current);
                heldLockRouteIdRef.current = null;
            }
            return;
        }

        let cancelled = false;
        wasOpenRef.current = true;
        const ann = announcementsRef.current;
        setDragSource(null);
        setDetailSearchQuery('');
        setCompactSearchQuery('');
        setCityFilter('');
        setUndoStack([]);
        setSyncLabel('در حال بارگذاری چیدمان مشترک...');

        (async () => {
            try {
                const shared = await fetchDairyArrangementState(arrangementWeekDayRef.current);
                if (cancelled || !wasOpenRef.current) return;

        const persistedMeta = loadPersistedArrangementWithMeta(userId, ann);
        const persisted = persistedMeta?.routes || null;
        let initial: DairyArrangementRoute[] = [];
        const persistedIsFresh =
            persistedMeta?.savedAt != null &&
            Date.now() - persistedMeta.savedAt < 5 * 60 * 1000;
        const preferPersistedOverShared = !!persisted?.length && persistedIsFresh;

                if (shared?.routes?.length && !preferPersistedOverShared) {
                    initial = reconcileRoutesWithAnnouncements(shared.routes, ann);
                    setSharedVersion(shared.version);
                    setLocks(shared.locks || {});
                    setSyncLabel(
                        `همگام · نسخه ${shared.version}${
                            shared.updatedByUserName ? ` · آخرین: ${shared.updatedByUserName}` : ''
                        }`
                    );
                } else if (persisted && persisted.length > 0) {
                    initial = persisted;
                    setSharedVersion(shared?.version ?? null);
                    setLocks(shared?.locks || {});
                    setSyncLabel(
                        preferPersistedOverShared
                            ? 'چیدمان محلی تازه‌تر — در حال انتشار به سرور...'
                            : 'چیدمان محلی — در حال انتشار به سرور...'
                    );
                } else {
                    initial = buildInitialRoutes(ann);
                    setSharedVersion(shared?.version ?? null);
                    setLocks(shared?.locks || {});
                    setSyncLabel('چیدمان اولیه — در حال انتشار به سرور...');
                }

                if (cancelled || !wasOpenRef.current) return;
                logArrangementRoutes('INIT', initial);
                setRoutes(initial);
                syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);

                if (initial.length > 0) {
                    savePersistedArrangement(userId, initial);
                    const saved = await saveDairyArrangementState(initial, shared?.version ?? null, arrangementWeekDayRef.current);
                    if (cancelled || !wasOpenRef.current) return;
                    if (saved.ok === true) {
                        setSharedVersion(saved.state.version);
                        setLocks(saved.state.locks || {});
                        setSyncLabel(`همگام · نسخه ${saved.state.version}`);
                    } else if (saved.conflict === true && saved.state) {
                        const remote = reconcileRoutesWithAnnouncements(
                            saved.state.routes || [],
                            announcementsRef.current
                        );
                        setRoutes(remote);
                        setSharedVersion(saved.state.version);
                        setLocks(saved.state.locks || {});
                        setSyncLabel(`همگام · نسخه ${saved.state.version} (تعارض برطرف شد)`);
                        setRemoteNotice('چیدمان از سرور جایگزین شد چون نسخه جدیدتری وجود داشت.');
                    } else {
                        setSyncLabel(
                            saved.message
                                ? `چیدمان محلی · ${saved.message}`
                                : 'چیدمان محلی — ذخیره سرور ناموفق'
                        );
                    }
                } else {
                    setSyncLabel('اعلام بار پاستوریزه‌ای برای چیدمان یافت نشد');
                }
            } catch (err) {
                console.error('❌ [DairyArrangement] init failed:', err);
                if (cancelled || !wasOpenRef.current) return;
                try {
                    const fallback =
                        loadPersistedArrangement(userId, announcementsRef.current) ||
                        buildInitialRoutes(announcementsRef.current);
                    setRoutes(fallback);
                    syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                    setSyncLabel('خطا در همگام‌سازی — چیدمان محلی بارگذاری شد');
                    setRemoteNotice('ارتباط با سرور چیدمان برقرار نشد؛ از نسخه محلی استفاده شد.');
                } catch (fallbackErr) {
                    console.error('❌ [DairyArrangement] fallback init failed:', fallbackErr);
                    setRoutes([]);
                    setSyncLabel('خطا در بارگذاری چیدمان');
                }
            }
        })();

        return () => {
            cancelled = true;
            // wasOpenRef را اینجا false نکن — فقط با بسته شدن دیالوگ؛
            // در غیر این صورت async نیمه‌کاره و Strict Mode با هم تداخل می‌کنند.
        };
    }, [isOpen, userId]);

    useEffect(() => {
        if (!isOpen || !wasOpenRef.current || isApplying) return;

        const ann = announcementsRef.current;
        const prevIds = syncedIdsRef.current;
        if (!prevIds || dairyAnnouncementIdsKey === prevIds) {
            if (!prevIds) syncedIdsRef.current = dairyAnnouncementIdsKey;
            return;
        }

        const prevIdSet = new Set(prevIds.split('|').filter(Boolean));
        const newIdSet = new Set(dairyAnnouncementIdsKey ? dairyAnnouncementIdsKey.split('|') : []);
        const removed = [...prevIdSet].filter((id) => !newIdSet.has(id));
        const added = [...newIdSet].filter((id) => !prevIdSet.has(id));

        if (added.length > 0) {
            logArrangement('MERGE new announcements', { added, removed });
            setRoutes((prev) =>
                applyNewAnnouncementRowsToRoutes(prev, ann, added as string[])
            );
        } else if (removed.length > 0) {
            logArrangement('PRUNE removed announcements', { removed });
            setRoutes((prev) => {
                const idx = buildApprovalIndex(prev);
                return dedupeRoutesById(reapplyApprovalsFromIndex(reconcileRoutesCore(prev, ann), idx));
            });
        }

        syncedIdsRef.current = dairyAnnouncementIdsKey;
    }, [isOpen, dairyAnnouncementIdsKey, isApplying]);

    const beginRemoteApply = useCallback(() => {
        applyingRemoteRef.current = true;
        suppressSaveUntilRef.current = Date.now() + 1200;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, []);

    const endRemoteApply = useCallback(() => {
        applyingRemoteRef.current = false;
        suppressSaveUntilRef.current = Date.now() + 800;
    }, []);

    const applyRemoteArrangementState = useCallback(
        (state: {
            routes?: DairyArrangementRoute[];
            version?: number;
            locks?: Record<string, ArrangementLock>;
            updatedByUserName?: string | null;
        }, notice?: string) => {
            beginRemoteApply();
            const remote = reconcileRoutesWithAnnouncements(
                Array.isArray(state.routes) ? state.routes : [],
                announcementsRef.current
            );
            setRoutes(remote);
            if (state.version != null) setSharedVersion(Number(state.version));
            if (state.locks) setLocks(state.locks);
            setSyncLabel(`همگام · نسخه ${state.version ?? sharedVersionRef.current ?? '—'}`);
            if (notice) setRemoteNotice(notice);
            savePersistedArrangement(userId, remote);
            syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
            endRemoteApply();
            return remote;
        },
        [beginRemoteApply, endRemoteApply, userId]
    );

    const resyncFromServer = useCallback(
        async (notice?: string) => {
            beginRemoteApply();
            try {
                onRefresh?.();
                const shared = await fetchDairyArrangementState(arrangementWeekDayRef.current);
                if (shared) {
                    applyRemoteArrangementState(
                        shared,
                        notice ||
                            `همگام با سرور · نسخه ${shared.version}${
                                shared.updatedByUserName ? ` · ${shared.updatedByUserName}` : ''
                            }`
                    );
                    return shared;
                }
            } catch (e) {
                console.error('❌ [DairyArrangement] resyncFromServer failed', e);
            } finally {
                endRemoteApply();
            }
            return null;
        },
        [applyRemoteArrangementState, beginRemoteApply, endRemoteApply, onRefresh]
    );

    const pushSharedLayout = useCallback(
        async (nextRoutes: DairyArrangementRoute[], options?: { forceRetry?: boolean }) => {
            if (applyingRemoteRef.current && !options?.forceRetry) return;
            if (Date.now() < suppressSaveUntilRef.current && !options?.forceRetry) return;
            if (saveInFlightRef.current) return;
            if ((dropInProgressRef.current || isApplying) && !options?.forceRetry) return;

            saveInFlightRef.current = true;
            try {
                let baseVersion = sharedVersionRef.current;
                let result = await saveDairyArrangementState(nextRoutes, baseVersion, arrangementWeekDayRef.current);
                // تعارض نسخه: یک‌بار با نسخهٔ تازه دوباره ذخیره کن و چیدمان محلی را نگه دار
                // (اعمال چیدمان قدیمی سرور باعث برگرداندن کارت به ردیف قبلی می‌شد)
                if (result.ok === false && result.conflict === true && result.state) {
                    baseVersion = Number(result.state.version);
                    sharedVersionRef.current = baseVersion;
                    setSharedVersion(baseVersion);
                    result = await saveDairyArrangementState(nextRoutes, baseVersion, arrangementWeekDayRef.current);
                }
                if (result.ok === true) {
                    sharedVersionRef.current = result.state.version;
                    setSharedVersion(result.state.version);
                    setLocks(result.state.locks || {});
                    setSyncLabel(`همگام · نسخه ${result.state.version}`);
                    savePersistedArrangement(userId, nextRoutes);
                    suppressSaveUntilRef.current = Date.now() + 500;
                    return;
                }
                if (result.conflict === true && result.state) {
                    // هنوز conflict: نسخه را جلو ببر، چیدمان محلی را عوض نکن
                    sharedVersionRef.current = Number(result.state.version);
                    setSharedVersion(Number(result.state.version));
                    setLocks(result.state.locks || {});
                    setRemoteNotice(
                        result.message ||
                            'نسخه سرور همزمان تغییر کرد — چیدمان شما نگه داشته شد و دوباره همگام می‌شود.'
                    );
                }
            } finally {
                saveInFlightRef.current = false;
            }
        },
        [userId, isApplying]
    );

    useEffect(() => {
        pushSharedLayoutRef.current = pushSharedLayout;
    }, [pushSharedLayout]);

    useEffect(() => {
        if (!isOpen || routes.length === 0) return;
        savePersistedArrangement(userId, routes);
        if (applyingRemoteRef.current) return;
        if (Date.now() < suppressSaveUntilRef.current) return;
        if (dropInProgressRef.current || isApplying) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            void pushSharedLayout(routesRef.current);
        }, 700);
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [isOpen, routes, userId, pushSharedLayout, isApplying]);

    useRealtimeUpdates({
        enabled: isOpen,
        onMessage: (message) => {
            if (!isOpen) return;
            if (message.type === 'general_update') {
                if (message.updateType === 'dairy_arrangement_layout') {
                    const data = message.data || {};
                    const expectedId = dairyArrangementStateId(arrangementWeekDayRef.current);
                    if (data.id && String(data.id) !== expectedId) return;
                    if (data.updatedByUserId && String(data.updatedByUserId) === String(userId)) return;
                    if (dropInProgressRef.current || isApplying || applyingRemoteRef.current) {
                        suppressSaveUntilRef.current = Date.now() + 500;
                        return;
                    }
                    // اگر نسخه قدیمی‌تر یا مساوی است، نادیده بگیر
                    if (
                        data.version != null &&
                        sharedVersionRef.current != null &&
                        Number(data.version) <= Number(sharedVersionRef.current)
                    ) {
                        return;
                    }
                    applyRemoteArrangementState(
                        data,
                        `به‌روزرسانی زنده از «${data.updatedByUserName || 'کاربر دیگر'}»`
                    );
                    return;
                }
                if (message.updateType === 'dairy_arrangement_locks') {
                    const data = message.data || {};
                    const expectedId = dairyArrangementStateId(arrangementWeekDayRef.current);
                    if (data.id && String(data.id) !== expectedId) return;
                    if (data.actorUserId && String(data.actorUserId) === String(userId)) return;
                    if (data.locks) setLocks(data.locks);
                    return;
                }
                if (message.updateType === 'dairy_arrangement_data_changed') {
                    // فقط لیست اعلام‌بار را تازه کن؛ کل چیدمان را عوض نکن
                    // (بازنشانی کامل باعث پرش کارت به جای قبلی می‌شد)
                    if (dropInProgressRef.current || isApplying) return;
                    setRemoteNotice('داده اعلام‌بار تغییر کرد — هم‌ترازسازی ردیف‌ها...');
                    onRefresh?.();
                    setTimeout(() => {
                        if (applyingRemoteRef.current || dropInProgressRef.current) return;
                        setRoutes((prev) => {
                            const next = reconcileRoutesWithAnnouncements(
                                prev,
                                announcementsRef.current
                            );
                            savePersistedArrangement(userId, next);
                            syncedIdsRef.current = buildDairyAnnouncementIdsKey(
                                announcementsRef.current
                            );
                            return next;
                        });
                    }, 600);
                }
            }
            if (message.type === 'announcement_update') {
                const t = message.updateType || '';
                if (
                    t === 'updated' ||
                    t === 'created' ||
                    t === 'cancelled' ||
                    t === 'assigned' ||
                    t === 'returned_to_creator'
                ) {
                    onRefresh?.();
                }
            }
        },
    });

    useEffect(() => {
        if (!isOpen) return;
        const timer = setInterval(() => {
            void (async () => {
                if (dropInProgressRef.current || isApplying || applyingRemoteRef.current) return;
                const shared = await fetchDairyArrangementState(arrangementWeekDayRef.current);
                if (!shared) return;
                if (
                    sharedVersionRef.current != null &&
                    shared.version > sharedVersionRef.current
                ) {
                    applyRemoteArrangementState(
                        shared,
                        `همگام‌سازی خودکار · نسخه ${shared.version}${
                            shared.updatedByUserName ? ` · ${shared.updatedByUserName}` : ''
                        }`
                    );
                } else if (shared.locks) {
                    setLocks(shared.locks);
                }
            })();
        }, 8000);
        return () => clearInterval(timer);
    }, [isOpen, userId, applyRemoteArrangementState, isApplying]);

    useEffect(() => {
        if (!remoteNotice) return;
        const t = setTimeout(() => setRemoteNotice(null), 5000);
        return () => clearTimeout(t);
    }, [remoteNotice]);

    const acquireRouteLock = useCallback(async (routeId: string): Promise<boolean> => {
        const existing = locksRef.current[routeId];
        if (existing && String(existing.userId) !== String(userId)) {
            alert(`این ردیف توسط «${existing.userName}» در حال ویرایش است.`);
            return false;
        }
        const result = await updateDairyArrangementLockApi(routeId, 'acquire', arrangementWeekDayRef.current);
        if (!result.ok) {
            if (result.locks) setLocks(result.locks);
            alert(result.message || 'قفل ردیف ممکن نیست.');
            return false;
        }
        if (result.locks) setLocks(result.locks);
        heldLockRouteIdRef.current = routeId;
        return true;
    }, [userId]);

    const releaseRouteLock = useCallback(async (routeId?: string | null) => {
        const id = routeId || heldLockRouteIdRef.current;
        if (!id) return;
        const result = await updateDairyArrangementLockApi(id, 'release', arrangementWeekDayRef.current);
        if (result.locks) setLocks(result.locks);
        if (heldLockRouteIdRef.current === id) heldLockRouteIdRef.current = null;
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onDragEnd = (e: Event) => {
            const routeId = (e as CustomEvent<{ routeId?: string }>).detail?.routeId;
            setDragSource(null);
            // drop موفق خودش قفل را آزاد می‌کند
            if (dropInProgressRef.current || isApplying) return;
            if (routeId) void releaseRouteLock(routeId);
        };
        window.addEventListener('dairy-arrangement-drag-end', onDragEnd as EventListener);
        return () => window.removeEventListener('dairy-arrangement-drag-end', onDragEnd as EventListener);
    }, [isOpen, isApplying, releaseRouteLock]);

    useEffect(() => {
        if (!isOpen || !heldLockRouteIdRef.current) return;
        const timer = setInterval(() => {
            const id = heldLockRouteIdRef.current;
            if (!id) return;
            void updateDairyArrangementLockApi(id, 'heartbeat', arrangementWeekDayRef.current).then((r) => {
                if (r.locks) setLocks(r.locks);
                if (!r.ok) heldLockRouteIdRef.current = null;
            });
        }, 30000);
        return () => clearInterval(timer);
    }, [isOpen, dragSource]);

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
        const cities = new Set<string>();
        routes.forEach((r) => {
            if (r.anchorCity) cities.add(r.anchorCity);
        });
        return Array.from(cities).sort((a, b) => a.localeCompare(b, 'fa'));
    }, [routes]);

    const filterRoutesForPanel = useCallback(
        (searchQuery: string) => {
            let list = routes;
            if (cityFilter) list = list.filter((r) => r.anchorCity === cityFilter);
            if (searchQuery.trim()) {
                list = list.filter((r) => routeMatchesSearch(r, searchQuery, announcementById));
            }
            return list;
        },
        [routes, cityFilter, announcementById]
    );

    const detailFilteredRoutes = useMemo(
        () => filterRoutesForPanel(detailSearchQuery),
        [filterRoutesForPanel, detailSearchQuery]
    );
    const compactFilteredRoutes = useMemo(
        () => filterRoutesForPanel(compactSearchQuery),
        [filterRoutesForPanel, compactSearchQuery]
    );

    const detailCitySections = useMemo(
        () => groupRoutesByCity(detailFilteredRoutes),
        [detailFilteredRoutes]
    );
    const compactCitySections = useMemo(
        () => groupRoutesByCity(compactFilteredRoutes),
        [compactFilteredRoutes]
    );
    const pendingRoutes = useMemo(() => collectPendingRoutes(routes), [routes]);
    const approvedRoutes = useMemo(() => collectApprovedRoutes(routes), [routes]);

    const runTransferOps = useCallback(
        async (ops: DairyTransferOp[]) => {
            let latestAnnouncements = announcementsRef.current;
            for (const op of ops) {
                let sourceId = op.sourceAnnouncementId;
                let targetId = op.targetAnnouncementId;

                const refreshIds = () => {
                    latestAnnouncements = announcementsRef.current;
                    const byId = new Map(latestAnnouncements.map((a) => [a.id, a]));
                    const owner = latestAnnouncements.find((a) =>
                        (a.destinations || []).some((d) => d.id === op.destinationId)
                    );
                    if (owner) sourceId = owner.id;

                    // اگر هدف مرده است، از چیدمان فعلی هدف زنده بگیر
                    // مقصد در حال جابجایی را حذف کن تا مالک مبدأ به‌عنوان هدف اشتباه گرفته نشود
                    if (!byId.has(targetId)) {
                        const route = routesRef.current.find((r) =>
                            routeStopsInOrder(r)
                                .flatMap(stopBlocks)
                                .some((b) => b.destinationId === op.destinationId)
                        );
                        if (route) {
                            const live = resolveLiveTargetAnnouncementId(
                                route,
                                byId,
                                new Set([op.destinationId])
                            );
                            if (live) targetId = live;
                        }
                    }
                    return byId;
                };

                let byId = refreshIds();
                // همان اعلام‌بار: بازترتیب داخل تور است و باید با newPosition به سرور برود
                if (!byId.has(sourceId) || !byId.has(targetId)) {
                    onRefresh?.();
                    await new Promise((r) => setTimeout(r, 400));
                    byId = refreshIds();
                }
                if (!byId.has(sourceId) || !byId.has(targetId)) {
                    logArrangement('TRANSFER skip — missing live announcement', {
                        destinationId: op.destinationId,
                        sourceId,
                        targetId,
                    });
                    return false;
                }

                let result = await onTransferDestination(
                    sourceId,
                    op.destinationId,
                    targetId,
                    op.newPosition,
                    { silent: true }
                );

                // فقط برای خطای شبکه/۵۰۰ یک‌بار تلاش مجدد — نه برای ۴۰۴
                if (!result.ok && (result.status == null || result.status >= 500)) {
                    await new Promise((r) => setTimeout(r, 350));
                    byId = refreshIds();
                    if (sourceId === targetId) {
                        result = { ok: true, announcements: announcementsRef.current };
                    } else if (byId.has(sourceId) && byId.has(targetId)) {
                        result = await onTransferDestination(
                            sourceId,
                            op.destinationId,
                            targetId,
                            op.newPosition,
                            { silent: true }
                        );
                    }
                } else if (!result.ok && result.status === 404) {
                    byId = refreshIds();
                    if (sourceId === targetId) {
                        result = { ok: true, announcements: announcementsRef.current };
                    } else if (
                        byId.has(sourceId) &&
                        byId.has(targetId) &&
                        sourceId !== op.sourceAnnouncementId
                    ) {
                        // مالک عوض شده — یک‌بار با شناسهٔ تازه
                        result = await onTransferDestination(
                            sourceId,
                            op.destinationId,
                            targetId,
                            op.newPosition,
                            { silent: true }
                        );
                    }
                }

                logArrangementTransferResult({
                    ok: result.ok,
                    op: {
                        ...op,
                        sourceAnnouncementId: sourceId,
                        targetAnnouncementId: targetId,
                    },
                    announcementCount: result.ok ? result.announcements.length : undefined,
                });
                if (!result.ok) return false;
                latestAnnouncements = result.announcements;
                announcementsRef.current = latestAnnouncements;
            }
            return true;
        },
        [onTransferDestination, onRefresh]
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
            // تا پایان انتقال، چیدمان remote اعمال نشود
            beginRemoteApply();

            try {
                const ok = await runTransferOps(ops);
                if (!ok) {
                    logArrangementRoutes('ROLLBACK after API fail', prevRoutes);
                    setUndoStack((s) => (undoEntry ? s.slice(0, -1) : s));
                    setRoutes(prevRoutes);
                    savePersistedArrangement(userId, prevRoutes);
                    setRemoteNotice('جابجایی ثبت نشد — وضعیت قبلی نگه داشته شد.');
                    onRefresh?.();
                    return false;
                }
                const reconciled = refreshBlocksInRoutes(nextRoutes, announcementsRef.current);
                syncedIdsRef.current = buildDairyAnnouncementIdsKey(announcementsRef.current);
                logArrangementRoutes('DROP success reconciled', reconciled);
                setRoutes(reconciled);
                savePersistedArrangement(userId, reconciled);
                suppressSaveUntilRef.current = Date.now() + 1200;
                // تا ذخیره چیدمان تمام نشده، remote اعمال نشود
                await pushSharedLayout(reconciled, { forceRetry: true });
                onRefresh?.();
                return true;
            } finally {
                endRemoteApply();
                setIsApplying(false);
            }
        },
        [
            userId,
            pushUndo,
            runTransferOps,
            onRefresh,
            pushSharedLayout,
            beginRemoteApply,
            endRemoteApply,
        ]
    );

    const isRouteLockedByOther = useCallback(
        (routeId: string): ArrangementLock | null => {
            const lock = locksRef.current[routeId];
            if (lock && lock.userId && String(lock.userId) !== String(userId)) return lock;
            return null;
        },
        [userId]
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

            const sourceLock = isRouteLockedByOther(source.sourceRouteId);
            const targetLock = isRouteLockedByOther(targetRouteId);
            if (sourceLock || targetLock) {
                const who = (sourceLock || targetLock)?.userName || 'کاربر دیگر';
                alert(`این ردیف توسط «${who}» در حال ویرایش است.`);
                setDragSource(null);
                void releaseRouteLock(source.sourceRouteId);
                return;
            }

            const currentRoutes = routesRef.current;
            const sourceRoute = currentRoutes.find((r) => r.id === source.sourceRouteId);
            const targetRouteBefore = currentRoutes.find((r) => r.id === targetRouteId);
            const annMap = buildAnnouncementMap(announcementsRef.current);
            if (
                !targetRouteBefore ||
                targetRouteBefore.approved ||
                isRouteAssignmentLocked(targetRouteBefore, annMap)
            ) {
                logArrangement('DROP blocked', {
                    reason: !targetRouteBefore
                        ? 'target missing'
                        : targetRouteBefore.approved
                          ? 'target route approved'
                          : 'target route assignment-locked',
                    targetRouteId,
                });
                void releaseRouteLock(source.sourceRouteId);
                setDragSource(null);
                return;
            }
            if (
                !sourceRoute ||
                sourceRoute.approved ||
                isRouteAssignmentLocked(sourceRoute, annMap)
            ) {
                logArrangement('DROP blocked', {
                    reason: !sourceRoute
                        ? 'source missing'
                        : sourceRoute.approved
                          ? 'source route approved'
                          : 'source route assignment-locked',
                    sourceRouteId: source.sourceRouteId,
                });
                void releaseRouteLock(source.sourceRouteId);
                setDragSource(null);
                return;
            }

            const movingBlocks = getMovingBlocksForDrag(currentRoutes, source.dragKey);
            if (movingBlocks.length === 0) {
                logArrangement('DROP blocked', { reason: 'no moving blocks', dragKey: source.dragKey });
                void releaseRouteLock(source.sourceRouteId);
                setDragSource(null);
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
            const movedDestIds = new Set(movingBlocks.map((b) => b.destinationId));
            const targetAnnId = targetRoute
                ? resolveLiveTargetAnnouncementId(targetRoute, annMap, movedDestIds)
                : null;

            if (!targetAnnId) {
                logArrangement('DROP blocked', { reason: 'no live target announcement', targetRouteId });
                setRemoteNotice('ردیف مقصد نامعتبر است — در حال همگام‌سازی...');
                setDragSource(null);
                void releaseRouteLock(source.sourceRouteId);
                onRefresh?.();
                setRoutes((prev) =>
                    reconcileRoutesWithAnnouncements(prev, announcementsRef.current)
                );
                return;
            }

            let ops = collectTransferOpsForMove(nextRoutes, targetRouteId, movingBlocks, annMap).sort(
                (a, b) => a.newPosition - b.newPosition
            );
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
                void releaseRouteLock(source.sourceRouteId);
                return;
            }

            dropInProgressRef.current = true;
            // قفل مقصد هم هنگام جابجایی
            if (source.sourceRouteId !== targetRouteId) {
                const okTarget = await acquireRouteLock(targetRouteId);
                if (!okTarget) {
                    dropInProgressRef.current = false;
                    void releaseRouteLock(source.sourceRouteId);
                    return;
                }
            }

            const undoEntry: UndoEntry = {
                routes: prevRoutes,
                reverseOps: ops.length > 0 ? buildReverseTransferOps(prevRoutes, ops) : undefined,
            };
            try {
                await applyTransferOps(prevRoutes, nextRoutes, ops, undoEntry);
            } finally {
                dropInProgressRef.current = false;
                void releaseRouteLock(source.sourceRouteId);
                if (source.sourceRouteId !== targetRouteId) {
                    void releaseRouteLock(targetRouteId);
                }
            }
        },
        [dragSource, isApplying, applyTransferOps, isRouteLockedByOther, acquireRouteLock, releaseRouteLock]
    );

    const handleSplitStop = useCallback(
        async (routeId: string, stopKey: string) => {
            const route = routesRef.current.find((r) => r.id === routeId);
            const annMap = buildAnnouncementMap(announcementsRef.current);
            if (!route || route.approved || isRouteAssignmentLocked(route, annMap)) return;
            if (isRouteLockedByOther(routeId)) {
                alert(`این ردیف توسط «${isRouteLockedByOther(routeId)?.userName}» در حال ویرایش است.`);
                return;
            }
            const ok = await acquireRouteLock(routeId);
            if (!ok) return;
            try {
                pushUndo({ routes: cloneArrangementRoutes(routesRef.current) });
                setRoutes((prev) => splitStopInRoute(prev, routeId, stopKey));
            } finally {
                void releaseRouteLock(routeId);
            }
        },
        [pushUndo, isRouteLockedByOther, acquireRouteLock, releaseRouteLock]
    );

    const handleVehicleChange = useCallback(
        async (routeId: string, vehicleType: string) => {
            const currentRoutes = routesRef.current;
            const route = currentRoutes.find((r) => r.id === routeId);
            const annMap = buildAnnouncementMap(announcementsRef.current);
            if (
                !route ||
                route.approved ||
                isRouteAssignmentLocked(route, annMap) ||
                route.vehicleType === vehicleType
            ) {
                return;
            }
            if (isRouteLockedByOther(routeId)) {
                alert(`این ردیف توسط «${isRouteLockedByOther(routeId)?.userName}» در حال ویرایش است.`);
                return;
            }
            const lockOk = await acquireRouteLock(routeId);
            if (!lockOk) return;

            const annId = resolveTargetAnnouncementId(route);
            if (!annId) {
                void releaseRouteLock(routeId);
                return;
            }

            const prevRoutes = cloneArrangementRoutes(currentRoutes);
            const optimistic = setRouteVehicleType(currentRoutes, routeId, vehicleType);
            setRoutes(optimistic);

            if (!onChangeVehicleType) {
                pushUndo({ routes: prevRoutes });
                savePersistedArrangement(userId, optimistic);
                void releaseRouteLock(routeId);
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
                void releaseRouteLock(routeId);
            }
        },
        [onChangeVehicleType, onRefresh, pushUndo, userId, isRouteLockedByOther, acquireRouteLock, releaseRouteLock]
    );

    const handleApprove = useCallback(
        (routeId: string) => {
            const route = routesRef.current.find((r) => r.id === routeId);
            const annMap = buildAnnouncementMap(announcementsRef.current);
            if (!route || isRouteAssignmentLocked(route, annMap)) return;
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
            const route = routesRef.current.find((r) => r.id === routeId);
            const annMap = buildAnnouncementMap(announcementsRef.current);
            if (!route || isRouteAssignmentLocked(route, annMap)) return;
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
        if (
            !window.confirm(
                'چیدمان مشترک پاک شود و از اول ساخته شود؟ این تغییر برای همه کاربران اعمال می‌شود.'
            )
        ) {
            return;
        }
        clearPersistedArrangement(userId);
        const ann = announcementsRef.current;
        const fresh = buildInitialRoutes(ann);
        setRoutes(fresh);
        setUndoStack([]);
        syncedIdsRef.current = buildDairyAnnouncementIdsKey(ann);
        void pushSharedLayout(fresh);
    }, [userId, pushSharedLayout]);

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
        const annMap = buildAnnouncementMap(announcementsRef.current);
        if (!route || route.approved || isRouteAssignmentLocked(route, annMap)) return;
        setSuggestRouteId(routeId);
    }, []);

    const handleConfirmSuggestion = useCallback(
        async (suggestion: DairyRouteSuggestion, vehicleType: string) => {
            if (!suggestRouteId) return;
            const currentRoutes = routesRef.current;
            const target = currentRoutes.find((r) => r.id === suggestRouteId);
            const annMapForLock = buildAnnouncementMap(announcementsRef.current);
            if (!target || target.approved || isRouteAssignmentLocked(target, annMapForLock)) return;

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
                    const annMapLive = buildAnnouncementMap(announcementsRef.current);
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
        onDragStart: (dragKey: string, routeId: string) => {
            const other = isRouteLockedByOther(routeId);
            if (other) {
                alert(`این ردیف توسط «${other.userName}» در حال ویرایش است.`);
                return;
            }
            setDragSource({ dragKey, routeId });
            void acquireRouteLock(routeId).then((ok) => {
                if (!ok) setDragSource(null);
            });
        },
        onDropOnRoute: handleDropOnRoute,
        onSplitStop: handleSplitStop,
        onVehicleChange: handleVehicleChange,
        onApprove: handleApprove,
        onUnapprove: handleUnapprove,
        onSuggest: handleOpenSuggest,
        onRequestReturn: onReturnDestinationToCreator || onReturnToCreator
            ? (routeId: string, stopKey: string) => {
                  const route = routesRef.current.find((r) => r.id === routeId);
                  if (!route) return;
                  const other = isRouteLockedByOther(routeId);
                  if (other) {
                      alert(`این ردیف توسط «${other.userName}» در حال ویرایش است.`);
                      return;
                  }
                  const annMap = buildAnnouncementMap(announcementsRef.current);
                  if (isRouteAssignmentLocked(route, annMap)) {
                      alert('این ردیف تخصیص خودرو و راننده شده و قابل تغییر نیست.');
                      return;
                  }
                  if (route.approved) {
                      alert('برای برگشت، ابتدا ردیف را با دکمه «باز کن» از حالت قفل خارج کنید.');
                      return;
                  }
                  const stop =
                      route.stops.find((s) => s && stopDragKey(s) === stopKey) ||
                      route.stops.find((s) =>
                          s ? stopBlocks(s).some((b) => stopKey.includes(b.destinationId)) : false
                      );
                  if (!stop) {
                      alert('کارت مقصد یافت نشد.');
                      return;
                  }
                  const items: Array<{ announcementId: string; destinationId: string; city: string }> = [];
                  const seen = new Set<string>();
                  for (const block of stopBlocks(stop)) {
                      if (seen.has(block.destinationId)) continue;
                      const ann = announcementById.get(block.announcementId);
                      if (!isReturnableAnnouncementStatus(ann?.status as string | undefined)) continue;
                      seen.add(block.destinationId);
                      items.push({
                          announcementId: block.announcementId,
                          destinationId: block.destinationId,
                          city: block.destination.city?.trim() || 'مقصد',
                      });
                  }
                  if (items.length === 0) {
                      alert('این کارت قابل برگشت نیست (فقط بارهای در انتظار تخصیص).');
                      return;
                  }
                  const cityLabel = items.map((i) => i.city).join('، ');
                  setReturnTarget({ routeId, stopKey, items, cityLabel });
                  setReturnReason('');
              }
            : undefined,
        onRequestSplitToNew: onSplitDestinationToNew
            ? async (routeId: string, stopKey: string) => {
                  const route = routesRef.current.find((r) => r.id === routeId);
                  if (!route) return;
                  const other = isRouteLockedByOther(routeId);
                  if (other) {
                      alert(`این ردیف توسط «${other.userName}» در حال ویرایش است.`);
                      return;
                  }
                  const annMap = buildAnnouncementMap(announcementsRef.current);
                  if (isRouteAssignmentLocked(route, annMap)) {
                      alert('این ردیف تخصیص خودرو و راننده شده و قابل تغییر نیست.');
                      return;
                  }
                  if (route.approved) {
                      alert('برای جداسازی، ابتدا ردیف را با دکمه «باز کن» از حالت قفل خارج کنید.');
                      return;
                  }
                  const stop =
                      route.stops.find((s) => s && stopDragKey(s) === stopKey) ||
                      route.stops.find((s) =>
                          s ? stopBlocks(s).some((b) => stopKey.includes(b.destinationId)) : false
                      );
                  if (!stop) {
                      alert('کارت مقصد یافت نشد.');
                      return;
                  }
                  const blocks = stopBlocks(stop);
                  const splitable = blocks.filter((b) => {
                      const ann = announcementById.get(b.announcementId);
                      return (ann?.destinations?.length || 0) > 1;
                  });
                  if (splitable.length === 0) {
                      alert('این مقصد تنها مقصد اعلام‌بار است؛ برای ردیف جدا همین الان اعلام‌بار مستقل دارد.');
                      return;
                  }
                  if (
                      !confirm(
                          `مقصد(های) «${formatStopCardDetail(stop, announcementById).city}» به ردیف/اعلام‌بار جدید در ترابری منتقل شوند؟`
                      )
                  ) {
                      return;
                  }
                  setIsApplying(true);
                  try {
                      // همه مقصدهای قابل جداسازی این کارت را به یک ردیف جدید ببر
                      const first = splitable[0];
                      const firstResult = await onSplitDestinationToNew(first.announcementId, first.destinationId, {
                          vehicleType: route.vehicleType,
                          silent: true,
                      });
                      if (!firstResult.ok || !firstResult.newAnnouncementId) {
                          alert('جداسازی به ردیف جدید ناموفق بود.');
                          return;
                      }
                      const newId = firstResult.newAnnouncementId;
                      let workingAnnouncements = firstResult.announcements || announcementsRef.current;
                      for (let i = 1; i < splitable.length; i += 1) {
                          const b = splitable[i];
                          // اگر هنوز روی همان منبع است، به اعلام‌بار جدید منتقل کن
                          const stillOnSource = workingAnnouncements
                              .find((a) => a.id === b.announcementId)
                              ?.destinations?.some((d) => d.id === b.destinationId);
                          if (!stillOnSource) continue;
                          const transferResult = await onTransferDestination(
                              b.announcementId,
                              b.destinationId,
                              newId,
                              i + 1,
                              { silent: true }
                          );
                          if (transferResult.ok && transferResult.announcements) {
                              workingAnnouncements = transferResult.announcements;
                          }
                      }
                      announcementsRef.current = workingAnnouncements;
                      const nextRoutes = applyNewAnnouncementRowsToRoutes(
                          routesRef.current,
                          workingAnnouncements,
                          [newId]
                      );
                      setRoutes(nextRoutes);
                      savePersistedArrangement(userId, nextRoutes);
                      syncedIdsRef.current = buildDairyAnnouncementIdsKey(workingAnnouncements);
                      onRefresh?.();
                      alert('مقصد به ردیف جدید منتقل شد.');
                  } finally {
                      setIsApplying(false);
                  }
              }
            : undefined,
    };

    const detailZoomScale = ZOOM_STEPS[detailZoomIndex] ?? 1;
    const compactZoomScale = COMPACT_ZOOM_STEPS[compactZoomIndex] ?? 1;

    const fitCompactAllRows = useCallback(() => {
        const scrollEl = compactScrollRef.current;
        const contentEl = compactContentRef.current;
        if (!scrollEl || !contentEl) return;

        const prevZoom = contentEl.style.zoom;
        contentEl.style.zoom = '1';
        const contentH = contentEl.scrollHeight || contentEl.offsetHeight;
        const contentW = contentEl.scrollWidth || contentEl.offsetWidth;
        contentEl.style.zoom = prevZoom;

        const availH = Math.max(1, scrollEl.clientHeight - 8);
        const availW = Math.max(1, scrollEl.clientWidth - 8);
        if (contentH <= 0) return;

        const target = Math.min(1, availH / contentH, availW / contentW);
        // بزرگ‌ترین پله‌ای که از target بیشتر نباشد تا همه جا شوند
        let bestIdx = 0;
        for (let i = 0; i < COMPACT_ZOOM_STEPS.length; i += 1) {
            if (COMPACT_ZOOM_STEPS[i] <= target + 0.001) bestIdx = i;
        }
        setCompactZoomIndex(bestIdx);
        requestAnimationFrame(() => {
            if (compactScrollRef.current) compactScrollRef.current.scrollTop = 0;
        });
    }, []);

    const handleConfirmReturn = useCallback(async () => {
        if (!returnTarget) return;
        const reason = returnReason.trim();
        if (!reason) {
            alert('علت برگشت الزامی است.');
            return;
        }
        const route = routesRef.current.find((r) => r.id === returnTarget.routeId);
        if (!route) return;
        const annMap = buildAnnouncementMap(announcementsRef.current);
        if (isRouteAssignmentLocked(route, annMap)) {
            alert('این ردیف تخصیص خودرو و راننده شده و قابل تغییر نیست.');
            return;
        }
        if (route.approved) {
            alert('برای برگشت، ابتدا ردیف را باز کنید.');
            return;
        }
        setIsReturning(true);
        try {
            const returnedDestIds = new Set<string>();
            const removedAnnIds = new Set<string>();
            let okCount = 0;

            for (const item of returnTarget.items) {
                if (onReturnDestinationToCreator) {
                    const result = await onReturnDestinationToCreator(
                        item.announcementId,
                        item.destinationId,
                        reason
                    );
                    if (!result.ok) continue;
                    okCount += 1;
                    if (result.destinationId) returnedDestIds.add(result.destinationId);
                    else returnedDestIds.add(item.destinationId);
                    if (result.mode === 'whole' || result.returnedAnnouncementId === result.sourceAnnouncementId) {
                        removedAnnIds.add(result.sourceAnnouncementId || item.announcementId);
                    }
                } else if (onReturnToCreator) {
                    const ok = await onReturnToCreator(item.announcementId, reason);
                    if (!ok) continue;
                    okCount += 1;
                    removedAnnIds.add(item.announcementId);
                }
            }

            if (okCount === 0) return;

            const remainingAnn = announcementsRef.current
                .filter((a) => !removedAnnIds.has(a.id))
                .map((a) => ({
                    ...a,
                    destinations: (a.destinations || []).filter((d) => !returnedDestIds.has(d.id)),
                }))
                .filter((a) => (a.destinations || []).length > 0);
            announcementsRef.current = remainingAnn;
            setRoutes((prev) => {
                const idx = buildApprovalIndex(prev);
                const next = dedupeRoutesById(
                    reapplyApprovalsFromIndex(reconcileRoutesCore(prev, remainingAnn), idx)
                );
                savePersistedArrangement(userId, next);
                return next;
            });
            syncedIdsRef.current = buildDairyAnnouncementIdsKey(remainingAnn);
            setReturnTarget(null);
            setReturnReason('');
            onRefresh?.();
        } finally {
            setIsReturning(false);
        }
    }, [
        returnTarget,
        returnReason,
        onReturnDestinationToCreator,
        onReturnToCreator,
        userId,
        onRefresh,
    ]);

    if (!isOpen) return null;

    const renderCitySections = (
        density: PanelDensity,
        sections: ReturnType<typeof groupRoutesByCity>
    ) =>
        sections.map((section) => (
            <CitySection
                key={`${density}-${section.city}`}
                city={section.city}
                routes={section.routes}
                density={density}
                announcementById={announcementById}
                dragSource={dragSource}
                locks={locks}
                currentUserId={userId}
                {...handlers}
            />
        ));

    const renderPanelEmpty = (hasAnyRoutes: boolean, filteredCount: number) => {
        if (filteredCount > 0) return null;
        return (
            <div className="flex-1 flex items-center justify-center text-black font-bold text-sm p-4 text-center">
                {!hasAnyRoutes
                    ? 'اعلام بار پاستوریزه‌ای برای چیدمان یافت نشد.'
                    : 'با این جستجو ردیفی یافت نشد.'}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/60" dir="rtl">
            <div className={`flex flex-col h-full w-full ${PAGE_BG} shadow-2xl`}>
                <header className={`flex flex-wrap items-center gap-2 px-3 py-2 ${PAGE_BG} border-b-2 border-black shrink-0`}>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-black">چیدمان مسیر — پاستوریزه</h2>
                        <p className="text-xs text-black font-semibold">
                            چیدمان مشترک آنلاین · جابجایی بلافاصله ثبت می‌شود · «قفل کن» ردیف را ثابت می‌کند
                            {isApplying ? ' · در حال ثبت...' : ''}
                        </p>
                        <p className="text-[11px] text-stone-700 font-bold mt-0.5" title="وضعیت همگام‌سازی سرور">
                            {syncLabel}
                            {userName ? ` · شما: ${userName}` : ''}
                        </p>
                        {remoteNotice && (
                            <p className="text-[11px] text-amber-800 font-black mt-0.5 bg-amber-50 border border-amber-400 rounded px-1.5 py-0.5 inline-block">
                                {remoteNotice}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mr-auto flex-wrap">
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
                            {approvedRoutes.length.toLocaleString('fa-IR')} قفل
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
                            title="بازنشانی چیدمان مشترک برای همه"
                        >
                            بازنشانی چیدمان
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
                    {routes.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-black font-bold text-sm">
                            اعلام بار پاستوریزه‌ای برای چیدمان یافت نشد.
                        </div>
                    ) : (
                        <>
                            <div
                                className={`min-w-0 flex flex-col rounded border-2 border-black ${SURFACE_BG} overflow-hidden`}
                                style={{ width: `${detailPanelPercent}%` }}
                            >
                                <div className={`shrink-0 px-2 py-1 ${PAGE_BG} border-b-2 border-black text-xs font-black text-black flex items-center gap-2 flex-wrap`}>
                                    <span>پنل جزئیات — {detailFilteredRoutes.length.toLocaleString('fa-IR')} ردیف</span>
                                    <input
                                        type="search"
                                        placeholder="جستجو در جزئیات..."
                                        value={detailSearchQuery}
                                        onChange={(e) => setDetailSearchQuery(e.target.value)}
                                        className="text-xs border-2 border-black rounded-md px-2 py-0.5 w-36 font-semibold"
                                    />
                                    <div className={`mr-auto flex items-center gap-0.5 border-2 border-black rounded ${SURFACE_BG}`}>
                                        <button
                                            type="button"
                                            onClick={() => setDetailZoomIndex((i) => Math.max(0, i - 1))}
                                            disabled={detailZoomIndex <= 0}
                                            className="px-1.5 py-0.5 text-xs font-black hover:bg-stone-100 disabled:opacity-40"
                                            title="کوچک‌نمایی پنل جزئیات"
                                        >
                                            −
                                        </button>
                                        <span className="text-[10px] font-bold px-1 min-w-[2.25rem] text-center tabular-nums">
                                            {Math.round(detailZoomScale * 100)}%
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setDetailZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                                            disabled={detailZoomIndex >= ZOOM_STEPS.length - 1}
                                            className="px-1.5 py-0.5 text-xs font-black hover:bg-stone-100 disabled:opacity-40"
                                            title="بزرگ‌نمایی پنل جزئیات"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                {detailFilteredRoutes.length === 0 ? (
                                    renderPanelEmpty(routes.length > 0, detailFilteredRoutes.length)
                                ) : (
                                    <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 ${PAGE_BG}`}>
                                        <div
                                            style={{
                                                zoom: detailZoomScale,
                                                transformOrigin: 'top right',
                                            }}
                                        >
                                            {renderCitySections('detail', detailCitySections)}
                                        </div>
                                    </div>
                                )}
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
                                <div className={`shrink-0 px-2 py-1 ${PAGE_BG} border-b-2 border-black text-xs font-black text-black flex items-center gap-2 flex-wrap`}>
                                    <span>نمای فشرده — {compactFilteredRoutes.length.toLocaleString('fa-IR')} ردیف</span>
                                    <input
                                        type="search"
                                        placeholder="جستجو در فشرده..."
                                        value={compactSearchQuery}
                                        onChange={(e) => setCompactSearchQuery(e.target.value)}
                                        className="text-xs border-2 border-black rounded-md px-2 py-0.5 w-36 font-semibold"
                                    />
                                    <div className={`mr-auto flex items-center gap-0.5 border-2 border-black rounded ${SURFACE_BG}`}>
                                        <button
                                            type="button"
                                            onClick={() => setCompactZoomIndex((i) => Math.max(0, i - 1))}
                                            disabled={compactZoomIndex <= 0}
                                            className="px-1.5 py-0.5 text-xs font-black hover:bg-stone-100 disabled:opacity-40"
                                            title="کوچک‌نمایی — ردیف‌های بیشتر"
                                        >
                                            −
                                        </button>
                                        <span className="text-[10px] font-bold px-1 min-w-[2.25rem] text-center tabular-nums">
                                            {Math.round(compactZoomScale * 100)}%
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCompactZoomIndex((i) => Math.min(COMPACT_ZOOM_STEPS.length - 1, i + 1))}
                                            disabled={compactZoomIndex >= COMPACT_ZOOM_STEPS.length - 1}
                                            className="px-1.5 py-0.5 text-xs font-black hover:bg-stone-100 disabled:opacity-40"
                                            title="بزرگ‌نمایی نمای فشرده"
                                        >
                                            +
                                        </button>
                                        <button
                                            type="button"
                                            onClick={fitCompactAllRows}
                                            className="px-1.5 py-0.5 text-[10px] font-black border-r-2 border-black hover:bg-red-50 text-red-700"
                                            title="زوم را طوری تنظیم کن که همه ردیف‌ها در پنل دیده شوند"
                                        >
                                            همه
                                        </button>
                                    </div>
                                </div>
                                {compactFilteredRoutes.length === 0 ? (
                                    renderPanelEmpty(routes.length > 0, compactFilteredRoutes.length)
                                ) : (
                                    <div
                                        ref={compactScrollRef}
                                        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1 ${PAGE_BG}`}
                                    >
                                        <div
                                            ref={compactContentRef}
                                            style={{
                                                zoom: compactZoomScale,
                                                transformOrigin: 'top right',
                                            }}
                                        >
                                            {renderCitySections('compact', compactCitySections)}
                                        </div>
                                    </div>
                                )}
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

            {returnTarget && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" dir="rtl">
                    <div className={`w-full max-w-md rounded-lg border-2 border-black ${SURFACE_BG} shadow-xl p-4`}>
                        <h3 className="text-base font-black text-black mb-1">برگشت کارت مقصد به اعلام‌کننده</h3>
                        <p className="text-xs text-black font-semibold mb-3">
                            فقط مقصد «{returnTarget.cityLabel}» به اعلام‌کننده برمی‌گردد.
                            {returnTarget.items.length > 1
                                ? ` (${returnTarget.items.length.toLocaleString('fa-IR')} مقصد روی کارت)`
                                : ''}{' '}
                            اگر اعلام‌بار چند مقصد داشته باشد، بقیه در چیدمان/صف ترابری می‌مانند.
                        </p>
                        <label className="block text-xs font-bold text-black mb-1">علت برگشت (اجباری)</label>
                        <textarea
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            rows={3}
                            className="w-full border-2 border-black rounded-md px-2 py-1.5 text-sm font-semibold"
                            placeholder="مثلاً: تناژ باید اصلاح شود"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <button
                                type="button"
                                disabled={isReturning}
                                onClick={() => {
                                    setReturnTarget(null);
                                    setReturnReason('');
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded border-2 border-black ${SURFACE_BG}`}
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                disabled={isReturning || !returnReason.trim()}
                                onClick={handleConfirmReturn}
                                className="px-3 py-1.5 text-xs font-black rounded border-2 border-amber-800 bg-amber-700 text-white disabled:opacity-40"
                            >
                                {isReturning ? 'در حال برگشت...' : 'تأیید برگشت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DairyRouteArrangementDialog;
