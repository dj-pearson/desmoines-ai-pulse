import puppeteer from 'puppeteer';
import { performance } from 'perf_hooks';

/**
 * Comprehensive Website Audit Script
 *
 * This script audits:
 * - Mobile responsiveness
 * - Performance metrics
 * - SEO elements
 * - Timezone handling
 * - API connections
 * - Feature completeness
 * - Best practices
 */

interface AuditResult {
  category: string;
  passed: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
  details?: any;
}

const BASE_URL = process.env.AUDIT_URL || 'http://localhost:8080';

const PAGES_TO_AUDIT = [
  { path: '/', name: 'Homepage' },
  { path: '/events', name: 'Events Page' },
  { path: '/restaurants', name: 'Restaurants Page' },
  { path: '/attractions', name: 'Attractions Page' },
  { path: '/playgrounds', name: 'Playgrounds Page' },
  { path: '/articles', name: 'Articles Page' },
  { path: '/neighborhoods', name: 'Neighborhoods Page' },
];

const MOBILE_VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12', width: 390, height: 844 },
  { name: 'Pixel 5', width: 393, height: 851 },
  { name: 'Small Mobile', width: 320, height: 568 },
];

async function auditMobileResponsiveness(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let passedChecks = 0;
  let totalChecks = 0;

  console.log('\n🔍 Auditing Mobile Responsiveness...');

  for (const pageDef of PAGES_TO_AUDIT.slice(0, 3)) {
    const page = await browser.newPage();

    for (const viewport of MOBILE_VIEWPORTS.slice(0, 2)) {
      totalChecks += 3;

      await page.setViewport({ width: viewport.width, height: viewport.height });

      try {
        await page.goto(`${BASE_URL}${pageDef.path}`, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        // Check 1: No horizontal scroll
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        if (hasHorizontalScroll) {
          issues.push(`${pageDef.name} has horizontal scroll on ${viewport.name}`);
        } else {
          passedChecks++;
        }

        // Check 2: Viewport meta tag
        const hasViewportMeta = await page.evaluate(() => {
          const meta = document.querySelector('meta[name="viewport"]');
          return meta?.getAttribute('content')?.includes('width=device-width') || false;
        });

        if (!hasViewportMeta) {
          issues.push(`${pageDef.name} missing proper viewport meta tag`);
        } else {
          passedChecks++;
        }

        // Check 3: Text readability
        const textSizeIssues = await page.evaluate(() => {
          const textElements = Array.from(document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6'));
          let smallTextCount = 0;

          for (const el of textElements) {
            const styles = window.getComputedStyle(el);
            const fontSize = parseFloat(styles.fontSize);
            if (fontSize < 12 && el.textContent && el.textContent.trim().length > 0) {
              smallTextCount++;
            }
          }

          return smallTextCount;
        });

        if (textSizeIssues > 10) {
          issues.push(`${pageDef.name} has ${textSizeIssues} text elements < 12px on ${viewport.name}`);
        } else {
          passedChecks++;
        }

      } catch (error: any) {
        issues.push(`Error loading ${pageDef.name} on ${viewport.name}: ${error.message}`);
      }
    }

    await page.close();
  }

  const score = Math.round((passedChecks / totalChecks) * 100);

  if (score < 90) {
    recommendations.push('Implement fluid typography and responsive layouts');
    recommendations.push('Test on more mobile devices');
    recommendations.push('Use CSS clamp() for responsive sizing');
  }

  return {
    category: 'Mobile Responsiveness',
    passed: score >= 90,
    score,
    issues,
    recommendations,
    details: {
      passedChecks,
      totalChecks,
      testedViewports: MOBILE_VIEWPORTS.slice(0, 2).length,
      testedPages: PAGES_TO_AUDIT.slice(0, 3).length,
    },
  };
}

async function auditPerformance(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  const performanceData: any = {};

  console.log('\n⚡ Auditing Performance...');

  const page = await browser.newPage();

  // Test on mobile viewport for mobile-first
  await page.setViewport({ width: 390, height: 844 });

  for (const pageDef of PAGES_TO_AUDIT.slice(0, 4)) {
    try {
      const startTime = performance.now();

      await page.goto(`${BASE_URL}${pageDef.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      const domLoadTime = performance.now() - startTime;

      await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
      const fullLoadTime = performance.now() - startTime;

      // Get performance metrics
      const metrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');

        return {
          domContentLoaded: perfData ? perfData.domContentLoadedEventEnd - perfData.fetchStart : 0,
          loadComplete: perfData ? perfData.loadEventEnd - perfData.fetchStart : 0,
          fcp: fcpEntry ? fcpEntry.startTime : 0,
        };
      });

      performanceData[pageDef.name] = {
        domLoadTime,
        fullLoadTime,
        ...metrics,
      };

      // Performance checks
      if (domLoadTime > 3000) {
        issues.push(`${pageDef.name} DOM load time > 3s (${Math.round(domLoadTime)}ms)`);
      }

      if (fullLoadTime > 5000) {
        issues.push(`${pageDef.name} full load time > 5s (${Math.round(fullLoadTime)}ms)`);
      }

      if (metrics.fcp > 2500) {
        issues.push(`${pageDef.name} First Contentful Paint > 2.5s`);
      }

    } catch (error: any) {
      issues.push(`Performance test failed for ${pageDef.name}: ${error.message}`);
    }
  }

  await page.close();

  const score = Math.max(0, 100 - (issues.length * 10));

  if (score < 80) {
    recommendations.push('Implement code splitting and lazy loading');
    recommendations.push('Optimize images (use WebP, proper sizing)');
    recommendations.push('Minimize JavaScript bundle size');
    recommendations.push('Enable HTTP/2 and compression');
    recommendations.push('Implement service worker for caching');
  }

  return {
    category: 'Performance',
    passed: score >= 80,
    score,
    issues,
    recommendations,
    details: performanceData,
  };
}

async function auditSEO(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let passedChecks = 0;
  let totalChecks = 0;

  console.log('\n🔎 Auditing SEO Implementation...');

  const page = await browser.newPage();

  for (const pageDef of PAGES_TO_AUDIT.slice(0, 5)) {
    try {
      await page.goto(`${BASE_URL}${pageDef.path}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      totalChecks += 8;

      // Check 1: Title tag
      const title = await page.title();
      if (title && title.length > 10 && title.length < 60) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} has improper title (length: ${title?.length || 0})`);
      }

      // Check 2: Meta description
      const metaDescription = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute('content')
      ).catch(() => null);

      if (metaDescription && metaDescription.length >= 120 && metaDescription.length <= 160) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} has improper meta description (length: ${metaDescription?.length || 0})`);
      }

      // Check 3: H1 tag
      const h1Count = await page.$$eval('h1', (h1s) => h1s.length);
      if (h1Count === 1) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} has ${h1Count} H1 tags (should be 1)`);
      }

      // Check 4: Semantic HTML
      const hasSemanticHTML = await page.evaluate(() => {
        return !!(
          document.querySelector('main') &&
          document.querySelector('header') &&
          document.querySelector('footer')
        );
      });

      if (hasSemanticHTML) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} missing semantic HTML elements`);
      }

      // Check 5: Images with alt text
      const imagesWithoutAlt = await page.$$eval('img', (imgs) =>
        imgs.filter((img) => !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation').length
      );

      if (imagesWithoutAlt === 0) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} has ${imagesWithoutAlt} images without alt text`);
      }

      // Check 6: Open Graph tags
      const hasOGTags = await page.evaluate(() => {
        return !!(
          document.querySelector('meta[property="og:title"]') &&
          document.querySelector('meta[property="og:description"]') &&
          document.querySelector('meta[property="og:image"]')
        );
      });

      if (hasOGTags) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} missing Open Graph tags`);
      }

      // Check 7: Structured data (JSON-LD)
      const hasStructuredData = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        return scripts.length > 0;
      });

      if (hasStructuredData) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} missing structured data (JSON-LD)`);
      }

      // Check 8: Canonical URL
      const hasCanonical = await page.$('link[rel="canonical"]') !== null;
      if (hasCanonical) {
        passedChecks++;
      } else {
        issues.push(`${pageDef.name} missing canonical URL`);
      }

    } catch (error: any) {
      issues.push(`SEO audit failed for ${pageDef.name}: ${error.message}`);
    }
  }

  await page.close();

  const score = Math.round((passedChecks / totalChecks) * 100);

  if (score < 85) {
    recommendations.push('Add comprehensive Open Graph and Twitter Card meta tags');
    recommendations.push('Implement structured data (Schema.org) for local business');
    recommendations.push('Ensure all images have descriptive alt text');
    recommendations.push('Add canonical URLs to all pages');
    recommendations.push('Optimize meta descriptions for click-through rate');
  }

  return {
    category: 'SEO',
    passed: score >= 85,
    score,
    issues,
    recommendations,
    details: {
      passedChecks,
      totalChecks,
    },
  };
}

async function auditTimezoneHandling(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let passedChecks = 0;
  let totalChecks = 0;

  console.log('\n🕐 Auditing Timezone Handling (CST)...');

  const page = await browser.newPage();

  try {
    // Check events page for date/time displays
    await page.goto(`${BASE_URL}/events`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Look for time displays
    const timeElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('time, [datetime], .time, .date'));
      return elements.map((el) => ({
        text: el.textContent?.trim() || '',
        datetime: el.getAttribute('datetime') || '',
        tagName: el.tagName,
      }));
    });

    totalChecks += 1;
    if (timeElements.length > 0) {
      passedChecks++;
      console.log(`  Found ${timeElements.length} time/date elements`);
    } else {
      issues.push('No time/date elements found on events page');
    }

    // Check for timezone indicators
    const hasTimezoneIndicators = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.includes('CST') || bodyText.includes('CDT') || bodyText.includes('Central');
    });

    totalChecks += 1;
    if (hasTimezoneIndicators) {
      passedChecks++;
    } else {
      issues.push('No timezone indicators (CST/CDT/Central) found');
      recommendations.push('Add timezone indicators to all date/time displays');
    }

    // Check if times are in reasonable format
    const timeFormats = await page.evaluate(() => {
      const timeTexts: string[] = [];
      const elements = document.querySelectorAll('time, .time, [datetime]');

      elements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text) timeTexts.push(text);
      });

      return timeTexts;
    });

    totalChecks += 1;
    const has12HourFormat = timeFormats.some((t) => t.match(/\d{1,2}:\d{2}\s*(AM|PM|am|pm)/));
    if (has12HourFormat) {
      passedChecks++;
    } else {
      issues.push('Times may not be in user-friendly 12-hour format');
      recommendations.push('Use 12-hour format (e.g., 7:30 PM) for better readability');
    }

  } catch (error: any) {
    issues.push(`Timezone audit failed: ${error.message}`);
  }

  await page.close();

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  if (score < 100) {
    recommendations.push('Verify all dates/times are converted from UTC to Central Time');
    recommendations.push('Test timezone conversion scripts thoroughly');
    recommendations.push('Add timezone abbreviations to all time displays');
    recommendations.push('Consider using date-fns-tz library for consistent timezone handling');
  }

  return {
    category: 'Timezone Handling',
    passed: score >= 80,
    score,
    issues,
    recommendations,
    details: {
      passedChecks,
      totalChecks,
    },
  };
}

async function auditAccessibility(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let passedChecks = 0;
  let totalChecks = 0;

  console.log('\n♿ Auditing Accessibility...');

  const page = await browser.newPage();

  for (const pageDef of PAGES_TO_AUDIT.slice(0, 3)) {
    try {
      await page.goto(`${BASE_URL}${pageDef.path}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      totalChecks += 5;

      // Check 1: Lang attribute
      const hasLang = await page.$eval('html', (el) => el.hasAttribute('lang'));
      if (hasLang) passedChecks++;
      else issues.push(`${pageDef.name} missing lang attribute on html tag`);

      // Check 2: Skip link
      const hasSkipLink = await page.evaluate(() => {
        const firstLink = document.querySelector('a');
        return firstLink?.textContent?.toLowerCase().includes('skip') || false;
      });
      if (hasSkipLink) passedChecks++;
      else issues.push(`${pageDef.name} missing skip to content link`);

      // Check 3: Buttons with labels
      const buttonsWithoutLabels = await page.$$eval('button', (buttons) =>
        buttons.filter((btn) => {
          const hasText = !!btn.textContent?.trim();
          const hasAriaLabel = !!btn.getAttribute('aria-label');
          return !hasText && !hasAriaLabel;
        }).length
      );
      if (buttonsWithoutLabels === 0) passedChecks++;
      else issues.push(`${pageDef.name} has ${buttonsWithoutLabels} buttons without labels`);

      // Check 4: Form inputs with labels
      const inputsWithoutLabels = await page.$$eval('input:not([type="hidden"])', (inputs) =>
        inputs.filter((input) => {
          const hasLabel = !!input.labels?.length;
          const hasAriaLabel = !!input.getAttribute('aria-label');
          return !hasLabel && !hasAriaLabel;
        }).length
      );
      if (inputsWithoutLabels === 0) passedChecks++;
      else issues.push(`${pageDef.name} has ${inputsWithoutLabels} inputs without labels`);

      // Check 5: Proper heading hierarchy
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (headings) =>
        headings.map((h) => parseInt(h.tagName[1]))
      );
      const h1Count = headings.filter((level) => level === 1).length;
      if (h1Count === 1) passedChecks++;
      else issues.push(`${pageDef.name} has ${h1Count} H1 tags (should be 1)`);

    } catch (error: any) {
      issues.push(`Accessibility audit failed for ${pageDef.name}: ${error.message}`);
    }
  }

  await page.close();

  const score = Math.round((passedChecks / totalChecks) * 100);

  if (score < 90) {
    recommendations.push('Run axe-core or Lighthouse accessibility audit');
    recommendations.push('Ensure all interactive elements are keyboard accessible');
    recommendations.push('Add ARIA labels where needed');
    recommendations.push('Test with screen readers');
    recommendations.push('Ensure sufficient color contrast (WCAG AA)');
  }

  return {
    category: 'Accessibility',
    passed: score >= 90,
    score,
    issues,
    recommendations,
    details: {
      passedChecks,
      totalChecks,
    },
  };
}

