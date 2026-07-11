/**
 * SECURITY: verify_jwt = false
 * Reason: Background scraping job that runs without user context to collect restaurant menu data
 * Alternative measures: Service role key required for database access, API key validation for external services
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { fetchPdfAsBase64, fetchImageAsBase64, detectImageMediaType } from "../_shared/scraper.ts";
import type { FetchedImage } from "../_shared/scraper.ts";
import { getAIConfig } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const claudeApiKey = Deno.env.get('CLAUDE_API')!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface MenuSection {
  section_name: string;
  section_sort_order: number;
  items: MenuItem[];
}

interface MenuItem {
  item_name: string;
  item_description: string | null;
  price: string | null;
  price_numeric: number | null;
  dietary_tags: string[];
  is_popular: boolean;
}

interface ScrapeRequest {
  restaurant_id?: string;
  restaurant_ids?: string[];
  batch_size?: number;
  force_update?: boolean;
}

interface RestaurantRow {
  id: string;
  name: string;
  website: string;
  menu_url: string | null;
}

interface DiscoveredLink {
  url: string;
  score: number;
  isPdf: boolean;
  isMenuSection: boolean;
  label: string;
}

interface DiscoveredImage {
  url: string;
  score: number;
  alt: string;
  width: number | null;
  height: number | null;
}

// ─── JSON repair ────────────────────────────────────────────────────────────

/**
 * Attempt to parse JSON, repairing truncated responses from Claude.
 * When max_tokens is hit, JSON gets cut off mid-array/object.
 * This tries to close open brackets/braces to salvage partial data.
 */
function parseJsonWithRepair(text: string): { sections: MenuSection[] } | null {
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // First try: parse as-is
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.sections) return parsed;
      if (parsed.menu_sections) return { sections: parsed.menu_sections };
      if (parsed.menu) return { sections: parsed.menu };
      return parsed;
    }
  } catch { /* fall through to repair */ }

  // Second try: find JSON start and attempt repair
  let jsonStart = text.indexOf('{"sections"');
  if (jsonStart === -1) jsonStart = text.indexOf('{"menu_sections"');
  if (jsonStart === -1) jsonStart = text.indexOf('{"menu"');
  if (jsonStart === -1) jsonStart = text.indexOf('{');
  if (jsonStart === -1) {
    console.error(`  ❌ No JSON found in response. First 300 chars: ${text.substring(0, 300)}`);
    return null;
  }

  let json = text.substring(jsonStart);
  const lastCompleteItem = json.lastIndexOf('}');
  if (lastCompleteItem === -1) return null;
  json = json.substring(0, lastCompleteItem + 1);

  // Count open brackets/braces
  let openBraces = 0, openBrackets = 0, inString = false, escape = false;
  for (const ch of json) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  const suffix = ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));

  try {
    const repaired = JSON.parse(json + suffix);
    const sections = repaired.sections || repaired.menu_sections || repaired.menu || [];
    if (sections.length > 0 && sections.some((s: MenuSection) => s.items?.length > 0)) {
      console.log(`  🔧 Repaired truncated JSON: ${sections.length} sections recovered`);
      return { sections };
    }
  } catch {
    const lastItemEnd = json.lastIndexOf('},');
    if (lastItemEnd > 0) {
      const trimmed = json.substring(0, lastItemEnd + 1);
      const suffix2 = ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
      try {
        const repaired2 = JSON.parse(trimmed + suffix2);
        const sections = repaired2.sections || repaired2.menu_sections || repaired2.menu || [];
        if (sections.length > 0 && sections.some((s: MenuSection) => s.items?.length > 0)) {
          console.log(`  🔧 Repaired truncated JSON (aggressive): ${sections.length} sections recovered`);
          return { sections };
        }
      } catch { /* give up */ }
    }
  }

  console.error(`  ❌ JSON repair failed. First 500 chars: ${text.substring(0, 500)}`);
  return null;
}

// ─── URL helpers ────────────────────────────────────────────────────────────

const THIRD_PARTY_PLATFORMS = [
  'eatfutiorders.com', 'toasttab.com', 'order.toasttab.com', 'clover.com',
  'doordash.com', 'grubhub.com', 'ubereats.com', 'chownow.com',
  'square.site', 'squareup.com', 'olo.com', 'bframenum.com',
  'popmenu.com', 'getbento.com', 'slicelife.com',
];

function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('/pdf/');
}

/** Check if a URL points to a known image format (including unsupported ones like AVIF) */
function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpe?g|png|gif|webp|avif|heic|bmp|tiff?)(\?|$)/i.test(lower);
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

// ─── Link discovery ─────────────────────────────────────────────────────────

