import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const googleSearchApiKey = Deno.env.get('GOOGLE_SEARCH_API');
const googleSearchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || '017576662512468239146:omuauf_lfve';
const claudeApiKey = Deno.env.get('CLAUDE_API');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

async function searchWithGoogle(query: string): Promise<SearchResult[]> {
  if (!googleSearchApiKey) {
    throw new Error('Google Search API key not configured');
  }
  
  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleSearchApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(query)}&num=5`;
  
  const response = await fetch(searchUrl);
  
  if (!response.ok) {
    throw new Error(`Google Search API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return data.items?.map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link
  })) || [];
}

async function analyzeWithClaude(searchResults: SearchResult[], fields: string[], currentData: any): Promise<any> {
  if (!claudeApiKey) {
    throw new Error('Claude API key not configured');
  }

  console.log('Claude API Key configured:', claudeApiKey ? 'Yes' : 'No');
  console.log('Claude API Key length:', claudeApiKey?.length || 0);

  const prompt = `
Based on the following search results and current event data, please extract and improve the following fields: ${fields.join(', ')}.

Current Event Data:
${JSON.stringify(currentData, null, 2)}

Search Results:
${searchResults.map(r => `Title: ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.link}`).join('\n\n')}

Please analyze the search results and provide improved information for the requested fields. 
Focus on accuracy and relevance. 

For price fields, try to find specific pricing information or indicate if the event is free.
For venue/location, be as specific as possible with addresses when available.
For descriptions, enhance with relevant details found in the search results but keep them concise.
For categories, use standard event categories like "Music", "Art", "Sports", "Food", "Entertainment", etc.

Return ONLY a JSON object with the improved field values. If you cannot find reliable information for a field, omit it from the response.

Example format:
{
  "price": "Free" or "$25" or "See website",
  "venue": "Specific venue name",
  "location": "123 Main St, Des Moines, IA",
  "category": "Music",
  "originalDescription": "Enhanced description with relevant details"
}
`;

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  console.log('Making Claude API request with model:', requestBody.model);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${claudeApiKey}`,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  console.log('Claude API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error response:', errorText);
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '{}';
  
  // Extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('No valid JSON found in Claude response:', content);
    return {};
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.warn('Failed to parse Claude JSON response:', error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventIds, fields, baseQuery } = await req.json();
    
    console.log(`Batch enhancing ${eventIds.length} events with fields: ${fields.join(', ')}`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the events from the database
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds);
    
    if (eventsError) {
      throw eventsError;
    }
    
    const results = [];
    
    for (const event of events) {
      try {
        // Create search query
        const searchQuery = baseQuery 
          ? `${baseQuery} ${event.title} ${event.venue || ''} ${event.location || ''}`
          : `${event.title} ${event.venue || ''} ${event.location || ''} Des Moines event`;
        
        console.log(`Searching for: ${searchQuery}`);
        
        // Search with Google
        const searchResults = await searchWithGoogle(searchQuery.trim());
        
        if (searchResults.length === 0) {
          results.push({
            eventId: event.id,
            status: 'no_results',
            message: 'No search results found'
          });
          continue;
        }
        
        // Analyze with Claude
        const currentEventData = Object.fromEntries(
          fields.map(field => [field, event[field]])
        );
        
        const improvements = await analyzeWithClaude(searchResults, fields, currentEventData);
        
        if (Object.keys(improvements).length === 0) {
          results.push({
            eventId: event.id,
            status: 'no_improvements',
            message: 'No improvements found'
          });
          continue;
        }
        
        // Update the event in the database
        const { error: updateError } = await supabase
          .from('events')
          .update(improvements)
          .eq('id', event.id);
        
        if (updateError) {
          throw updateError;
        }
        
        results.push({
          eventId: event.id,
          status: 'success',
          improvements: improvements
        });
        
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
        results.push({
          eventId: event.id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Batch enhance error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
