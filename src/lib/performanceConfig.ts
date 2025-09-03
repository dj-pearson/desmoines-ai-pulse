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

// Critical resource preloading for LCP optimization
export const criticalResourcesConfig = {
  preloadLinks: [
    // Preload critical fonts for Des Moines Insider branding
    { 
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      rel: 'preload',
      as: 'style',
      crossorigin: 'anonymous'
    },
    // Preload hero images for main pages
    {
      href: '/DMI-Logo-Header.png',
      rel: 'preload', 
      as: 'image',
      media: '(min-width: 768px)'
    }
  ],
  
  // DNS prefetching for external resources
  prefetchDomains: [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.googletagmanager.com',
    'www.google-analytics.com'
  ]
};

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

// Service Worker configuration for caching strategy
export const serviceWorkerConfig = {
  // Cache static assets for performance
  staticCache: {
    name: 'des-moines-insider-static-v1',
    urls: [
      '/',
      '/restaurants',
      '/events', 
      '/neighborhoods',
      '/manifest.json',
      '/DMI-Logo-Header.png'
    ]
  },
  
  // Cache API responses for offline functionality
  apiCache: {
    name: 'des-moines-insider-api-v1',
    strategy: 'network-first', // Fresh content when online
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxEntries: 100
  },
  
  // Cache Google Fonts and external resources
  externalCache: {
    name: 'des-moines-insider-external-v1',
    strategy: 'cache-first',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  }
};

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
  
  // Real User Monitoring (RUM) setup
  rumConfig: {
    sampleRate: 0.1, // 10% of users for performance monitoring
    reportInterval: 30000, // Report every 30 seconds
    endpoint: '/api/performance-metrics'
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
  criticalResourcesConfig,
  codeSplittingConfig,
  serviceWorkerConfig,
  webVitalsConfig,
  mobileFirstConfig,
  performanceMonitoring
};