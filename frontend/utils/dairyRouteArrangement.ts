import { FreightAnnouncement, Destination, FreightAnnouncementStatus } from '../types';
import { FreightLineType } from '../types';
import { formatDestinationProductsLabel, resolveDestinationRepTypeLabel, matchesFreightLine, formatRepresentativeType, getDestinationCitiesLabel } from './freightDisplay';
import { generateUUID } from './uuid';

export const DAIRY_ARRANGEMENT_VEHICLE_TYPES = [
    'تریلی',
    'مینی تریلی',
    'ده چرخ',
    'تک',
    'مینی تک',
    'خاور',
] as const;

export const DAIRY_VEHICLE_SOFT_CAPACITY_KG: Record<string, number> = {
    تریلی: 24000,
    'مینی تریلی': 24000,
    'ده چرخ': 14000,
    تک: 10000,
    'مینی تک': 5000,
    خاور: 4000,
};

export interface DairyArrangementBlock {
    key: string;
    announcementId: string;
    announcementCode: string;
    destinationId: string;
    destination: Destination;
}

export type DairyArrangementStop =
    | { kind: 'single'; block: DairyArrangementBlock }
    | { kind: 'merged'; id: string; blocks: DairyArrangementBlock[] };

export interface DairyArrangementRoute {
    id: string;
    vehicleType: string;
    /** همیشه ۴ اسلات — null یعنی خانه خالی */
    stops: (DairyArrangementStop | null)[];
    approved: boolean;
    sourceAnnouncementIds: string[];
    anchorCity: string;
    targetAnnouncementId?: string | null;
}

export const DAIRY_ROUTE_SLOT_COUNT = 4;

export function emptyRouteSlots(): (DairyArrangementStop | null)[] {
    return [null, null, null, null];
}

/** تبدیل چیدمان قدیمی (فشرده) به ۴ اسلات ثابت */
export function ensureRouteSlots(
    stops: (DairyArrangementStop | null)[] | DairyArrangementStop[]
): (DairyArrangementStop | null)[] {
    const slots = emptyRouteSlots();
    const raw = stops as (DairyArrangementStop | null)[];
    if (raw.length === DAIRY_ROUTE_SLOT_COUNT) {
        for (let i = 0; i < DAIRY_ROUTE_SLOT_COUNT; i++) slots[i] = raw[i] ?? null;
        return slots;
    }
    for (let i = 0; i < Math.min(raw.length, DAIRY_ROUTE_SLOT_COUNT); i++) {
        if (raw[i]) slots[i] = raw[i];
    }
    return slots;
}

export function routeStopsInOrder(route: DairyArrangementRoute): DairyArrangementStop[] {
    return ensureRouteSlots(route.stops).filter((s): s is DairyArrangementStop => s != null);
}

function stopMatchesDragKey(stop: DairyArrangementStop, dragKey: string): boolean {
    if (stopDragKey(stop) === dragKey) return true;
    const parsed = parseDragKey(dragKey);
    if (parsed.type === 'merged') return stop.kind === 'merged' && stop.id === parsed.mergedId;
    const destIdFromKey = parsed.blockKey.includes('::') ? parsed.blockKey.split('::')[1] : null;
    return stopBlocks(stop).some(
        (b) => b.key === parsed.blockKey || (destIdFromKey != null && b.destinationId === destIdFromKey)
    );
}

function findSlotForDrag(slots: (DairyArrangementStop | null)[], dragKey: string): number {
    for (let i = 0; i < slots.length; i++) {
        const stop = slots[i];
        if (stop && stopMatchesDragKey(stop, dragKey)) return i;
    }
    return -1;
}

function resolveTargetSlot(targetIndex: number | undefined, slots: (DairyArrangementStop | null)[]): number {
    if (targetIndex != null && targetIndex >= 0 && targetIndex < DAIRY_ROUTE_SLOT_COUNT) return targetIndex;
    const empty = slots.findIndex((s) => s == null);
    return empty >= 0 ? empty : DAIRY_ROUTE_SLOT_COUNT - 1;
}

/** قرار دادن در اسلات — اگر پر باشد جابجا (swap) می‌شود، هرگز تلفیق نمی‌شود */
function placeStopInSlots(
    slots: (DairyArrangementStop | null)[],
    fromSlot: number,
    toSlot: number,
    stop: DairyArrangementStop
): (DairyArrangementStop | null)[] {
    const next = [...ensureRouteSlots(slots)];
    if (fromSlot >= 0 && fromSlot < DAIRY_ROUTE_SLOT_COUNT) next[fromSlot] = null;
    if (toSlot < 0 || toSlot >= DAIRY_ROUTE_SLOT_COUNT) return next;

    const existing = next[toSlot];
    next[toSlot] = stop;
    if (existing && fromSlot >= 0 && fromSlot < DAIRY_ROUTE_SLOT_COUNT && fromSlot !== toSlot) {
        next[fromSlot] = existing;
    }
    return next;
}

export interface DairyArrangementCityGroup {
    city: string;
    routes: DairyArrangementRoute[];
}

const PENDING_ARRANGEMENT_STATUSES = new Set<string>([
    FreightAnnouncementStatus.PendingPersonalAssignment,
    FreightAnnouncementStatus.PendingCompanyAssignment,
    FreightAnnouncementStatus.Assigned,
    'PendingPersonalAssignment',
    'PendingCompanyAssignment',
    'Assigned',
]);

export function isDairyAnnouncementForArrangement(ann: FreightAnnouncement): boolean {
    if (!matchesDairyLine(ann)) return false;
    const status = String(ann.status || '');
    if (status === FreightAnnouncementStatus.Cancelled || status === 'Cancelled') return false;
    if (status === FreightAnnouncementStatus.Finalized || status === 'Finalized') return false;
    return PENDING_ARRANGEMENT_STATUSES.has(status) && ann.destinations.length > 0;
}

/** اعلام‌باری که واقعاً خودرو و راننده دارد — فقط نمایش در چیدمان، بدون ویرایش */
export function isAnnouncementAssignmentLocked(ann: FreightAnnouncement | undefined | null): boolean {
    if (!ann) return false;
    // فقط تخصیص واقعی؛ وضعیت Assigned بدون راننده/خودرو (مثلاً بعد از ردیف جدید) قفل نیست
    return Boolean(ann.assignedDriverId && ann.assignedVehicleId);
}

/** ردیف چیدمان قفل‌شده به‌خاطر تخصیص راننده/خودرو روی هر اعلام‌بار مرتبط */
export function isRouteAssignmentLocked(
    route: DairyArrangementRoute,
    announcementById: Map<string, FreightAnnouncement>
): boolean {
    const ids = new Set<string>();
    for (const id of route.sourceAnnouncementIds || []) {
        if (id) ids.add(id);
    }
    if (route.targetAnnouncementId) ids.add(route.targetAnnouncementId);
    for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
        ids.add(block.announcementId);
    }
    for (const id of ids) {
        if (isAnnouncementAssignmentLocked(announcementById.get(id))) return true;
    }
    return false;
}

export function matchesDairyLine(ann: FreightAnnouncement): boolean {
    return matchesFreightLine(ann, FreightLineType.Dairy);
}

