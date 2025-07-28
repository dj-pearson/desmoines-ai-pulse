import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    
    // Handle field mapping for different content types
    if (contentType === 'event' && enhancedData.name) {
      enhancedData.title = enhancedData.name;
      delete enhancedData.name;
    }
    
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
  // Define the appropriate description field for each content type
  const getDescriptionFields = (type: string) => {
    switch (type) {
      case 'event':
        return {
          input: 'original_description',
          output: 'enhanced_description'
        };
      default:
        return {
          input: 'description',
          output: 'description'
        };
    }
  };

  const descFields = getDescriptionFields(contentType);
  
  const prompt = `You are a data researcher. I need you to help me find accurate, up-to-date information about a ${contentType}.

Current data: ${JSON.stringify(currentData, null, 2)}

Search context: "${searchQuery}"

CRITICAL: You MUST always return a JSON object, even if you can only verify partial information. If you cannot verify certain fields, simply omit them from the JSON response.

Please provide accurate, verified information in this exact JSON format (only include fields that you can verify or reasonably infer):

{
  "name": "Accurate business/venue name",
  "location": "Complete address if different from current",
  "phone": "Phone number in (xxx) xxx-xxxx format",
  "website": "Official website URL",
  "${descFields.output}": "Brief, factual description (2-3 sentences max)",
  ${contentType === 'restaurant' ? `"cuisine": "Type of cuisine",
  "price_range": "$", "$$", "$$$", or "$$$$",` : ''}
  ${contentType === 'event' ? `"venue": "Event venue name",
  "price": "Ticket price or 'Free'",` : ''}
  ${contentType === 'attraction' ? `"type": "Type of attraction",` : ''}
  ${contentType === 'playground' ? `"amenities": ["list", "of", "amenities"],
  "age_range": "Age range like '2-12 years'",` : ''}
  "rating": 4.5
}

IMPORTANT: Always return valid JSON. If you cannot verify ANY information, return: {"status": "no_data_found"}

Do not include any explanatory text outside the JSON. Return only the JSON object.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.1,
      messages: [
        { role: 'user', content: prompt }
      ],
    }),
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