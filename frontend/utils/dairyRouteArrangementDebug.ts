import { FreightAnnouncement } from '../types';
import { DairyArrangementRoute, DairyTransferOp } from './dairyRouteArrangement';
import { stopBlocks } from './dairyRouteArrangement';

const PREFIX = '🧭 [DairyArrangement]';

function summarizeRoute(route: DairyArrangementRoute) {
    return {
        id: route.id,
        anchorCity: route.anchorCity,
        vehicleType: route.vehicleType,
        sourceAnnouncementIds: route.sourceAnnouncementIds,
        stops: route.stops.map((stop, idx) =>
            stop
                ? {
                      slot: idx + 1,
                      kind: stop.kind,
                      blocks: stopBlocks(stop).map((b) => ({
                          destId: b.destinationId,
                          city: b.destination.city,
                          annId: b.announcementId,
                          code: b.announcementCode,
                      })),
                  }
                : { slot: idx + 1, empty: true }
        ),
    };
}

export function logArrangement(
    step: string,
    data: Record<string, unknown>
): void {
    console.groupCollapsed(`${PREFIX} ${step}`);
    console.log(data);
    console.groupEnd();
}

export function logArrangementRoutes(step: string, routes: DairyArrangementRoute[]): void {
    logArrangement(step, {
        routeCount: routes.length,
        routes: routes.map(summarizeRoute),
    });
}

export function logArrangementDrop(params: {
    sourceRouteId: string;
    targetRouteId: string;
    targetIndex?: number;
    dragKey: string;
    movingBlocks: { destinationId: string; announcementId: string; city?: string }[];
    targetAnnId: string | null;
    ops: DairyTransferOp[];
    layoutChanged: boolean;
}): void {
    logArrangement('DROP', {
        ...params,
        opsCount: params.ops.length,
        reason:
            params.ops.length === 0
                ? params.targetAnnId
                    ? 'no API ops (already at target position?)'
                    : 'no target announcement id'
                : 'will call transfer API',
    });
}

export function logArrangementTransferResult(params: {
    ok: boolean;
    op: DairyTransferOp;
    announcementCount?: number;
    error?: string;
}): void {
    const isReorder = params.op.sourceAnnouncementId === params.op.targetAnnouncementId;
    logArrangement(params.ok ? (isReorder ? 'REORDER OK' : 'TRANSFER OK') : 'TRANSFER FAIL', {
        ...params,
        kind: isReorder ? 'reorder-within-announcement' : 'cross-announcement',
    });
}

export function logArrangementSync(step: string, fingerprint: string, announcements: FreightAnnouncement[]): void {
    logArrangement(step, {
        fingerprint,
        announcements: announcements.map((a) => ({
            id: a.id,
            code: a.announcementCode,
            destinations: (a.destinations || []).map((d, i) => ({
                pos: i + 1,
                id: d.id,
                city: d.city,
            })),
        })),
    });
}