export function buildBlockKey(announcementId: string, destinationId: string): string {
    return `${announcementId}::${destinationId}`;
}

export function blockFromDestination(ann: FreightAnnouncement, dest: Destination): DairyArrangementBlock {
    return {
        key: buildBlockKey(ann.id, dest.id),
        announcementId: ann.id,
        announcementCode: ann.announcementCode,
        destinationId: dest.id,
        destination: dest,
    };
}

export function singleStop(block: DairyArrangementBlock): DairyArrangementStop {
    return { kind: 'single', block };
}

export function mergedStop(blocks: DairyArrangementBlock[]): DairyArrangementStop {
    return { kind: 'merged', id: `merged-${generateUUID()}`, blocks };
}

export function stopBlocks(stop: DairyArrangementStop): DairyArrangementBlock[] {
    return stop.kind === 'single' ? [stop.block] : stop.blocks;
}

export function stopDragKey(stop: DairyArrangementStop): string {
    return stop.kind === 'single' ? stop.block.key : `merged:${stop.id}`;
}

export function parseDragKey(key: string): { type: 'block'; blockKey: string } | { type: 'merged'; mergedId: string } {
    if (key.startsWith('merged:')) return { type: 'merged', mergedId: key.slice(7) };
    return { type: 'block', blockKey: key };
}

export function getRepTypeLabel(
    block: DairyArrangementBlock,
    ann?: FreightAnnouncement
): string {
    const rep = ann ? resolveDestinationRepTypeLabel(ann, block.destination) : formatRepresentativeType(block.destination.representativeType);
    return rep && rep !== '-' ? rep : '';
}

/** کلید تلفیق: شهر + نوع نماینده (+ نام نماینده برای «نماینده») */
export function getMergeGroupKey(
    block: DairyArrangementBlock,
    ann?: FreightAnnouncement
): string {
    const city = (block.destination.city || '').trim();
    const repType = getRepTypeLabel(block, ann);
    const repName = (block.destination.representativeName || ann?.representativeName || '').trim();
    const isAgent =
        repType === 'نماینده' ||
        String(block.destination.representativeType || '').toLowerCase() === 'agent';
    if (isAgent && repName) return `${city}||${repType}||${repName}`;
    return `${city}||${repType}`;
}

export function canMergeBlocks(
    a: DairyArrangementBlock,
    b: DairyArrangementBlock,
    annById: Map<string, FreightAnnouncement>
): boolean {
    const ka = getMergeGroupKey(a, annById.get(a.announcementId));
    const kb = getMergeGroupKey(b, annById.get(b.announcementId));
    return ka !== '' && ka === kb;
}

export function canMergeStopWithBlock(
    stop: DairyArrangementStop,
    block: DairyArrangementBlock,
    annById: Map<string, FreightAnnouncement>
): boolean {
    const blocks = stopBlocks(stop);
    if (blocks.length === 0) return false;
    const groupKey = getMergeGroupKey(blocks[0], annById.get(blocks[0].announcementId));
    if (!blocks.every((b) => getMergeGroupKey(b, annById.get(b.announcementId)) === groupKey)) return false;
    return getMergeGroupKey(block, annById.get(block.announcementId)) === groupKey;
}

export function mergeStopWithBlock(
    stop: DairyArrangementStop,
    block: DairyArrangementBlock,
    annById: Map<string, FreightAnnouncement>
): DairyArrangementStop | null {
    if (!canMergeStopWithBlock(stop, block, annById)) return null;
    const existing = stopBlocks(stop);
    if (existing.some((b) => b.key === block.key)) return stop;
    return mergedStop([...existing, block]);
}

export function sumStopTonnageKg(stop: DairyArrangementStop): number {
    return stopBlocks(stop).reduce((sum, b) => sum + (Number(b.destination.tonnage) || 0), 0);
}

export function routeFromAnnouncement(ann: FreightAnnouncement): DairyArrangementRoute | null {
    const blocks = (ann.destinations || [])
        .filter((d) => d.city?.trim())
        .map((d) => blockFromDestination(ann, d));
    if (blocks.length === 0) return null;

    const anchorCity = blocks[0].destination.city?.trim() || 'بدون شهر';
    const slots = emptyRouteSlots();
    blocks.forEach((b, i) => {
        if (i < DAIRY_ROUTE_SLOT_COUNT) slots[i] = singleStop(b);
    });
    return {
        id: `route-${ann.id}`,
        vehicleType: ann.vehicleType || 'ده چرخ',
        stops: slots,
        approved: false,
        sourceAnnouncementIds: [ann.id],
        anchorCity,
    };
}

export function buildInitialRoutes(announcements: FreightAnnouncement[]): DairyArrangementRoute[] {
    const routes = announcements
        .filter((a) => matchesDairyLine(a) && isDairyAnnouncementForArrangement(a))
        .map(routeFromAnnouncement)
        .filter((r): r is DairyArrangementRoute => r != null);

    return routes.sort((a, b) => firstRouteLabel(a).localeCompare(firstRouteLabel(b), 'fa'));
}

function firstRouteLabel(route: DairyArrangementRoute): string {
    const b = routeStopsInOrder(route)[0];
    return b ? stopBlocks(b)[0]?.announcementCode || '' : '';
}

/** حذف مقصدها از چیدمان فعلی (مثلاً قبل از ساخت ردیف جدید بعد از «ردیف جدید») */
export function removeDestinationIdsFromRoutes(
    routes: DairyArrangementRoute[],
    destinationIds: Set<string> | Iterable<string>
): DairyArrangementRoute[] {
    const ids = destinationIds instanceof Set ? destinationIds : new Set(destinationIds);
    if (ids.size === 0) return routes;

    return routes
        .map((route) => {
            const slots = ensureRouteSlots(route.stops);
            const nextSlots: (DairyArrangementStop | null)[] = slots.map((stop) => {
                if (!stop) return null;
                const blocks = stopBlocks(stop).filter((b) => !ids.has(b.destinationId));
                if (blocks.length === 0) return null;
                return blocks.length === 1 ? singleStop(blocks[0]) : mergedStop(blocks);
            });
            if (!nextSlots.some((s) => s != null)) return null;
            return {
                ...route,
                stops: nextSlots,
                sourceAnnouncementIds: collectAnnouncementIds(nextSlots),
            };
        })
        .filter((r): r is DairyArrangementRoute => r != null);
}

export function mergeNewAnnouncementsIntoRoutes(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const existingAnnIds = new Set<string>();
    const existingRouteIds = new Set<string>();
    for (const route of routes) {
        existingRouteIds.add(route.id);
        for (const id of route.sourceAnnouncementIds) existingAnnIds.add(id);
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) existingAnnIds.add(block.announcementId);
        const targetId = resolveTargetAnnouncementId(route);
        if (targetId) existingAnnIds.add(targetId);
        if (route.id.startsWith('route-') && !route.id.startsWith('route-new-') && !route.id.startsWith('route-split-')) {
            existingAnnIds.add(route.id.slice('route-'.length));
        }
    }

    const additions = buildInitialRoutes(announcements).filter((route) => {
        const annId = route.sourceAnnouncementIds[0];
        if (!annId || existingAnnIds.has(annId)) return false;
        if (existingRouteIds.has(route.id)) return false;
        return true;
    });

    if (additions.length === 0) return dedupeRoutesById(routes);
    return dedupeRoutesById(
        [...routes, ...additions].sort((a, b) => firstRouteLabel(a).localeCompare(firstRouteLabel(b), 'fa'))
    );
}

