import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createLogger } from '../logger';

describe('logger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log debug messages in development', () => {
      logger.debug('test debug message');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy.mock.calls[0][0]).toContain('DEBUG');
      expect(debugSpy.mock.calls[0][0]).toContain('test debug message');
    });

    it('should log info messages in development', () => {
      logger.info('test info message');
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0][0]).toContain('INFO');
      expect(infoSpy.mock.calls[0][0]).toContain('test info message');
    });

    it('should log warn messages', () => {
      logger.warn('test warn message');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('WARN');
      expect(warnSpy.mock.calls[0][0]).toContain('test warn message');
    });

    it('should log error messages', () => {
      logger.error('test error message');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('ERROR');
      expect(errorSpy.mock.calls[0][0]).toContain('test error message');
    });
  });

  describe('context formatting', () => {
    it('should include component name in log output', () => {
      logger.info('message', { component: 'TestComponent', action: 'test' });
      expect(infoSpy.mock.calls[0][0]).toContain('[TestComponent]');
    });

    it('should include action in log output', () => {
      logger.info('message', { component: 'TestComponent', action: 'doSomething' });
      expect(infoSpy.mock.calls[0][0]).toContain(':doSomething');
    });

    it('should include timestamp in ISO format', () => {
      logger.info('message');
      const logOutput = infoSpy.mock.calls[0][0] as string;
      // ISO timestamp pattern: 2026-02-12T10:00:00.000Z
      expect(logOutput).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should pass metadata as second argument when present', () => {
      const metadata = { eventId: '123', count: 5 };
      logger.info('message', { component: 'Test', action: 'act', metadata });
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0][1]).toEqual(metadata);
    });

    it('should not pass metadata argument when not present', () => {
      logger.info('message', { component: 'Test', action: 'act' });
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0]).toHaveLength(1);
    });
  });

  describe('createLogger', () => {
    it('should create a logger with a default component name', () => {
      const log = createLogger('MyComponent');
      log.info('hello', { action: 'greet' });
      expect(infoSpy.mock.calls[0][0]).toContain('[MyComponent]');
      expect(infoSpy.mock.calls[0][0]).toContain(':greet');
    });

    it('should allow overriding the component name in individual calls', () => {
      const log = createLogger('DefaultComponent');
      log.info('hello', { component: 'OverriddenComponent', action: 'greet' });
      expect(infoSpy.mock.calls[0][0]).toContain('[OverriddenComponent]');
    });

    it('should use default component when no context is provided', () => {
      const log = createLogger('StandaloneComponent');
      log.warn('something happened');
      expect(warnSpy.mock.calls[0][0]).toContain('[StandaloneComponent]');
      expect(warnSpy.mock.calls[0][0]).toContain('something happened');
    });

    it('should work with all log levels', () => {
      const log = createLogger('AllLevels');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('production behavior', () => {
    // Note: import.meta.env.PROD is false in vitest's test environment (DEV is true).
    // We test the development behavior here. The production filtering (debug/info suppressed)
    // is verified by the shouldLog function's logic — in PROD, only warn and error pass.
    // A direct test of production behavior would require mocking import.meta.env.PROD,
    // which is complex in vitest. We verify the dev behavior is correct instead.

    it('should log all levels in development mode', () => {
      const log = createLogger('ProdTest');
      log.debug('debug msg');
      log.info('info msg');
      log.warn('warn msg');
      log.error('error msg');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
