import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { stripAiLabels } from "../_shared/aiText.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// BEGIN pure: planEnhanceUpdate
// Self-contained on purpose (no imports, no module state):
// _tests/restaurant-ingest-honesty.test.ts lifts this block out of the file and
// runs it, because importing index.ts would start the server.
//
// The columns this function may write, per content type. It is also the list
// the prompt asks for, so the model is never invited to fill anything else.
// A restaurant gets a description and nothing more: phone, website, address,
// cuisine and price are facts the page shows as sourced, and the model here has
// no source. No type gets a rating, which no column can attribute to anyone.
export const ENHANCE_WRITABLE: Readonly<Record<string, readonly string[]>> = {
  restaurant: ['description'],
  event: ['title', 'location', 'venue', 'price', 'enhanced_description', 'image_url'],
  attraction: ['name', 'location', 'website', 'description', 'type', 'image_url'],
  playground: ['name', 'location', 'description', 'amenities', 'age_range', 'image_url'],
};

export interface EnhancePlan {
  update: Record<string, string | string[]>;
  refused: string[];
}

/**
 * Splits a model response into the keys that may be written and the ones that
 * are refused. A key is refused when it is not whitelisted for the type or its
 * value is not a non-empty string (a string array for amenities). "status" is
 * the function's own control field and is dropped without being reported.
 */
export function planEnhanceUpdate(contentType: string, aiData: Record<string, unknown>): EnhancePlan {
  const allowed = ENHANCE_WRITABLE[contentType] ?? [];
  const update: Record<string, string | string[]> = {};
  const refused: string[] = [];
  for (const [key, value] of Object.entries(aiData)) {
    if (key === 'status') continue;
    if (!allowed.includes(key)) {
      refused.push(key);
      continue;
    }
    if (key === 'amenities') {
      if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.trim())) {
        update[key] = value.map((v) => (v as string).trim());
      } else {
        refused.push(key);
      }
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      update[key] = value.trim();
    } else {
      refused.push(key);
    }
  }
  return { update, refused };
}
// END pure: planEnhanceUpdate

