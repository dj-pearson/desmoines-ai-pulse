/**
 * Lazy initialization utilities for deferring non-critical code
 * Improves Time to Interactive by splitting initialization
 */

let initialized = false;

/**
 * Initialize non-critical features after page becomes interactive
 */
export function initializeNonCriticalFeatures() {
  if (initialized) return;
  initialized = true;

  // Use requestIdleCallback for non-blocking initialization
  const scheduleInit = (callback: () => void, delay = 0) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: delay + 1000 });
    } else {
      setTimeout(callback, delay);
    }
  };

  // Priority 1: Analytics (after 1 second)
  scheduleInit(() => {
    import('./performance').then(({ trackWebVitals }) => {
      trackWebVitals();
    }).catch(() => {});
  }, 1000);

  // Priority 2: Resource hints (after 2 seconds)
  scheduleInit(() => {
    import('./performance').then(({ addResourceHints }) => {
      addResourceHints();
    }).catch(() => {});
  }, 2000);

  // NO SERVICE-WORKER STEP. There was one here, five seconds in, calling
  // performance.ts's registerServiceWorker() - which unregistered workers and
  // cleared caches rather than registering anything, so this call site read as
  // the opposite of what it did (WEB-QUAL-014). index.html's inline script
  // already runs that teardown on every page load, in the same document, so
  // this was a dynamic import and a timer for work that was finished before it
  // fired.

  // Priority 4: Error handling (after 500ms)
  scheduleInit(() => {
    import('./errorSuppression').then(({ 
      suppressSESWarnings, 
      handleGitHubPagesRouting, 
      initializeRuntimeErrorHandling 
    }) => {
      suppressSESWarnings();
      handleGitHubPagesRouting();
      initializeRuntimeErrorHandling();
    }).catch(() => {});
  }, 500);
}

/**
 * Initialize features on first user interaction
 */
export function initializeOnInteraction() {
  const events = ['mousedown', 'touchstart', 'keydown'];
  
  const handler = () => {
    initializeNonCriticalFeatures();
    events.forEach(event => {
      document.removeEventListener(event, handler);
    });
  };

  events.forEach(event => {
    document.addEventListener(event, handler, { once: true, passive: true });
  });

  // Fallback: initialize after 3 seconds if no interaction
  setTimeout(initializeNonCriticalFeatures, 3000);
}