/** یک id ردیف فقط یک‌بار — در صورت تکرار، ردیف کامل‌تر نگه داشته می‌شود */
export function dedupeRoutesById(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    const best = new Map<string, DairyArrangementRoute>();
    for (const route of routes) {
        const prev = best.get(route.id);
        if (!prev) {
            best.set(route.id, route);
            continue;
        }
        const prevStops = routeStopsInOrder(prev).length;
        const nextStops = routeStopsInOrder(route).length;
        const prevTon = sumRouteTonnageKg(prev);
        const nextTon = sumRouteTonnageKg(route);
        if (nextStops > prevStops || (nextStops === prevStops && nextTon > prevTon)) {
            best.set(route.id, route);
        }
    }
    return Array.from(best.values());
}

export function buildInitialCityGroups(announcements: FreightAnnouncement[]): DairyArrangementCityGroup[] {
    return groupRoutesByCity(buildInitialRoutes(announcements));
}

export function groupRoutesByCity(routes: DairyArrangementRoute[]): DairyArrangementCityGroup[] {
    const cityMap = new Map<string, DairyArrangementRoute[]>();
    for (const route of dedupeRoutesById(routes)) {
        const city = route.anchorCity || 'بدون شهر';
        const list = cityMap.get(city) || [];
        list.push(route);
        cityMap.set(city, list);
    }
    return Array.from(cityMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'fa'))
        .map(([city, cityRoutes]) => ({
            city,
            routes: cityRoutes.sort((r1, r2) => firstRouteLabel(r1).localeCompare(firstRouteLabel(r2), 'fa')),
        }));
}

export function sumRouteTonnageKg(route: DairyArrangementRoute): number {
    return routeStopsInOrder(route).reduce((sum, s) => sum + sumStopTonnageKg(s), 0);
}

export function capacityStatus(vehicleType: string, tonnageKg: number): 'ok' | 'warn' | 'over' {
    const cap = DAIRY_VEHICLE_SOFT_CAPACITY_KG[vehicleType] ?? 14000;
    if (tonnageKg <= cap * 0.92) return 'ok';
    if (tonnageKg <= cap) return 'warn';
    return 'over';
}

export interface StopCardDetail {
    city: string;
    repType: string;
    tonnage: string;
    tonnageKg: number;
    lis: string;
    products: string;
    isMerged: boolean;
    mergeCount: number;
    codes: string;
}

export function formatStopCardDetail(
    stop: DairyArrangementStop,
    announcementById: Map<string, FreightAnnouncement>
): StopCardDetail {
    const blocks = stopBlocks(stop);
    const first = blocks[0];
    const city = first?.destination.city?.trim() || '—';
    const ann0 = first ? announcementById.get(first.announcementId) : undefined;
    const repType = first ? getRepTypeLabel(first, ann0) : '';

    const tonnageKg = blocks.reduce((s, b) => s + (Number(b.destination.tonnage) || 0), 0);
    const lisParts = blocks.map((b) => b.destination.lisCode?.trim()).filter(Boolean) as string[];
    const productSet = new Set<string>();
    for (const b of blocks) {
        const p = formatDestinationProductsLabel(b.destination);
        if (p && p !== '-') productSet.add(p);
    }

    return {
        city,
        repType,
        tonnage: tonnageKg > 0 ? `${tonnageKg.toLocaleString('fa-IR')} kg` : '',
        tonnageKg,
        lis: lisParts.length > 0 ? lisParts.join(' , ') : '',
        products: Array.from(productSet).join(' · '),
        isMerged: stop.kind === 'merged' || blocks.length > 1,
        mergeCount: blocks.length,
        codes: blocks.map((b) => b.announcementCode).join(' , '),
    };
}

export function routeHasStops(route: DairyArrangementRoute): boolean {
    return ensureRouteSlots(route.stops).some((s) => s != null);
}

export function routeMatchesSearch(
    route: DairyArrangementRoute,
    query: string,
    announcementById: Map<string, FreightAnnouncement>
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
        if (block.announcementCode?.toLowerCase().includes(q)) return true;
        if (block.destination.city?.toLowerCase().includes(q)) return true;
        if (block.destination.lisCode?.toLowerCase().includes(q)) return true;
        const ann = announcementById.get(block.announcementId);
        if (ann?.assignedDriverName?.toLowerCase().includes(q)) return true;
    }
    if (route.anchorCity.toLowerCase().includes(q)) return true;
    return false;
}

function collectAnnouncementIds(stops: (DairyArrangementStop | null)[]): string[] {
    const ids = new Set<string>();
    for (const s of ensureRouteSlots(stops)) {
        if (!s) continue;
        for (const b of stopBlocks(s)) ids.add(b.announcementId);
    }
    return Array.from(ids);
}

function updateRouteSlots(
    routes: DairyArrangementRoute[],
    routeId: string,
    slots: (DairyArrangementStop | null)[]
): DairyArrangementRoute[] {
    const normalized = ensureRouteSlots(slots);
    return routes
        .map((r) =>
            r.id === routeId
                ? { ...r, stops: normalized, sourceAnnouncementIds: collectAnnouncementIds(normalized) }
                : r
        )
        .filter((r) => routeHasStops(r));
}

export function stripTemporaryRoutes(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    return routes.filter((r) => !r.id.startsWith('route-new-'));
}

export function resolveDropSlotIndex(route: DairyArrangementRoute, targetIndex?: number): number {
    return resolveTargetSlot(targetIndex, ensureRouteSlots(route.stops));
}

/** جابجایی داخل همان ردیف — swap اسلات، بدون تلفیق */
function reorderWithinRoute(
    routes: DairyArrangementRoute[],
    routeId: string,
    dragKey: string,
    targetIndex?: number
): DairyArrangementRoute[] {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return routes;

    const slots = ensureRouteSlots(route.stops);
    const fromSlot = findSlotForDrag(slots, dragKey);
    if (fromSlot < 0) return routes;

    const movingStop = slots[fromSlot];
    if (!movingStop) return routes;

    const toSlot = resolveTargetSlot(targetIndex, slots);
    const nextSlots = placeStopInSlots(slots, fromSlot, toSlot, movingStop);
    return updateRouteSlots(routes, routeId, nextSlots);
}

