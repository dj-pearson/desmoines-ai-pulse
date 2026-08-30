/**
 * Universal Web Scraper
 * Supports multiple scraping backends: Puppeteer, Playwright, and Firecrawl
 */

import { isCrawlAllowed } from './robots.ts';

export type ScraperBackend = 'browserless' | 'fetch' | 'puppeteer' | 'playwright' | 'firecrawl';

export interface ScraperConfig {
  backend: ScraperBackend;
  waitForSelector?: string;
  waitTime?: number;
  timeout?: number;
  userAgent?: string;
  /**
   * True when SCRAPER_USER_AGENT was set deliberately, rather than the
   * built-in desktop-Chrome default. Backends that can forward a
   * User-Agent to the crawled site only do so when this is true, so
   * leaving the variable unset keeps every backend behaving exactly as
   * it did before. See WEB-SEC-024.
   */
  userAgentDeclared?: boolean;
  firecrawlApiKey?: string;
  browserlessApiKey?: string;
  browserlessUrl?: string;
}

export interface ScraperResult {
  success: boolean;
  html?: string;
  markdown?: string;
  text?: string;
  error?: string;
  backend: ScraperBackend;
  duration: number;
}

/**
 * Get scraper configuration from environment or defaults
 */
export function getScraperConfig(): ScraperConfig {
  // Support both BROWSERLESS_API and BROWSERLESS_API_KEY
  const browserlessKey = Deno.env.get('BROWSERLESS_API') || Deno.env.get('BROWSERLESS_API_KEY');
  const defaultBackend = browserlessKey ? 'browserless' : 'fetch';
  const backend = (Deno.env.get('SCRAPER_BACKEND') || defaultBackend) as ScraperBackend;
  
  return {
    backend,
    waitTime: parseInt(Deno.env.get('SCRAPER_WAIT_TIME') || '5000'),
    timeout: parseInt(Deno.env.get('SCRAPER_TIMEOUT') || '30000'),
    userAgent: Deno.env.get('SCRAPER_USER_AGENT') || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    userAgentDeclared: !!Deno.env.get('SCRAPER_USER_AGENT'),
    firecrawlApiKey: Deno.env.get('FIRECRAWL_API_KEY'),
    browserlessApiKey: browserlessKey,
    browserlessUrl: Deno.env.get('BROWSERLESS_URL') || 'https://production-sfo.browserless.io',
  };
}

/**
 * Scrape a URL using Browserless.io (cloud Chrome automation)
 */