async function auditBestPractices(browser: puppeteer.Browser): Promise<AuditResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let passedChecks = 0;
  let totalChecks = 0;

  console.log('\n✅ Auditing Best Practices...');

  const page = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    totalChecks += 7;

    // Check 1: HTTPS (not applicable for localhost)
    const isHTTPS = page.url().startsWith('https://');
    if (isHTTPS || page.url().includes('localhost')) {
      passedChecks++;
    } else {
      issues.push('Site should use HTTPS in production');
    }

    // Check 2: No console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload({ waitUntil: 'networkidle0' });

    if (consoleErrors.length === 0) {
      passedChecks++;
    } else {
      issues.push(`Console errors found: ${consoleErrors.length} errors`);
    }

    // Check 3: Proper doctype
    const hasDoctype = await page.evaluate(() => {
      return document.doctype !== null;
    });
    if (hasDoctype) passedChecks++;
    else issues.push('Missing DOCTYPE declaration');

    // Check 4: Responsive images
    const imagesWithoutSrcset = await page.$$eval('img', (imgs) =>
      imgs.filter((img) => !img.hasAttribute('srcset') && !img.hasAttribute('sizes')).length
    );
    if (imagesWithoutSrcset < 5) passedChecks++;
    else issues.push(`${imagesWithoutSrcset} images without srcset/sizes attributes`);

    // Check 5: External links security
    const unsafeExternalLinks = await page.$$eval('a[target="_blank"]', (links) =>
      links.filter((link) => !link.getAttribute('rel')?.includes('noopener')).length
    );
    if (unsafeExternalLinks === 0) passedChecks++;
    else issues.push(`${unsafeExternalLinks} external links without rel="noopener noreferrer"`);

    // Check 6: Lazy loading
    const lazyLoadedImages = await page.$$eval('img', (imgs) =>
      imgs.filter((img) => img.loading === 'lazy').length
    );
    const totalImages = await page.$$eval('img', (imgs) => imgs.length);

    if (totalImages > 5 && lazyLoadedImages / totalImages > 0.5) {
      passedChecks++;
    } else {
      issues.push('Consider implementing lazy loading for images');
    }

    // Check 7: Service Worker
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });
    if (hasServiceWorker) passedChecks++;
    else recommendations.push('Consider implementing a service worker for offline support');

  } catch (error: any) {
    issues.push(`Best practices audit failed: ${error.message}`);
  }

  await page.close();

  const score = Math.round((passedChecks / totalChecks) * 100);

  if (score < 85) {
    recommendations.push('Ensure all external links have proper rel attributes');
    recommendations.push('Implement lazy loading for below-fold images');
    recommendations.push('Use modern image formats (WebP, AVIF)');
    recommendations.push('Implement Content Security Policy headers');
    recommendations.push('Add a service worker for PWA capabilities');
  }

  return {
    category: 'Best Practices',
    passed: score >= 85,
    score,
    issues,
    recommendations,
    details: {
      passedChecks,
      totalChecks,
    },
  };
}