export function sortRouteStopsByAnnouncementOrder(
    route: DairyArrangementRoute,
    announcements: FreightAnnouncement[]
): DairyArrangementRoute {
    const annId = resolveTargetAnnouncementId(route);
    if (!annId) return route;
    const ann = announcements.find((a) => a.id === annId);
    if (!ann?.destinations?.length) return route;

    const order = new Map(ann.destinations.map((d, i) => [d.id, i]));
    const filled = routeStopsInOrder(route);
    const sorted = [...filled].sort((a, b) => {
        const aPos = Math.min(...stopBlocks(a).map((bl) => order.get(bl.destinationId) ?? 999));
        const bPos = Math.min(...stopBlocks(b).map((bl) => order.get(bl.destinationId) ?? 999));
        return aPos - bPos;
    });
    const next = emptyRouteSlots();
    sorted.forEach((s, i) => {
        if (i < DAIRY_ROUTE_SLOT_COUNT) next[i] = s;
    });
    return { ...route, stops: next };
}

export function syncRoutesWithAnnouncementOrders(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    return routes.map((r) => sortRouteStopsByAnnouncementOrder(r, announcements));
}

export function collectReorderOpsIfNeeded(
    routesAfter: DairyArrangementRoute[],
    movedBlocks: DairyArrangementBlock[],
    targetRouteId: string,
    announcementById: Map<string, FreightAnnouncement>
): DairyTransferOp[] {
    const targetRoute = routesAfter.find((r) => r.id === targetRouteId);
    if (!targetRoute) return [];
    const targetAnnId = resolveLiveTargetAnnouncementId(targetRoute, announcementById);
    if (!targetAnnId || !announcementById.has(targetAnnId)) return [];

    const ann = announcementById.get(targetAnnId);
    if (!ann) return [];

    const ops: DairyTransferOp[] = [];
    for (const block of movedBlocks) {
        const newPos = computeBlockPositionInRoute(targetRoute, block.destinationId);
        const serverIdx = ann.destinations.findIndex((d) => d.id === block.destinationId);
        const serverPos = serverIdx >= 0 ? serverIdx + 1 : -1;
        const ownerId =
            resolveDestinationOwnerAnnouncementId(block.destinationId, announcementById) ||
            block.announcementId;
        if (serverPos !== newPos && ownerId === targetAnnId && announcementById.has(ownerId)) {
            ops.push({
                sourceAnnouncementId: ownerId,
                destinationId: block.destinationId,
                targetAnnouncementId: targetAnnId,
                newPosition: newPos,
            });
        }
    }
    return ops;
}

export function moveBlockBetweenRoutes(
    routes: DairyArrangementRoute[],
    dragKey: string,
    sourceRouteId: string,
    targetRouteId: string,
    targetIndex: number | undefined
): DairyArrangementRoute[] {
    if (sourceRouteId === targetRouteId && targetIndex == null) return routes;

    if (sourceRouteId === targetRouteId) {
        return reorderWithinRoute(routes, sourceRouteId, dragKey, targetIndex);
    }

    const sourceRoute = routes.find((r) => r.id === sourceRouteId);
    const targetRoute = routes.find((r) => r.id === targetRouteId);
    if (!sourceRoute || !targetRoute) return routes;

    const sourceSlots = ensureRouteSlots(sourceRoute.stops);
    const fromSlot = findSlotForDrag(sourceSlots, dragKey);
    if (fromSlot < 0) return routes;

    const movingStop = sourceSlots[fromSlot];
    if (!movingStop) return routes;

    const targetSlots = ensureRouteSlots(targetRoute.stops);
    const toSlot = resolveTargetSlot(targetIndex, targetSlots);

    const nextSourceSlots = [...sourceSlots];
    nextSourceSlots[fromSlot] = null;

    const displaced = targetSlots[toSlot];
    const nextTargetSlots = [...targetSlots];
    nextTargetSlots[toSlot] = movingStop;
    if (displaced) nextSourceSlots[fromSlot] = displaced;

    return routes
        .map((r) => {
            if (r.id === sourceRouteId) {
                return {
                    ...r,
                    stops: nextSourceSlots,
                    sourceAnnouncementIds: collectAnnouncementIds(nextSourceSlots),
                };
            }
            if (r.id === targetRouteId) {
                return {
                    ...r,
                    stops: nextTargetSlots,
                    sourceAnnouncementIds: collectAnnouncementIds(nextTargetSlots),
                };
            }
            return r;
        })
        .filter((r) => routeHasStops(r));
}

/**
 * فقط یک مقصد را از ردیف مبدأ جدا می‌کند (حتی اگر داخل کارت تلفیق باشد).
 * برای پیشنهاد ترکیب — بدون جابجایی (swap) با مقصدهای موجود.
 */
export function extractDestinationBlockFromRoutes(
    routes: DairyArrangementRoute[],
    destinationId: string
): { routes: DairyArrangementRoute[]; block: DairyArrangementBlock; sourceRouteId: string } | null {
    for (const route of routes) {
        const slots = ensureRouteSlots(route.stops);
        for (let i = 0; i < DAIRY_ROUTE_SLOT_COUNT; i++) {
            const stop = slots[i];
            if (!stop) continue;
            const blocks = stopBlocks(stop);
            const idx = blocks.findIndex((b) => b.destinationId === destinationId);
            if (idx < 0) continue;

            const block = blocks[idx];
            const nextSlots = [...slots];
            if (blocks.length === 1) {
                nextSlots[i] = null;
            } else {
                const remaining = blocks.filter((_, bi) => bi !== idx);
                nextSlots[i] = remaining.length === 1 ? singleStop(remaining[0]) : mergedStop(remaining);
            }

            const nextRoutes = routes
                .map((r) =>
                    r.id === route.id
                        ? {
                              ...r,
                              stops: nextSlots,
                              sourceAnnouncementIds: collectAnnouncementIds(nextSlots),
                          }
                        : r
                )
                .filter((r) => routeHasStops(r));

            return { routes: nextRoutes, block, sourceRouteId: route.id };
        }
    }
    return null;
}

/**
 * قرار دادن یک مقصد فقط در اولین اسلات خالی ردیف هدف.
 * اگر اسلات خالی نباشد null برمی‌گرداند (هرگز swap نمی‌کند).
 */
export function appendBlockToRouteEmptySlot(
    routes: DairyArrangementRoute[],
    targetRouteId: string,
    block: DairyArrangementBlock
): DairyArrangementRoute[] | null {
    const targetRoute = routes.find((r) => r.id === targetRouteId);
    if (!targetRoute) return null;

    const slots = ensureRouteSlots(targetRoute.stops);
    const emptyIdx = slots.findIndex((s) => s == null);
    if (emptyIdx < 0) return null;

    const nextSlots = [...slots];
    nextSlots[emptyIdx] = singleStop(block);

    return routes.map((r) =>
        r.id === targetRouteId
            ? {
                  ...r,
                  stops: nextSlots,
                  sourceAnnouncementIds: collectAnnouncementIds(nextSlots),
              }
            : r
    );
}

/** انتقال یک مقصد به اسلات خالی ردیف هدف — بدون swap */
export function moveDestinationToRouteEmptySlot(
    routes: DairyArrangementRoute[],
    destinationId: string,
    targetRouteId: string
): { routes: DairyArrangementRoute[]; block: DairyArrangementBlock } | null {
    const already = routes
        .find((r) => r.id === targetRouteId)
        ?.stops?.some((s) => s && stopBlocks(s).some((b) => b.destinationId === destinationId));
    if (already) return null;

    const extracted = extractDestinationBlockFromRoutes(routes, destinationId);
    if (!extracted) return null;
    if (extracted.sourceRouteId === targetRouteId) {
        // مقصد همین ردیف است ولی در اسلات دیگر — برای پیشنهاد جابجا نمی‌کنیم
        return null;
    }

    const appended = appendBlockToRouteEmptySlot(extracted.routes, targetRouteId, extracted.block);
    if (!appended) return null;
    return { routes: appended, block: extracted.block };
}

