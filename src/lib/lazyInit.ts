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

  // Priority 3: Service worker (after 5 seconds)
  scheduleInit(() => {
    if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
      import('./performance').then(({ registerServiceWorker }) => {
        registerServiceWorker();
      }).catch(() => {});
    }
  }, 5000);

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