function discoverMenuLinks(html: string, pageUrl: string): DiscoveredLink[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (!doc) return [];

  const links: DiscoveredLink[] = [];
  const seen = new Set<string>();

  const anchors = doc.querySelectorAll('a[href]');
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) continue;

    const normalized = resolved.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const linkText = (anchor.textContent || '').trim().toLowerCase();
    const hrefLower = resolved.toLowerCase();
    const isPdf = isPdfUrl(resolved);

    if (/\b(gift\s*card|login|sign.?in|account|cart|checkout|contact|careers|about|privacy|terms)\b/i.test(linkText)) continue;
    if (/\/(gift-?card|login|signin|account|cart|checkout|contact|careers|about|privacy|terms)/i.test(hrefLower)) continue;

    let score = 0;
    let isMenuSection = false;
    const label = linkText.substring(0, 80) || href;

    if (/\bmenu\b/i.test(linkText)) score += 10;
    if (/\bfood\b/i.test(linkText)) score += 5;
    if (/\bdining\b/i.test(linkText)) score += 4;
    if (/\border\s*(online|now)?\b/i.test(linkText)) score += 3;
    if (/\bsee\s+(the\s+)?menu\b/i.test(linkText)) score += 15;
    if (/\bview\s+(our\s+)?menu\b/i.test(linkText)) score += 15;
    if (/\bdownload\w*\s+menu\b/i.test(linkText)) score += 12;
    if (/\bfull\s+menu\b/i.test(linkText)) score += 12;
    if (/\bour\s+menu\b/i.test(linkText)) score += 10;
    if (/\bfood\s*(and|&)\s*drink/i.test(linkText)) score += 8;

    const foodCategoryPattern = /\b(appetizer|starter|salad|soup|entr[eé]e|pasta|seafood|steak|pizza|sandwich|burger|wrap|taco|sushi|wing|rib|bbq|barbecue|dessert|sweet|breakfast|brunch|lunch|dinner|drink|cocktail|beer|wine|beverage|side|kid'?s?\s*menu|happy\s*hour|special|combo|platter|shareabl|small\s*plate|large\s*plate|main|noodle|rice|curry|ramen|pho|dim\s*sum|sashimi|roll|grill|frie[ds]|chicken|pork|beef|lamb|vegan|vegetarian|gluten.?free|house\s*specialt)/i;

    if (foodCategoryPattern.test(linkText)) { score += 6; isMenuSection = true; }
    if (foodCategoryPattern.test(hrefLower.split('/').pop() || '')) { score += 4; isMenuSection = true; }

    if (/\/menu(s)?\b/i.test(hrefLower)) score += 8;
    if (/\/food(-|_)?menu/i.test(hrefLower)) score += 7;
    if (/\/our-menu/i.test(hrefLower)) score += 7;
    if (/\/dining/i.test(hrefLower)) score += 4;

    if (isPdf) {
      score += 6;
      if (/menu/i.test(hrefLower) || /menu/i.test(linkText)) score += 8;
    }

    const isThirdParty = THIRD_PARTY_PLATFORMS.some(p => hrefLower.includes(p));
    if (isThirdParty) score += 7;

    if (score > 0) links.push({ url: resolved, score, isPdf, isMenuSection, label });
  }

  links.sort((a, b) => b.score - a.score);
  return links.slice(0, 15);
}

// ─── Image discovery ────────────────────────────────────────────────────────

/**
 * Discover menu-related images from an HTML page.
 * Finds <img>, <picture>/<source>, and background-image references
 * that are likely photographs of a restaurant menu.
 *
 * Prioritizes Claude-Vision-compatible formats (JPEG, PNG, GIF, WebP)
 * and skips unsupported formats (AVIF, SVG) unless a fallback exists.
 */
