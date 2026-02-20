import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleError,
  withErrorHandling,
  createComponentErrorHandler,
  safeJsonParse,
  safeParseInt,
  safeParseFloat,
  ErrorSeverity,
  initErrorTracking,
} from '../errorHandler';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('handleError', () => {
  it('converts non-Error values to Error objects and logs the message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError('string error');
    expect(consoleSpy).toHaveBeenCalled();
    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('string error');
  });

  it('dispatches app-error custom event for ERROR severity', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener('app-error', listener);
    handleError(new Error('test'), {}, ErrorSeverity.ERROR);
    window.removeEventListener('app-error', listener);
    expect(listener).toHaveBeenCalled();
  });

  it('does not dispatch app-error for INFO severity', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener('app-error', listener);
    handleError(new Error('info'), {}, ErrorSeverity.INFO);
    window.removeEventListener('app-error', listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not dispatch app-error for WARNING severity', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener('app-error', listener);
    handleError(new Error('warn'), {}, ErrorSeverity.WARNING);
    window.removeEventListener('app-error', listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('includes component and action in console output', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError(new Error('test'), { component: 'EventList', action: 'load' });
    // Logger formats as: [timestamp] ERROR [errorHandler:EventList:load] ...
    const allOutput = consoleSpy.mock.calls.map(c => c[0]).join(' ');
    expect(allOutput).toContain('EventList');
    expect(allOutput).toContain('load');
  });
});

describe('withErrorHandling', () => {
  it('returns operation result on success', async () => {
    const result = await withErrorHandling(
      async () => 42,
      { component: 'Test' }
    );
    expect(result).toBe(42);
  });

  it('returns fallback value on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await withErrorHandling(
      async () => { throw new Error('fail'); },
      { component: 'Test' },
      'fallback'
    );
    expect(result).toBe('fallback');
  });

  it('returns undefined when no fallback provided', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await withErrorHandling(
      async () => { throw new Error('fail'); },
      { component: 'Test' }
    );
    expect(result).toBeUndefined();
  });
});

describe('createComponentErrorHandler', () => {
  it('creates a handler bound to a component name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const handler = createComponentErrorHandler('MyComponent');
    const listener = vi.fn();
    window.addEventListener('app-error', listener);
    handler(new Error('broken'), 'render');
    window.removeEventListener('app-error', listener);
    expect(listener).toHaveBeenCalled();
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
  });
});

describe('safeParseInt', () => {
  it('parses valid integer strings', () => {
    expect(safeParseInt('42', 0)).toBe(42);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeParseInt(null, 10)).toBe(10);
    expect(safeParseInt(undefined, 10)).toBe(10);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(safeParseInt('abc', 5)).toBe(5);
  });
});

describe('safeParseFloat', () => {
  it('parses valid float strings', () => {
    expect(safeParseFloat('3.14', 0)).toBeCloseTo(3.14);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeParseFloat(null, 1.5)).toBe(1.5);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(safeParseFloat('xyz', 0)).toBe(0);
  });
});