/** تفکیک کارت تلفیق‌شده به کارت‌های جدا */
export function splitStopInRoute(
    routes: DairyArrangementRoute[],
    routeId: string,
    stopKey: string
): DairyArrangementRoute[] {
    return routes.map((r) => {
        if (r.id !== routeId) return r;
        const slots = ensureRouteSlots(r.stops);
        const next = [...slots];
        for (let i = 0; i < DAIRY_ROUTE_SLOT_COUNT; i++) {
            const stop = next[i];
            if (!stop) continue;
            const key = stopDragKey(stop);
            if (key !== stopKey && !(stop.kind === 'single' && stop.block.key === stopKey)) continue;
            if (stop.kind !== 'merged') continue;
            const blocks = stop.blocks;
            next[i] = singleStop(blocks[0]);
            let bi = 1;
            for (let j = 0; j < DAIRY_ROUTE_SLOT_COUNT && bi < blocks.length; j++) {
                if (j !== i && next[j] == null) {
                    next[j] = singleStop(blocks[bi++]);
                }
            }
        }
        return { ...r, stops: next, sourceAnnouncementIds: collectAnnouncementIds(next) };
    });
}

export function setRouteVehicleType(routes: DairyArrangementRoute[], routeId: string, vehicleType: string): DairyArrangementRoute[] {
    return routes.map((r) => (r.id === routeId ? { ...r, vehicleType } : r));
}

export function setRouteApproved(routes: DairyArrangementRoute[], routeId: string, approved: boolean): DairyArrangementRoute[] {
    return routes.map((r) => (r.id === routeId ? { ...r, approved } : r));
}

export function collectApprovedRoutes(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    return routes.filter((r) => r.approved);
}

export function collectPendingRoutes(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    return routes.filter((r) => !r.approved);
}

export const DAIRY_ARRANGEMENT_DRAG_MIME = 'application/x-dairy-arrangement';

export function encodeDragPayload(dragKey: string, sourceRouteId: string): string {
    return JSON.stringify({ dragKey, sourceRouteId });
}

export function decodeDragPayload(raw: string): { dragKey: string; sourceRouteId: string } | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as { dragKey?: string; sourceRouteId?: string; blockKey?: string };
        if (parsed.dragKey && parsed.sourceRouteId) {
            return { dragKey: parsed.dragKey, sourceRouteId: parsed.sourceRouteId };
        }
        if (parsed.blockKey && parsed.sourceRouteId) {
            return { dragKey: parsed.blockKey, sourceRouteId: parsed.sourceRouteId };
        }
    } catch {
        // ignore
    }
    return null;
}

const ARRANGEMENT_STORAGE_VERSION = 9;

export function arrangementStorageKey(userId: string): string {
    return `dairy-route-arrangement:v${ARRANGEMENT_STORAGE_VERSION}:${userId}`;
}

/** کلید پایدار تأیید بر اساس مجموعه مقصدهای ردیف */
export function routeApprovalSignature(route: DairyArrangementRoute): string {
    return routeStopsInOrder(route)
        .flatMap(stopBlocks)
        .map((b) => b.destinationId)
        .filter(Boolean)
        .sort()
        .join('|');
}

export type ArrangementApprovalIndex = {
    signatures: string[];
    destinationIds: string[];
    targetAnnouncementIds: string[];
};

export function buildApprovalIndex(routes: DairyArrangementRoute[]): ArrangementApprovalIndex {
    const signatures = new Set<string>();
    const destinationIds = new Set<string>();
    const targetAnnouncementIds = new Set<string>();

    for (const route of routes) {
        if (!route.approved) continue;
        const sig = routeApprovalSignature(route);
        if (sig) signatures.add(sig);
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            if (block.destinationId) destinationIds.add(block.destinationId);
        }
        const targetId = resolveTargetAnnouncementId(route);
        if (targetId) targetAnnouncementIds.add(targetId);
    }

    return {
        signatures: [...signatures],
        destinationIds: [...destinationIds],
        targetAnnouncementIds: [...targetAnnouncementIds],
    };
}

export function reapplyApprovalsFromIndex(
    routes: DairyArrangementRoute[],
    index: ArrangementApprovalIndex | null | undefined
): DairyArrangementRoute[] {
    if (!index) return routes;
    const signatures = new Set(index.signatures || []);
    const approvedDestIds = new Set(index.destinationIds || []);
    const approvedTargets = new Set(index.targetAnnouncementIds || []);

    return routes.map((route) => {
        if (route.approved) return route;
        const sig = routeApprovalSignature(route);
        if (sig && signatures.has(sig)) {
            return { ...route, approved: true };
        }

        const blocks = routeStopsInOrder(route).flatMap(stopBlocks);
        if (blocks.length === 0) return route;
        const allDestsApproved = blocks.every(
            (b) => b.destinationId && approvedDestIds.has(b.destinationId)
        );
        if (!allDestsApproved) return route;

        const targetId = resolveTargetAnnouncementId(route);
        if (targetId && approvedTargets.has(targetId)) {
            return { ...route, approved: true };
        }
        // اگر همه مقصدها قبلاً تأیید شده‌اند، ردیف را تأیید نگه دار
        if (blocks.length >= 1 && allDestsApproved) {
            return { ...route, approved: true };
        }
        return route;
    });
}

function readLegacyApprovalIndex(raw: string): ArrangementApprovalIndex | null {
    try {
        // نسخه‌های قدیمی فقط routes داشتند — از خود routes تأیید را استخراج کن
        const parsed = JSON.parse(raw) as {
            routes?: DairyArrangementRoute[];
            approvalIndex?: ArrangementApprovalIndex;
        };
        if (parsed.approvalIndex) return parsed.approvalIndex;
        if (parsed.routes?.length) return buildApprovalIndex(parsed.routes);
    } catch {
        // ignore
    }
    return null;
}

/** خواندن ایندکس تأیید حتی از کلیدهای نسخه قبلی */
export function loadApprovalIndex(userId: string): ArrangementApprovalIndex | null {
    if (!userId) return null;
    try {
        const current = localStorage.getItem(arrangementStorageKey(userId));
        if (current) {
            const idx = readLegacyApprovalIndex(current);
            if (idx) return idx;
        }
        // مهاجرت از v7
        const legacy = localStorage.getItem(`dairy-route-arrangement:v7:${userId}`);
        if (legacy) return readLegacyApprovalIndex(legacy);
    } catch {
        // ignore
    }
    return null;
}

function findBlockForDestination(
    announcements: FreightAnnouncement[],
    destinationId: string
): DairyArrangementBlock | null {
    for (const ann of announcements) {
        const dest = ann.destinations?.find((d) => d.id === destinationId);
        if (dest) return blockFromDestination(ann, dest);
    }
    return null;
}