function discoverMenuImages(html: string, pageUrl: string): DiscoveredImage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (!doc) return [];

  const images: DiscoveredImage[] = [];
  const seen = new Set<string>();

  const addImage = (src: string, score: number, alt: string, w: number | null, h: number | null) => {
    const resolved = resolveUrl(src, pageUrl);
    if (!resolved) return;
    const norm = resolved.replace(/\/$/, '').toLowerCase();
    if (seen.has(norm)) return;
    // Skip tiny inline data URIs and SVGs
    if (resolved.startsWith('data:') || resolved.endsWith('.svg')) return;
    seen.add(norm);
    images.push({ url: resolved, score, alt, width: w, height: h });
  };

  // ── 1. <picture> elements — prefer supported fallback formats ──
  const pictures = doc.querySelectorAll('picture');
  for (let i = 0; i < pictures.length; i++) {
    const pic = pictures[i];
    const img = pic.querySelector('img');
    const alt = (img?.getAttribute('alt') || '').toLowerCase();
    const w = parseInt(img?.getAttribute('width') || '', 10) || null;
    const h = parseInt(img?.getAttribute('height') || '', 10) || null;

    // Collect all candidate URLs from <source> and <img> in preference order
    const sources = pic.querySelectorAll('source');
    const candidates: { url: string; supported: boolean }[] = [];

    for (let j = 0; j < sources.length; j++) {
      const srcset = sources[j].getAttribute('srcset');
      const type = (sources[j].getAttribute('type') || '').toLowerCase();
      if (!srcset) continue;
      // srcset may have multiple entries with widths — take the first/largest
      const firstSrc = srcset.split(',')[0].trim().split(/\s+/)[0];
      const resolved = resolveUrl(firstSrc, pageUrl);
      if (!resolved) continue;
      const isSupported = !!detectImageMediaType(resolved, type || null);
      candidates.push({ url: resolved, supported: isSupported });
    }

    // Add the <img> fallback too
    const imgSrc = img?.getAttribute('src');
    if (imgSrc) {
      const resolved = resolveUrl(imgSrc, pageUrl);
      if (resolved) {
        candidates.push({ url: resolved, supported: !!detectImageMediaType(resolved, null) });
      }
    }

    // Pick the best supported candidate
    const best = candidates.find(c => c.supported) || null;
    if (best) {
      let score = 0;
      if (/menu/i.test(alt)) score += 15;
      if (/food|dish|plate|dinner|lunch|appetizer|entree/i.test(alt)) score += 5;
      if (/menu/i.test(best.url)) score += 10;
      // Large images are more likely to be menu photos
      if (w && w >= 600) score += 5;
      if (h && h >= 400) score += 3;
      if (score > 0 || /menu/i.test(alt) || /menu/i.test(best.url)) {
        addImage(best.url, Math.max(score, 3), alt, w, h);
      }
    }
  }

  // ── 2. Standalone <img> elements ──
  const imgs = doc.querySelectorAll('img[src]');
  for (let i = 0; i < imgs.length; i++) {
    const el = imgs[i];
    // Skip images inside <picture> (handled above)
    if (el.parentElement?.tagName?.toLowerCase() === 'picture') continue;

    const src = el.getAttribute('src') || '';
    const alt = (el.getAttribute('alt') || '').toLowerCase();
    const srcLower = src.toLowerCase();
    const w = parseInt(el.getAttribute('width') || '', 10) || null;
    const h = parseInt(el.getAttribute('height') || '', 10) || null;
    const className = (el.getAttribute('class') || '').toLowerCase();
    const parentClass = (el.parentElement?.getAttribute('class') || '').toLowerCase();
    const parentId = (el.parentElement?.getAttribute('id') || '').toLowerCase();

    // Skip known non-menu images
    if (/logo|icon|avatar|profile|banner|hero|background|social|facebook|twitter|instagram|yelp|tripadvisor|google/i.test(alt + ' ' + className)) continue;
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) continue;

    // Handle srcset — prefer larger images, prefer supported formats
    const srcset = el.getAttribute('srcset') || '';
    let bestSrc = src;
    if (srcset) {
      const entries = srcset.split(',').map(e => e.trim().split(/\s+/));
      // Pick the supported entry with highest width descriptor (e.g., "img.webp 1200w")
      let bestWidth = 0;
      for (const [url, descriptor] of entries) {
        if (!url) continue;
        const resolved = resolveUrl(url, pageUrl);
        if (!resolved) continue;
        const supported = !!detectImageMediaType(resolved, null);
        if (!supported) continue;
        const widthMatch = descriptor?.match(/(\d+)w/);
        const ww = widthMatch ? parseInt(widthMatch[1], 10) : 0;
        if (ww >= bestWidth) {
          bestWidth = ww;
          bestSrc = url;
        }
      }
    }

    // Check if the image format is supported by Claude Vision
    const resolved = resolveUrl(bestSrc, pageUrl);
    if (!resolved) continue;
    const supported = !!detectImageMediaType(resolved, null);
    if (!supported) continue;

    let score = 0;

    // Alt text signals
    if (/menu/i.test(alt)) score += 15;
    if (/food|dish|plate|dinner|lunch|breakfast|appetizer|entree|dessert/i.test(alt)) score += 4;
    if (/price|pricing|\$/i.test(alt)) score += 8;

    // URL signals
    if (/menu/i.test(resolved)) score += 10;
    if (/food|dish|plate|dinner|specials/i.test(resolved)) score += 3;

    // Container signals (is this image inside a "menu" section?)
    if (/menu/i.test(parentClass + ' ' + parentId)) score += 8;

    // Size signals — menu images tend to be large
    if (w && w >= 600) score += 5;
    if (h && h >= 400) score += 3;
    if (w && w >= 1000) score += 3; // extra bonus for very large
    // If no width/height attributes, assume it could be a menu image (neutral)

    if (score > 0) {
      addImage(resolved, score, alt, w, h);
    }
  }

  // ── 3. CSS background images in inline styles ──
  const bgElements = doc.querySelectorAll('[style*="background"]');
  for (let i = 0; i < bgElements.length; i++) {
    const style = bgElements[i].getAttribute('style') || '';
    const bgMatch = style.match(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
    if (!bgMatch) continue;
    const bgUrl = bgMatch[1];
    const resolved = resolveUrl(bgUrl, pageUrl);
    if (!resolved || !detectImageMediaType(resolved, null)) continue;

    const elClass = (bgElements[i].getAttribute('class') || '').toLowerCase();
    const elId = (bgElements[i].getAttribute('id') || '').toLowerCase();
    let score = 0;
    if (/menu/i.test(elClass + ' ' + elId + ' ' + resolved)) score += 12;
    if (/food|dining/i.test(elClass + ' ' + elId)) score += 4;
    if (score > 0) addImage(resolved, score, '', null, null);
  }

  images.sort((a, b) => b.score - a.score);
  return images.slice(0, 8);
}

