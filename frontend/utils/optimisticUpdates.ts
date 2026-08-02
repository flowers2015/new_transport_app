/**
 * Utility functions برای Optimistic Updates
 * برای بهبود UX با نمایش فوری تغییرات قبل از تأیید سرور
 */

import { normalizeFreightAnnouncementPatch } from './freightDisplay';
import { FreightAnnouncement, Destination } from '../types';
import {
    joinAnnouncementNotes,
    partitionNotesForDestinationSplit,
} from './announcementNotes';

export type TransferDestinationResult =
    | { ok: true; announcements: FreightAnnouncement[] }
    | { ok: false; status?: number; message?: string };

export type SplitDestinationResult =
    | {
          ok: true;
          announcements: FreightAnnouncement[];
          newAnnouncementId: string;
          newAnnouncementCode: string;
      }
    | { ok: false };

export interface OptimisticUpdate<T> {
  id: string;
  data: Partial<T>;
  timestamp: number;
  rollback?: () => void;
}

/**
 * کلاس برای مدیریت Optimistic Updates
 */
export class OptimisticUpdateManager<T> {
  private updates: Map<string, OptimisticUpdate<T>> = new Map();
  private listeners: Set<(updates: Map<string, OptimisticUpdate<T>>) => void> = new Set();

  /**
   * اضافه کردن یک optimistic update
   */
  addUpdate(id: string, data: Partial<T>, rollback?: () => void): void {
    const update: OptimisticUpdate<T> = {
      id,
      data,
      timestamp: Date.now(),
      rollback
    };

    this.updates.set(id, update);
    this.notifyListeners();
  }

  /**
   * حذف یک optimistic update (بعد از تأیید سرور)
   */
  removeUpdate(id: string): void {
    this.updates.delete(id);
    this.notifyListeners();
  }

  /**
   * Rollback یک optimistic update (در صورت خطا)
   */
  rollbackUpdate(id: string): void {
    const update = this.updates.get(id);
    if (update?.rollback) {
      update.rollback();
    }
    this.updates.delete(id);
    this.notifyListeners();
  }

  /**
   * Rollback همه updates
   */
  rollbackAll(): void {
    this.updates.forEach(update => {
      if (update?.rollback) {
        update.rollback();
      }
    });
    this.updates.clear();
    this.notifyListeners();
  }

  /**
   * دریافت همه updates
   */
  getUpdates(): Map<string, OptimisticUpdate<T>> {
    return new Map(this.updates);
  }

  /**
   * دریافت update برای یک ID خاص
   */
  getUpdate(id: string): OptimisticUpdate<T> | undefined {
    return this.updates.get(id);
  }

  /**
   * بررسی اینکه آیا update برای یک ID وجود دارد
   */
  hasUpdate(id: string): boolean {
    return this.updates.has(id);
  }

  /**
   * اضافه کردن listener برای تغییرات
   */
  addListener(listener: (updates: Map<string, OptimisticUpdate<T>>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * اطلاع‌رسانی به listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.updates);
      } catch (error) {
        console.error('❌ [OptimisticUpdateManager] Error in listener:', error);
      }
    });
  }

  /**
   * پاک کردن همه updates (برای cleanup)
   */
  clear(): void {
    this.updates.clear();
    this.notifyListeners();
  }
}

/**
 * Helper function برای اعمال optimistic update به یک array
 */
export function applyOptimisticUpdate<T extends { id: string }>(
  items: T[],
  updateId: string,
  updateData: Partial<T>
): T[] {
  const normalized = normalizeFreightAnnouncementPatch(
    updateData as Record<string, unknown>
  ) as Partial<T>;
  return items.map(item => {
    if (item.id === updateId) {
      return { ...item, ...normalized };
    }
    return item;
  });
}

/**
 * Helper function برای اعمال چند optimistic update به یک array
 */
export function applyOptimisticUpdates<T extends { id: string }>(
  items: T[],
  updates: Map<string, OptimisticUpdate<T>>
): T[] {
  let result = [...items];
  
  updates.forEach((update, id) => {
    result = applyOptimisticUpdate(result, id, update.data);
  });
  
  return result;
}

/**
 * Helper function برای ایجاد rollback function
 */
export function createRollback<T>(
    originalItems: T[],
    setItems: (items: T[]) => void
): () => void {
    return () => {
        setItems([...originalItems]);
    };
}

const destCargoRaw = (d: any): number => {
    const v = Number(d?.cargoValue ?? d?.cargo_value);
    return Number.isFinite(v) && v > 0 ? v : 0;
};

const sumDestCargoRaw = (dests: Destination[] = []) =>
    dests.reduce((s, d) => s + destCargoRaw(d), 0);

