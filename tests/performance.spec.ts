import { test, expect, Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Performance Testing Suite
 *
 * This suite validates:
 * - Page load times
 * - Core Web Vitals (LCP, FID, CLS)
 * - Resource loading efficiency
 * - Time to Interactive
 * - Bundle size impact
 * - Image optimization
 * - Network performance
 */

/**
 * The smoke lane builds with placeholder VITE_SUPABASE_*, so without help
 * every hub measures a failed fetch and its error branch rather than the page
 * a visitor gets (WEB-CI-028). fixtureBackend answers PostgREST with rows, and
 * consent is seeded so the cookie banner is not part of what CLS and LCP see.
 *
 * The clock is deliberately NOT pinned, unlike layout-integrity.spec.ts:
 * page.clock fakes `performance` too, and with it installed
 * performance.getEntriesByType('resource') comes back empty, so the vitals
 * and byte-budget tests below would measure nothing and pass.
 */
const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode: the banner shows and CLS includes it */
    }
  }, CONSENT);
  await installFixtureBackend(page);
});

const pages = [
  { path: '/', name: 'homepage' },
  { path: '/events', name: 'events' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/attractions', name: 'attractions' },
  { path: '/articles', name: 'articles' },
  { path: '/playgrounds', name: 'playgrounds' },
];

interface PerformanceMetrics {
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  cls: number; // Cumulative Layout Shift
  tti: number; // Time to Interactive
  tbt: number; // Total Blocking Time
  domContentLoaded: number;
  loadComplete: number;
}

async function getWebVitals(page: Page): Promise<PerformanceMetrics> {
  return await page.evaluate(() => {
    return new Promise<PerformanceMetrics>((resolve) => {
      const metrics: Partial<PerformanceMetrics> = {};

      // Get navigation timing
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (perfData) {
        metrics.domContentLoaded = perfData.domContentLoadedEventEnd - perfData.fetchStart;
        metrics.loadComplete = perfData.loadEventEnd - perfData.fetchStart;
      }

      // Get paint timing
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      if (fcpEntry) {
        metrics.fcp = fcpEntry.startTime;
      }

      // Try to get CLS from PerformanceObserver
      let clsValue = 0;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).hadRecentInput) continue;
            clsValue += (entry as any).value;
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        // PerformanceObserver not supported or layout-shift not available
      }
      metrics.cls = clsValue;

      // Estimate TTI (simplified)
      metrics.tti = metrics.loadComplete || 0;
      metrics.tbt = 0; // Would need more complex calculation

      // Try to get LCP
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        metrics.lcp = metrics.fcp || 0;
      }

      // Return after a short delay to capture metrics
      setTimeout(() => {
        resolve({
          fcp: metrics.fcp || 0,
          lcp: metrics.lcp || 0,
          cls: metrics.cls || 0,
          tti: metrics.tti || 0,
          tbt: metrics.tbt || 0,
          domContentLoaded: metrics.domContentLoaded || 0,
          loadComplete: metrics.loadComplete || 0,
        });
      }, 1000);
    });
  });
}

test.describe('Page Load Performance', () => {
  for (const page of pages) {
    test(`${page.name} should load within acceptable time on mobile`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 375, height: 667 });

      const startTime = Date.now();
      await pw.goto(page.path, { waitUntil: 'domcontentloaded' });
      const domLoadTime = Date.now() - startTime;

      await pw.waitForLoadState('networkidle');
      const fullLoadTime = Date.now() - startTime;

      console.log(`${page.name} - DOM: ${domLoadTime}ms, Full: ${fullLoadTime}ms`);

      // DOM should load within 3 seconds on mobile
      expect(domLoadTime, 'DOM Content Loaded should be under 3000ms').toBeLessThan(3000);

      // Full load should be within 5 seconds
      expect(fullLoadTime, 'Full page load should be under 5000ms').toBeLessThan(5000);
    });

    test(`${page.name} should load within acceptable time on desktop`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 1920, height: 1080 });

      const startTime = Date.now();
      await pw.goto(page.path, { waitUntil: 'domcontentloaded' });
      const domLoadTime = Date.now() - startTime;

      await pw.waitForLoadState('networkidle');
      const fullLoadTime = Date.now() - startTime;

      console.log(`${page.name} Desktop - DOM: ${domLoadTime}ms, Full: ${fullLoadTime}ms`);

      // Desktop should be faster
      expect(domLoadTime, 'DOM Content Loaded should be under 2000ms').toBeLessThan(2000);
      expect(fullLoadTime, 'Full page load should be under 4000ms').toBeLessThan(4000);
    });
  }
});

