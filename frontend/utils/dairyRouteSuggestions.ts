import { FreightAnnouncement } from '../types';
import {
    DairyArrangementBlock,
    DairyArrangementRoute,
    DairyTransferOp,
    DAIRY_ROUTE_SLOT_COUNT,
    collectTransferOpsForMove,
    dedupeDestinationsAcrossRoutes,
    dedupeRoutesById,
    emptyRouteSlots,
    ensureRouteSlots,
    extractDestinationBlockFromRoutes,
    moveDestinationToRouteEmptySlot,
    resolveTargetAnnouncementId,
    routeStopsInOrder,
    setRouteVehicleType,
    singleStop,
    stopBlocks,
} from './dairyRouteArrangement';

export type DairySuggestionStop = {
    announcementId: string;
    announcementCode?: string;
    destinationId: string;
    city: string;
    province?: string | null;
    tonnage: number;
    representativeType?: string | null;
    representativeName?: string | null;
};

export type DairyRouteSuggestionKind = 'add' | 'repair_remove' | 'repair_replace';

export type DairyRouteSuggestion = {
    id: string;
    kind?: DairyRouteSuggestionKind;
    score: number;
    rule?: string | null;
    axisCode?: string | null;
    reason: string;
    vehicleType: string;
    capacityKg: number;
    seedTonnageKg: number;
    addedTonnageKg: number;
    removedTonnageKg?: number;
    totalTonnageKg: number;
    fillRatio: number;
    stops: DairySuggestionStop[];
    removeStops?: DairySuggestionStop[];
    stopCities: string[];
};

export type DairySuggestionApiResponse = {
    vehicleType: string;
    capacityKg: number;
    seedCities: string[];
    seedTonnageKg: number;
    divergent?: boolean;
    keepCities?: string[];
    outlierCities?: string[];
    dominantAxis?: string | null;
    suggestions: DairyRouteSuggestion[];
};

function createSoloRouteFromBlock(
    block: DairyArrangementBlock,
    vehicleType: string,
    announcementId: string,
    announcementCode?: string
): DairyArrangementRoute {
    const updatedBlock: DairyArrangementBlock = {
        ...block,
        announcementId,
        announcementCode: announcementCode || block.announcementCode,
        key: `${announcementId}::${block.destinationId}`,
    };
    const slots = emptyRouteSlots();
    slots[0] = singleStop(updatedBlock);
    return {
        id: `route-${announcementId}`,
        vehicleType: vehicleType || 'ده چرخ',
        stops: slots,
        approved: false,
        sourceAnnouncementIds: [announcementId],
        anchorCity: updatedBlock.destination.city || '',
        targetAnnouncementId: announcementId,
    };
}

/**
 * اعمال پیشنهاد (افزودن / اصلاح حذف / اصلاح حذف+افزودن)
 * برای حذف: فقط ردیف جدید (با map اعلام‌بار جدید) — هرگز روی ردیف‌های دیگر نمی‌ریزد.
 */
