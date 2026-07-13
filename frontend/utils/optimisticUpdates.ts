/**
 * Utility functions برای Optimistic Updates
 * برای بهبود UX با نمایش فوری تغییرات قبل از تأیید سرور
 */

import { normalizeFreightAnnouncementPatch } from './freightDisplay';
import { FreightAnnouncement } from '../types';

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
      if (update.rollback) {
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
    return announcements
        .map((ann) => {
            if (ann.id === sourceAnnouncementId) {
                const updatedDestinations = ann.destinations.filter((d) => d.id !== destinationId);
                if (updatedDestinations.length === 0 || sourceAnnouncementDeleted) {
                    return null;
                }
                return { ...ann, destinations: updatedDestinations };
            }
            if (ann.id === targetAnnouncementId) {
                const transferredDest = sourceAnn?.destinations.find((d) => d.id === destinationId);
                if (transferredDest) {
                    const newDestinations = [...ann.destinations];
                    const existingIndex = newDestinations.findIndex((d) => d.id === destinationId);
                    if (existingIndex >= 0) {
                        newDestinations.splice(existingIndex, 1);
                    }
                    const insertIndex = Math.min(newPosition - 1, newDestinations.length);
                    newDestinations.splice(insertIndex, 0, transferredDest);
                    return { ...ann, destinations: newDestinations };
                }
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
    extras?: { vehicleType?: string; status?: string }
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
    const updatedSource: FreightAnnouncement = {
        ...sourceAnn,
        destinations: sourceAnn.destinations.filter((d) => d.id !== destinationId),
    };

    const newAnn: FreightAnnouncement = {
        ...sourceAnn,
        id: newAnnouncementId,
        announcementCode: newAnnouncementCode,
        destinations: [{ ...moved }],
        vehicleType: extras?.vehicleType || sourceAnn.vehicleType,
        status: (extras?.status as FreightAnnouncement['status']) || sourceAnn.status,
        assignedDriverId: undefined,
        assignedDriverName: undefined,
        assignedVehicleId: undefined,
        assignedVehicleModel: undefined,
        assignedVehicleBrand: undefined,
        assignedAt: undefined,
    };

    return [
        ...announcements.filter((a) => a.id !== effectiveSourceId && a.id !== newAnnouncementId),
        updatedSource,
        newAnn,
    ].filter((a) => (a.destinations || []).length > 0);
}


