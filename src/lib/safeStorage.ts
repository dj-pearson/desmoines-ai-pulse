/**
 * Safe storage wrapper that handles localStorage failures gracefully
 * Falls back to in-memory storage when localStorage is unavailable
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('SafeStorage');

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

class SafeStorage implements StorageInterface {
  private storage: Storage | MemoryStorage;
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.checkLocalStorage();
    this.storage = this.isLocalStorageAvailable
      ? window.localStorage
      : new MemoryStorage();
  }

  private checkLocalStorage(): boolean {
    try {
      const test = '__storage_test__';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch (e) {
      if (import.meta.env.DEV) {
        log.warn('localStorage is not available, falling back to memory storage', { action: 'checkLocalStorage', metadata: { error: e } });
      }
      return false;
    }
  }

  getItem(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch (e) {
      if (import.meta.env.DEV) {
        log.warn(`Failed to get item "${key}" from storage`, { action: 'getItem', metadata: { key, error: e } });
      }
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (e) {
      if (import.meta.env.DEV) {
        log.warn(`Failed to set item "${key}" in storage`, { action: 'setItem', metadata: { key, error: e } });
      }
      // If localStorage is full, try to clear old items
      if (this.isLocalStorageAvailable && e instanceof DOMException) {
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
      if (import.meta.env.DEV) {
        log.warn(`Failed to remove item "${key}" from storage`, { action: 'removeItem', metadata: { key, error: e } });
      }
    }
  }

  clear(): void {
    try {
      this.storage.clear();
    } catch (e) {
      if (import.meta.env.DEV) {
        log.warn('Failed to clear storage', { action: 'clear', metadata: { error: e } });
      }
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
    return this.isLocalStorageAvailable;
  }
}

// Export a singleton instance
export const safeStorage = new SafeStorage();

// Also export typed helper functions for JSON storage
export const storage = {
  get<T>(key: string, defaultValue?: T): T | null {
    const item = safeStorage.getItem(key);
    if (item === null) {
      return defaultValue ?? null;
    }
    try {
      return JSON.parse(item) as T;
    } catch {
      if (import.meta.env.DEV) {
        log.warn(`Failed to parse JSON from storage key "${key}"`, { action: 'get', metadata: { key } });
      }
      return defaultValue ?? null;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      safeStorage.setItem(key, serialized);
    } catch (e) {
      if (import.meta.env.DEV) {
        log.warn(`Failed to serialize value for storage key "${key}"`, { action: 'set', metadata: { key, error: e } });
      }
    }
  },

  remove(key: string): void {
    safeStorage.removeItem(key);
  },

  clear(): void {
    safeStorage.clear();
  },

  getString(key: string, defaultValue?: string): string | null {
    return safeStorage.getItem(key) ?? defaultValue ?? null;
  },

  setString(key: string, value: string): void {
    safeStorage.setItem(key, value);
  },
};