function reconcileStopWithAnnouncements(
    stop: DairyArrangementStop,
    announcements: FreightAnnouncement[]
): DairyArrangementStop | null {
    const blocks = stopBlocks(stop)
        .map((b) => findBlockForDestination(announcements, b.destinationId))
        .filter((b): b is DairyArrangementBlock => b != null);
    if (blocks.length === 0) return null;
    if (blocks.length === 1) return singleStop(blocks[0]);
    return mergedStop(blocks);
}

export function reconcileRoutesWithAnnouncements(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const approvalIndex = buildApprovalIndex(routes);
    const reconciled = reconcileRoutesCore(routes, announcements);
    const withNew = mergeNewAnnouncementsIntoRoutes(reconciled, announcements);
    const attached = attachMissingDestinationsToRoutes(withNew, announcements);
    const pruned = pruneDeadArrangementRoutes(attached, announcements);
    return reapplyApprovalsFromIndex(dedupeDestinationsAcrossRoutes(pruned), approvalIndex);
}

function attachMissingDestinationsToRoutes(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const layoutDestIds = new Set<string>();
    for (const route of routes) {
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            layoutDestIds.add(block.destinationId);
        }
    }

    let result = routes;
    for (const ann of announcements) {
        if (!isDairyAnnouncementForArrangement(ann)) continue;
        const missing = (ann.destinations || []).filter((d) => d.id && !layoutDestIds.has(d.id));
        if (missing.length === 0) continue;

        const routeId = `route-${ann.id}`;
        const existingIdx = result.findIndex((r) => r.id === routeId);
        if (existingIdx >= 0) {
            const route = result[existingIdx];
            const nextSlots = ensureRouteSlots(route.stops);
            for (const d of missing) {
                const emptyIdx = nextSlots.findIndex((s) => s == null);
                if (emptyIdx < 0) break;
                nextSlots[emptyIdx] = singleStop(blockFromDestination(ann, d));
            }
            result = result.map((r, i) =>
                i === existingIdx
                    ? {
                          ...r,
                          stops: nextSlots,
                          sourceAnnouncementIds: collectAnnouncementIds(nextSlots),
                      }
                    : r
            );
        } else {
            const route = routeFromAnnouncement(ann);
            if (route) result = [...result, route];
        }
        for (const d of missing) layoutDestIds.add(d.id);
    }
    return dedupeRoutesById(result);
}

/**
 * بعد از جداسازی مقصد به اعلام‌بار جدید: مقصد را از ردیف فعلی بردار و ردیف مستقل بساز.
 * اگر فقط reconcile شود، announcementId بلوک عوض می‌شود ولی روی همان ردیف می‌ماند و merge ردیف جدید نمی‌سازد.
 */
export function applyNewAnnouncementRowsToRoutes(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[],
    newAnnouncementIds: string[]
): DairyArrangementRoute[] {
    const approvalIndex = buildApprovalIndex(routes);
    const destIds = new Set<string>();
    for (const id of newAnnouncementIds) {
        const ann = announcements.find((a) => a.id === id);
        for (const d of ann?.destinations || []) {
            if (d.id) destIds.add(d.id);
        }
    }
    const stripped = removeDestinationIdsFromRoutes(routes, destIds);
    const reconciled = reconcileRoutesCore(stripped, announcements);
    const withNew = mergeNewAnnouncementsIntoRoutes(reconciled, announcements);
    const attached = attachMissingDestinationsToRoutes(withNew, announcements);
    return dedupeRoutesById(reapplyApprovalsFromIndex(dedupeDestinationsAcrossRoutes(attached), approvalIndex));
}

export function loadPersistedArrangement(
    userId: string,
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] | null {
    if (!userId) return null;
    try {
        let raw = localStorage.getItem(arrangementStorageKey(userId));
        // مهاجرت از نسخه ۷
        if (!raw) {
            raw = localStorage.getItem(`dairy-route-arrangement:v7:${userId}`);
        }
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            routes?: DairyArrangementRoute[];
            approvalIndex?: ArrangementApprovalIndex;
        };
        if (!parsed?.routes?.length) return null;

        const approvalIndex = parsed.approvalIndex || buildApprovalIndex(parsed.routes);
        const reconciled = reconcileRoutesWithAnnouncements(
            stripTemporaryRoutes(parsed.routes),
            announcements
        );
        const withApprovals = reapplyApprovalsFromIndex(reconciled, approvalIndex);
        // اگر بعد از reconcile چیزی نماند، null برگردان تا از اول ساخته شود
        if (!withApprovals.length) return null;
        return dedupeRoutesById(withApprovals);
    } catch {
        return null;
    }
}

export function savePersistedArrangement(userId: string, routes: DairyArrangementRoute[]): void {
    if (!userId) return;
    try {
        const unique = dedupeRoutesById(routes);
        const approvalIndex = buildApprovalIndex(unique);
        localStorage.setItem(
            arrangementStorageKey(userId),
            JSON.stringify({
                routes: unique,
                approvalIndex,
                savedAt: Date.now(),
            })
        );
        // پاک کردن کلید قدیمی تا دوبل نشود
        try {
            localStorage.removeItem(`dairy-route-arrangement:v7:${userId}`);
        } catch {
            // ignore
        }
    } catch {
        // ignore quota errors
    }
}

export function capacityStatusTitle(vehicleType: string, tonnageKg: number): string {
    const cap = capacityStatus(vehicleType, tonnageKg);
    const softCap = DAIRY_VEHICLE_SOFT_CAPACITY_KG[vehicleType] ?? 14000;
    if (cap === 'over') {
        return `تناژ (${tonnageKg.toLocaleString('fa-IR')} kg) از سقف «${vehicleType}» (${softCap.toLocaleString('fa-IR')} kg) بیشتر است`;
    }
    if (cap === 'warn') {
        return `تناژ نزدیک به سقف «${vehicleType}» (${softCap.toLocaleString('fa-IR')} kg)`;
    }
    return `تناژ در محدوده مناسب · سقف «${vehicleType}»: ${softCap.toLocaleString('fa-IR')} kg`;
}

export function resolveTargetAnnouncementId(route: DairyArrangementRoute): string | null {
    if (route.targetAnnouncementId) return route.targetAnnouncementId;
    if (route.id.startsWith('route-')) {
        return route.id.slice('route-'.length);
    }
    if (route.sourceAnnouncementIds.length === 1) return route.sourceAnnouncementIds[0];
    if (route.sourceAnnouncementIds.length > 1) {
        const counts = new Map<string, number>();
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            counts.set(block.announcementId, (counts.get(block.announcementId) || 0) + 1);
        }
        let bestId = route.sourceAnnouncementIds[0];
        let bestCount = 0;
        for (const [id, count] of counts) {
            if (count > bestCount) {
                bestId = id;
                bestCount = count;
            }
        }
        return bestId;
    }
    const slots = ensureRouteSlots(route.stops);
    const firstStop = slots.find((s) => s != null);
    const first = firstStop ? stopBlocks(firstStop)[0] : undefined;
    return first?.announcementId ?? null;
}