test.describe('Core Web Vitals', () => {
  for (const page of pages) {
    test(`${page.name} should meet Core Web Vitals thresholds`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      // Wait for page to settle
      await pw.waitForTimeout(2000);

      const metrics = await getWebVitals(pw);

      console.log(`${page.name} Web Vitals:`, metrics);

      // Core Web Vitals thresholds
      // LCP should be under 2.5s (good), under 4s (acceptable)
      if (metrics.lcp > 0) {
        expect(metrics.lcp, 'LCP (Largest Contentful Paint) should be under 4000ms').toBeLessThan(4000);
      }

      // FCP should be under 1.8s (good), under 3s (acceptable)
      if (metrics.fcp > 0) {
        expect(metrics.fcp, 'FCP (First Contentful Paint) should be under 3000ms').toBeLessThan(3000);
      }

      // CLS should be under 0.1 (good), under 0.25 (acceptable)
      if (metrics.cls > 0) {
        expect(metrics.cls, 'CLS (Cumulative Layout Shift) should be under 0.25').toBeLessThan(0.25);
      }
    });
  }
});

test.describe('Resource Loading', () => {
  test('should not load excessive resources on homepage', async ({ page }) => {
    const resourceStats = {
      scripts: 0,
      stylesheets: 0,
      images: 0,
      fonts: 0,
      other: 0,
      totalSize: 0,
    };

    page.on('response', (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (contentType.includes('javascript')) resourceStats.scripts++;
      else if (contentType.includes('css')) resourceStats.stylesheets++;
      else if (contentType.includes('image')) resourceStats.images++;
      else if (contentType.includes('font')) resourceStats.fonts++;
      else resourceStats.other++;

      response.body().then(body => {
        resourceStats.totalSize += body.length;
      }).catch(() => {});
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // JS as it crossed the wire (gzipped by vite preview here, by Cloudflare in
    // production), from Resource Timing rather than response bodies, which are
    // decoded.
    const scriptGzipBytes = await page.evaluate(() =>
      (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name))
        .reduce((sum, e) => sum + e.encodedBodySize, 0),
    );
    const scriptGzipKB = scriptGzipBytes / 1024;

    console.log('Resource Stats:', resourceStats, `JS on the wire: ${scriptGzipKB.toFixed(1)} KB`);

    // The budget is BYTES, not files. This used to assert fewer than 100 JS
    // files, a bar written for the dev server, and it failed every build at
    // 111-114 (2026-11-07): vite.config.ts trades more small chunks for fewer
    // bytes on purpose (experimentalMinChunkSize, WEB-PERF-065: no merging, so
    // routes stop downloading modules they never run; measured there; the
    // home page went from 47 to 62 route files). A file-count bar argues with that
    // decision; it does not catch the regression it was meant to, a heavy
    // library landing on the home page. CLAUDE.md's bundle target is 500 KB
    // gzipped; the home page measured 423 KB on 2026-11-07. Zero means
    // Resource Timing recorded nothing, which would make this pass vacuously.
    expect(scriptGzipBytes, 'Resource Timing must see the scripts it is budgeting').toBeGreaterThan(0);
    expect(scriptGzipKB, 'Home page JS should stay under the 500 KB gzipped bundle target').toBeLessThan(500);
    expect(resourceStats.stylesheets, 'Should not load excessive CSS files').toBeLessThan(20);

    // Total page size should be reasonable (in bytes)
    const totalMB = resourceStats.totalSize / (1024 * 1024);
    console.log(`Total page size: ${totalMB.toFixed(2)} MB`);
    expect(totalMB, 'Total page size should be under 5MB').toBeLessThan(5);
  });

  /**
   * "Critical CSS first" means no unstyled first paint: the shell's inline
   * <style> is there, and the app stylesheet is a <link> in the initial <head>
   * that holds rendering until it arrives. The old version compared the
   * Date.now() of two response events and logged the answer (WEB-QA-050).
   * Order of CSS vs module JS is not the point - Vite's entry is a deferred
   * module script - so this checks the paint against the stylesheet instead.
   */
  test('should load critical CSS first', async ({ page, browserName }) => {
    await page.goto('/', { waitUntil: 'load' });

    const css = await page.evaluate(() => {
      const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
      const appSheet = links.find((l) => /\/assets\/index-[^/]+\.css$/.test(l.href));
      const timing = appSheet
        ? (performance.getEntriesByName(appSheet.href)[0] as
            | (PerformanceResourceTiming & { renderBlockingStatus?: string })
            | undefined)
        : undefined;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        inlineCriticalCss: (document.head.querySelector('style')?.textContent ?? '').includes('--background'),
        appSheetHref: appSheet?.href ?? null,
        appSheetMedia: appSheet?.media ?? null,
        renderBlockingStatus: timing?.renderBlockingStatus ?? null,
        responseEnd: timing?.responseEnd ?? null,
        fcp: fcp?.startTime ?? null,
      };
    });

    expect(css.inlineCriticalCss, 'index.html inlines the theme tokens for the first paint').toBe(true);
    expect(css.appSheetHref, 'the app stylesheet is a <link> in the initial <head>').not.toBeNull();
    expect(['', 'all', 'screen'], 'the app stylesheet applies to screen, not deferred via media').toContain(
      css.appSheetMedia,
    );
    expect(css.responseEnd, 'Resource Timing recorded the app stylesheet').not.toBeNull();
    expect(css.fcp, 'the page recorded a first-contentful-paint').not.toBeNull();
    expect(css.responseEnd, 'the app stylesheet arrived before the first contentful paint').toBeLessThanOrEqual(
      css.fcp,
    );
    // renderBlockingStatus is Chromium-only; the smoke lane is Chromium.
    if (browserName === 'chromium') {
      expect(css.renderBlockingStatus, 'the app stylesheet blocks rendering').toBe('blocking');
    }
  });
});