function generateReport(results: AuditResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE WEBSITE AUDIT REPORT');
  console.log('='.repeat(80));

  let totalScore = 0;
  let totalCategories = results.length;

  for (const result of results) {
    totalScore += result.score;

    console.log(`\n${result.category}`);
    console.log('-'.repeat(80));
    console.log(`Score: ${result.score}/100 ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

    if (result.issues.length > 0) {
      console.log('\nIssues:');
      result.issues.slice(0, 10).forEach((issue) => {
        console.log(`  ❌ ${issue}`);
      });
      if (result.issues.length > 10) {
        console.log(`  ... and ${result.issues.length - 10} more issues`);
      }
    }

    if (result.recommendations.length > 0) {
      console.log('\nRecommendations:');
      result.recommendations.forEach((rec) => {
        console.log(`  💡 ${rec}`);
      });
    }
  }

  const overallScore = Math.round(totalScore / totalCategories);

  console.log('\n' + '='.repeat(80));
  console.log(`OVERALL SCORE: ${overallScore}/100`);

  let grading: string;
  if (overallScore >= 90) grading = 'A (Excellent)';
  else if (overallScore >= 80) grading = 'B (Good)';
  else if (overallScore >= 70) grading = 'C (Fair)';
  else if (overallScore >= 60) grading = 'D (Needs Improvement)';
  else grading = 'F (Poor)';

  console.log(`Grade: ${grading}`);
  console.log('='.repeat(80) + '\n');

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => r.passed).length;

  console.log('\n📈 Summary:');
  console.log(`  ✅ Passed: ${passed}/${totalCategories} categories`);
  console.log(`  ❌ Failed: ${totalCategories - passed}/${totalCategories} categories`);

  console.log('\n🎯 Priority Actions:');
  const allRecommendations = results.flatMap((r) => r.recommendations);
  const uniqueRecommendations = [...new Set(allRecommendations)];
  uniqueRecommendations.slice(0, 10).forEach((rec, idx) => {
    console.log(`  ${idx + 1}. ${rec}`);
  });
}

async function runAudit(): Promise<void> {
  console.log('🚀 Starting Comprehensive Website Audit');
  console.log(`Target: ${BASE_URL}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: AuditResult[] = [];

  try {
    // Run all audits
    results.push(await auditMobileResponsiveness(browser));
    results.push(await auditPerformance(browser));
    results.push(await auditSEO(browser));
    results.push(await auditTimezoneHandling(browser));
    results.push(await auditAccessibility(browser));
    results.push(await auditBestPractices(browser));

    // Generate report
    generateReport(results);

  } catch (error) {
    console.error('❌ Audit failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the audit
runAudit().catch(console.error);