async function scrapeWithBrowserless(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();

  try {
    console.log(`🌐 Using Browserless to scrape: ${url}`);

    if (!config.browserlessApiKey) {
      throw new Error('Browserless API key not configured');
    }

    // Use the /scrape endpoint for more control over JavaScript execution
    // This allows us to wait for dynamic content to load
    const browserlessUrl = `${config.browserlessUrl}/scrape?token=${config.browserlessApiKey}`;

    // Build the scrape request with proper waiting for dynamic content
    const scrapeRequest = {
      url,
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: config.timeout || 30000,
      },
      // Wait for dynamic content to fully render
      waitForTimeout: config.waitTime || 5000,
      // Optional: wait for specific selector if provided
      ...(config.waitForSelector && {
        waitForSelector: {
          selector: config.waitForSelector,
          timeout: 10000,
        },
      }),
      // Return the WHOLE document, not just <body>.
      //
      // This was `{ selector: 'body' }`, which returns the body subtree only —
      // so every <script type="application/ld+json"> and <meta property="og:*">
      // in <head> was discarded before it reached the callers. Both the
      // schema.org/Event pre-pass and the og:image fallback read from <head>, so
      // on any site that emits its structured data there (WordPress "The Events
      // Calendar", Squarespace, Wix, most Next.js themes) they silently found
      // nothing and the crawl fell back to fuzzy text extraction.
      elements: [
        { selector: 'html' }
      ],
    };

    console.log(`⏳ Browserless will wait ${config.waitTime || 5000}ms for dynamic content`);

    let response: Response;
    for (let attempt = 1; ; attempt++) {
      response = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': config.userAgent || '',
        },
        body: JSON.stringify(scrapeRequest),
      });
      if (response.status !== 429 || attempt >= 3) break;
      console.log(`⏳ Browserless rate limited (429). Retry #${attempt}...`);
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }

    if (!response.ok) {
      const errorText = await response.text();
      // If /scrape endpoint fails, fall back to /content endpoint
      console.log(`⚠️ Browserless /scrape failed (${response.status}), trying /content endpoint...`);
      return await scrapeWithBrowserlessContent(url, config, startTime);
    }

    const data = await response.json();

    // The /scrape endpoint returns JSON with data property
    const html = data.data?.[0]?.results?.[0]?.html || data.data || '';

    if (!html || typeof html !== 'string') {
      console.log(`⚠️ Browserless /scrape returned unexpected format, trying /content endpoint...`);
      return await scrapeWithBrowserlessContent(url, config, startTime);
    }

    // Extract text content from HTML
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`✅ Browserless scraped ${html.length} chars HTML, ${text.length} chars text`);

    return {
      success: true,
      html,
      text,
      backend: 'browserless',
      duration: Date.now() - startTime,
    };

  } catch (error) {
    console.error(`❌ Browserless error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'browserless',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Fallback: Scrape using Browserless /content endpoint (simpler, less features)
 */
async function scrapeWithBrowserlessContent(
  url: string,
  config: ScraperConfig,
  startTime: number
): Promise<ScraperResult> {
  try {
    const browserlessUrl = `${config.browserlessUrl}/content?token=${config.browserlessApiKey}`;

    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': config.userAgent || '',
      },
      body: JSON.stringify({
        url,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: config.timeout || 30000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless /content error: ${response.status} - ${errorText}`);
    }

    const html = await response.text();

    // Extract text content from HTML
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`✅ Browserless /content scraped ${html.length} chars HTML, ${text.length} chars text`);

    return {
      success: true,
      html,
      text,
      backend: 'browserless',
      duration: Date.now() - startTime,
    };

  } catch (error) {
    console.error(`❌ Browserless /content error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'browserless',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Scrape a URL using simple fetch (works in edge functions)
 */
async function scrapeWithFetch(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🌐 Using fetch to scrape: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.userAgent || '',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Extract text content from HTML (simple approach)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`✅ Fetch scraped ${html.length} chars HTML, ${text.length} chars text`);
    
    return {
      success: true,
      html,
      text,
      backend: 'fetch',
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    console.error(`❌ Fetch error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'fetch',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Scrape a URL using Puppeteer (Chromium)
 * NOTE: This will NOT work in Supabase edge functions as Chrome binary is not available
 */
async function scrapeWithPuppeteer(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🎭 Using Puppeteer to scrape: ${url}`);
    
    // Dynamic import for Puppeteer
    const puppeteer = await import('https://deno.land/x/puppeteer@16.2.0/mod.ts');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
    });

    try {
      const page = await browser.newPage();
      
      // Set user agent
      await page.setUserAgent(config.userAgent || '');
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to URL
      console.log(`🌐 Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: config.timeout,
      });
      
      // Wait for additional time for JS to render
      if (config.waitTime) {
        console.log(`⏳ Waiting ${config.waitTime}ms for JS rendering...`);
        await new Promise(resolve => setTimeout(resolve, config.waitTime));
      }
      
      // Wait for specific selector if provided
      if (config.waitForSelector) {
        try {
          await page.waitForSelector(config.waitForSelector, { timeout: 5000 });
        } catch (e) {
          console.log(`⚠️ Selector ${config.waitForSelector} not found, continuing anyway`);
        }
      }
      
      // Get page content
      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);
      
      console.log(`✅ Puppeteer scraped ${html.length} chars HTML, ${text.length} chars text`);
      
      await page.close();
      
      return {
        success: true,
        html,
        text,
        backend: 'puppeteer',
        duration: Date.now() - startTime,
      };
      
    } finally {
      await browser.close();
    }
    
  } catch (error) {
    console.error(`❌ Puppeteer error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'puppeteer',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Scrape a URL using Playwright
 * NOTE: Playwright is NOT supported in Deno edge functions (requires browser binaries)
 * This function returns an error and suggests using 'firecrawl' or 'browserless' instead
 */
async function scrapeWithPlaywright(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();
  
  console.error(`❌ Playwright is not supported in Deno edge functions. Use 'firecrawl' or 'browserless' backend instead.`);
  
  return {
    success: false,
    error: 'Playwright is not supported in Deno edge functions. Use firecrawl or browserless backend instead.',
    backend: 'playwright',
    duration: Date.now() - startTime,
  };
}

/**
 * Scrape a URL using Firecrawl API
 */
async function scrapeWithFirecrawl(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🔥 Using Firecrawl to scrape: ${url}`);
    
    if (!config.firecrawlApiKey) {
      throw new Error('Firecrawl API key not configured');
    }
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: config.waitTime,
        timeout: config.timeout,
        // WEB-SEC-024: this is the ONLY backend besides plain fetch that can
        // carry our identity to the crawled site. Firecrawl's /v1/scrape takes
        // a `headers` object and applies it to the target request; without it
        // the site sees Firecrawl's own agent and SCRAPER_USER_AGENT reaches
        // nobody. Sent only when the variable was set deliberately, so the
        // default path is byte-identical to before.
        ...(config.userAgentDeclared && config.userAgent
          ? { headers: { 'User-Agent': config.userAgent } }
          : {}),
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    console.log(`✅ Firecrawl scraped ${html.length} chars HTML, ${markdown.length} chars markdown`);
    
    return {
      success: true,
      html,
      markdown,
      text: markdown, // Use markdown as text fallback
      backend: 'firecrawl',
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    console.error(`❌ Firecrawl error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'firecrawl',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Main scraper function - routes to appropriate backend
 */
export async function scrapeUrl(
  url: string,
  customConfig?: Partial<ScraperConfig>
): Promise<ScraperResult> {
  const defaults = getScraperConfig();
  const overrides = Object.fromEntries(Object.entries(customConfig || {}).filter(([_, v]) => v !== undefined));
  const config = { ...defaults, ...overrides } as ScraperConfig;
  
  console.log(`🚀 Starting scrape of ${url} using ${config.backend}`);

  // WEB-SEC-024: ask the site first. Every ingestion path in the project goes
  // through scrapeUrl, and none of them checked robots.txt, so a site that had
  // explicitly asked not to be crawled was crawled anyway. Checked here rather
  // than in each backend because the fallback chain below would otherwise route
  // straight around it.
  //
  // Fail-open by construction (see robots.ts): only an explicit Disallow blocks.
  // SCRAPER_IGNORE_ROBOTS=true is an escape hatch for an incident, not a default.
  if (Deno.env.get('SCRAPER_IGNORE_ROBOTS') !== 'true') {
    const allowed = await isCrawlAllowed(url, config.userAgent || '*');
    if (!allowed) {
      console.log(`⛔ ${url} is disallowed by robots.txt — not fetching`);
      return {
        success: false,
        error: 'Disallowed by robots.txt',
        backend: config.backend,
        duration: 0,
      };
    }
  }

  let result: ScraperResult;
  
  switch (config.backend) {
    case 'browserless':
      result = await scrapeWithBrowserless(url, config);
      break;
      
    case 'fetch':
      result = await scrapeWithFetch(url, config);
      break;
    
    case 'puppeteer':
      console.log(`⚠️ Warning: Puppeteer requires Chrome binary, not available in edge functions. Use 'browserless' instead.`);
      result = await scrapeWithPuppeteer(url, config);
      break;
      
    case 'playwright':
      console.log(`⚠️ Warning: Playwright requires browser binary, not available in edge functions. Use 'browserless' instead.`);
      result = await scrapeWithPlaywright(url, config);
      break;
      
    case 'firecrawl':
      result = await scrapeWithFirecrawl(url, config);
      break;
      
    default:
      result = {
        success: false,
        error: `Unknown backend: ${config.backend}`,
        backend: config.backend,
        duration: 0,
      };
  }
  
  // If primary backend fails, try fallbacks sequentially
  if (!result.success && config.backend !== 'browserless' && config.browserlessApiKey) {
    console.log(`⚠️ Primary backend failed, falling back to Browserless...`);
    result = await scrapeWithBrowserless(url, config);
  }
  if (!result.success && config.backend !== 'firecrawl' && config.firecrawlApiKey) {
    console.log(`⚠️ Browserless failed or unavailable, falling back to Firecrawl...`);
    result = await scrapeWithFirecrawl(url, config);
  }
  if (!result.success && config.backend !== 'fetch') {
    console.log(`⚠️ All backends failed, trying basic fetch as last resort...`);
    result = await scrapeWithFetch(url, config);
  }
  
  return result;
}

/**
 * Scrape multiple URLs in parallel with rate limiting
 */
export async function scrapeUrls(
  urls: string[],
  customConfig?: Partial<ScraperConfig>,
  concurrency: number = 3
): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  
  // Process URLs in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    console.log(`📦 Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(urls.length / concurrency)}`);
    
    const batchResults = await Promise.all(
      batch.map(url => scrapeUrl(url, customConfig))
    );
    
    results.push(...batchResults);
    
    // Rate limiting between batches
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return results;
}

/**
 * Fetch a PDF from a URL and return it as base64 data.
 * Returns null if the URL does not point to a PDF or the fetch fails.
 */
export async function fetchPdfAsBase64(
  url: string,
  timeout = 30000
): Promise<string | null> {
  try {
    console.log(`📄 Fetching PDF: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`❌ PDF fetch failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !url.toLowerCase().endsWith('.pdf')) {
      console.warn(`⚠️ URL does not appear to be a PDF (content-type: ${contentType})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Encode to base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    console.log(`✅ PDF fetched: ${(bytes.length / 1024).toFixed(1)}KB`);
    return base64;
  } catch (error) {
    console.error(`❌ PDF fetch error:`, error);
    return null;
  }
}

