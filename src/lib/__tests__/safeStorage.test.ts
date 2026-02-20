import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage, safeStorage } from '../safeStorage';

beforeEach(() => {
  safeStorage.clear();
  vi.restoreAllMocks();
});

describe('storage.set and storage.get', () => {
  it('stores and retrieves JSON objects', () => {
    storage.set('user', { name: 'Alice', age: 30 });
    expect(storage.get('user')).toEqual({ name: 'Alice', age: 30 });
  });

  it('stores and retrieves arrays', () => {
    storage.set('items', [1, 2, 3]);
    expect(storage.get('items')).toEqual([1, 2, 3]);
  });

  it('returns default value for missing keys', () => {
    expect(storage.get('nonexistent', 'default')).toBe('default');
  });

  it('returns null when key missing and no default', () => {
    expect(storage.get('nonexistent')).toBeNull();
  });
});

describe('storage.remove', () => {
  it('removes a stored value', () => {
    storage.set('key', 'value');
    storage.remove('key');
    expect(storage.get('key')).toBeNull();
  });
});

describe('storage.getString and storage.setString', () => {
  it('stores and retrieves raw strings', () => {
    storage.setString('token', 'abc123');
    expect(storage.getString('token')).toBe('abc123');
  });

  it('returns default for missing string keys', () => {
    expect(storage.getString('missing', 'fallback')).toBe('fallback');
  });
});

describe('storage.clear', () => {
  it('clears all stored values', () => {
    storage.set('a', 1);
    storage.set('b', 2);
    storage.clear();
    expect(storage.get('a')).toBeNull();
    expect(storage.get('b')).toBeNull();
  });
});

describe('safeStorage.isAvailable', () => {
  it('reports localStorage availability', () => {
    // In jsdom, localStorage should be available
    expect(safeStorage.isAvailable()).toBe(true);
  });
});
