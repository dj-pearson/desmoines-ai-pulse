/**
 * Utility for intelligent lazy loading with route-based prefetching
 * Reduces main thread work by deferring non-critical code
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('LazyLoad');

// Track which routes have been prefetched
const prefetchedRoutes = new Set<string>();

/**
 * Prefetch a route's code when user hovers over a link
 */
export const prefetchRoute = (routePath: string) => {
  if (prefetchedRoutes.has(routePath)) return;
  
  // Use requestIdleCallback to avoid blocking main thread
  const prefetch = () => {
    prefetchedRoutes.add(routePath);
    // Route-specific prefetching logic can be added here
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetch);
  } else {
    setTimeout(prefetch, 1);
  }
};

/**
 * Lazy load component with automatic retry on failure
 */
export const lazyWithRetry = <T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) => {
  return React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      // Retry once on failure (network issues)
      log.warn('Lazy load failed, retrying...', { action: 'lazyWithRetry', metadata: { error } });
      return await componentImport();
    }
  });
};

// Stub React import for type checking
import React from 'react';
