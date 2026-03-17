/**
 * SECURITY: verify_jwt = false
 * Reason: Background scraping job that runs without user context to collect restaurant menu data
 * Alternative measures: Service role key required for database access, API key validation for external services
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scrapeUrl } from "../_shared/scraper.ts";

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

/**
 * Extract structured menu data from raw content using Claude AI
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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
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
 * Scrape menu from a restaurant's website.
 * If menu_url is set on the restaurant record, that URL is used exclusively.
 * Otherwise, common menu path patterns are tried against the website field.
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

  // If a custom menu_url is stored, use it exclusively — no pattern guessing needed
  let menuUrls: string[];
  if (restaurant.menu_url) {
    console.log(`  Using stored menu_url: ${restaurant.menu_url}`);
    menuUrls = [restaurant.menu_url];
  } else {
    // Discover menu URL via common path patterns
    const baseUrl = restaurant.website.replace(/\/$/, '');
    menuUrls = [
      `${baseUrl}/menu`,
      `${baseUrl}/menus`,
      `${baseUrl}/food-menu`,
      `${baseUrl}/our-menu`,
      `${baseUrl}/food`,
      `${baseUrl}/food-and-drink`,
      `${baseUrl}/dining`,
      baseUrl, // fallback to homepage
    ];
  }

  let bestContent = '';
  let sourceUrl = '';

  for (const url of menuUrls) {
    console.log(`  Trying: ${url}`);
    try {
      const result = await scrapeUrl(url, {
        waitTime: 3000,
        timeout: 15000,
      });

      if (result.success) {
        const content = result.markdown || result.text || result.html || '';
        // Check if this page likely has menu content
        const menuSignals = (content.match(/\$\d+/g) || []).length;
        const hasMenuKeywords = /menu|appetizer|entree|dessert|drink|sandwich|salad|soup|burger/i.test(content);

        if (content.length > 200 && (menuSignals >= 3 || hasMenuKeywords)) {
          if (content.length > bestContent.length || menuSignals > (bestContent.match(/\$\d+/g) || []).length) {
            bestContent = content;
            sourceUrl = url;
          }
        }
      }
    } catch {
      // Try next URL
    }
  }

  if (!bestContent) {
    return { success: false, items_count: 0, error: 'No menu content found at any URL' };
  }

  console.log(`  Best menu source: ${sourceUrl} (${bestContent.length} chars)`);

  // Extract structured menu using AI
  const extracted = await extractMenuFromContent(bestContent, restaurant.name, sourceUrl);

  if (!extracted || extracted.sections.length === 0) {
    return { success: false, items_count: 0, error: 'AI could not extract menu items' };
  }

  // Count total items
  const totalItems = extracted.sections.reduce((sum, s) => sum + s.items.length, 0);

  if (totalItems < 2) {
    return { success: false, items_count: 0, error: 'Too few items extracted (likely not a menu)' };
  }

  // Insert new menu version (triggers auto-version and unmarks previous)
  const { data: newMenu, error: menuError } = await supabase
    .from('restaurant_menus')
    .insert({
      restaurant_id: restaurant.id,
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
