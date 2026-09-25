/**
 * Performance optimization utilities for Core Web Vitals compliance
 * Targets LCP < 2.5s, INP < 200ms, CLS < 0.1 per SEO research requirements
 */

// Image optimization for mobile-first indexing
export const imageOptimizationConfig = {
  // WebP format with fallbacks as recommended in research
  formats: ['webp', 'jpeg', 'png'],
  
  // Responsive breakpoints for mobile-first loading
  breakpoints: [
    { width: 320, quality: 75 }, // Mobile portrait
    { width: 768, quality: 80 }, // Tablet  
    { width: 1024, quality: 85 }, // Desktop
    { width: 1440, quality: 90 }, // Large desktop
  ],
  
  // Lazy loading configuration
  lazyLoading: {
    threshold: '50px', // Load when 50px from viewport
    placeholder: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y0ZjRmNCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TG9hZGluZy4uLjwvdGV4dD48L3N2Zz4='
  }
};

// No criticalResourcesConfig: it preloaded Google-hosted Inter (no CSS uses
// it) and DMI-Logo-Header.png (the header renders logo2), and nothing read it.

// Code splitting configuration for reduced bundle size
export const codeSplittingConfig = {
  // Lazy load heavy components identified in research
  lazyComponents: [
    'SeasonalContent', // Iowa State Fair content
    'WeekendGuide', // Dynamic weekend content
    'RestaurantFilters', // Advanced filtering UI
    'NeighborhoodGuide', // Detailed neighborhood content
    'SEOTools' // Admin-only functionality
  ],
  
  // Route-based code splitting
  routeSplitting: {
    '/admin': 'admin-bundle',
    '/iowa-state-fair': 'seasonal-bundle', 
    '/neighborhoods/*': 'neighborhood-bundle',
    '/restaurants/*': 'restaurant-bundle'
  }
};

// No serviceWorkerConfig: index.html unregisters every service worker on load,
// so a cache list here described nothing that runs.

// Core Web Vitals monitoring configuration
export const webVitalsConfig = {
  // Thresholds from SEO research
  thresholds: {
    lcp: 2500, // 2.5 seconds
    inp: 200, // 200 milliseconds  
    cls: 0.1 // 0.1 layout shift score
  },
  
  // Google Analytics 4 integration for tracking
  analytics: {
    measurementId: 'G-XGQFFP9BHZ',
    customMetrics: {
      'custom_metric_lcp': 'largest_contentful_paint',
      'custom_metric_inp': 'interaction_to_next_paint',
      'custom_metric_cls': 'cumulative_layout_shift'
    }
  },
  
  // Sampling for the dev overlay's GA4 forwarding (src/hooks/useWebVitals.ts).
  //
  // There is no `endpoint` here any more. It read '/api/performance-metrics',
  // a route functions/ has never contained, and the one caller POSTed to it on
  // every metric. Real-user collection is src/lib/webVitals.ts writing the
  // web_vitals table - the one the weekly rollup and the admin panel read.
  // WEB-PERF-039.
  rumConfig: {
    sampleRate: 0.1, // 10% of users for performance monitoring
    reportInterval: 30000 // Report every 30 seconds
  }
};

// Mobile-first responsive design validation
export const mobileFirstConfig = {
  // Breakpoints aligned with mobile-first indexing requirements
  breakpoints: {
    mobile: '0px',      // Mobile-first baseline
    tablet: '768px',    // Tablet breakpoint
    desktop: '1024px',  // Desktop breakpoint
    wide: '1440px'      // Wide desktop
  },
  
  // Touch-friendly interaction targets
  touchTargets: {
    minSize: '44px',    // Minimum touch target size
    padding: '8px',     // Minimum padding around targets
    spacing: '8px'      // Minimum spacing between targets
  },
  
  // Mobile performance optimizations
  mobileOptimizations: {
    reduceMotion: true,     // Respect prefers-reduced-motion
    optimizeImages: true,   // Aggressive image optimization on mobile
    limitAnimations: true,  // Reduce animations on slower devices
    deferNonCritical: true  // Defer non-critical JS on mobile
  }
};

// Performance monitoring and alerting
export const performanceMonitoring = {
  // Core Web Vitals alerts
  alerts: {
    lcp_threshold: 3000,    // Alert if LCP > 3 seconds
    inp_threshold: 300,     // Alert if INP > 300ms
    cls_threshold: 0.25,    // Alert if CLS > 0.25
    bundle_size: 250000     // Alert if bundle > 250KB
  },
  
  // Performance budget for assets
  budgets: {
    javascript: 200000,     // 200KB JS budget
    css: 50000,            // 50KB CSS budget  
    images: 500000,        // 500KB image budget per page
    total: 1000000         // 1MB total page weight budget
  }
};

export default {
  imageOptimizationConfig,
  codeSplittingConfig,
  webVitalsConfig,
  mobileFirstConfig,
  performanceMonitoring
};