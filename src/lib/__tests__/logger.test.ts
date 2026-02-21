import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, logger } from '../logger';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('creates a logger with the given component name', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('EventList');
    log.info('load', 'Loading events');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('EventList');
    expect(spy.mock.calls[0]?.[0]).toContain('load');
    expect(spy.mock.calls[0]?.[0]).toContain('Loading events');
  });
});

describe('Logger levels', () => {
  it('logs debug with console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = createLogger('Test');
    log.debug('init', 'Starting up');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('DEBUG');
  });

  it('logs warn with console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createLogger('Test');
    log.warn('cache', 'Cache miss');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('WARN');
  });

  it('logs error with console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('Test');
    log.error('fetch', 'Request failed');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('ERROR');
  });
});

describe('Logger metadata', () => {
  it('passes metadata as second argument when provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('Test');
    const meta = { userId: '123', page: 2 };
    log.info('search', 'Querying', meta);
    expect(spy).toHaveBeenCalledWith(expect.any(String), meta);
  });

  it('does not pass metadata when not provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('Test');
    log.info('render', 'Done');
    expect(spy).toHaveBeenCalledWith(expect.any(String));
  });
});

describe('default logger', () => {
  it('uses App as default component', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('boot', 'Started');
    expect(spy.mock.calls[0]?.[0]).toContain('App');
  });
});
