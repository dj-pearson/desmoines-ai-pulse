/**
 * Universal Web Scraper
 * Supports multiple scraping backends: Puppeteer, Playwright, and Firecrawl
 */

export type ScraperBackend = 'browserless' | 'fetch' | 'puppeteer' | 'playwright' | 'firecrawl';

export interface ScraperConfig {
  backend: ScraperBackend;
  waitForSelector?: string;
  waitTime?: number;
  timeout?: number;
  userAgent?: string;
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
    
    const browserlessUrl = `${config.browserlessUrl}/content?token=${config.browserlessApiKey}`;
    
    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: config.timeout,
        },
        waitFor: config.waitTime,
        userAgent: config.userAgent,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless API error: ${response.status} - ${errorText}`);
    }
    
    const html = await response.text();
    
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
 */
async function scrapeWithPlaywright(
  url: string,
  config: ScraperConfig
): Promise<ScraperResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🎭 Using Playwright to scrape: ${url}`);
    
    // Dynamic import for Playwright
    const { chromium } = await import('npm:playwright@1.40.0');
    
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent: config.userAgent,
        viewport: { width: 1920, height: 1080 },
      });
      
      const page = await context.newPage();
      
      // Navigate to URL
      console.log(`🌐 Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.timeout,
      });
      
      // Wait for additional time for JS to render
      if (config.waitTime) {
        console.log(`⏳ Waiting ${config.waitTime}ms for JS rendering...`);
        await page.waitForTimeout(config.waitTime);
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
      const text = await page.textContent('body') || '';
      
      console.log(`✅ Playwright scraped ${html.length} chars HTML, ${text.length} chars text`);
      
      await context.close();
      
      return {
        success: true,
        html,
        text,
        backend: 'playwright',
        duration: Date.now() - startTime,
      };
      
    } finally {
      await browser.close();
    }
    
  } catch (error) {
    console.error(`❌ Playwright error:`, error);
    return {
      success: false,
      error: error.message,
      backend: 'playwright',
      duration: Date.now() - startTime,
    };
  }
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
  const config = { ...getScraperConfig(), ...customConfig };
  
  console.log(`🚀 Starting scrape of ${url} using ${config.backend}`);
  
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
  
  // If primary backend fails, try fallbacks in order
  if (!result.success) {
    // Try Browserless if available and not already tried
    if (config.backend !== 'browserless' && config.browserlessApiKey) {
      console.log(`⚠️ Primary backend failed, falling back to Browserless...`);
      result = await scrapeWithBrowserless(url, config);
    }
    // Try Firecrawl if available and not already tried
    else if (config.backend !== 'firecrawl' && config.firecrawlApiKey) {
      console.log(`⚠️ Primary backend failed, falling back to Firecrawl...`);
      result = await scrapeWithFirecrawl(url, config);
    }
    // Try fetch as last resort if not already tried
    else if (config.backend !== 'fetch') {
      console.log(`⚠️ All backends failed, trying basic fetch as last resort...`);
      result = await scrapeWithFetch(url, config);
    }
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