const claudeApiKey = getAnthropicApiKey();
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Runs as service_role and had no caller check. verify_jwt is not a gate:
  // it defaults to true, and true only means "a valid Supabase JWT", which
  // the publishable anon key is.
  //
  // Callers, enumerated before guarding:
  //   ContentTable -> AdminContent, /admin/content (App.tsx:452)
  // requireAdminOrApiKey accepts the service-role key the cron sends and an
  // admin user JWT, so every real caller is unaffected.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const { contentType, contentId, currentData } = await req.json();
    
    console.log(`Enhancing ${contentType} with ID: ${contentId}`);
    
    // WEB-BE-077: names this function to the copy-provenance trigger, which
    // labels a description it writes as AI-assisted.
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { 'x-actor': 'enhance-content' } },
    });
    // Before the model call: an unknown type still fails with the same 500 it
    // always did, and now without paying for a completion first.
    const tableName = getTableName(contentType);

    // Create search query based on content type and current data
    const searchQuery = createSearchQuery(contentType, currentData);
    
    // Use AI to research and enhance the content
    const enhancedData = await enhanceContentWithAI(searchQuery, currentData, contentType);
    
    // Check if AI found any data to enhance
    if (enhancedData.status === "no_data_found") {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No additional data found to enhance content',
          data: currentData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (enhancedData.status === "parsing_error") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI response could not be parsed'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // WEB-BE-068. Only whitelisted keys reach the row. This used to write
    // whatever the model returned, so a restaurant got the phone, website,
    // address, price and "rating": 4.5 the prompt's example suggested, from a
    // model with no search tool and no source text.
    const { update, refused } = planEnhanceUpdate(contentType, enhancedData);
    if (refused.length > 0) {
      console.warn(`[enhance-content] refused keys for ${contentType} ${contentId}: ${refused.join(', ')}`);
    }

    // SEO-057: a description that comes back as "**Description:** ..." or with
    // a trailing "**Location:**" line keeps its text and loses the label.
    for (const field of ['enhanced_description', 'description']) {
      if (typeof update[field] === 'string') {
        update[field] = stripAiLabels(update[field] as string);
      }
    }

    if (Object.keys(update).length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No additional data found to enhance content',
          data: currentData,
          refused_keys: refused,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the database with enhanced information
    const { data, error } = await supabase
      .from(tableName)
      .update(update)
      .eq('id', contentId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`Successfully enhanced ${contentType}:`, data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data,
        message: 'Content enhanced successfully',
        refused_keys: refused,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error enhancing content:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to enhance content' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function createSearchQuery(contentType: string, currentData: any): string {
  const name = currentData.name || currentData.title;
  const location = currentData.location;
  
  switch (contentType) {
    case 'restaurant':
      return `${name} restaurant ${location}`;
    case 'event':
      return `${name} event ${location} venue date time website tickets`;
    case 'attraction':
      return `${name} attraction ${location} website phone hours admission`;
    case 'playground':
      return `${name} playground ${location} amenities hours contact`;
    default:
      return `${name} ${location} contact information website phone`;
  }
}

async function enhanceContentWithAI(searchQuery: string, currentData: any, contentType: string) {
  // The fields asked for are the fields that may be written (ENHANCE_WRITABLE).
  const getAvailableFields = (type: string) => ({
    nameField: type === 'event' ? 'title' : 'name',
    descriptionField: type === 'event' ? 'enhanced_description' : 'description',
    availableFields: [...(ENHANCE_WRITABLE[type] ?? ['description'])],
  });

  const fieldConfig = getAvailableFields(contentType);
  
  const prompt = `You are a data researcher. I need you to help me find accurate, up-to-date information about a ${contentType}.

Current data: ${JSON.stringify(currentData, null, 2)}

Search context: "${searchQuery}"

CRITICAL: You MUST always return a JSON object, even if you can only verify partial information. If you cannot verify certain fields, simply omit them from the JSON response.

Please provide accurate, verified information using ONLY these available fields for ${contentType}:
${fieldConfig.availableFields.map(field => `- ${field}`).join('\n')}

Return in this JSON format (only include fields you can verify):

{
  ${fieldConfig.availableFields.map(field => {
    if (field === fieldConfig.nameField) return `"${field}": "Accurate business/venue name"`;
    if (field === 'location') return `"location": "Complete address if different from current"`;
    if (field === 'phone') return `"phone": "Phone number in (xxx) xxx-xxxx format"`;
    if (field === 'website') return `"website": "Official website URL"`;
    if (field === fieldConfig.descriptionField) return `"${field}": "Brief, factual description (2-3 sentences max), plain text with no markdown and no label such as 'Description:'"`;
    if (field === 'venue') return `"venue": "Event venue name"`;
    if (field === 'price') return `"price": "Ticket price or 'Free'"`;
    if (field === 'type') return `"type": "Type of attraction"`;
    if (field === 'amenities') return `"amenities": ["list", "of", "amenities"]`;
    if (field === 'age_range') return `"age_range": "Age range like '2-12 years'"`;
    if (field === 'image_url') return `"image_url": "URL to image"`;
    return `"${field}": "appropriate value"`;
  }).join(',\n  ')}
}

IMPORTANT: Always return valid JSON. If you cannot verify ANY information, return: {"status": "no_data_found"}

Do not include any explanatory text outside the JSON. Return only the JSON object.`;

  const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
  const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
  const requestBody = await buildClaudeRequest(
    [{ role: 'user', content: prompt }],
    { 
      supabaseUrl, 
      supabaseKey: supabaseServiceKey,
      customMaxTokens: 1000,
      customTemperature: 0.1
    }
  );

  const response = await fetchWithTimeout(config.api_endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  }, 60_000);

  const aiResponse = await response.json();
  const extracted = extractClaudeText(aiResponse);
  if (!extracted.ok) {
    console.error("Claude response not usable:", extracted.reason, extracted.detail);
    throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
  }
  const enhancedContent = extracted.text;
  
  try {
    // Parse the AI response as JSON - handle both wrapped and unwrapped JSON
    let cleanedResponse = enhancedContent.trim();
    
    // Remove markdown code blocks if present
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Try to extract just the JSON object by finding the first { and last }
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
      return JSON.parse(cleanedResponse);
    } else {
      // No JSON found in the response, Claude refused to provide data
      console.log('No JSON found in AI response, Claude refused to provide data');
      return { status: "no_data_found" };
    }
  } catch (parseError) {
    console.error('Failed to parse AI response:', enhancedContent);
    // Return a safe fallback instead of throwing
    return { status: "parsing_error" };
  }
}

function getTableName(contentType: string): string {
  switch (contentType) {
    case 'restaurant': return 'restaurants';
    case 'event': return 'events';
    case 'attraction': return 'attractions';
    case 'playground': return 'playgrounds';
    default: throw new Error(`Unknown content type: ${contentType}`);
  }
}