// ─── AI extraction ──────────────────────────────────────────────────────────

const MENU_EXTRACTION_INSTRUCTIONS = `
For each item extract:
- item_name: The dish name (REQUIRED)
- item_description: Short description or null (keep brief, max 80 chars)
- price: Price as displayed (e.g., "$12.99") or null
- price_numeric: Numeric price (e.g., 12.99) or null
- dietary_tags: Array from ["vegan","vegetarian","gluten-free","dairy-free","nut-free","spicy","raw","organic","halal","kosher"] — empty array [] if none
- is_popular: true if marked as popular/recommended/starred, otherwise omit this field

Group items into sections with section_name and section_sort_order (0-based, natural menu order).

CRITICAL: Return compact JSON with no extra whitespace. Omit null fields and false values to save space.
Return ONLY: {"sections":[{"section_name":"...","section_sort_order":0,"items":[...]}]}
If no menu items found: {"sections":[]}`;

/**
 * Extract menu from plain text/HTML content using Claude text API
 */
async function extractMenuFromContent(
  content: string,
  restaurantName: string,
  sourceUrl: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  const prompt = `You are an expert at extracting restaurant menu data from websites. Analyze this content from ${sourceUrl} for the restaurant "${restaurantName}" and extract the COMPLETE menu.

WEBSITE CONTENT:
${content.substring(0, 25000)}

EXTRACTION INSTRUCTIONS:

1. Extract EVERY menu item you can find, organized by section (e.g., Appetizers, Salads, Entrees, Sandwiches, Desserts, Drinks, Kids Menu, etc.)
2. ${MENU_EXTRACTION_INSTRUCTIONS}

IMPORTANT:
- Extract ALL items, not just highlights
- Keep original pricing format in "price" field
- Parse numeric value into "price_numeric" (use lower bound for ranges)
- Detect dietary tags from descriptions (e.g., "(GF)" = gluten-free, "(V)" = vegan/vegetarian)
- Items marked with stars, flames, or "popular"/"favorite" should have is_popular: true

Return ONLY a JSON object: {"sections":[...]}
If no menu items can be found, return: {"sections": []}`;

  const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

  const response = await fetchWithTimeout(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': aiConfig.anthropic_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.default_model,
      max_tokens: parseInt(String(aiConfig.max_tokens_large), 10) || 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 60_000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const extractedText = data.content?.[0]?.text || '{}';
  const stopReason = data.stop_reason || '';

  if (stopReason === 'max_tokens') {
    console.warn(`  ⚠️ Claude text extraction truncated by max_tokens`);
  }

  console.log(`  Claude response: ${extractedText.length} chars, stop_reason=${stopReason}`);

  const parsed = parseJsonWithRepair(extractedText);
  if (parsed) {
    return { sections: parsed.sections || [], raw_text: content.substring(0, 50000) };
  }

  console.error(`  ❌ Failed to parse Claude response. First 500 chars: ${extractedText.substring(0, 500)}`);
  return null;
}

/**
 * Extract menu from a PDF using Claude Vision (document block)
 */
async function extractMenuFromPdf(
  pdfBase64: string,
  restaurantName: string,
  sourceUrl: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  console.log(`  🤖 Sending PDF to Claude Vision for extraction...`);

  const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

  const response = await fetchWithTimeout(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': aiConfig.anthropic_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.default_model,
      max_tokens: parseInt(String(aiConfig.max_tokens_large), 10) || 8000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          {
            type: 'text',
            text: `You are an expert at extracting restaurant menu data. This is a PDF menu from "${restaurantName}" (source: ${sourceUrl}).

Extract the COMPLETE menu with every item, organized by section.
${MENU_EXTRACTION_INSTRUCTIONS}`,
          },
        ],
      }],
    }),
  }, 60_000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude Vision API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const extractedText = data.content?.[0]?.text || '{}';
  const stopReason = data.stop_reason || '';

  if (stopReason === 'max_tokens') {
    console.warn(`  ⚠️ Claude response truncated by max_tokens — attempting JSON repair`);
  }

  const parsed = parseJsonWithRepair(extractedText);
  if (parsed) {
    return {
      sections: parsed.sections || [],
      raw_text: `[PDF menu from ${sourceUrl}]\n${extractedText.substring(0, 50000)}`,
    };
  }

  console.error('Failed to parse Claude Vision response — no valid JSON recovered');
  return null;
}

/**
 * Extract menu from one or more images using Claude Vision.
 * Sends up to 4 images in a single multi-image request so Claude can
 * cross-reference pages/sections of the same menu.
 */