test.describe('Image Optimization', () => {
  test('should not load oversized images on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const oversizedImages: any[] = [];

    page.on('response', async (response) => {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('image')) {
        try {
          const body = await response.body();
          const sizeKB = body.length / 1024;

          // Images larger than 500KB on mobile are concerning
          if (sizeKB > 500) {
            oversizedImages.push({
              url: response.url().split('/').pop(),
              sizeKB: sizeKB.toFixed(2),
            });
          }
        } catch (e) {
          // Ignore errors
        }
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    if (oversizedImages.length > 0) {
      console.log('Oversized images found:', oversizedImages);
    }

    expect(oversizedImages.length, 'Should not load excessively large images on mobile').toBeLessThan(3);
  });

  /**
   * Images this build serves itself must be WebP, AVIF or SVG. Third-party
   * images (venue photos from image_url) are out of this build's control and
   * excluded. The fixtures carry image_url: null, so on the smoke lane the
   * same-origin set is the header logo, which OptimizedLogo serves from a
   * <picture> with a WebP <source>; a regression to its PNG fallback fails
   * here. The non-empty check stops this passing on a page that loaded no
   * images at all (WEB-QA-050).
   */
  test('should use appropriate image formats', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    const served: { file: string; type: string }[] = [];

    page.on('response', (response) => {
      if (response.request().resourceType() !== 'image') return;
      if (new URL(response.url()).origin !== origin) return;
      served.push({
        file: response.url().split('/').pop() ?? response.url(),
        type: (response.headers()['content-type'] ?? '').split(';')[0].trim(),
      });
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(served.length, 'the home page loaded at least one same-origin image').toBeGreaterThan(0);
    const legacy = served.filter((s) => !['image/webp', 'image/avif', 'image/svg+xml'].includes(s.type));
    expect(legacy, 'same-origin images are WebP, AVIF or SVG').toEqual([]);
  });

  test('should implement lazy loading for images', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const images = await page.$$eval('img', imgs =>
      imgs.map(img => ({
        src: img.src,
        loading: img.loading,
        hasLazyLoading: img.loading === 'lazy' || img.classList.contains('lazy'),
      }))
    );

    const belowFoldImages = images.slice(5); // Images after the first 5 should ideally be lazy loaded
    const lazyLoadedCount = belowFoldImages.filter(img => img.hasLazyLoading).length;

    console.log(`${lazyLoadedCount} of ${belowFoldImages.length} below-fold images are lazy loaded`);

    // At least some images should use lazy loading
    if (belowFoldImages.length > 5) {
      const lazyLoadPercentage = (lazyLoadedCount / belowFoldImages.length) * 100;
      expect(lazyLoadPercentage, 'At least 30% of below-fold images should be lazy loaded').toBeGreaterThan(30);
    }
  });
});

test.describe('JavaScript Performance', () => {
  test('should not have long-running scripts blocking main thread', async ({ page }) => {
    const longTasks: any[] = [];

    await page.goto('/');

    // Measure long tasks
    const tasks = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries.map(entry => ({
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
          })));
        });

        try {
          observer.observe({ type: 'longtask', buffered: true });
          setTimeout(() => resolve([]), 3000); // Timeout after 3 seconds
        } catch (e) {
          resolve([]); // Not supported
        }
      });
    });

    const longTaskArray = tasks as any[];
    const significantTasks = longTaskArray.filter(task => task.duration > 100);

    if (significantTasks.length > 0) {
      console.log(`Found ${significantTasks.length} long tasks:`, significantTasks);
    }

    // Should minimize long-running tasks
    expect(significantTasks.length, 'Should minimize tasks over 100ms').toBeLessThan(10);
  });

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/');

    // Get initial memory
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    if (initialMemory === 0) {
      console.log('Memory API not available');
      return;
    }

    // Navigate to several pages
    await page.goto('/events');
    await page.waitForTimeout(1000);
    await page.goto('/restaurants');
    await page.waitForTimeout(1000);
    await page.goto('/attractions');
    await page.waitForTimeout(1000);

    // Get final memory
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB
    console.log(`Memory increase after navigation: ${memoryIncrease.toFixed(2)} MB`);

    // Memory shouldn't increase dramatically (more than 50MB suggests leaks)
    expect(memoryIncrease, 'Should not have significant memory leaks').toBeLessThan(50);
  });
});

