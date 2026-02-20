/**
 * Structured logging utility
 * Provides leveled, contextual logging that is automatically suppressed in production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component: string;
  action: string;
  metadata?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  if (import.meta.env.PROD) {
    // In production, only warn and error are logged
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY.warn;
  }
  return true;
}

function formatMessage(level: LogLevel, context: LogContext, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level.toUpperCase()} [${context.component}:${context.action}] ${message}`;
}

class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  debug(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', action, message, metadata);
  }

  info(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('info', action, message, metadata);
  }

  warn(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', action, message, metadata);
  }

  error(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('error', action, message, metadata);
  }

  private log(level: LogLevel, action: string, message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;

    const context: LogContext = { component: this.component, action, metadata };
    const formatted = formatMessage(level, context, message);

    const consoleFn = level === 'debug' ? console.debug
      : level === 'info' ? console.info
      : level === 'warn' ? console.warn
      : console.error;

    if (metadata) {
      consoleFn(formatted, metadata);
    } else {
      consoleFn(formatted);
    }
  }
}

/**
 * Create a logger instance scoped to a component name.
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

/**
 * Default logger for general-purpose use.
 */
export const logger = createLogger('App');
