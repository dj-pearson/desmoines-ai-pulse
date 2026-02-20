// Performance optimization utilities

import { createLogger } from '@/lib/logger';

const logger = createLogger('performance');

// Preload critical resources
export const preloadResource = (href: string, as: string, type?: string) => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  if (type) link.type = type;
  document.head.appendChild(link);
};

// Lazy load images with intersection observer
export const createImageObserver = (callback: (entry: IntersectionObserverEntry) => void) => {
  return new IntersectionObserver(
    (entries) => {
      entries.forEach(callback);
    },
    {
      rootMargin: '50px 0px',
      threshold: 0.01,
    }
  );
};

// Debounce function for performance
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle function for performance
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Web Vitals tracking - suppress console output to reduce noise
export const trackWebVitals = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    // Track Core Web Vitals using dynamic import with modern API
    import('web-vitals').then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
      const logMetric = (metric: unknown) => logger.debug('webVitals', 'metric', { metric });
      onCLS(logMetric);
      onINP(logMetric); // replaces FID in web-vitals v3+
      onFCP(logMetric);
      onLCP(logMetric);
      onTTFB(logMetric);
    }).catch(() => {
      logger.debug('trackWebVitals', 'Web Vitals tracking not available');
    });
  }
};

// Memory usage monitoring
export const monitorMemoryUsage = () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    logger.debug('monitorMemoryUsage', 'Memory usage', {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    });
  }
};

// Resource loading optimization
export const loadResourceAsync = (src: string, type: 'script' | 'style'): Promise<void> => {
  return new Promise((resolve, reject) => {
    let element: HTMLScriptElement | HTMLLinkElement;
    
    if (type === 'script') {
      element = document.createElement('script');
      (element as HTMLScriptElement).src = src;
      (element as HTMLScriptElement).async = true;
    } else {
      element = document.createElement('link');
      (element as HTMLLinkElement).rel = 'stylesheet';
      (element as HTMLLinkElement).href = src;
    }
    
    element.onload = () => resolve();
    element.onerror = () => reject(new Error(`Failed to load ${src}`));
    
    document.head.appendChild(element);
  });
};

// Service Worker registration - Production only
export const registerServiceWorker = async () => {
  // Only register in production AND when served from HTTPS (or localhost)
  const isProd = import.meta.env.PROD && import.meta.env.MODE === 'production';
  const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost';

  if (!('serviceWorker' in navigator)) {
    logger.debug('registerServiceWorker', 'Service Worker not supported');
    return;
  }

  // ALWAYS unregister and clear caches if not production or not secure
  if (!isProd || !isSecureContext) {
    try {
      // Unregister ALL service workers
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));

      // Clear ALL caches that might interfere
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      logger.debug('registerServiceWorker', 'Service Workers disabled for development/insecure context');
    } catch (err) {
      logger.warn('registerServiceWorker', 'Failed to clear service workers/caches', { error: String(err) });
    }
    return;
  }

  try {
    // Check if service worker script exists before registering
    const response = await fetch('/sw.js', { method: 'HEAD' });
    if (!response.ok) {
      logger.warn('registerServiceWorker', 'Service Worker script not found, skipping registration');
      return;
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    logger.debug('registerServiceWorker', 'Service Worker registered successfully');

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            logger.info('registerServiceWorker', 'New content available, please refresh.');
          }
        });
      }
    });
    return registration;
  } catch (error) {
    logger.error('registerServiceWorker', 'Service Worker registration failed', { error: String(error) });
    // Don't let SW registration failures break the app
    return null;
  }
};

// Critical resource hints
export const addResourceHints = () => {
  // DNS prefetch for external domains
  const dnsPrefetch = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];
  
  dnsPrefetch.forEach(domain => {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = domain;
    document.head.appendChild(link);
  });
  
  // Preconnect to critical domains
  const preconnect = [
    'https://fonts.googleapis.com',
  ];
  
  preconnect.forEach(domain => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = domain;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
};

// Bundle size analyzer (development only)
export const analyzeBundleSize = () => {
  logger.debug('analyzeBundleSize', 'Bundle analysis would run here in development');
};

// Image format detection
export const supportsWebP = (): boolean => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
};

export const supportsAvif = (): boolean => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
};

// Network information
export const getNetworkInfo = () => {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }
  return null;
};

// Adaptive loading based on network conditions
export const shouldLoadHighQuality = (): boolean => {
  const networkInfo = getNetworkInfo();
  if (!networkInfo) return true; // Default to high quality if no info
  
  // Load lower quality on slow connections or save-data mode
  return networkInfo.effectiveType !== 'slow-2g' && 
         networkInfo.effectiveType !== '2g' && 
         !networkInfo.saveData;
};