/** Map file extensions to media types (for URL-based hints only) */
const EXT_TO_MEDIA: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * Detect the ACTUAL image format from the first bytes (magic bytes).
 * This is the only reliable way — URLs, extensions, and even Content-Type
 * headers can lie (e.g., CDNs with auto=format serve AVIF from .jpg URLs).
 *
 * Returns a Claude-Vision-compatible media type, or null if unsupported.
 */
function detectMediaTypeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // AVIF / HEIC: starts with a size box then "ftyp" at offset 4
  // followed by brand "avif", "avis", "mif1", or "heic"
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // This is an ftyp box — AVIF/HEIC, NOT supported by Claude Vision
    return null;
  }

  return null;
}

/**
 * Detect the media type from a URL and Content-Type header.
 * Used as a HINT for pre-filtering (e.g., in discoverMenuImages).
 * The actual format is verified via magic bytes after fetching.
 */
export function detectImageMediaType(
  url: string,
  contentType?: string | null
): string | null {
  // Try Content-Type header first
  if (contentType) {
    const ct = contentType.split(';')[0].trim().toLowerCase();
    if (ct === 'image/jpeg' || ct === 'image/jpg') return 'image/jpeg';
    if (ct === 'image/png') return 'image/png';
    if (ct === 'image/gif') return 'image/gif';
    if (ct === 'image/webp') return 'image/webp';
    // AVIF/HEIC — not supported, but don't reject yet (caller decides)
  }

  // Fall back to file extension
  const pathname = new URL(url, 'https://x').pathname.toLowerCase();
  const ext = pathname.split('.').pop()?.split('?')[0] || '';
  return EXT_TO_MEDIA[ext] || null;
}