async function extractMenuFromImages(
  images: FetchedImage[],
  restaurantName: string,
  sourceUrl: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  if (images.length === 0) return null;

  console.log(`  🤖 Sending ${images.length} image(s) to Claude Vision for extraction...`);

  const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

  // Build content array with all images + the extraction prompt
  const content: any[] = [];
  for (const img of images.slice(0, 4)) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  }

  const imageCount = Math.min(images.length, 4);
  content.push({
    type: 'text',
    text: `You are an expert at extracting restaurant menu data. ${imageCount > 1 ? `These ${imageCount} images are` : 'This image is'} from the menu of "${restaurantName}" (source: ${sourceUrl}).

Extract the COMPLETE menu with every item visible across all images, organized by section.
${MENU_EXTRACTION_INSTRUCTIONS}`,
  });

  const response = await fetchWithTimeout(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': aiConfig.anthropic_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.default_model,
      max_tokens: parseInt(String(aiConfig.max_tokens_large), 10) || 8000,
      messages: [{ role: 'user', content }],
    }),
  }, 60_000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude Vision API error (images): ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const extractedText = data.content?.[0]?.text || '{}';
  const stopReason = data.stop_reason || '';

  if (stopReason === 'max_tokens') {
    console.warn(`  ⚠️ Claude image response truncated by max_tokens — attempting JSON repair`);
  }

  const parsed = parseJsonWithRepair(extractedText);
  if (parsed) {
    return {
      sections: parsed.sections || [],
      raw_text: `[Menu images from ${sourceUrl}]\n${extractedText.substring(0, 50000)}`,
    };
  }

  console.error('Failed to parse Claude Vision response for images');
  return null;
}

// ─── Database persistence ───────────────────────────────────────────────────

async function saveMenuToDatabase(
  restaurantId: string,
  sourceUrl: string,
  extracted: { sections: MenuSection[]; raw_text: string }
): Promise<{ success: boolean; items_count: number; error?: string }> {
  const totalItems = extracted.sections.reduce((sum, s) => sum + s.items.length, 0);

  if (totalItems < 2) {
    return { success: false, items_count: 0, error: 'Too few items extracted (likely not a menu)' };
  }

  const { data: newMenu, error: menuError } = await supabase
    .from('restaurant_menus')
    .insert({
      restaurant_id: restaurantId,
      is_current: true,
      source_type: 'scraped',
      source_url: sourceUrl,
      captured_at: new Date().toISOString(),
      raw_text: extracted.raw_text,
    })
    .select('id')
    .single();

  if (menuError || !newMenu) {
    return { success: false, items_count: 0, error: `DB insert error: ${menuError?.message}` };
  }

  const menuItems = extracted.sections.flatMap((section) =>
    section.items.map((item, itemIdx) => ({
      menu_id: newMenu.id,
      section_name: section.section_name,
      section_sort_order: section.section_sort_order,
      item_name: item.item_name,
      item_description: item.item_description,
      price: item.price,
      price_numeric: item.price_numeric,
      dietary_tags: item.dietary_tags || [],
      is_popular: item.is_popular || false,
      sort_order: itemIdx,
    }))
  );

  for (let i = 0; i < menuItems.length; i += 100) {
    const { error: itemsError } = await supabase
      .from('restaurant_menu_items')
      .insert(menuItems.slice(i, i + 100));

    if (itemsError) {
      console.error(`Error inserting menu items batch ${i}:`, itemsError);
      await supabase.from('restaurant_menus').delete().eq('id', newMenu.id);
      return { success: false, items_count: 0, error: `Items insert error: ${itemsError.message}` };
    }
  }

  return { success: true, items_count: totalItems };
}

// ─── Page fetching & content scoring ────────────────────────────────────────

function scoreMenuContent(content: string): number {
  const priceMatches = (content.match(/\$\d+/g) || []).length;
  const hasMenuKeywords = /menu|appetizer|entree|dessert|drink|sandwich|salad|soup|burger/i.test(content);
  if (content.length < 200) return 0;
  let score = 0;
  if (priceMatches >= 3) score += priceMatches;
  if (hasMenuKeywords) score += 5;
  return score;
}

