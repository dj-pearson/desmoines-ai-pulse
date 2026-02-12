import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleError,
  withErrorHandling,
  createComponentErrorHandler,
  ErrorSeverity,
  initErrorTracking,
  safeJsonParse,
  safeParseInt,
  safeParseFloat,
} from '../errorHandler';

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs errors to console in development mode', () => {
    const error = new Error('Test error');
    handleError(error, { component: 'TestComponent', action: 'testAction' });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      error
    );
  });

  it('converts non-Error values to Error objects', () => {
    handleError('string error', { component: 'Test' });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      expect.objectContaining({ message: 'string error' })
    );
  });

  it('includes component and action in log context string', () => {
    handleError(new Error('test'), { component: 'MyComp', action: 'doThing' });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[MyComp:doThing]'),
      expect.any(Error)
    );
  });

  it('logs metadata when provided', () => {
    const metadata = { key: 'value' };
    handleError(new Error('test'), { component: 'Test', metadata });

    expect(console.error).toHaveBeenCalledWith('Context:', metadata);
  });

  it('dispatches app-error custom event for ERROR severity', () => {
    const handler = vi.fn();
    window.addEventListener('app-error', handler);

    handleError(new Error('test'), {}, ErrorSeverity.ERROR);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          severity: ErrorSeverity.ERROR,
        }),
      })
    );

    window.removeEventListener('app-error', handler);
  });

  it('does not dispatch app-error for INFO severity', () => {
    const handler = vi.fn();
    window.addEventListener('app-error', handler);

    handleError(new Error('test'), {}, ErrorSeverity.INFO);

    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener('app-error', handler);
  });
});

describe('withErrorHandling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the result of a successful operation', async () => {
    const result = await withErrorHandling(
      async () => 'success',
      { component: 'Test' }
    );
    expect(result).toBe('success');
  });

  it('returns fallback value when operation fails', async () => {
    const result = await withErrorHandling(
      async () => { throw new Error('fail'); },
      { component: 'Test' },
      'fallback'
    );
    expect(result).toBe('fallback');
  });

  it('returns undefined when operation fails and no fallback is provided', async () => {
    const result = await withErrorHandling(
      async () => { throw new Error('fail'); },
      { component: 'Test' }
    );
    expect(result).toBeUndefined();
  });
});

describe('createComponentErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a handler bound to a component name', () => {
    const handler = createComponentErrorHandler('MyComponent');
    handler(new Error('test'), 'load');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[MyComponent:load]'),
      expect.any(Error)
    );
  });

  it('includes metadata in the handler call', () => {
    const handler = createComponentErrorHandler('MyComponent');
    const meta = { userId: '123' };
    handler(new Error('test'), 'save', meta);

    expect(console.error).toHaveBeenCalledWith('Context:', meta);
  });
});

describe('safeJsonParse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
  });
});

describe('safeParseInt', () => {
  it('parses valid integers', () => {
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
  it('parses valid floats', () => {
    expect(safeParseFloat('3.14', 0)).toBeCloseTo(3.14);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(safeParseFloat('xyz', 1.5)).toBe(1.5);
  });
});
