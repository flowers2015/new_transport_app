/**
 * Utility functions برای Optimistic Updates
 * برای بهبود UX با نمایش فوری تغییرات قبل از تأیید سرور
 */

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
  return items.map(item => {
    if (item.id === updateId) {
      return { ...item, ...updateData };
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

