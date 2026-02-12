import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storage, safeStorage } from '../safeStorage';

describe('safeStorage', () => {
  beforeEach(() => {
    safeStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves raw string values', () => {
    safeStorage.setItem('key', 'value');
    expect(safeStorage.getItem('key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    expect(safeStorage.getItem('nonexistent')).toBeNull();
  });

  it('removes items', () => {
    safeStorage.setItem('toRemove', 'data');
    safeStorage.removeItem('toRemove');
    expect(safeStorage.getItem('toRemove')).toBeNull();
  });

  it('clears all items', () => {
    safeStorage.setItem('a', '1');
    safeStorage.setItem('b', '2');
    safeStorage.clear();
    expect(safeStorage.getItem('a')).toBeNull();
    expect(safeStorage.getItem('b')).toBeNull();
  });

  it('reports storage availability', () => {
    expect(safeStorage.isAvailable()).toBe(true);
  });
});

describe('storage (typed JSON helpers)', () => {
  beforeEach(() => {
    safeStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves JSON objects', () => {
    const data = { theme: 'dark', count: 42 };
    storage.set('prefs', data);
    expect(storage.get('prefs')).toEqual(data);
  });

  it('returns default value when key does not exist', () => {
    expect(storage.get('missing', { fallback: true })).toEqual({ fallback: true });
  });

  it('returns null when key does not exist and no default provided', () => {
    expect(storage.get('missing')).toBeNull();
  });

  it('returns default value when stored JSON is invalid', () => {
    safeStorage.setItem('badJson', 'not-json');
    expect(storage.get('badJson', { ok: false })).toEqual({ ok: false });
  });

  it('handles getString and setString correctly', () => {
    storage.setString('name', 'Alice');
    expect(storage.getString('name')).toBe('Alice');
  });

  it('getString returns default for missing keys', () => {
    expect(storage.getString('missing', 'default')).toBe('default');
  });

  it('getString returns null when no key and no default', () => {
    expect(storage.getString('missing')).toBeNull();
  });

  it('remove deletes items', () => {
    storage.set('temp', [1, 2, 3]);
    storage.remove('temp');
    expect(storage.get('temp')).toBeNull();
  });
});