export function applySuggestionToRoutes(
    routes: DairyArrangementRoute[],
    targetRouteId: string,
    vehicleType: string,
    suggestion: Pick<DairyRouteSuggestion, 'stops' | 'removeStops' | 'kind'>,
    options?: {
        /** destinationId → اعلام‌بار جدید ساخته‌شده برای outlier */
        relocateAnnouncementByDestId?: Map<
            string,
            { announcementId: string; announcementCode?: string }
        >;
    }
): {
    nextRoutes: DairyArrangementRoute[];
    movedBlocks: DairyArrangementBlock[];
    moveTargets: Array<{ block: DairyArrangementBlock; targetRouteId: string }>;
    /** مقصدهایی که با split API جدا شده‌اند و نباید دوباره transfer شوند */
    splitHandledDestIds: string[];
    ops: DairyTransferOp[];
    announcementByIdNeeded: true;
    error?: string;
    expectedMoveCount: number;
} {
    let next = setRouteVehicleType(routes, targetRouteId, vehicleType);
    const moveTargets: Array<{ block: DairyArrangementBlock; targetRouteId: string }> = [];
    const splitHandledDestIds: string[] = [];
    const relocateMap = options?.relocateAnnouncementByDestId || new Map();
    const targetBefore = next.find((r) => r.id === targetRouteId);
    if (!targetBefore) {
        return {
            nextRoutes: routes,
            movedBlocks: [],
            moveTargets: [],
            splitHandledDestIds: [],
            ops: [],
            announcementByIdNeeded: true,
            error: 'ردیف هدف پیدا نشد.',
            expectedMoveCount: 0,
        };
    }

    const removeStops = suggestion.removeStops || [];
    const addStops = suggestion.stops || [];

    const alreadyOnTarget = new Set(
        routeStopsInOrder(targetBefore)
            .flatMap(stopBlocks)
            .map((b) => b.destinationId)
    );

    const toAdd = addStops.filter((s) => !alreadyOnTarget.has(s.destinationId));
    const toRemove = removeStops.filter((s) => alreadyOnTarget.has(s.destinationId));

    const emptyBefore = ensureRouteSlots(targetBefore.stops).filter((s) => s == null).length;
    const emptyAfterRemoves = emptyBefore + toRemove.length;
    if (toAdd.length > emptyAfterRemoves) {
        return {
            nextRoutes: routes,
            movedBlocks: [],
            moveTargets: [],
            splitHandledDestIds: [],
            ops: [],
            announcementByIdNeeded: true,
            error: `پس از اصلاح، فقط ${emptyAfterRemoves.toLocaleString('fa-IR')} اسلات برای افزودن آزاد می‌شود.`,
            expectedMoveCount: toRemove.length + toAdd.length,
        };
    }

    // ۱) حذف outlierها → همیشه ردیف جدید (اعلام‌بار جدید)
    for (const stop of toRemove) {
        const extracted = extractDestinationBlockFromRoutes(next, stop.destinationId);
        if (!extracted) {
            return {
                nextRoutes: routes,
                movedBlocks: [],
                moveTargets: [],
                splitHandledDestIds: [],
                ops: [],
                announcementByIdNeeded: true,
                error: `نتوانست مقصد «${stop.city}» را از ردیف جدا کند.`,
                expectedMoveCount: toRemove.length + toAdd.length,
            };
        }
        next = extracted.routes;

        const relocated = relocateMap.get(stop.destinationId);
        if (!relocated?.announcementId) {
            return {
                nextRoutes: routes,
                movedBlocks: [],
                moveTargets: [],
                splitHandledDestIds: [],
                ops: [],
                announcementByIdNeeded: true,
                error: `برای «${stop.city}» اعلام‌بار جدید ساخته نشد.`,
                expectedMoveCount: toRemove.length + toAdd.length,
            };
        }

        const solo = createSoloRouteFromBlock(
            extracted.block,
            vehicleType,
            relocated.announcementId,
            relocated.announcementCode
        );
        // اگر ردیف با این id از قبل هست، جایگزین کن
        next = next.filter((r) => r.id !== solo.id);
        next = [...next, solo];
        // مقصد جداشده نباید روی ردیف‌های دیگر بماند
        next = dedupeDestinationsAcrossRoutes(next);
        next = dedupeRoutesById(next);
        splitHandledDestIds.push(stop.destinationId);
        moveTargets.push({ block: solo.stops[0] ? stopBlocks(solo.stops[0])[0] : extracted.block, targetRouteId: solo.id });
    }

    // ۲) افزودن مقصدهای پیشنهادی به ردیف هدف
    for (const stop of toAdd) {
        const moved = moveDestinationToRouteEmptySlot(next, stop.destinationId, targetRouteId);
        if (!moved) {
            return {
                nextRoutes: routes,
                movedBlocks: [],
                moveTargets: [],
                splitHandledDestIds,
                ops: [],
                announcementByIdNeeded: true,
                error: `نتوانست مقصد «${stop.city}» را به اسلات خالی منتقل کند.`,
                expectedMoveCount: toRemove.length + toAdd.length,
            };
        }
        next = moved.routes;
        moveTargets.push({ block: moved.block, targetRouteId });
    }

    return {
        nextRoutes: dedupeRoutesById(dedupeDestinationsAcrossRoutes(next)),
        movedBlocks: moveTargets.map((m) => m.block),
        moveTargets,
        splitHandledDestIds,
        ops: [],
        announcementByIdNeeded: true,
        expectedMoveCount: toRemove.length + toAdd.length,
    };
}

