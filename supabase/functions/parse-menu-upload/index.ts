/**
 * SECURITY: verify_jwt = false
 * Reason: Called from admin UI with a bearer token; JWT + admin-role check
 * enforced in the handler (profiles.role === 'admin') before any work.
 * Alternative measures: Service role key for DB writes, Anthropic API key kept server-side.
 * Risk level: LOW (admin-only feature, file size limited to 10 MB)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const claudeApiKey = Deno.env.get('CLAUDE_API')!;

const supabase = createClient(supabaseUrl, supabaseKey);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

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

interface ParseRequest {
  restaurant_id: string;
  file_base64: string;           // base64-encoded file content
  file_type: 'jpeg' | 'jpg' | 'png' | 'pdf';
  file_name?: string;
  save_to_db?: boolean;          // if true, inserts directly into restaurant_menus + items
  notes?: string;
}

function buildExtractionPrompt(restaurantId: string, fileName?: string): string {
  return `You are an expert at extracting restaurant menu data from images and PDFs. Extract the COMPLETE menu from this file${fileName ? ` ("${fileName}")` : ''}.

EXTRACTION INSTRUCTIONS:

1. Extract EVERY menu item you can find, organized by section (e.g., Appetizers, Salads, Entrees, Sandwiches, Desserts, Drinks, Kids Menu, etc.)
2. For each item extract:
   - item_name: The dish name (REQUIRED)
   - item_description: Description of the dish (null if not visible)
   - price: Price as displayed (e.g., "$12.99", "Market Price", "$10-15") or null
   - price_numeric: Numeric price for filtering (e.g., 12.99) or null if variable/unavailable
   - dietary_tags: Array of applicable tags from: ["vegan", "vegetarian", "gluten-free", "dairy-free", "nut-free", "spicy", "raw", "organic", "halal", "kosher"]
   - is_popular: true if marked as popular, recommended, chef's pick, bestseller, or starred

3. Group items into logical sections. Use the menu's own section names when available.
4. Assign section_sort_order starting from 0 in natural menu reading order.
5. If the document has multiple pages, extract ALL pages.

IMPORTANT:
- Extract ALL items visible, not just highlights
- Keep original pricing format in "price" field
- Parse numeric value into "price_numeric" (use lower bound for ranges like "$10-15" → 10)
- Detect dietary tags from symbols, abbreviations, or descriptions (e.g., "(GF)" = gluten-free, "(V)" or a leaf icon = vegan/vegetarian)
- Items marked with stars, flames, crowns, or labels like "popular"/"favorite"/"chef's choice" should have is_popular: true

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

If no menu items can be found at all, return: {"sections": []}`;
}

async function extractMenuFromFile(
  fileBase64: string,
  fileType: string,
  restaurantId: string,
  fileName?: string
): Promise<{ sections: MenuSection[]; raw_text: string } | null> {
  const mediaType = fileType === 'pdf'
    ? 'application/pdf'
    : `image/${fileType === 'jpg' ? 'jpeg' : fileType}`;

  const contentBlock = fileType === 'pdf'
    ? {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBase64,
        },
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: fileBase64,
        },
      };

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
            contentBlock,
            {
              type: 'text',
              text: buildExtractionPrompt(restaurantId, fileName),
            },
          ],
        },
      ],
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
        raw_text: extractedText.substring(0, 50000),
      };
    }
  } catch (parseError) {
    console.error('Failed to parse Claude response:', parseError);
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Admin authentication — this function writes to the DB with the
    // service-role key and burns the Anthropic budget, so it must not be
    // callable anonymously despite verify_jwt=false at the platform layer.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ParseRequest = await req.json();
    const { restaurant_id, file_base64, file_type, file_name, save_to_db = false, notes } = body;

    if (!restaurant_id || !file_base64 || !file_type) {
      return new Response(
        JSON.stringify({ error: 'restaurant_id, file_base64, and file_type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedTypes = ['jpeg', 'jpg', 'png', 'pdf'];
    if (!allowedTypes.includes(file_type.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${file_type}. Allowed: jpeg, jpg, png, pdf` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check approximate decoded size
    const estimatedBytes = Math.ceil(file_base64.length * 0.75);
    if (estimatedBytes > MAX_FILE_BYTES) {
      return new Response(
        JSON.stringify({ error: `File too large (estimated ${Math.round(estimatedBytes / 1024 / 1024)}MB). Maximum is 10MB.` }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify restaurant exists
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurant_id)
      .single();

    if (restError || !restaurant) {
      return new Response(
        JSON.stringify({ error: 'Restaurant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Parsing menu upload for ${restaurant.name} (${file_type}, ~${Math.round(estimatedBytes / 1024)}KB)`);

    const extracted = await extractMenuFromFile(file_base64, file_type, restaurant_id, file_name);

    if (!extracted || extracted.sections.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No menu items could be extracted from the file', sections: [], items_count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalItems = extracted.sections.reduce((sum, s) => sum + s.items.length, 0);
    console.log(`Extracted ${totalItems} items across ${extracted.sections.length} sections`);

    if (!save_to_db) {
      return new Response(
        JSON.stringify({
          success: true,
          sections: extracted.sections,
          items_count: totalItems,
          raw_text: extracted.raw_text,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Persist to database
    const sourceType = file_type === 'pdf' ? 'uploaded_pdf' : 'uploaded_image';

    const { data: newMenu, error: menuError } = await supabase
      .from('restaurant_menus')
      .insert({
        restaurant_id,
        is_current: true,
        source_type: sourceType,
        source_url: null,
        captured_at: new Date().toISOString(),
        raw_text: extracted.raw_text,
        notes: notes || `Uploaded ${file_type.toUpperCase()}${file_name ? `: ${file_name}` : ''}`,
      })
      .select('id')
      .single();

    if (menuError || !newMenu) {
      return new Response(
        JSON.stringify({ error: `DB insert error: ${menuError?.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const menuItems = extracted.sections.flatMap((section) =>
      section.items.map((item, idx) => ({
        menu_id: newMenu.id,
        section_name: section.section_name,
        section_sort_order: section.section_sort_order,
        item_name: item.item_name,
        item_description: item.item_description,
        price: item.price,
        price_numeric: item.price_numeric,
        dietary_tags: item.dietary_tags || [],
        is_popular: item.is_popular || false,
        sort_order: idx,
      }))
    );

    for (let i = 0; i < menuItems.length; i += 100) {
      const { error: itemsError } = await supabase
        .from('restaurant_menu_items')
        .insert(menuItems.slice(i, i + 100));

      if (itemsError) {
        await supabase.from('restaurant_menus').delete().eq('id', newMenu.id);
        return new Response(
          JSON.stringify({ error: `Items insert error: ${itemsError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        menu_id: newMenu.id,
        sections: extracted.sections,
        items_count: totalItems,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in parse-menu-upload:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
