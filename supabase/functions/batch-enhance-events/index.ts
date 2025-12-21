import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const googleSearchApiKey = Deno.env.get('GOOGLE_SEARCH_API') || Deno.env.get('GOOGLE_PROGRAMMATIC_KEY');
const googleSearchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || 'a67b454ea60fc4b35';
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
  
  console.log('Google Search URL:', searchUrl.replace(googleSearchApiKey, '[API_KEY_HIDDEN]'));
  console.log('Google Search Engine ID:', googleSearchEngineId);
  console.log('Encoded query:', encodeURIComponent(query));
  
  const response = await fetch(searchUrl);
  
  console.log('Google Search API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google Search API error response:', errorText);
    throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  console.log('Google Search API response keys:', Object.keys(data));
  console.log('Search info:', JSON.stringify(data.searchInformation || {}, null, 2));
  console.log('Items returned:', data.items?.length || 0);
  
  if (data.items?.length) {
    console.log('First result sample:', JSON.stringify({
      title: data.items[0].title,
      snippet: data.items[0].snippet?.substring(0, 100) + '...',
      link: data.items[0].link
    }, null, 2));
  }
  
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

IMPORTANT GUIDELINES FOR SOURCE URL SELECTION:
- If updating "source_url", prioritize OFFICIAL and AUTHORITATIVE sources in this order:
  1. Official government/city websites (e.g., dsm.city, cityofdm.org)
  2. Official organization/venue websites (e.g., venue's own domain)
  3. Official event organizer websites
  4. Established event listing sites (e.g., catchdesmoines.com, eventbrite.com)
  5. Social media pages (Facebook, Instagram) only if no better option exists
  
- AVOID selecting URLs that are:
  - The same as the current source_url (unless it's the only relevant result)
  - Generic aggregator sites or directories
  - Unrelated websites that happen to mention the event
  - Broken or obviously incorrect links

- For Des Moines events, dsm.city links are highly preferred over other sources
- Look for URLs that provide the most comprehensive and official information about the event

For other fields:
- For price fields, try to find specific pricing information or indicate if the event is free.
- For venue/location, be as specific as possible with addresses when available.
- For descriptions, enhance with relevant details found in the search results but keep them concise.
- For categories, use standard event categories like "Music", "Art", "Sports", "Food", "Entertainment", etc.

Return ONLY a JSON object with the improved field values. If you cannot find reliable information for a field, omit it from the response.

Example format:
{
  "source_url": "https://dsm.city/ParkNPlay",
  "price": "Free" or "$25" or "See website",
  "venue": "Specific venue name",
  "location": "123 Main St, Des Moines, IA",
  "category": "Music",
  "original_description": "Enhanced description with relevant details"
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

  // Add timeout to the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('Claude API request timing out after 30 seconds');
    controller.abort();
  }, 30000); // 30 second timeout

  try {
    console.log('About to make fetch request to Claude API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('Claude API response received');
    console.log('Claude API response status:', response.status);
    console.log('Claude API response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error response:', errorText);
      console.error('Claude API error status:', response.status);
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
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Claude API request timed out after 30 seconds');
    }
    throw error;
  }
}

// Map frontend field names to database column names
function mapFieldNames(frontendFields: string[]): string[] {
  const fieldMap: Record<string, string> = {
    'sourceUrl': 'source_url',
    'originalDescription': 'original_description',
    'enhancedDescription': 'enhanced_description',
    'imageUrl': 'image_url',
    'isEnhanced': 'is_enhanced',
    'isFeatured': 'is_featured',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at'
  };
  
  return frontendFields.map(field => fieldMap[field] || field);
}

// Map database field names back to frontend format for Claude prompt
function mapToClaudeFields(dbFields: string[]): string[] {
  const reverseMap: Record<string, string> = {
    'source_url': 'source_url', // Keep as source_url for Claude
    'original_description': 'original_description',
    'enhanced_description': 'enhanced_description',
    'image_url': 'image_url',
    'is_enhanced': 'is_enhanced',
    'is_featured': 'is_featured'
  };
  
  return dbFields.map(field => reverseMap[field] || field);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventIds, fields, baseQuery } = await req.json();
    
    console.log(`Batch enhancing ${eventIds.length} events with fields: ${fields.join(', ')}`);
    console.log('Environment check - Claude API Key exists:', !!claudeApiKey);
    console.log('Environment check - Google Search API Key exists:', !!googleSearchApiKey);
    
    // Map frontend field names to database column names
    const dbFields = mapFieldNames(fields);
    console.log('Mapped fields for database:', dbFields.join(', '));
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the events from the database
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds);
    
    if (eventsError) {
      throw eventsError;
    }
    
    const results: any[] = [];
    
    for (const event of events) {
      try {
        // Create search query - simplified and more effective
        const searchTerms = [event.title];
        
        // Add venue if it exists and isn't already in title
        if (event.venue && !event.title.toLowerCase().includes(event.venue.toLowerCase())) {
          searchTerms.push(event.venue);
        }
        
        // Add base query if provided
        if (baseQuery) {
          searchTerms.unshift(baseQuery);
        }
        
        // Add "Des Moines" if not already present
        const searchText = searchTerms.join(' ');
        const searchQuery = searchText.toLowerCase().includes('des moines') 
          ? searchText 
          : `${searchText} Des Moines`;
        
        console.log(`Searching for: ${searchQuery}`);
        
        // Search with Google
        let searchResults = await searchWithGoogle(searchQuery.trim());
        
        console.log(`Search results count: ${searchResults.length}`);
        
        // If no results, try a simpler search with just the event title
        if (searchResults.length === 0 && searchQuery !== event.title) {
          console.log(`No results found, trying simplified search: ${event.title}`);
          searchResults = await searchWithGoogle(event.title);
          console.log(`Simplified search results count: ${searchResults.length}`);
        }
        
        // If still no results, try with just venue name if available
        if (searchResults.length === 0 && event.venue) {
          const venueSearch = `${event.venue} Des Moines`;
          console.log(`No results found, trying venue search: ${venueSearch}`);
          searchResults = await searchWithGoogle(venueSearch);
          console.log(`Venue search results count: ${searchResults.length}`);
        }
        
        if (searchResults.length === 0) {
          console.log(`No search results for event ${event.id}`);
          results.push({
            eventId: event.id,
            status: 'no_results',
            message: 'No search results found'
          });
          continue;
        }
        
        console.log(`About to analyze with Claude for event ${event.id}`);
        
        // Analyze with Claude - use mapped database fields for current data
        const currentEventData = Object.fromEntries(
          dbFields.map(field => [field, event[field] || null])
        );
        
        console.log(`Current event data for Claude:`, JSON.stringify(currentEventData, null, 2));
        console.log(`Full event data available:`, JSON.stringify({
          id: event.id,
          title: event.title,
          venue: event.venue,
          location: event.location,
          date: event.date
        }, null, 2));
        
        // Use database field names for Claude (they match the expected format)
        const improvements = await analyzeWithClaude(searchResults, dbFields, currentEventData);
        
        console.log(`Claude analysis complete for event ${event.id}:`, JSON.stringify(improvements, null, 2));
        
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
        
        // Small delay to prevent rate limiting - reduced from 1000ms to 500ms
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
        console.error(`Error type: ${typeof error}`);
        console.error(`Error stack:`, error.stack);
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
