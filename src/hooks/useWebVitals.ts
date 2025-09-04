import { useEffect, useState } from 'react';
import { webVitalsConfig } from '@/lib/performanceConfig';

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

interface PerformanceData {
  lcp: WebVitalMetric | null;
  inp: WebVitalMetric | null;
  cls: WebVitalMetric | null;
  ttfb: WebVitalMetric | null;
}

/**
 * Core Web Vitals monitoring hook
 * Tracks performance metrics per SEO research requirements:
 * - LCP < 2.5s (good), 2.5-4s (needs improvement), >4s (poor)
 * - INP < 200ms (good), 200-500ms (needs improvement), >500ms (poor)
 * - CLS < 0.1 (good), 0.1-0.25 (needs improvement), >0.25 (poor)
 */
export const useWebVitals = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    lcp: null,
    inp: null,
    cls: null,
    ttfb: null
  });

  const getRating = (name: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
    switch (name) {
      case 'LCP':
        return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
      case 'INP':
        return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
      case 'CLS':
        return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
      case 'TTFB':
        return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
      default:
        return 'poor';
    }
  };

  const sendToAnalytics = (metric: WebVitalMetric) => {
    // Send to Google Analytics 4 with custom metrics
    if (typeof window !== 'undefined' && 'gtag' in window) {
      (window as any).gtag('event', 'web_vitals', {
        custom_metric_name: metric.name,
        custom_metric_value: metric.value,
        custom_metric_rating: metric.rating,
        page_url: window.location.pathname,
        user_agent: navigator.userAgent,
        connection_type: (navigator as any).connection?.effectiveType || 'unknown'
      });
    }

    // Send to performance monitoring endpoint
    if (webVitalsConfig.rumConfig.endpoint) {
      fetch(webVitalsConfig.rumConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric: metric.name,
          value: metric.value,
          rating: metric.rating,
          timestamp: metric.timestamp,
          url: window.location.pathname,
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        })
      }).catch(() => {
        // Silently fail - don't impact user experience
      });
    }
  };

  useEffect(() => {
    // Only measure if web-vitals library is available
    const measureWebVitals = async () => {
      try {
        const { onLCP, onINP, onCLS, onTTFB } = await import('web-vitals');

        // Largest Contentful Paint - critical for SEO
        onLCP((metric) => {
          const webVital: WebVitalMetric = {
            name: 'LCP',
            value: metric.value,
            rating: getRating('LCP', metric.value),
            timestamp: Date.now()
          };
          
          setPerformanceData(prev => ({ ...prev, lcp: webVital }));
          
          // Sample rate check for analytics
          if (Math.random() < webVitalsConfig.rumConfig.sampleRate) {
            sendToAnalytics(webVital);
          }
        });

        // Interaction to Next Paint - new metric replacing FID
        onINP((metric) => {
          const webVital: WebVitalMetric = {
            name: 'INP',
            value: metric.value,
            rating: getRating('INP', metric.value),
            timestamp: Date.now()
          };
          
          setPerformanceData(prev => ({ ...prev, inp: webVital }));
          
          if (Math.random() < webVitalsConfig.rumConfig.sampleRate) {
            sendToAnalytics(webVital);
          }
        });

        // Cumulative Layout Shift - important for mobile UX
        onCLS((metric) => {
          const webVital: WebVitalMetric = {
            name: 'CLS',
            value: metric.value,
            rating: getRating('CLS', metric.value),
            timestamp: Date.now()
          };
          
          setPerformanceData(prev => ({ ...prev, cls: webVital }));
          
          if (Math.random() < webVitalsConfig.rumConfig.sampleRate) {
            sendToAnalytics(webVital);
          }
        });

        // Time to First Byte - server performance indicator
        onTTFB((metric) => {
          const webVital: WebVitalMetric = {
            name: 'TTFB',
            value: metric.value,
            rating: getRating('TTFB', metric.value),
            timestamp: Date.now()
          };
          
          setPerformanceData(prev => ({ ...prev, ttfb: webVital }));
          
          if (Math.random() < webVitalsConfig.rumConfig.sampleRate) {
            sendToAnalytics(webVital);
          }
        });

      } catch (error) {
        console.warn('Web Vitals measurement failed:', error);
      }
    };

    measureWebVitals();
  }, []);

  return performanceData;
};

/**
 * Performance optimization utilities for mobile-first compliance
 */
export const performanceUtils = {
  // Lazy load images with intersection observer
  lazyLoadImage: (img: HTMLImageElement, src: string) => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          img.src = src;
          img.onload = () => {
            img.classList.add('loaded');
          };
          observer.unobserve(img);
        }
      });
    }, { 
      rootMargin: '50px' // Load 50px before entering viewport
    });

    observer.observe(img);
  },

  // Defer non-critical JavaScript
  deferScript: (src: string, priority: 'high' | 'low' = 'low') => {
    if (priority === 'high') {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    } else {
      // Defer low priority scripts until after page load
      window.addEventListener('load', () => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      });
    }
  },

  // Optimize images for mobile devices
  getOptimizedImageSrc: (baseSrc: string, width: number, quality: number = 80) => {
    // This would integrate with your image optimization service
    // For now, return the base source with quality parameters
    const url = new URL(baseSrc, window.location.origin);
    url.searchParams.set('w', width.toString());
    url.searchParams.set('q', quality.toString());
    url.searchParams.set('f', 'webp');
    return url.toString();
  },

  // Check if user prefers reduced motion (accessibility & performance)
  prefersReducedMotion: () => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // Detect slow connection for performance adaptations
  isSlowConnection: () => {
    const connection = (navigator as any).connection;
    return connection && 
           (connection.effectiveType === 'slow-2g' || 
            connection.effectiveType === '2g' ||
            connection.saveData === true);
  },

  // Resource hints for critical resources
  addResourceHints: () => {
    // Add DNS prefetch for external domains
    const domains = [
      'fonts.googleapis.com',
      'fonts.gstatic.com', 
      'www.googletagmanager.com'
    ];

    domains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });
  }
};

export default useWebVitals;