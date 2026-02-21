/**
 * Error tracking integration (Sentry example)
 *
 * To use Sentry:
 * 1. npm install @sentry/react
 * 2. Sign up at https://sentry.io
 * 3. Create a project and get your DSN
 * 4. Add VITE_SENTRY_DSN to your .env file
 * 5. Import and call initErrorTracking() in main.tsx
 */

import { initErrorTracking as initErrorHandler, ErrorSeverity } from './errorHandler';
import { createLogger } from '@/lib/logger';

const logger = createLogger('errorTracking');

// Uncomment when Sentry is installed
// import * as Sentry from '@sentry/react';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Initialize error tracking service
 * Call this once in main.tsx before rendering the app
 */
export function initErrorTracking() {
  // Only initialize in production
  if (!import.meta.env.PROD) {
    logger.debug('initErrorTracking', 'Error tracking disabled in development');
    return;
  }

  const sentryDSN = import.meta.env['VITE_SENTRY_DSN'];

  if (!sentryDSN) {
    logger.warn('initErrorTracking', 'VITE_SENTRY_DSN not configured. Error tracking disabled.');
    return;
  }

  // Initialize Sentry
  // Uncomment when @sentry/react is installed
  /*
  Sentry.init({
    dsn: sentryDSN,
    environment: import.meta.env.MODE,

    // Set sample rate for performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Set sample rate for session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Integrations
    integrations: [
      new Sentry.BrowserTracing({
        // Set 'tracePropagationTargets' to control span generation
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/desmoinesinsider\.com/,
          /^https:\/\/.*\.supabase\.co/,
        ],
      }),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Before sending, scrub sensitive data
    beforeSend(event, hint) {
      // Remove PII
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }

      // Scrub sensitive request data
      if (event.request) {
        event.request.cookies = undefined;

        if (event.request.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.Cookie;
        }
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',

      // Network errors (user's connection issue)
      'Network request failed',
      'Failed to fetch',

      // Browser quirks
      'SecurityError',
      'NotAllowedError',

      // Third-party scripts
      'Script error.',
    ],
  });
  */

  // Register with our error handler
  const errorTracker = {
    captureException: (error: Error, context: ErrorContext) => {
      // Uncomment when Sentry is installed
      /*
      Sentry.withScope((scope) => {
        if (context.component) {
          scope.setTag('component', context.component);
        }
        if (context.action) {
          scope.setTag('action', context.action);
        }
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        if (context.metadata) {
          scope.setContext('metadata', context.metadata);
        }

        Sentry.captureException(error);
      });
      */

      // Fallback for when Sentry is not installed
      logger.error('captureException', error.message, { component: context.component, action: context.action });
    },

    captureMessage: (message: string, level: 'info' | 'warning' | 'error') => {
      // Uncomment when Sentry is installed
      /*
      Sentry.captureMessage(message, level as Sentry.SeverityLevel);
      */

      // Fallback
      logger.info('captureMessage', `${level}: ${message}`);
    },
  };

  // Register with error handler
  initErrorHandler(errorTracker);

  logger.info('initErrorTracking', 'Error tracking initialized');
}

/**
 * Set user context for error tracking
 */
export function setUser(_userId: string, _email?: string) {
  if (!import.meta.env.PROD) return;

  // Uncomment when Sentry is installed
  /*
  Sentry.setUser({
    id: userId,
    // Don't send email in production for privacy
    // email: email,
  });
  */
}

/**
 * Clear user context
 */
export function clearUser() {
  if (!import.meta.env.PROD) return;

  // Uncomment when Sentry is installed
  /*
  Sentry.setUser(null);
  */
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, data?: Record<string, any>) {
  if (!import.meta.env.PROD) {
    logger.debug('addBreadcrumb', message, data);
    return;
  }

  // Uncomment when Sentry is installed
  /*
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
  */
}

/**
 * Manually capture error
 */
export function captureError(error: Error, context?: ErrorContext) {
  if (!import.meta.env.PROD) {
    logger.error('captureError', error.message, { component: context?.component, action: context?.action });
    return;
  }

  // Uncomment when Sentry is installed
  /*
  Sentry.withScope((scope) => {
    if (context?.component) {
      scope.setTag('component', context.component);
    }
    if (context?.action) {
      scope.setTag('action', context.action);
    }
    if (context?.metadata) {
      scope.setContext('metadata', context.metadata);
    }

    Sentry.captureException(error);
  });
  */
}

/**
 * Capture message
 */
export function captureMessage(message: string, level: ErrorSeverity = ErrorSeverity.INFO) {
  if (!import.meta.env.PROD) {
    logger.info('captureMessage', `${level}: ${message}`);
    return;
  }

  // Uncomment when Sentry is installed
  /*
  const sentryLevel = level === ErrorSeverity.CRITICAL ? 'fatal' : level;
  Sentry.captureMessage(message, sentryLevel as Sentry.SeverityLevel);
  */
}

// Export Sentry for advanced usage
// Uncomment when installed
// export { Sentry };
