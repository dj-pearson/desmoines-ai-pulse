import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const claudeApiKey = Deno.env.get('CLAUDE_API');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contentType, contentId, currentData } = await req.json();
    
    console.log(`Enhancing ${contentType} with ID: ${contentId}`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    
    // Remove status field if it exists before updating database
    delete enhancedData.status;
    
    // Update the database with enhanced information
    const tableName = getTableName(contentType);
    const { data, error } = await supabase
      .from(tableName)
      .update(enhancedData)
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
        message: 'Content enhanced successfully' 
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
      return `${name} restaurant ${location} phone website hours menu`;
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
  // Define the available fields for each content type based on actual database schema
  const getAvailableFields = (type: string) => {
    switch (type) {
      case 'event':
        return {
          nameField: 'title',
          descriptionField: 'enhanced_description',
          availableFields: ['title', 'location', 'venue', 'price', 'enhanced_description', 'image_url']
        };
      case 'restaurant':
        return {
          nameField: 'name',
          descriptionField: 'description',
          availableFields: ['name', 'location', 'phone', 'website', 'description', 'cuisine', 'price_range', 'rating', 'image_url']
        };
      case 'attraction':
        return {
          nameField: 'name',
          descriptionField: 'description',
          availableFields: ['name', 'location', 'website', 'description', 'type', 'rating', 'image_url']
        };
      case 'playground':
        return {
          nameField: 'name',
          descriptionField: 'description',
          availableFields: ['name', 'location', 'description', 'amenities', 'age_range', 'rating', 'image_url']
        };
      default:
        return {
          nameField: 'name',
          descriptionField: 'description',
          availableFields: ['name', 'location', 'description']
        };
    }
  };

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
    if (field === fieldConfig.descriptionField) return `"${field}": "Brief, factual description (2-3 sentences max)"`;
    if (field === 'cuisine') return `"cuisine": "Type of cuisine"`;
    if (field === 'price_range') return `"price_range": "$", "$$", "$$$", or "$$$$"`;
    if (field === 'venue') return `"venue": "Event venue name"`;
    if (field === 'price') return `"price": "Ticket price or 'Free'"`;
    if (field === 'type') return `"type": "Type of attraction"`;
    if (field === 'amenities') return `"amenities": ["list", "of", "amenities"]`;
    if (field === 'age_range') return `"age_range": "Age range like '2-12 years'"`;
    if (field === 'rating') return `"rating": 4.5`;
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

  const response = await fetch(config.api_endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  const aiResponse = await response.json();
  const enhancedContent = aiResponse.content[0].text;
  
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