/**
 * Safe storage wrapper that handles localStorage failures gracefully
 * Falls back to in-memory storage when localStorage is unavailable
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('safeStorage');

interface StorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

class MemoryStorage implements StorageInterface {
  private storage: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.storage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

type Backing = 'local' | 'session';

class SafeStorage implements StorageInterface {
  private storage: Storage | MemoryStorage;
  private isNativeAvailable: boolean;
  private readonly backing: Backing;

  constructor(backing: Backing = 'local') {
    this.backing = backing;
    this.isNativeAvailable = this.checkNativeStorage();
    this.storage = this.isNativeAvailable
      ? (backing === 'session' ? window.sessionStorage : window.localStorage)
      : new MemoryStorage();
  }

  private nativeStore(): Storage {
    return this.backing === 'session' ? window.sessionStorage : window.localStorage;
  }

  private checkNativeStorage(): boolean {
    try {
      const test = '__storage_test__';
      this.nativeStore().setItem(test, test);
      this.nativeStore().removeItem(test);
      return true;
    } catch (e) {
      logger.warn('checkNativeStorage', `${this.backing}Storage is not available, falling back to memory storage`, { error: String(e) });
      return false;
    }
  }

  getItem(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch (e) {
      logger.warn('getItem', `Failed to get item "${key}" from storage`, { error: String(e) });
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (e) {
      logger.warn('setItem', `Failed to set item "${key}" in storage`, { error: String(e) });
      // If storage is full, try to clear old items
      if (this.isNativeAvailable && e instanceof DOMException) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          this.clearOldItems();
          try {
            this.storage.setItem(key, value);
          } catch {
            // Still failed, nothing we can do
          }
        }
      }
    }
  }

  removeItem(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch (e) {
      logger.warn('removeItem', `Failed to remove item "${key}" from storage`, { error: String(e) });
    }
  }

  clear(): void {
    try {
      this.storage.clear();
    } catch (e) {
      logger.warn('clear', 'Failed to clear storage', { error: String(e) });
    }
  }

  /**
   * Attempt to clear old items when storage quota is exceeded
   * This is a simple strategy that removes all items except the most recent ones
   */
  private clearOldItems(): void {
    try {
      const keys = Object.keys(this.storage);
      // Remove half of the stored items
      const itemsToRemove = Math.ceil(keys.length / 2);
      keys.slice(0, itemsToRemove).forEach((key) => {
        this.storage.removeItem(key);
      });
    } catch {
      // If clearing fails, just clear everything
      try {
        this.storage.clear();
      } catch {
        // Nothing we can do
      }
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return this.isNativeAvailable;
  }
}

// Export singleton instances. `safeStorage` is localStorage-backed (persistent);
// `safeSessionStorage` is sessionStorage-backed (cleared when the tab closes).
// Both fall back to in-memory storage when the native store is blocked
// (private mode, disabled cookies) instead of throwing.
export const safeStorage = new SafeStorage('local');
export const safeSessionStorage = new SafeStorage('session');

/** Typed JSON/string helpers over a SafeStorage instance. */
function makeStore(backing: SafeStorage) {
  return {
    get<T>(key: string, defaultValue?: T): T | null {
      const item = backing.getItem(key);
      if (item === null) return defaultValue ?? null;
      try {
        return JSON.parse(item) as T;
      } catch {
        logger.warn('get', `Failed to parse JSON from storage key "${key}"`);
        return defaultValue ?? null;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        backing.setItem(key, JSON.stringify(value));
      } catch (e) {
        logger.warn('set', `Failed to serialize value for storage key "${key}"`, { error: String(e) });
      }
    },
    remove(key: string): void {
      backing.removeItem(key);
    },
    clear(): void {
      backing.clear();
    },
    getString(key: string, defaultValue?: string): string | null {
      return backing.getItem(key) ?? defaultValue ?? null;
    },
    setString(key: string, value: string): void {
      backing.setItem(key, value);
    },
  };
}

// Also export typed helper functions for JSON storage
/** Persistent (localStorage-backed) typed JSON/string storage. */
export const storage = makeStore(safeStorage);

/** Session-scoped (sessionStorage-backed) typed JSON/string storage. */
export const sessionStore = makeStore(safeSessionStorage);
