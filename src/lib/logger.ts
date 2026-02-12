/**
 * Structured logging utility
 *
 * Provides consistent, leveled logging with automatic suppression in production.
 * In production (import.meta.env.PROD), debug and info levels are no-ops.
 * In development, logs include timestamp, level, component, action, and message.
 *
 * Usage:
 *   import { logger, createLogger } from '@/lib/logger';
 *
 *   // Default logger
 *   logger.info('App started', { component: 'App', action: 'init' });
 *
 *   // Component-scoped logger
 *   const log = createLogger('EventCard');
 *   log.debug('Rendering', { action: 'render', metadata: { eventId: '123' } });
 *   log.warn('Missing image', { action: 'render' });
 *   log.error('Failed to load', { action: 'fetch', metadata: { error } });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component: string;
  action: string;
  metadata?: Record<string, unknown>;
}

interface Logger {
  debug(message: string, context?: Partial<LogContext>): void;
  info(message: string, context?: Partial<LogContext>): void;
  warn(message: string, context?: Partial<LogContext>): void;
  error(message: string, context?: Partial<LogContext>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatLog(level: LogLevel, message: string, context?: Partial<LogContext>): string {
  const timestamp = formatTimestamp();
  const componentStr = context?.component ? ` [${context.component}]` : '';
  const actionStr = context?.action ? `:${context.action}` : '';
  return `${timestamp} ${level.toUpperCase()}${componentStr}${actionStr} ${message}`;
}

function shouldLog(level: LogLevel): boolean {
  // In production, only warn and error are logged
  if (import.meta.env.PROD) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY.warn;
  }
  return true;
}

function log(level: LogLevel, message: string, context?: Partial<LogContext>): void {
  if (!shouldLog(level)) {
    return;
  }

  const formatted = formatLog(level, message, context);

  switch (level) {
    case 'debug':
      if (context?.metadata) {
        // eslint-disable-next-line no-console
        console.debug(formatted, context.metadata);
      } else {
        // eslint-disable-next-line no-console
        console.debug(formatted);
      }
      break;
    case 'info':
      if (context?.metadata) {
        // eslint-disable-next-line no-console
        console.info(formatted, context.metadata);
      } else {
        // eslint-disable-next-line no-console
        console.info(formatted);
      }
      break;
    case 'warn':
      if (context?.metadata) {
        // eslint-disable-next-line no-console
        console.warn(formatted, context.metadata);
      } else {
        // eslint-disable-next-line no-console
        console.warn(formatted);
      }
      break;
    case 'error':
      if (context?.metadata) {
        // eslint-disable-next-line no-console
        console.error(formatted, context.metadata);
      } else {
        // eslint-disable-next-line no-console
        console.error(formatted);
      }
      break;
  }
}

function createLoggerInstance(defaultComponent?: string): Logger {
  function mergeContext(context?: Partial<LogContext>): Partial<LogContext> | undefined {
    if (!defaultComponent && !context) return undefined;
    if (!defaultComponent) return context;
    return { component: defaultComponent, ...context };
  }

  return {
    debug(message: string, context?: Partial<LogContext>) {
      log('debug', message, mergeContext(context));
    },
    info(message: string, context?: Partial<LogContext>) {
      log('info', message, mergeContext(context));
    },
    warn(message: string, context?: Partial<LogContext>) {
      log('warn', message, mergeContext(context));
    },
    error(message: string, context?: Partial<LogContext>) {
      log('error', message, mergeContext(context));
    },
  };
}

/**
 * Create a logger scoped to a specific component.
 *
 * @param component - The component name to include in all log messages
 * @returns A Logger instance with the component pre-set
 *
 * @example
 * const log = createLogger('EventCard');
 * log.info('Loaded event', { action: 'fetch', metadata: { id: event.id } });
 */
export function createLogger(component: string): Logger {
  return createLoggerInstance(component);
}

/**
 * Default logger instance (no default component).
 *
 * @example
 * logger.info('Application started', { component: 'App', action: 'init' });
 */
export const logger: Logger = createLoggerInstance();