/** ارزش بلوک مقصد؛ اگر خالی بود از سهم اعلام‌بار پر کن */
function stampDestinationsCargoFromAnnouncement(
    ann: FreightAnnouncement,
    dests: Destination[]
): Destination[] {
    const annCargo = Number(ann.cargoValue) || 0;
    const existingSum = sumDestCargoRaw(dests);
    if (existingSum > 0 || annCargo <= 0 || dests.length === 0) {
        return dests.map((d) => ({
            ...d,
            cargoValue: destCargoRaw(d) || Number(d.cargoValue) || 0,
        }));
    }
    if (dests.length === 1) {
        return [{ ...dests[0], cargoValue: annCargo }];
    }
    const base = Math.floor(annCargo / dests.length);
    let allocated = 0;
    return dests.map((d, i) => {
        const share = i === dests.length - 1 ? annCargo - allocated : base;
        allocated += share;
        return { ...d, cargoValue: share };
    });
}

function resolveMovedDestCargo(
    moved: Destination,
    sourceAnn: FreightAnnouncement,
    remainingDests: Destination[]
): number {
    const own = destCargoRaw(moved);
    if (own > 0) return own;
    const sourceTotal = Number(sourceAnn.cargoValue) || 0;
    const remainingSum = sumDestCargoRaw(remainingDests);
    if (remainingSum > 0) return Math.max(0, sourceTotal - remainingSum);
    const totalDests = remainingDests.length + 1;
    if (sourceTotal > 0 && totalDests === 1) return sourceTotal;
    if (sourceTotal > 0 && totalDests > 1) return Math.floor(sourceTotal / totalDests);
    return 0;
}

export function applyDestinationTransferToAnnouncements(
    announcements: FreightAnnouncement[],
    sourceAnnouncementId: string,
    destinationId: string,
    targetAnnouncementId: string,
    newPosition: number,
    sourceAnnouncementDeleted = false
): FreightAnnouncement[] {
    // جابجایی داخل همان اعلام‌بار — فقط تغییر ترتیب، نه حذف
    if (sourceAnnouncementId === targetAnnouncementId) {
        return announcements.map((ann) => {
            if (ann.id !== sourceAnnouncementId) return ann;
            const fromIdx = ann.destinations.findIndex((d) => d.id === destinationId);
            if (fromIdx < 0) return ann;
            const next = [...ann.destinations];
            const [moved] = next.splice(fromIdx, 1);
            const insertIndex = Math.max(0, Math.min(newPosition - 1, next.length));
            next.splice(insertIndex, 0, moved);
            return { ...ann, destinations: next };
        });
    }

    const sourceAnn = announcements.find((a) => a.id === sourceAnnouncementId);
    const transferredDest = sourceAnn?.destinations.find((d) => d.id === destinationId);
    if (!sourceAnn || !transferredDest) return announcements;

    const stampedSourceDests = stampDestinationsCargoFromAnnouncement(
        sourceAnn,
        sourceAnn.destinations
    );
    const stampedMoved =
        stampedSourceDests.find((d) => d.id === destinationId) || transferredDest;
    const remainingOnSource = stampedSourceDests.filter((d) => d.id !== destinationId);
    const movedCargo = resolveMovedDestCargo(stampedMoved, sourceAnn, remainingOnSource);
    const movedDestWithCargo: Destination = {
        ...stampedMoved,
        cargoValue: movedCargo,
        loadingDate:
            String((stampedMoved as any).loadingDate || '').trim() ||
            (typeof sourceAnn.loadingDate === 'string'
                ? sourceAnn.loadingDate.replace(/-/g, '/')
                : undefined),
        platformArrivalTime:
            String((stampedMoved as any).platformArrivalTime || '').trim() ||
            String(sourceAnn.platformArrivalTime || '').trim() ||
            undefined,
    };

    return announcements
        .map((ann) => {
            if (ann.id === sourceAnnouncementId) {
                if (remainingOnSource.length === 0 || sourceAnnouncementDeleted) {
                    return null;
                }
                const remainingSum = sumDestCargoRaw(remainingOnSource);
                return {
                    ...ann,
                    destinations: remainingOnSource,
                    cargoValue:
                        remainingSum > 0
                            ? remainingSum
                            : Math.max(0, (Number(ann.cargoValue) || 0) - movedCargo),
                };
            }
            if (ann.id === targetAnnouncementId) {
                const stampedTarget = stampDestinationsCargoFromAnnouncement(
                    ann,
                    ann.destinations
                );
                const newDestinations = [...stampedTarget];
                const existingIndex = newDestinations.findIndex((d) => d.id === destinationId);
                if (existingIndex >= 0) {
                    newDestinations.splice(existingIndex, 1);
                }
                const insertIndex = Math.min(newPosition - 1, newDestinations.length);
                newDestinations.splice(insertIndex, 0, movedDestWithCargo);
                const destSum = sumDestCargoRaw(newDestinations);
                const shouldMergeNotes =
                    remainingOnSource.length === 0 || sourceAnnouncementDeleted;
                return {
                    ...ann,
                    destinations: newDestinations,
                    // جمع ارزش مقصدها (هر مقصد ارزش خودش)
                    cargoValue:
                        destSum > 0
                            ? destSum
                            : (Number(ann.cargoValue) || 0) + movedCargo,
                    notes: shouldMergeNotes
                        ? joinAnnouncementNotes(ann.notes, sourceAnn.notes)
                        : ann.notes,
                };
            }
            return ann;
        })
        .filter((ann): ann is FreightAnnouncement => ann !== null);
}