export function collectOpsForSuggestionApply(
    routesAfter: DairyArrangementRoute[],
    moveTargets: Array<{ block: DairyArrangementBlock; targetRouteId: string }>,
    announcementById: Map<string, FreightAnnouncement>,
    skipDestinationIds?: Set<string>
): DairyTransferOp[] {
    const byRoute = new Map<string, DairyArrangementBlock[]>();
    for (const item of moveTargets) {
        if (skipDestinationIds?.has(item.block.destinationId)) continue;
        const list = byRoute.get(item.targetRouteId) || [];
        list.push(item.block);
        byRoute.set(item.targetRouteId, list);
    }
    const ops: DairyTransferOp[] = [];
    for (const [routeId, blocks] of byRoute.entries()) {
        ops.push(...collectTransferOpsForMove(routesAfter, routeId, blocks, announcementById));
    }
    return ops;
}

export function buildSuggestionCandidatesFromRoutes(
    routes: DairyArrangementRoute[],
    excludeRouteId: string,
    announcementById: Map<string, FreightAnnouncement>
): Array<{
    announcementId: string;
    announcementCode: string;
    destinationId: string;
    city: string;
    province?: string | null;
    tonnage: number;
    representativeType?: string | null;
    representativeName?: string | null;
}> {
    const out: Array<{
        announcementId: string;
        announcementCode: string;
        destinationId: string;
        city: string;
        province?: string | null;
        tonnage: number;
        representativeType?: string | null;
        representativeName?: string | null;
    }> = [];

    for (const route of routes) {
        if (route.id === excludeRouteId) continue;
        if (route.approved) continue;
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            const ann = announcementById.get(block.announcementId);
            out.push({
                announcementId: block.announcementId,
                announcementCode: block.announcementCode,
                destinationId: block.destinationId,
                city: block.destination.city || '',
                province: null,
                tonnage: Number(block.destination.tonnage) || 0,
                representativeType: block.destination.representativeType || ann?.representativeType || null,
                representativeName: block.destination.representativeName || ann?.representativeName || null,
            });
        }
    }
    return out;
}

export function getRouteSeedInfo(route: DairyArrangementRoute): {
    cities: string[];
    destinationIds: string[];
    tonnageKg: number;
    stopCount: number;
    seedStops: DairySuggestionStop[];
} {
    const blocks = routeStopsInOrder(route).flatMap(stopBlocks);
    const cities = [...new Set(blocks.map((b) => b.destination.city?.trim()).filter(Boolean) as string[])];
    return {
        cities,
        destinationIds: blocks.map((b) => b.destinationId),
        tonnageKg: blocks.reduce((s, b) => s + (Number(b.destination.tonnage) || 0), 0),
        stopCount: routeStopsInOrder(route).length,
        seedStops: blocks.map((b) => ({
            announcementId: b.announcementId,
            announcementCode: b.announcementCode,
            destinationId: b.destinationId,
            city: b.destination.city || '',
            province: null,
            tonnage: Number(b.destination.tonnage) || 0,
            representativeType: b.destination.representativeType || null,
            representativeName: b.destination.representativeName || null,
        })),
    };
}

export function resolveSuggestionTargetAnnId(route: DairyArrangementRoute): string | null {
    return resolveTargetAnnouncementId(route);
}

/** برای تست/دیباگ — تعداد اسلات آزاد ردیف */
export function countEmptySlots(route: DairyArrangementRoute): number {
    return ensureRouteSlots(route.stops).filter((s) => s == null).length;
}

export { DAIRY_ROUTE_SLOT_COUNT };
