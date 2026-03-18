/**
 * SECURITY: verify_jwt = false
 * Reason: Background scraping job that runs without user context to collect restaurant menu data
 * Alternative measures: Service role key required for database access, API key validation for external services
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { scrapeUrl, fetchPdfAsBase64 } from "../_shared/scraper.ts";
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
  label: string;
}

// Known third-party ordering/menu platforms
const THIRD_PARTY_PLATFORMS = [
  'eatfutiorders.com',
  'toasttab.com',
  'order.toasttab.com',
  'clover.com',
  'doordash.com',
  'grubhub.com',
  'ubereats.com',
  'chownow.com',
  'square.site',
  'squareup.com',
  'olo.com',
  'bframenum.com',
  'popmenu.com',
  'getbento.com',
  'slicelife.com',
];

/**
 * Check if a URL points to a PDF
 */
function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('/pdf/');
}

/**
 * Resolve a potentially relative URL against a base URL
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Discover menu-related links from an HTML page.
 * Parses the HTML to find anchor tags with menu-related text, PDF links,
 * and third-party platform URLs. Returns scored and ranked results.
 */
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

    // Deduplicate
    const normalized = resolved.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const linkText = (anchor.textContent || '').trim().toLowerCase();
    const hrefLower = resolved.toLowerCase();
    const isPdf = isPdfUrl(resolved);

    let score = 0;
    let label = linkText.substring(0, 80) || href;

    // Score based on link text
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

    // Score based on URL path
    if (/\/menu(s)?\b/i.test(hrefLower)) score += 8;
    if (/\/food(-|_)?menu/i.test(hrefLower)) score += 7;
    if (/\/our-menu/i.test(hrefLower)) score += 7;
    if (/\/dining/i.test(hrefLower)) score += 4;

    // PDF links are valuable if they have menu-related context
    if (isPdf) {
      score += 6;
      if (/menu/i.test(hrefLower) || /menu/i.test(linkText)) score += 8;
    }

    // Third-party platform links
    const isThirdParty = THIRD_PARTY_PLATFORMS.some(p => hrefLower.includes(p));
    if (isThirdParty) score += 7;

    // Only keep links with some menu relevance
    if (score > 0) {
      links.push({ url: resolved, score, isPdf, label });
    }
  }

  // Sort by score descending, limit to top 5
  links.sort((a, b) => b.score - a.score);
  return links.slice(0, 5);
}

/**
 * Extract structured menu data from raw text content using Claude AI
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
2. For each item extract:
   - item_name: The dish name (REQUIRED)
   - item_description: Description of the dish (null if not available)
   - price: Price as displayed (e.g., "$12.99", "Market Price", "$10-15") or null
   - price_numeric: Numeric price for filtering (e.g., 12.99) or null if variable/unavailable
   - dietary_tags: Array of applicable tags from: ["vegan", "vegetarian", "gluten-free", "dairy-free", "nut-free", "spicy", "raw", "organic", "halal", "kosher"]
   - is_popular: true if marked as popular, recommended, chef's pick, bestseller, or starred

3. Group items into logical sections. Use the restaurant's own section names when available.
4. Assign section_sort_order starting from 0 in natural menu order (appetizers before entrees before desserts).
5. If no clear sections exist, group logically (e.g., by meal type or food category).

IMPORTANT:
- Extract ALL items, not just highlights
- Keep original pricing format in "price" field
- Parse numeric value into "price_numeric" (use lower bound for ranges)
- Detect dietary tags from descriptions (e.g., "(GF)" = gluten-free, "(V)" = vegan/vegetarian)
- Items marked with stars, flames, or "popular"/"favorite" should have is_popular: true

Return ONLY a JSON object with this exact structure:
{
  "sections": [
    {
      "section_name": "Appetizers",
      "section_sort_order": 0,
      "items": [
        {
          "item_name": "Bruschetta",
          "item_description": "Toasted bread with fresh tomatoes, basil, and garlic",
          "price": "$9.99",
          "price_numeric": 9.99,
          "dietary_tags": ["vegetarian"],
          "is_popular": false
        }
      ]
    }
  ]
}

If no menu items can be found, return: {"sections": []}`;

  const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

  const response = await fetch(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': aiConfig.anthropic_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.default_model,
      max_tokens: aiConfig.max_tokens_large,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const extractedText = data.content?.[0]?.text || '{}';

  try {
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sections: parsed.sections || [],
        raw_text: content.substring(0, 50000),
      };
    }
  } catch (parseError) {
    console.error('Failed to parse Claude response:', parseError);
  }

  return null;
}

/**
 * Extract structured menu data from a PDF using Claude Vision (document block).
 * Follows the same pattern as parse-menu-upload/index.ts.
 */