async function fetchPage(url: string): Promise<{ html: string; text: string; status: number } | { status: number } | null> {
  try {
    console.log(`  🌐 fetch: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`  ❌ ${url} → ${response.status}`);
      return { status: response.status };
    }

    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`  ✅ ${url} → ${html.length} HTML, ${text.length} text`);
    return { html, text, status: 200 };
  } catch {
    return null;
  }
}

function hasContent(result: { html: string; text: string; status: number } | { status: number } | null): result is { html: string; text: string; status: number } {
  return result !== null && 'html' in result;
}

// ─── Attempt image extraction from a page's HTML ────────────────────────────

/**
 * Given a page's HTML, discover menu images, fetch them, and run through
 * Claude Vision. Returns extracted data or null if no usable images found.
 */
async function tryExtractFromPageImages(
  html: string,
  pageUrl: string,
  restaurantName: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  const discoveredImages = discoverMenuImages(html, pageUrl);
  if (discoveredImages.length === 0) return null;

  console.log(`  🖼️ Found ${discoveredImages.length} candidate menu image(s):`);
  for (const img of discoveredImages) {
    console.log(`    - [${img.score}] ${img.alt || '(no alt)'} → ${img.url}`);
  }

  // Fetch the top-scoring images (up to 4)
  const fetched: FetchedImage[] = [];
  for (const img of discoveredImages.slice(0, 6)) {
    const result = await fetchImageAsBase64(img.url);
    if (result) {
      fetched.push(result);
      if (fetched.length >= 4) break; // Claude Vision supports up to 20, but 4 is practical
    }
  }

  if (fetched.length === 0) {
    console.log(`  ⏭️ No fetchable menu images (all unsupported format or too small)`);
    return null;
  }

  return extractMenuFromImages(fetched, restaurantName, pageUrl);
}

// ─── Main scrape orchestrator ───────────────────────────────────────────────

/**
 * Scrape menu from a restaurant's website.
 * Strategy:
 *   1. If menu_url set, use it (handle PDF, image, or HTML — discover PDFs + images on page)
 *   2. Fetch homepage + pattern URLs
 *   3. Parse HTML for menu links and images
 *   4. Try discovered links (PDFs via Vision, images via Vision, HTML via text extraction)
 *   5. Extract from best content found
 */
async function scrapeRestaurantMenu(
  restaurant: RestaurantRow,
  forceUpdate: boolean
): Promise<{ success: boolean; items_count: number; error?: string }> {
  // Check for existing current menu
  if (!forceUpdate) {
    const { data: existingMenu } = await supabase
      .from('restaurant_menus')
      .select('id, captured_at')
      .eq('restaurant_id', restaurant.id)
      .eq('is_current', true)
      .single();

    if (existingMenu) {
      const daysSince = (Date.now() - new Date(existingMenu.captured_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return { success: true, items_count: 0, error: `Menu already current (${Math.round(daysSince)}d old)` };
      }
    }
  }

  // ── Phase 1: Try explicit menu_url first ──
  if (restaurant.menu_url) {
    console.log(`  Using stored menu_url: ${restaurant.menu_url}`);

    // 1a. Direct PDF link
    if (isPdfUrl(restaurant.menu_url)) {
      const pdfBase64 = await fetchPdfAsBase64(restaurant.menu_url);
      if (pdfBase64) {
        const extracted = await extractMenuFromPdf(pdfBase64, restaurant.name, restaurant.menu_url);
        if (extracted && extracted.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, restaurant.menu_url, extracted);
        }
      }
    }

    // 1b. Direct image link (e.g., a JPEG/PNG/WebP of the menu)
    if (isImageUrl(restaurant.menu_url)) {
      const img = await fetchImageAsBase64(restaurant.menu_url);
      if (img) {
        const extracted = await extractMenuFromImages([img], restaurant.name, restaurant.menu_url);
        if (extracted && extracted.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, restaurant.menu_url, extracted);
        }
      }
    }

    // 1c. HTML page — look for PDFs, images, and text content
    if (!isPdfUrl(restaurant.menu_url) && !isImageUrl(restaurant.menu_url)) {
      const menuUrlResult = await fetchPage(restaurant.menu_url);
      if (hasContent(menuUrlResult)) {
        // Try PDF links on the page
        const discovered = discoverMenuLinks(menuUrlResult.html, restaurant.menu_url);
        const pdfLinks = discovered.filter(l => l.isPdf);
        for (const pdfLink of pdfLinks.slice(0, 2)) {
          console.log(`  Trying PDF: ${pdfLink.url} (score: ${pdfLink.score})`);
          const pdfBase64 = await fetchPdfAsBase64(pdfLink.url);
          if (pdfBase64) {
            const extracted = await extractMenuFromPdf(pdfBase64, restaurant.name, pdfLink.url);
            if (extracted && extracted.sections.length > 0) {
              return saveMenuToDatabase(restaurant.id, pdfLink.url, extracted);
            }
          }
        }

        // Try menu images on the page
        const imageResult = await tryExtractFromPageImages(
          menuUrlResult.html, restaurant.menu_url, restaurant.name
        );
        if (imageResult && imageResult.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, restaurant.menu_url, imageResult);
        }

        // Fall back to text extraction from the HTML
        const menuScore = scoreMenuContent(menuUrlResult.text);
        if (menuScore > 0) {
          const extracted = await extractMenuFromContent(menuUrlResult.text, restaurant.name, restaurant.menu_url);
          if (extracted && extracted.sections.length > 0) {
            return saveMenuToDatabase(restaurant.id, restaurant.menu_url, extracted);
          }
        }
      }
    }
  }

  // ── Phase 2: Try common URL patterns ──
  const baseUrl = (restaurant.website || '').replace(/\/$/, '');
  if (!baseUrl) {
    return { success: false, items_count: 0, error: 'No website URL available' };
  }

  const patternUrls = [
    `${baseUrl}/menu`,
    `${baseUrl}/menus`,
    `${baseUrl}/food-menu`,
    `${baseUrl}/our-menu`,
    `${baseUrl}/food`,
    `${baseUrl}/food-and-drink`,
    `${baseUrl}/dining`,
    baseUrl, // homepage as fallback
  ];

  let bestContent = '';
  let bestSourceUrl = '';
  let bestScore = 0;
  let bestHtmlForImages = '';      // Keep the HTML from the best-scoring page for image discovery
  let bestHtmlSourceUrl = '';
  const allDiscoveredLinks: DiscoveredLink[] = [];
  const allDiscoveredImages: DiscoveredImage[] = [];
  let consecutiveFailures = 0;

  for (const url of patternUrls) {
    console.log(`  Trying: ${url}`);
    const result = await fetchPage(url);

    if (!hasContent(result)) {
      consecutiveFailures++;
      if (consecutiveFailures >= 2 && result && 'status' in result && result.status === 403) {
        console.log(`  ⛔ Domain appears to block scraping (403). Skipping remaining patterns.`);
        break;
      }
      continue;
    }

    consecutiveFailures = 0;

    // Discover menu links
    const discovered = discoverMenuLinks(result.html, url);
    for (const link of discovered) {
      if (!allDiscoveredLinks.some(l => l.url === link.url)) {
        allDiscoveredLinks.push(link);
      }
    }

    // Discover menu images
    const images = discoverMenuImages(result.html, url);
    for (const img of images) {
      if (!allDiscoveredImages.some(i => i.url === img.url)) {
        allDiscoveredImages.push(img);
      }
    }

    // Score text content
    const score = scoreMenuContent(result.text);
    if (score > bestScore) {
      bestScore = score;
      bestContent = result.text;
      bestSourceUrl = url;
      bestHtmlForImages = result.html;
      bestHtmlSourceUrl = url;
    }

    // If this is a menu-specific URL with images, remember it for image extraction
    if (images.length > 0 && /\/menu/i.test(url) && (!bestHtmlForImages || score >= bestScore)) {
      bestHtmlForImages = result.html;
      bestHtmlSourceUrl = url;
    }
  }

  // ── Phase 3: Try discovered links ──
  allDiscoveredLinks.sort((a, b) => b.score - a.score);
  allDiscoveredImages.sort((a, b) => b.score - a.score);

  const pdfLinks = allDiscoveredLinks.filter(l => l.isPdf).slice(0, 3);
  const sectionLinks = allDiscoveredLinks.filter(l => l.isMenuSection && !l.isPdf);
  const otherLinks = allDiscoveredLinks.filter(l => !l.isPdf && !l.isMenuSection).slice(0, 5);

  if (allDiscoveredLinks.length > 0 || allDiscoveredImages.length > 0) {
    console.log(`  Discovered: ${pdfLinks.length} PDF, ${sectionLinks.length} section, ${otherLinks.length} other links; ${allDiscoveredImages.length} images`);
    for (const link of allDiscoveredLinks.slice(0, 10)) {
      const tag = link.isPdf ? '📄' : link.isMenuSection ? '📋' : '🔗';
      console.log(`    - [${link.score}] ${tag} ${link.label} → ${link.url}`);
    }
    for (const img of allDiscoveredImages.slice(0, 5)) {
      console.log(`    - [${img.score}] 🖼️ ${img.alt || '(no alt)'} → ${img.url}`);
    }
  }

  // 3a: Try PDFs first
  for (const link of pdfLinks) {
    console.log(`  Trying PDF link: ${link.url}`);
    const pdfBase64 = await fetchPdfAsBase64(link.url);
    if (pdfBase64) {
      const extracted = await extractMenuFromPdf(pdfBase64, restaurant.name, link.url);
      if (extracted && extracted.sections.length > 0) {
        return saveMenuToDatabase(restaurant.id, link.url, extracted);
      }
    }
  }

  // 3b: Try menu images discovered across pages
  if (allDiscoveredImages.length > 0) {
    console.log(`  🖼️ Trying ${allDiscoveredImages.length} discovered menu images...`);
    const fetched: FetchedImage[] = [];
    for (const img of allDiscoveredImages.slice(0, 6)) {
      const result = await fetchImageAsBase64(img.url);
      if (result) {
        fetched.push(result);
        if (fetched.length >= 4) break;
      }
    }

    if (fetched.length > 0) {
      const extracted = await extractMenuFromImages(fetched, restaurant.name, bestHtmlSourceUrl || baseUrl);
      if (extracted && extracted.sections.length > 0) {
        return saveMenuToDatabase(restaurant.id, bestHtmlSourceUrl || baseUrl, extracted);
      }
    }
  }

  // 3c: Multi-page menu sections
  if (sectionLinks.length >= 2) {
    const baseDomain = new URL(baseUrl).hostname;
    const sameDomainSections = sectionLinks.filter(l => {
      try { return new URL(l.url).hostname === baseDomain; } catch { return false; }
    }).slice(0, 12);

    if (sameDomainSections.length >= 2) {
      console.log(`  📚 Multi-page menu detected: ${sameDomainSections.length} section pages`);
      const sectionTexts: string[] = [];

      for (const link of sameDomainSections) {
        console.log(`  Fetching section: ${link.label} → ${link.url}`);
        const sectionResult = await fetchPage(link.url);
        if (hasContent(sectionResult) && sectionResult.text.length > 100) {
          sectionTexts.push(`=== ${link.label.toUpperCase()} ===\n${sectionResult.text}`);

          // Also check for menu images on section pages
          const sectionImages = discoverMenuImages(sectionResult.html, link.url);
          for (const img of sectionImages) {
            if (!allDiscoveredImages.some(i => i.url === img.url)) {
              allDiscoveredImages.push(img);
            }
          }
        }
      }

      if (sectionTexts.length >= 2) {
        const combinedText = sectionTexts.join('\n\n');
        console.log(`  Combined ${sectionTexts.length} section pages: ${combinedText.length} chars total`);
        const extracted = await extractMenuFromContent(combinedText, restaurant.name, baseUrl);
        if (extracted && extracted.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, baseUrl, extracted);
        }
      }
    }
  }

  // 3d: Try other discovered HTML links
  for (const link of otherLinks) {
    console.log(`  Trying discovered link: ${link.url}`);
    const linkResult = await fetchPage(link.url);
    if (hasContent(linkResult)) {
      // Check for images on the linked page too
      const imageResult = await tryExtractFromPageImages(linkResult.html, link.url, restaurant.name);
      if (imageResult && imageResult.sections.length > 0) {
        return saveMenuToDatabase(restaurant.id, link.url, imageResult);
      }

      const score = scoreMenuContent(linkResult.text);
      if (score > bestScore) {
        bestScore = score;
        bestContent = linkResult.text;
        bestSourceUrl = link.url;
      }
    }
  }

  // ── Phase 4: Extract from the best text content we found ──
  if (!bestContent) {
    return { success: false, items_count: 0, error: 'No menu content found at any URL' };
  }

  console.log(`  Best menu source: ${bestSourceUrl} (${bestContent.length} chars, score: ${bestScore})`);

  const extracted = await extractMenuFromContent(bestContent, restaurant.name, bestSourceUrl);

  if (!extracted || extracted.sections.length === 0) {
    return { success: false, items_count: 0, error: 'AI could not extract menu items' };
  }

  return saveMenuToDatabase(restaurant.id, bestSourceUrl, extracted);
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ScrapeRequest = await req.json().catch(() => ({}));
    const { restaurant_id, restaurant_ids, batch_size = 10, force_update = false } = body;

    let restaurants: RestaurantRow[] = [];

    if (restaurant_id) {
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .eq('id', restaurant_id)
        .single();

      if (data && (data.website || data.menu_url)) restaurants = [data];
    } else if (restaurant_ids?.length) {
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .in('id', restaurant_ids);

      if (data) restaurants = data.filter((r) => r.website || r.menu_url);
    } else {
      let query = supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .eq('menu_scrape_enabled', true)
        .order('popularity_score', { ascending: false, nullsFirst: false })
        .limit(batch_size);

      if (!force_update) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentMenus } = await supabase
          .from('restaurant_menus')
          .select('restaurant_id')
          .eq('is_current', true)
          .gte('captured_at', thirtyDaysAgo);

        const excludeIds = (recentMenus || []).map((m) => m.restaurant_id);
        if (excludeIds.length > 0) {
          query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }
      }

      const { data } = await query;
      if (data) restaurants = data.filter((r) => r.website || r.menu_url);
    }

    if (restaurants.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No restaurants to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting menu scrape for ${restaurants.length} restaurants`);

    let processed = 0;
    let succeeded = 0;
    let totalItems = 0;
    const errors: string[] = [];

    for (const restaurant of restaurants) {
      console.log(`\nProcessing: ${restaurant.name} (${restaurant.website})`);

      const result = await scrapeRestaurantMenu(restaurant, force_update);
      processed++;

      if (result.success && result.items_count > 0) {
        succeeded++;
        totalItems += result.items_count;
        console.log(`  ✅ ${restaurant.name}: ${result.items_count} items extracted`);
      } else {
        const msg = `${restaurant.name}: ${result.error || 'Unknown error'}`;
        if (result.items_count === 0 && result.success) {
          console.log(`  ⏭️ ${msg}`);
        } else {
          console.log(`  ❌ ${msg}`);
          errors.push(msg);
        }
      }
    }

    console.log(`\nComplete: ${succeeded}/${processed} restaurants, ${totalItems} total items`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        succeeded,
        total_items: totalItems,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in menu scraper:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
