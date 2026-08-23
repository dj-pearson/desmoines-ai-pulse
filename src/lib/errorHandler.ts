/**
 * Centralized error handling utility
 * Provides consistent error handling across the application
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('errorHandler');

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

interface ErrorTrackingService {
  captureException(error: Error, context: ErrorContext): void;
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
}

// Placeholder for error tracking service (e.g., Sentry)
let errorTracker: ErrorTrackingService | null = null;

/**
 * Initialize error tracking service
 */
export function initErrorTracking(service: ErrorTrackingService) {
  errorTracker = service;
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Report an error that has already been handled visibly - an error boundary
 * showing its fallback, a form showing its own message - without ALSO showing a
 * toast. handleError() at ERROR severity does both, so a boundary calling it
 * rendered the fallback and popped a toast for the same failure.
 *
 * Everything else is identical: same tracker, same production pipeline.
 */
export function captureHandledError(error: Error | unknown, context: ErrorContext = {}): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  const contextStr = context.component || context.action
    ? `${context.component || ''}${context.component && context.action ? ':' : ''}${context.action || ''}`
    : 'unknown';
  logger.error(contextStr, `ERROR: ${errorObj.message}`, context.metadata);

  if (import.meta.env.PROD && errorTracker) {
    errorTracker.captureException(errorObj, context);
  }
  if (import.meta.env.PROD) {
    reportErrorEvent(errorObj.message, context, ErrorSeverity.ERROR);
  }
}

/**
 * Handle application errors with consistent behavior
 */
export function handleError(
  error: Error | unknown,
  context: ErrorContext = {},
  severity: ErrorSeverity = ErrorSeverity.ERROR
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  // Log via structured logger (debug/info suppressed in production)
  const contextStr = context.component || context.action
    ? `${context.component || ''}${context.component && context.action ? ':' : ''}${context.action || ''}`
    : 'unknown';

  logger.error(contextStr, `${severity.toUpperCase()}: ${errorObj.message}`, context.metadata);

  // Send to error tracking service in production
  if (import.meta.env.PROD && errorTracker) {
    errorTracker.captureException(errorObj, context);
  }

  // Ship to the production-error pipeline (AOS-DEV-001). Best-effort and
  // non-blocking; PII is scrubbed server-side at ingest.
  if (import.meta.env.PROD) {
    reportErrorEvent(errorObj.message, context, severity);
  }

  // Don't show user-facing errors for info/warning levels
  if (severity === ErrorSeverity.INFO || severity === ErrorSeverity.WARNING) {
    return;
  }

  // Show user-friendly error message based on error type
  const userMessage = getUserFriendlyMessage(errorObj);
  showErrorToUser(userMessage, severity);
}

// ── Production-error pipeline sink (AOS-DEV-001) ─────────────────────────────
// Client-side throttle: cap sends of the same message to once per minute so an
// error storm (e.g. a render loop) can't flood the sink.
const recentSends = new Map<string, number>();
const SEND_THROTTLE_MS = 60_000;

function reportErrorEvent(message: string, context: ErrorContext, severity: ErrorSeverity): void {
  try {
    const now = Date.now();
    const key = `${context.component ?? ''}:${context.action ?? ''}:${message}`.slice(0, 200);
    const last = recentSends.get(key);
    if (last && now - last < SEND_THROTTLE_MS) return;
    recentSends.set(key, now);
    if (recentSends.size > 200) recentSends.clear(); // bound memory

    const url = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    // Fire-and-forget; never block or throw. PII is scrubbed server-side.
    void fetch(`${url}/functions/v1/log-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      keepalive: true,
      body: JSON.stringify({
        message,
        component: context.component,
        action: context.action,
        route: typeof window !== 'undefined' ? window.location?.pathname : undefined,
        severity,
        source: 'client',
        userId: context.userId,
      }),
    }).catch(() => {});
  } catch {
    // Sink must never affect the app.
  }
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(error: Error): string {
  // Network errors
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return 'Connection issue. Please check your internet and try again.';
  }

  // Authentication errors
  if (error.message.includes('auth') || error.message.includes('unauthorized')) {
    return 'Please sign in to continue.';
  }

  // Permission errors
  if (error.message.includes('permission') || error.message.includes('forbidden')) {
    return "You don't have permission to perform this action.";
  }

  // Not found errors
  if (error.message.includes('not found') || error.message.includes('404')) {
    return 'The requested content was not found.';
  }

  // Rate limit errors
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Generic error
  return 'Something went wrong. Please try again.';
}

/**
 * Show error to user (stub - implement with your toast library)
 */
function showErrorToUser(message: string, severity: ErrorSeverity): void {
  // This should be implemented with your actual toast/notification system
  // Example: toast.error(message);

  logger.debug('showErrorToUser', `${severity}: ${message}`);

  // Create a custom event that components can listen to
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-error', {
      detail: { message, severity }
    }));
  }
}

/**
 * Handle async operation with automatic error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    handleError(error, context);
    return fallbackValue;
  }
}

/**
 * Create an error handler for a specific component
 */
export function createComponentErrorHandler(componentName: string) {
  return (error: Error | unknown, action?: string, metadata?: Record<string, any>) => {
    handleError(error, {
      component: componentName,
      action,
      metadata,
    });
  };
}

/**
 * Log information for debugging (only in development)
 */
export function logDebug(message: string, data?: any): void {
  logger.debug('logDebug', message, data ? { data } : undefined);
}

/**
 * Log warning
 */
export function logWarning(message: string, context?: ErrorContext): void {
  logger.warn('logWarning', message, context ? { component: context.component, action: context.action } : undefined);

  if (import.meta.env.PROD && errorTracker) {
    errorTracker.captureMessage(message, 'warning');
  }
}

/**
 * Assert condition and throw error if false (only in development)
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (import.meta.env.DEV && !condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Wrap a function with error handling
 */
export function withErrorBoundary<T extends (...args: any[]) => any>(
  fn: T,
  context: ErrorContext
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          handleError(error, context);
          throw error;
        });
      }

      return result;
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Exists so `catch` blocks can be typed `catch (error)` — which TypeScript
 * gives the type `unknown` — instead of `catch (error: any)` purely to reach
 * `.message` (WEB-QUAL-004). `any` there is not free: it silently permits
 * `error.mesage`, `error.response.data` and similar unchecked access on a value
 * that may not be an Error at all. Anything can be thrown in JS, including
 * strings, and Supabase/PostgREST rejections are plain objects, not Errors.
 *
 * @param error - the caught value, of genuinely unknown shape
 * @param fallback - returned when no message can be recovered
 */
export function getErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred'
): string {
  if (typeof error === 'string') return error || fallback;
  if (error instanceof Error) return error.message || fallback;

  // PostgREST/Supabase errors are plain objects carrying `message`, and often
  // `details`/`hint`, without being Error instances.
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return fallback;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn('safeJsonParse', 'Failed to parse JSON', { error: String(error) });
    return fallback;
  }
}

/**
 * Safe number parse
 */
export function safeParseInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Safe number parse (float)
 */
export function safeParseFloat(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}
