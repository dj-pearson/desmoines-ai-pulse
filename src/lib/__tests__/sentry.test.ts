import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Sentry loads after first paint (WEB-PERF-020), which is only acceptable
 * because nothing thrown before it arrives is lost. That is the property these
 * tests pin: the change is WHEN an event is sent, not WHETHER.
 *
 * The mock stands in for the dynamically imported @sentry/react. Without it a
 * test would either reach the real SDK or silently skip the flush, and a
 * silently skipped flush is exactly the failure being guarded against.
 */
const init = vi.fn();
const captureExceptionSpy = vi.fn();
const captureMessageSpy = vi.fn();

vi.mock('@sentry/react', () => ({
  init,
  captureException: captureExceptionSpy,
  captureMessage: captureMessageSpy,
}));

async function freshModule() {
  vi.resetModules();
  init.mockClear();
  captureExceptionSpy.mockClear();
  captureMessageSpy.mockClear();
  return await import('@/lib/sentry');
}

describe('deferred Sentry', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('buffers an exception raised before the SDK arrives, then sends it', async () => {
    const s = await freshModule();
    const boom = new Error('thrown during boot');

    s.captureException(boom, { tags: { phase: 'pre-sentry' } });
    expect(captureExceptionSpy).not.toHaveBeenCalled();

    await s.loadSentry();

    expect(init).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy.mock.calls[0][0]).toBe(boom);
    expect(captureExceptionSpy.mock.calls[0][1]).toEqual({ tags: { phase: 'pre-sentry' } });
  });

  it('buffers messages too, and replays them in order', async () => {
    const s = await freshModule();
    s.captureMessage('first', 'warning');
    s.captureMessage('second', 'error');
    expect(captureMessageSpy).not.toHaveBeenCalled();

    await s.loadSentry();

    expect(captureMessageSpy.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
    expect(captureMessageSpy.mock.calls[0][1]).toBe('warning');
  });

  it('forwards straight through once loaded, with no second flush', async () => {
    const s = await freshModule();
    await s.loadSentry();

    s.captureException(new Error('after load'));
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);

    // A second load must not re-init or replay anything already sent.
    await s.loadSentry();
    expect(init).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('caps the buffer, so an error loop before load is not a memory leak', async () => {
    const s = await freshModule();
    for (let i = 0; i < 500; i++) s.captureException(new Error(`spam ${i}`));

    await s.loadSentry();

    expect(captureExceptionSpy).toHaveBeenCalledTimes(50);
    // The cap keeps the OLDEST, which are the ones nearest the cause.
    expect(captureExceptionSpy.mock.calls[0][0].message).toBe('spam 0');
  });

  it('initSentry buffers window errors and unhandled rejections', async () => {
    const s = await freshModule();
    s.initSentry();

    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('window onerror'), message: 'window onerror' }),
    );
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new Error('unhandled rejection');
    window.dispatchEvent(rejection);

    expect(captureExceptionSpy).not.toHaveBeenCalled();

    await s.loadSentry();

    const messages = captureExceptionSpy.mock.calls.map((c) => c[0].message);
    expect(messages).toContain('window onerror');
    expect(messages).toContain('unhandled rejection');
  });

  it('survives a failed chunk load without throwing, and keeps the buffer', async () => {
    const s = await freshModule();
    init.mockImplementationOnce(() => {
      throw new Error('chunk load failed');
    });

    s.captureException(new Error('queued'));
    await expect(s.loadSentry()).resolves.toBeUndefined();
    expect(captureExceptionSpy).not.toHaveBeenCalled();

    // A later attempt still flushes what was queued.
    await s.loadSentry();
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy.mock.calls[0][0].message).toBe('queued');
  });

  it('resolves a DSN so the deferral is actually armed', async () => {
    const s = await freshModule();
    expect(s.getSentryDsn()).toMatch(/^https:\/\/.+@.+\.ingest\..*sentry\.io\/\d+$/);
  });
});

/**
 * The deferred chunk was 187.9 KB gzipped because sentry.ts imported the
 * @sentry/react namespace, which keeps every export (replay/rrweb, feedback,
 * tracing) alive. These pin the narrow path: sentry.ts loads only
 * sentryClient.ts, and sentryClient.ts re-exports named functions, never `*`.
 */
describe('Sentry chunk stays narrow', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

  it('sentry.ts dynamic-imports the narrow module, not the package', () => {
    const src = read('sentry.ts');
    expect(src).toContain("import('./sentryClient')");
    expect(src).not.toMatch(/import\(\s*['"]@sentry\//);
    expect(src).not.toMatch(/from\s+['"]@sentry\//);
  });

  it('sentryClient.ts re-exports by name only', () => {
    const src = read('sentryClient.ts');
    expect(src).not.toMatch(/export\s*\*/);
    expect(src).not.toMatch(/import\s*\*\s*as/);
  });

  it('init is not asked for tracing or replay it cannot do', async () => {
    const s = await freshModule();
    await s.loadSentry();
    const opts = init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts).not.toHaveProperty('integrations');
    expect(opts).not.toHaveProperty('tracesSampleRate');
    expect(opts).not.toHaveProperty('replaysOnErrorSampleRate');
  });
});