/**
 * هدف واقعی ردیف فقط از اعلام‌بارهای زنده‌ای که هنوز در لیست هستند.
 * excludeDestIds: مقصدهای در حال جابجایی (مالک‌شان هنوز مبدأ است).
 */
export function resolveLiveTargetAnnouncementId(
    route: DairyArrangementRoute,
    announcementById: Map<string, FreightAnnouncement>,
    excludeDestIds?: Set<string>
): string | null {
    const counts = new Map<string, number>();
    for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
        if (excludeDestIds?.has(block.destinationId)) continue;
        const owner = resolveDestinationOwnerAnnouncementId(block.destinationId, announcementById);
        if (owner && announcementById.has(owner)) {
            counts.set(owner, (counts.get(owner) || 0) + 1);
        }
    }
    let bestId: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
        if (count > bestCount) {
            bestId = id;
            bestCount = count;
        }
    }
    if (bestId) return bestId;

    const candidates = [
        route.targetAnnouncementId,
        route.id.startsWith('route-') ? route.id.slice('route-'.length) : null,
        ...(route.sourceAnnouncementIds || []),
    ];
    for (const id of candidates) {
        if (id && announcementById.has(id)) return id;
    }
    return null;
}

/** حذف ردیف‌هایی که نه مقصد زنده دارند نه اعلام‌بار زنده */
export function pruneDeadArrangementRoutes(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const byId = new Map(announcements.map((a) => [a.id, a]));
    const liveDestIds = new Set<string>();
    for (const ann of announcements) {
        for (const d of ann.destinations || []) {
            if (d.id) liveDestIds.add(d.id);
        }
    }
    return routes.filter((route) => {
        const blocks = routeStopsInOrder(route).flatMap(stopBlocks);
        const hasLiveDest = blocks.some((b) => liveDestIds.has(b.destinationId));
        if (hasLiveDest) return true;
        const tid = resolveLiveTargetAnnouncementId(route, byId);
        return Boolean(tid);
    });
}

export function buildAnnouncementFingerprint(announcements: FreightAnnouncement[]): string {
    return announcements
        .map((a) => `${a.id}:${(a.destinations || []).map((d) => d.id).join('.')}`)
        .join('|');
}

export function buildDairyAnnouncementIdsKey(announcements: FreightAnnouncement[]): string {
    return announcements
        .filter(isDairyAnnouncementForArrangement)
        .map((a) => a.id)
        .sort()
        .join('|');
}

export function reconcileRoutesCore(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const byId = new Map(announcements.map((a) => [a.id, a]));
    const reconciled: DairyArrangementRoute[] = [];
    for (const route of routes) {
        const slots = ensureRouteSlots(route.stops);
        const nextSlots = slots.map((s) => (s ? reconcileStopWithAnnouncements(s, announcements) : null));
        if (!nextSlots.some((s) => s != null)) continue;
        const filled = nextSlots.filter((s): s is DairyArrangementStop => s != null);
        const sourceAnnouncementIds = collectAnnouncementIds(nextSlots);
        const draft: DairyArrangementRoute = {
            ...route,
            stops: nextSlots,
            sourceAnnouncementIds,
            anchorCity: route.anchorCity?.trim()
                ? route.anchorCity
                : filled[0]
                  ? stopBlocks(filled[0])[0]?.destination.city?.trim() || 'بدون شهر'
                  : 'بدون شهر',
            targetAnnouncementId: route.targetAnnouncementId ?? null,
        };
        const liveTarget = resolveLiveTargetAnnouncementId(draft, byId);
        reconciled.push({
            ...draft,
            // شناسهٔ اعلام‌بار حذف‌شده را نگه ندار — باعث ۴۰۴ transfer می‌شود
            targetAnnouncementId: liveTarget,
            sourceAnnouncementIds: liveTarget
                ? Array.from(new Set([liveTarget, ...sourceAnnouncementIds.filter((id) => byId.has(id))]))
                : sourceAnnouncementIds.filter((id) => byId.has(id)),
        });
    }
    return dedupeDestinationsAcrossRoutes(reconciled);
}

/** هر مقصد فقط روی یک ردیف بماند — بعد از انتقال، از ردیف مبدأ حذف می‌شود */
export function dedupeDestinationsAcrossRoutes(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    const destOwners = new Map<string, string>();

    const scoreRouteForDest = (route: DairyArrangementRoute, block: DairyArrangementBlock): number => {
        const annId = block.announcementId;
        let score = 0;
        if (route.id === `route-${annId}`) score += 100;
        if (route.targetAnnouncementId === annId) score += 90;
        if (resolveTargetAnnouncementId(route) === annId) score += 60;
        // ردیف تأییدشده اولویت خیلی بالاتر دارد تا بعد از رفرش تأیید از بین نرود
        if (route.approved) score += 1000;
        score += routeStopsInOrder(route).flatMap(stopBlocks).filter((b) => b.destinationId === block.destinationId).length;
        return score;
    };

    for (const route of routes) {
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            const prevRouteId = destOwners.get(block.destinationId);
            if (!prevRouteId) {
                destOwners.set(block.destinationId, route.id);
                continue;
            }
            const prevRoute = routes.find((r) => r.id === prevRouteId);
            const prevBlock = prevRoute
                ? routeStopsInOrder(prevRoute)
                      .flatMap(stopBlocks)
                      .find((b) => b.destinationId === block.destinationId)
                : undefined;
            if (!prevRoute || !prevBlock) {
                destOwners.set(block.destinationId, route.id);
                continue;
            }
            if (scoreRouteForDest(route, block) >= scoreRouteForDest(prevRoute, prevBlock)) {
                destOwners.set(block.destinationId, route.id);
            }
        }
    }

    return routes
        .map((route) => {
            const slots = ensureRouteSlots(route.stops);
            const nextSlots: (DairyArrangementStop | null)[] = slots.map((stop) => {
                if (!stop) return null;
                const blocks = stopBlocks(stop).filter((b) => destOwners.get(b.destinationId) === route.id);
                if (blocks.length === 0) return null;
                return blocks.length === 1 ? singleStop(blocks[0]) : mergedStop(blocks);
            });
            if (!nextSlots.some((s) => s != null)) return null;
            return {
                ...route,
                stops: nextSlots,
                sourceAnnouncementIds: collectAnnouncementIds(nextSlots),
            };
        })
        .filter((r): r is DairyArrangementRoute => r != null);
}

export function clearPersistedArrangement(userId: string): void {
    if (!userId) return;
    try {
        localStorage.removeItem(arrangementStorageKey(userId));
    } catch {
        // ignore
    }
}

/** فقط دادهٔ بلوک‌ها را از سرور تازه می‌کند؛ ترتیب چیدمان و تأیید دست‌نخورده می‌ماند */
export function refreshBlocksInRoutes(
    routes: DairyArrangementRoute[],
    announcements: FreightAnnouncement[]
): DairyArrangementRoute[] {
    const approvalIndex = buildApprovalIndex(routes);
    return reapplyApprovalsFromIndex(reconcileRoutesCore(routes, announcements), approvalIndex);
}

