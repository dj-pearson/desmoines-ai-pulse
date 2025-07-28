import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API');
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
  const prompt = `You are a data researcher. I need you to help me find accurate, up-to-date information about a ${contentType}.

Current data: ${JSON.stringify(currentData, null, 2)}

Search context: "${searchQuery}"

Please provide accurate, verified information in this exact JSON format (only include fields that need updating or are missing):

{
  "name": "Accurate business/venue name",
  "location": "Complete address if different from current",
  "phone": "Phone number in (xxx) xxx-xxxx format",
  "website": "Official website URL",
  "description": "Brief, factual description (2-3 sentences max)",
  ${contentType === 'restaurant' ? `"cuisine": "Type of cuisine",
  "price_range": "$", "$$", "$$$", or "$$$$",` : ''}
  ${contentType === 'event' ? `"venue": "Event venue name",
  "price": "Ticket price or 'Free'",` : ''}
  ${contentType === 'attraction' ? `"type": "Type of attraction",` : ''}
  ${contentType === 'playground' ? `"amenities": ["list", "of", "amenities"],
  "age_range": "Age range like '2-12 years'",` : ''}
  "rating": 4.5
}

Only return the JSON object with fields that have accurate information. If you cannot verify a field, omit it entirely.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: 'You are a precise data researcher. Only provide verified, accurate information. Return valid JSON only.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  const aiResponse = await response.json();
  const enhancedContent = aiResponse.choices[0].message.content;
  
  try {
    // Parse the AI response as JSON
    const cleanedResponse = enhancedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanedResponse);
  } catch (parseError) {
    console.error('Failed to parse AI response:', enhancedContent);
    throw new Error('AI returned invalid JSON response');
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