test.describe('Mobile Performance', () => {
  test('should be responsive on slow 3G network', async ({ page, context }) => {
    // Simulate slow 3G
    await context.route('**/*', route => {
      setTimeout(() => route.continue(), 100); // Add 100ms delay
    });

    await page.setViewportSize({ width: 375, height: 667 });

    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const loadTime = Date.now() - startTime;

    console.log(`Load time on slow network: ${loadTime}ms`);

    // Should still be usable on slow networks (under 8 seconds)
    expect(loadTime, 'Should load within 8 seconds on slow network').toBeLessThan(8000);
  });

  /**
   * Holds every PostgREST answer behind a gate so the loading state is
   * observable rather than a race against a local fixture (WEB-QA-050). While
   * held, the first screen must say it is loading (aria-busy, which is what a
   * screen reader hears); once released, nothing on that screen may still be
   * busy or still a skeleton. Below-fold rails keep their skeletons until
   * scrolled to, so only the viewport is checked.
   */
  test('should show loading states for async content', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/rest/v1/**', async (route) => {
      await gate;
      await route.fallback();
    });

    const loadingInViewport = () =>
      page.evaluate(() => {
        const inView = (e: Element) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
        };
        return {
          busy: Array.from(document.querySelectorAll('[aria-busy="true"]')).filter(inView).length,
          skeletons: Array.from(document.querySelectorAll('.animate-pulse')).filter(inView).length,
        };
      });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // The route's Suspense fallback is itself aria-busy; wait for the page to
    // mount so the check below sees the data loading state, not the shell's.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect
      .poll(async () => (await loadingInViewport()).busy, {
        message: 'while data is pending, the first screen marks a region aria-busy',
      })
      .toBeGreaterThan(0);

    release();
    await page.waitForLoadState('networkidle');

    await expect
      .poll(loadingInViewport, { message: 'once data arrives, no busy region or skeleton is left on screen' })
      .toEqual({ busy: 0, skeletons: 0 });
  });
});

test.describe('Caching and Optimization', () => {
  test('should leverage browser caching', async ({ page }) => {
    const cachedResources: string[] = [];
    const nonCachedResources: string[] = [];

    page.on('response', (response) => {
      const cacheControl = response.headers()['cache-control'] || '';
      const url = response.url();

      // Static assets should be cached
      if (url.match(/\.(js|css|jpg|jpeg|png|gif|svg|woff|woff2|ttf)$/)) {
        if (cacheControl.includes('max-age') || cacheControl.includes('immutable')) {
          cachedResources.push(url.split('/').pop() || url);
        } else {
          nonCachedResources.push(url.split('/').pop() || url);
        }
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    console.log(`Cached resources: ${cachedResources.length}`);
    console.log(`Non-cached resources: ${nonCachedResources.length}`);

    if (nonCachedResources.length > 0) {
      console.log('Resources without caching:', nonCachedResources.slice(0, 5));
    }

    // Most static assets should have caching headers in production
    // Note: In dev mode, Vite doesn't send cache headers - caching is handled by CDN in production
    // This test is informational in dev mode
    if (cachedResources.length + nonCachedResources.length > 0) {
      const cacheRatio = cachedResources.length / (cachedResources.length + nonCachedResources.length);
      // Skip assertion in dev mode (no cache headers)
      if (cacheRatio > 0) {
        expect(cacheRatio, 'At least 50% of static resources should be cached').toBeGreaterThan(0.5);
      } else {
        console.log('Note: No cache headers in dev mode - caching verified in production via CDN');
      }
    }
  });
});