/** جداسازی مقصد به اعلام‌بار جدید — به‌روزرسانی خوش‌بینانه لیست اعلام‌بارها */
export function applySplitDestinationToAnnouncements(
    announcements: FreightAnnouncement[],
    sourceAnnouncementId: string,
    destinationId: string,
    newAnnouncementId: string,
    newAnnouncementCode: string,
    extras?: {
        vehicleType?: string;
        status?: string;
        notes?: string | null;
        sourceNotes?: string | null;
    }
): FreightAnnouncement[] {
    let sourceAnn = announcements.find((a) => a.id === sourceAnnouncementId);
    let moved = sourceAnn?.destinations.find((d) => d.id === destinationId);

    // اگر فرانت source اشتباه فرستاده، مقصد را در همه اعلام‌بارها پیدا کن
    if (!moved) {
        for (const ann of announcements) {
            const found = ann.destinations.find((d) => d.id === destinationId);
            if (found) {
                sourceAnn = ann;
                moved = found;
                break;
            }
        }
    }
    if (!sourceAnn || !moved) return announcements;

    const effectiveSourceId = sourceAnn.id;
    const stampedSourceDests = stampDestinationsCargoFromAnnouncement(
        sourceAnn,
        sourceAnn.destinations
    );
    const stampedMoved =
        stampedSourceDests.find((d) => d.id === destinationId) || moved;
    const remainingDests = stampedSourceDests.filter((d) => d.id !== destinationId);
    const movedCargo = resolveMovedDestCargo(stampedMoved, sourceAnn, remainingDests);
    const remainingSum = sumDestCargoRaw(remainingDests);
    const sourceTotal = Number(sourceAnn.cargoValue) || 0;

    const notesPartition =
        extras?.notes !== undefined || extras?.sourceNotes !== undefined
            ? {
                  splitNotes: extras.notes || undefined,
                  hostNotes: extras.sourceNotes || undefined,
              }
            : partitionNotesForDestinationSplit(sourceAnn.notes, {
                  leavingCreatorId: stampedMoved.originalCreatedByUserId || null,
                  remainingCreatorIds: remainingDests.map((d) => d.originalCreatedByUserId),
              });

    const updatedSource: FreightAnnouncement = {
        ...sourceAnn,
        destinations: remainingDests,
        cargoValue:
            remainingSum > 0 ? remainingSum : Math.max(0, sourceTotal - movedCargo),
        notes: notesPartition.hostNotes,
    };

    const destLoading = String((stampedMoved as any).loadingDate || '').trim();
    const destPlatform = String((stampedMoved as any).platformArrivalTime || '').trim();
    const stampedMovedFinal: Destination = {
        ...stampedMoved,
        cargoValue: movedCargo,
        loadingDate: destLoading || undefined,
        platformArrivalTime:
            destPlatform || String(sourceAnn.platformArrivalTime || '').trim() || undefined,
    };
    const newAnn: FreightAnnouncement = {
        ...sourceAnn,
        id: newAnnouncementId,
        announcementCode: newAnnouncementCode,
        destinations: [stampedMovedFinal],
        vehicleType: extras?.vehicleType || sourceAnn.vehicleType,
        status: (extras?.status as FreightAnnouncement['status']) || sourceAnn.status,
        cargoValue: movedCargo,
        loadingDate: (destLoading || sourceAnn.loadingDate) as any,
        notes: notesPartition.splitNotes,
        platformArrivalTime: stampedMovedFinal.platformArrivalTime,
        assignedDriverId: undefined,
        assignedDriverName: undefined,
        assignedVehicleId: undefined,
        assignedAt: undefined,
        totalFreightCost: undefined,
    };

    return [
        ...announcements.filter((a) => a.id !== effectiveSourceId && a.id !== newAnnouncementId),
        updatedSource,
        newAnn,
    ].filter((a) => (a.destinations || []).length > 0);
}
