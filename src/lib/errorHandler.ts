/**
 * Centralized error handling utility
 * Provides consistent error handling across the application
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('ErrorHandler');

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
 * Handle application errors with consistent behavior
 */
export function handleError(
  error: Error | unknown,
  context: ErrorContext = {},
  severity: ErrorSeverity = ErrorSeverity.ERROR
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  // Log to console in development
  if (import.meta.env.DEV) {
    const contextStr = context.component || context.action
      ? ` [${context.component || ''}${context.component && context.action ? ':' : ''}${context.action || ''}]`
      : '';

    log.error(`${severity.toUpperCase()}${contextStr}`, { action: 'handleError', metadata: { error: errorObj } });
    if (context.metadata) {
      log.error('Error context', { action: 'handleError', metadata: context.metadata });
    }
  }

  // Send to error tracking service in production
  if (import.meta.env.PROD && errorTracker) {
    errorTracker.captureException(errorObj, context);
  }

  // Don't show user-facing errors for info/warning levels
  if (severity === ErrorSeverity.INFO || severity === ErrorSeverity.WARNING) {
    return;
  }

  // Show user-friendly error message based on error type
  const userMessage = getUserFriendlyMessage(errorObj);
  showErrorToUser(userMessage, severity);
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

  log.debug(`User error: ${severity}: ${message}`, { action: 'showError' });

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
  log.debug(message, { action: 'debug', metadata: { data } });
}

/**
 * Log warning
 */
export function logWarning(message: string, context?: ErrorContext): void {
  if (import.meta.env.DEV) {
    log.warn(message, { action: 'warning', metadata: context as Record<string, unknown> });
  }

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
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    if (import.meta.env.DEV) {
      log.warn('Failed to parse JSON', { action: 'safeJsonParse', metadata: { error } });
    }
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