export function findDragItemInRoutes(
    routes: DairyArrangementRoute[],
    dragKey: string
): { routeId: string; block: DairyArrangementBlock } | null {
    const parsed = parseDragKey(dragKey);
    for (const route of routes) {
        const slots = ensureRouteSlots(route.stops);
        if (parsed.type === 'merged') {
            const stop = slots.find((s) => s?.kind === 'merged' && s.id === parsed.mergedId);
            if (stop?.kind === 'merged' && stop.blocks[0]) {
                return { routeId: route.id, block: stop.blocks[0] };
            }
        } else {
            for (const stop of slots) {
                if (!stop) continue;
                for (const block of stopBlocks(stop)) {
                    if (block.key === parsed.blockKey) {
                        return { routeId: route.id, block };
                    }
                    const destIdFromKey = parsed.blockKey.includes('::') ? parsed.blockKey.split('::')[1] : null;
                    if (destIdFromKey && block.destinationId === destIdFromKey) {
                        return { routeId: route.id, block };
                    }
                }
            }
        }
    }
    return null;
}

/** موقعیت ۱-based مقصد در مسیر مقصد (پس از چیدمان) */
export function computeBlockPositionInRoute(
    route: DairyArrangementRoute,
    destinationId: string
): number {
    let pos = 0;
    for (const stop of ensureRouteSlots(route.stops)) {
        if (!stop) continue;
        for (const block of stopBlocks(stop)) {
            pos++;
            if (block.destinationId === destinationId) return pos;
        }
    }
    return Math.max(1, pos);
}

/** مالک فعلی مقصد در دادهٔ سرور (نه لزوماً announcementId ذخیره‌شده روی بلوک چیدمان) */
export function resolveDestinationOwnerAnnouncementId(
    destinationId: string,
    announcementById: Map<string, FreightAnnouncement>
): string | null {
    for (const ann of announcementById.values()) {
        if ((ann.destinations || []).some((d) => d.id === destinationId)) {
            return ann.id;
        }
    }
    return null;
}

/** مالک واقعی مقصد برای جداسازی به ردیف جدید */
export function resolveOwnerAnnouncementIdForDestination(
    destinationId: string,
    routes: DairyArrangementRoute[],
    announcementById: Map<string, FreightAnnouncement>
): string | null {
    const fromLive = resolveDestinationOwnerAnnouncementId(destinationId, announcementById);
    if (fromLive) return fromLive;

    for (const route of routes) {
        for (const block of routeStopsInOrder(route).flatMap(stopBlocks)) {
            if (block.destinationId !== destinationId) continue;
            const blockAnn = announcementById.get(block.announcementId);
            if (blockAnn?.destinations?.some((d) => d.id === destinationId)) {
                return block.announcementId;
            }
            // بلوک هنوز announcementId قدیمی دارد؛ اگر در live پیدا نشد همان را امتحان کن
            if (block.announcementId) return block.announcementId;
        }
    }
    return null;
}

export function shouldCallTransferApi(
    block: DairyArrangementBlock,
    targetAnnouncementId: string,
    newPosition: number,
    announcementById: Map<string, FreightAnnouncement>
): boolean {
    const currentAnnId = resolveDestinationOwnerAnnouncementId(block.destinationId, announcementById);
    let currentPos = -1;
    if (currentAnnId) {
        const ann = announcementById.get(currentAnnId);
        const idx = ann?.destinations?.findIndex((d) => d.id === block.destinationId) ?? -1;
        currentPos = idx >= 0 ? idx + 1 : -1;
    }
    if (currentAnnId === targetAnnouncementId && currentPos === newPosition) return false;
    // اگر مقصد در دادهٔ فعلی پیدا نشد، API را صدا نزن (جلوگیری از خطای ۴۰۴)
    if (!currentAnnId) return false;
    return true;
}

export interface DairyTransferOp {
    sourceAnnouncementId: string;
    destinationId: string;
    targetAnnouncementId: string;
    newPosition: number;
}

export function getMovingBlocksForDrag(
    routes: DairyArrangementRoute[],
    dragKey: string
): DairyArrangementBlock[] {
    const parsed = parseDragKey(dragKey);
    if (parsed.type === 'merged') {
        for (const route of routes) {
            const stop = ensureRouteSlots(route.stops).find((s) => s?.kind === 'merged' && s.id === parsed.mergedId);
            if (stop) return stopBlocks(stop);
        }
        return [];
    }
    const found = findDragItemInRoutes(routes, dragKey);
    return found ? [found.block] : [];
}

export function collectTransferOpsForMove(
    routesAfter: DairyArrangementRoute[],
    targetRouteId: string,
    movedBlocks: DairyArrangementBlock[],
    announcementById: Map<string, FreightAnnouncement>
): DairyTransferOp[] {
    const targetRoute = routesAfter.find((r) => r.id === targetRouteId);
    if (!targetRoute) return [];
    const excludeDestIds = new Set(movedBlocks.map((b) => b.destinationId));
    const targetAnnId = resolveLiveTargetAnnouncementId(
        targetRoute,
        announcementById,
        excludeDestIds
    );
    if (!targetAnnId) return [];

    const ops: DairyTransferOp[] = [];
    for (const block of movedBlocks) {
        const newPos = computeBlockPositionInRoute(targetRoute, block.destinationId);
        if (shouldCallTransferApi(block, targetAnnId, newPos, announcementById)) {
            const sourceAnnouncementId =
                resolveDestinationOwnerAnnouncementId(block.destinationId, announcementById) ||
                block.announcementId;
            // مبدأ/مقصد مرده → API نزن
            if (!announcementById.has(sourceAnnouncementId) || !announcementById.has(targetAnnId)) {
                continue;
            }
            ops.push({
                sourceAnnouncementId,
                destinationId: block.destinationId,
                targetAnnouncementId: targetAnnId,
                newPosition: newPos,
            });
        }
    }
    return ops;
}

export function cloneArrangementRoutes(routes: DairyArrangementRoute[]): DairyArrangementRoute[] {
    return JSON.parse(JSON.stringify(routes)) as DairyArrangementRoute[];
}

export function findDestinationLayoutPosition(
    routes: DairyArrangementRoute[],
    destinationId: string
): { announcementId: string; position: number } | null {
    for (const route of routes) {
        const annId = resolveTargetAnnouncementId(route);
        if (!annId) continue;
        const hasDest = routeStopsInOrder(route).some((s) =>
            stopBlocks(s).some((b) => b.destinationId === destinationId)
        );
        if (!hasDest) continue;
        return { announcementId: annId, position: computeBlockPositionInRoute(route, destinationId) };
    }
    return null;
}

export function buildReverseTransferOps(
    prevRoutes: DairyArrangementRoute[],
    appliedOps: DairyTransferOp[]
): DairyTransferOp[] {
    const reversed: DairyTransferOp[] = [];
    for (const op of [...appliedOps].reverse()) {
        const orig = findDestinationLayoutPosition(prevRoutes, op.destinationId);
        if (!orig) continue;
        reversed.push({
            sourceAnnouncementId: op.targetAnnouncementId,
            destinationId: op.destinationId,
            targetAnnouncementId: orig.announcementId,
            newPosition: orig.position,
        });
    }
    return reversed;
}