export interface FetchedImage {
  base64: string;
  mediaType: string;   // e.g. "image/jpeg"
  sizeKB: number;
}

/**
 * Rewrite a CDN URL to force a Claude-Vision-compatible format.
 * Many image CDNs (GetBento/BentoBox, Cloudinary, imgix, Contentful, etc.)
 * have `auto=format` or similar params that serve AVIF to modern browsers.
 * We need to force JPEG/WebP/PNG instead.
 */
function forceSupportedFormat(url: string): string {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    const host = u.hostname.toLowerCase();

    // GetBento / BentoBox: images.getbento.com
    // Has `auto=compress,format` — remove "format" from auto, add fm=jpg
    if (host.includes('getbento.com')) {
      const auto = params.get('auto') || '';
      if (auto.includes('format')) {
        params.set('auto', auto.replace(/,?\s*format/, '').replace(/format,?\s*/, '') || 'compress');
        params.set('fm', 'jpg');
      }
      return u.toString();
    }

    // Cloudinary: res.cloudinary.com
    // URL path contains /f_auto/ — replace with /f_jpg/
    if (host.includes('cloudinary.com')) {
      u.pathname = u.pathname.replace(/\/f_auto\b/, '/f_jpg');
      return u.toString();
    }

    // imgix: *.imgix.net or custom domains with ?auto=format
    if (host.includes('imgix.net') || params.get('auto')?.includes('format')) {
      const auto = params.get('auto') || '';
      if (auto.includes('format')) {
        params.set('auto', auto.replace(/,?\s*format/, '').replace(/format,?\s*/, '') || 'compress');
        params.set('fm', 'jpg');
      }
      return u.toString();
    }

    // Contentful: images.ctfassets.net
    if (host.includes('ctfassets.net')) {
      params.set('fm', 'jpg');
      return u.toString();
    }

    // Squarespace CDN: images.squarespace-cdn.com — add ?format=1500w (JPEG)
    if (host.includes('squarespace-cdn.com') && !params.has('format')) {
      params.set('format', 'original');
      return u.toString();
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Fetch an image from a URL and return it as base64 + media type.
 * Only returns images in Claude Vision-supported formats (JPEG, PNG, GIF, WebP).
 *
 * Key behavior:
 * - Detects actual format via magic bytes (not URL extension or Content-Type)
 * - If CDN serves AVIF despite .jpg URL, rewrites URL to force JPEG and retries
 * - Rejects images smaller than minBytes (default 5KB) to skip icons/spacers
 */
export async function fetchImageAsBase64(
  url: string,
  timeout = 20000,
  maxBytes = 20 * 1024 * 1024,
  minBytes = 5 * 1024
): Promise<FetchedImage | null> {
  // Try the original URL first, then a CDN-rewritten URL if format is unsupported
  const urls = [url];
  const rewritten = forceSupportedFormat(url);
  if (rewritten !== url) urls.push(rewritten);

  for (const tryUrl of urls) {
    try {
      console.log(`🖼️ Fetching image: ${tryUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(tryUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          // Request supported formats explicitly — avoid AVIF
          'Accept': 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.1',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`  ❌ Image fetch failed: ${response.status}`);
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      if (bytes.length < minBytes) {
        console.log(`  ⏭️ Image too small (${(bytes.length / 1024).toFixed(1)}KB), likely an icon`);
        return null;
      }

      if (bytes.length > maxBytes) {
        console.log(`  ⏭️ Image too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
        return null;
      }

      // Detect ACTUAL format from magic bytes
      const mediaType = detectMediaTypeFromBytes(bytes);

      if (!mediaType) {
        const contentType = response.headers.get('content-type') || 'unknown';
        console.log(`  ⏭️ Unsupported image format (actual bytes). Content-Type: ${contentType}, URL: ${tryUrl}`);
        // If this was the original URL and we have a rewritten URL, try that next
        continue;
      }

      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const sizeKB = Math.round(bytes.length / 1024);

      console.log(`  ✅ Image fetched: ${sizeKB}KB ${mediaType} (verified by magic bytes)`);
      return { base64, mediaType, sizeKB };
    } catch (error) {
      console.error(`  ❌ Image fetch error:`, error);
    }
  }

  return null;
}