async function extractMenuFromPdf(
  pdfBase64: string,
  restaurantName: string,
  sourceUrl: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  console.log(`  🤖 Sending PDF to Claude Vision for extraction...`);

  const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

  const response = await fetch(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': aiConfig.anthropic_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.default_model,
      max_tokens: aiConfig.max_tokens_large,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `You are an expert at extracting restaurant menu data. This is a PDF menu from "${restaurantName}" (source: ${sourceUrl}).

Extract the COMPLETE menu with every item, organized by section.

For each item extract:
- item_name: The dish name (REQUIRED)
- item_description: Description (null if unavailable)
- price: Price as displayed (e.g., "$12.99") or null
- price_numeric: Numeric price (e.g., 12.99) or null
- dietary_tags: Array from ["vegan", "vegetarian", "gluten-free", "dairy-free", "nut-free", "spicy", "raw", "organic", "halal", "kosher"]
- is_popular: true if marked as popular/recommended/starred

Group items into sections with section_name and section_sort_order (0-based, natural menu order).

Return ONLY a JSON object: {"sections": [{"section_name": "...", "section_sort_order": 0, "items": [...]}]}
If no menu items found, return: {"sections": []}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude Vision API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const extractedText = data.content?.[0]?.text || '{}';

  try {
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sections: parsed.sections || [],
        raw_text: `[PDF menu from ${sourceUrl}]\n${extractedText.substring(0, 50000)}`,
      };
    }
  } catch (parseError) {
    console.error('Failed to parse Claude Vision response:', parseError);
  }

  return null;
}

/**
 * Save extracted menu data to the database.
 * Returns the number of items saved, or an error.
 */
async function saveMenuToDatabase(
  restaurantId: string,
  sourceUrl: string,
  extracted: { sections: MenuSection[]; raw_text: string }
): Promise<{ success: boolean; items_count: number; error?: string }> {
  const totalItems = extracted.sections.reduce((sum, s) => sum + s.items.length, 0);

  if (totalItems < 2) {
    return { success: false, items_count: 0, error: 'Too few items extracted (likely not a menu)' };
  }

  // Insert new menu version (triggers auto-version and unmarks previous)
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

  // Insert all menu items
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

  // Insert in batches of 100
  for (let i = 0; i < menuItems.length; i += 100) {
    const batch = menuItems.slice(i, i + 100);
    const { error: itemsError } = await supabase
      .from('restaurant_menu_items')
      .insert(batch);

    if (itemsError) {
      console.error(`Error inserting menu items batch ${i}:`, itemsError);
      // Clean up the menu record on failure
      await supabase.from('restaurant_menus').delete().eq('id', newMenu.id);
      return { success: false, items_count: 0, error: `Items insert error: ${itemsError.message}` };
    }
  }

  return { success: true, items_count: totalItems };
}

/**
 * Evaluate HTML content for menu signals.
 * Returns a score indicating how likely the content contains a menu.
 */
function scoreMenuContent(content: string): number {
  const priceMatches = (content.match(/\$\d+/g) || []).length;
  const hasMenuKeywords = /menu|appetizer|entree|dessert|drink|sandwich|salad|soup|burger/i.test(content);
  if (content.length < 200) return 0;
  let score = 0;
  if (priceMatches >= 3) score += priceMatches;
  if (hasMenuKeywords) score += 5;
  return score;
}

/**
 * Fetch a URL using the fetch backend (free, reliable) and return HTML + text.
 */
async function fetchPage(url: string): Promise<{ html: string; text: string } | null> {
  try {
    const result = await scrapeUrl(url, {
      backend: 'fetch',
      waitTime: 3000,
      timeout: 15000,
    });
    if (result.success) {
      return {
        html: result.html || '',
        text: result.markdown || result.text || result.html || '',
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Scrape menu from a restaurant's website.
 * Strategy:
 *   1. If menu_url set, use it (handle PDF or HTML, also discover PDF links on the page)
 *   2. Fetch homepage + pattern URLs with fetch backend
 *   3. Parse HTML for menu links (anchors with menu text, PDF hrefs, third-party platforms)
 *   4. Try discovered links (PDFs via Claude Vision, HTML via text extraction)
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

  // ---- Phase 1: Try explicit menu_url first (may be PDF or HTML) ----
  if (restaurant.menu_url) {
    console.log(`  Using stored menu_url: ${restaurant.menu_url}`);

    if (isPdfUrl(restaurant.menu_url)) {
      const pdfBase64 = await fetchPdfAsBase64(restaurant.menu_url);
      if (pdfBase64) {
        const extracted = await extractMenuFromPdf(pdfBase64, restaurant.name, restaurant.menu_url);
        if (extracted && extracted.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, restaurant.menu_url, extracted);
        }
      }
    } else {
      // HTML menu_url — fetch it and also discover links on the page
      const page = await fetchPage(restaurant.menu_url);
      if (page) {
        // Check for PDF links on the menu_url page
        const discovered = discoverMenuLinks(page.html, restaurant.menu_url);
        const pdfLinks = discovered.filter(l => l.isPdf);
        if (pdfLinks.length > 0) {
          console.log(`  Found ${pdfLinks.length} PDF link(s) on menu page`);
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
        }

        // Fall back to extracting from the HTML text content
        const menuScore = scoreMenuContent(page.text);
        if (menuScore > 0) {
          const extracted = await extractMenuFromContent(page.text, restaurant.name, restaurant.menu_url);
          if (extracted && extracted.sections.length > 0) {
            return saveMenuToDatabase(restaurant.id, restaurant.menu_url, extracted);
          }
        }
      }
    }
  }

  // ---- Phase 2: Try common URL patterns with fetch backend ----
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
  const allDiscoveredLinks: DiscoveredLink[] = [];

  for (const url of patternUrls) {
    console.log(`  Trying: ${url}`);
    const page = await fetchPage(url);
    if (!page) continue;

    // Discover menu links from this page's HTML
    const discovered = discoverMenuLinks(page.html, url);
    for (const link of discovered) {
      // Avoid duplicates across pages
      if (!allDiscoveredLinks.some(l => l.url === link.url)) {
        allDiscoveredLinks.push(link);
      }
    }

    // Score this page's own content
    const score = scoreMenuContent(page.text);
    if (score > bestScore) {
      bestScore = score;
      bestContent = page.text;
      bestSourceUrl = url;
    }
  }

  // ---- Phase 3: Try discovered links (PDFs and third-party platforms) ----
  // Re-sort all discovered links and try the top ones
  allDiscoveredLinks.sort((a, b) => b.score - a.score);
  const topLinks = allDiscoveredLinks.slice(0, 5);

  if (topLinks.length > 0) {
    console.log(`  Discovered ${allDiscoveredLinks.length} menu link(s), trying top ${topLinks.length}:`);
    for (const link of topLinks) {
      console.log(`    - [${link.score}] ${link.isPdf ? '📄' : '🔗'} ${link.label} → ${link.url}`);
    }
  }

  for (const link of topLinks) {
    if (link.isPdf) {
      // PDF link — fetch and send to Claude Vision
      console.log(`  Trying PDF link: ${link.url}`);
      const pdfBase64 = await fetchPdfAsBase64(link.url);
      if (pdfBase64) {
        const extracted = await extractMenuFromPdf(pdfBase64, restaurant.name, link.url);
        if (extracted && extracted.sections.length > 0) {
          return saveMenuToDatabase(restaurant.id, link.url, extracted);
        }
      }
    } else {
      // HTML link — fetch and score
      console.log(`  Trying discovered link: ${link.url}`);
      const page = await fetchPage(link.url);
      if (page) {
        const score = scoreMenuContent(page.text);
        if (score > bestScore) {
          bestScore = score;
          bestContent = page.text;
          bestSourceUrl = link.url;
        }
      }
    }
  }

  // ---- Phase 4: Extract from the best HTML content we found ----
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ScrapeRequest = await req.json().catch(() => ({}));
    const { restaurant_id, restaurant_ids, batch_size = 10, force_update = false } = body;

    let restaurants: RestaurantRow[] = [];

    if (restaurant_id) {
      // Single restaurant — respects menu_scrape_enabled unless caller is explicit
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .eq('id', restaurant_id)
        .single();

      // Require at least one URL source
      if (data && (data.website || data.menu_url)) restaurants = [data];
    } else if (restaurant_ids?.length) {
      // Specific list of restaurant IDs
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .in('id', restaurant_ids);

      if (data) restaurants = data.filter((r) => r.website || r.menu_url);
    } else {
      // Batch mode: restaurants that have scraping enabled and at least one URL source
      let query = supabase
        .from('restaurants')
        .select('id, name, website, menu_url')
        .eq('menu_scrape_enabled', true)
        .order('popularity_score', { ascending: false, nullsFirst: false })
        .limit(batch_size);

      if (!force_update) {
        // Exclude restaurants that already have a recent menu (< 30 days)
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
