import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('SEO generation request received');
    
    const { contentType, batchSize = 10 } = await req.json();
    
    console.log('Parsed request body successfully:', { contentType, batchSize });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    console.log('Supabase client created');

    const claudeApiKey = Deno.env.get('CLAUDE_API');
    if (!claudeApiKey) {
      console.error('CLAUDE_API environment variable not found');
      throw new Error('Claude API key not found');
    }

    console.log('Claude API key found, length:', claudeApiKey.length);
    console.log(`Starting SEO content generation for ${contentType}`);

    // Get items that need SEO content with locking to prevent duplicates
    let query;
    if (contentType === 'event') {
      query = supabaseClient
        .from('events')
        .select('id, title, venue, location, date, category, ai_writeup')
        .or('seo_title.is.null,seo_title.eq.""')
        .limit(batchSize);
    } else {
      query = supabaseClient
        .from('restaurants')
        .select('id, name, description, cuisine, location, price_range, ai_writeup, opening_date, status')
        .or('seo_title.is.null,seo_title.eq.""')
        .limit(batchSize);
    }

    const { data: items, error: fetchError } = await query;
    
    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      throw new Error('Failed to fetch items');
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No items need SEO content', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${items.length} items to process`);

    let processedCount = 0;
    const errors = [];

    for (const item of items) {
      try {
        // Immediately mark item as processing to prevent duplicates
        const lockData = {
          seo_title: 'PROCESSING...',
          seo_description: 'Processing SEO content...'
        };
        
        const { error: lockError } = await supabaseClient
          .from(contentType === 'event' ? 'events' : 'restaurants')
          .update(lockData)
          .eq('id', item.id)
          .or('seo_title.is.null,seo_title.eq.""');
        
        if (lockError) {
          console.log(`Item ${item.id} already being processed, skipping`);
          continue;
        }

        const prompt = contentType === 'event' 
          ? createEventSEOPrompt(item)
          : createRestaurantSEOPrompt(item);

        const config = await getAIConfig(supabaseUrl, supabaseKey);
        const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
        const requestBody = await buildClaudeRequest(
          [{ role: 'user', content: prompt }],
          { 
            supabaseUrl, 
            supabaseKey,
            customMaxTokens: 1000,
            customTemperature: 0.1
          }
        );

        const claudeResponse = await fetch(config.api_endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        console.log('Claude API Response Status:', claudeResponse.status);

        if (!claudeResponse.ok) {
          throw new Error(`Claude API error: ${claudeResponse.status}`);
        }

        const claudeData = await claudeResponse.json();
        const generatedContent = claudeData.content[0].text;

        // Parse the structured response
        const seoData = parseClaudeResponse(generatedContent);

        // Update the database with final content
        const updateData = {
          seo_title: seoData.title,
          seo_description: seoData.description,
          seo_keywords: seoData.keywords,
          seo_h1: seoData.h1,
          geo_summary: seoData.summary,
          geo_key_facts: seoData.keyFacts,
          geo_faq: seoData.faq
        };

        const { error: updateError } = await supabaseClient
          .from(contentType === 'event' ? 'events' : 'restaurants')
          .update(updateData)
          .eq('id', item.id);

        if (updateError) {
          throw new Error(`Database update error: ${updateError.message}`);
        }

        processedCount++;
        console.log(`Successfully processed ${contentType} ${item.id}`);

      } catch (error) {
        console.error(`Error processing ${contentType} ${item.id}:`, error);
        
        // Reset the lock if processing failed
        const resetData = {
          seo_title: null,
          seo_description: null
        };
        await supabaseClient
          .from(contentType === 'event' ? 'events' : 'restaurants')
          .update(resetData)
          .eq('id', item.id);
          
        errors.push(`${item.id}: ${error.message}`);
      }
    }

    console.log(`SEO generation completed. Processed: ${processedCount}/${items.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        total: items.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SEO generation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function createEventSEOPrompt(event: any): string {
  return `Generate comprehensive SEO and GEO optimization content for this Des Moines event. Return ONLY a JSON object with these exact fields:

{
  "title": "SEO title (under 60 chars, include event name + Des Moines + date)",
  "description": "Meta description (150-155 chars, compelling with local keywords)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching primary search intent",
  "summary": "2-3 sentence GEO summary for AI engines, location-focused",
  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "faq": [
    {"question": "When is [event]?", "answer": "Answer with date and time"},
    {"question": "Where is [event] located?", "answer": "Answer with venue and Des Moines"},
    {"question": "What type of event is [event]?", "answer": "Answer with category"}
  ]
}

Event Details:
- Title: ${event.title}
- Venue: ${event.venue || 'N/A'}
- Location: ${event.location}
- Date: ${event.date}
- Category: ${event.category}
- AI Writeup: ${event.ai_writeup ? event.ai_writeup.substring(0, 200) + '...' : 'N/A'}

Focus on Des Moines local SEO and GEO optimization for AI search engines.`;
}

function createRestaurantSEOPrompt(restaurant: any): string {
  return `Generate comprehensive SEO and GEO optimization content for this Des Moines restaurant. Return ONLY a JSON object with these exact fields:

{
  "title": "SEO title (under 60 chars, include restaurant name + cuisine + Des Moines)",
  "description": "Meta description (150-155 chars, compelling with local keywords)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching primary search intent",
  "summary": "2-3 sentence GEO summary for AI engines, location-focused",
  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "faq": [
    {"question": "What type of cuisine does [restaurant] serve?", "answer": "Answer with cuisine type"},
    {"question": "Where is [restaurant] located?", "answer": "Answer with address and Des Moines"},
    {"question": "What is the price range at [restaurant]?", "answer": "Answer with price range"}
  ]
}

Restaurant Details:
- Name: ${restaurant.name}
- Description: ${restaurant.description || 'N/A'}
- Cuisine: ${restaurant.cuisine}
- Location: ${restaurant.location}
- Price Range: ${restaurant.price_range || 'N/A'}
- Status: ${restaurant.status || 'N/A'}
- Opening Date: ${restaurant.opening_date || 'N/A'}
- AI Writeup: ${restaurant.ai_writeup ? restaurant.ai_writeup.substring(0, 200) + '...' : 'N/A'}

Focus on Des Moines local SEO and GEO optimization for AI search engines.`;
}

function parseClaudeResponse(response: string): any {
  try {
    // Clean the response to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error parsing Claude response:', error);
    console.error('Raw response:', response);
    throw new Error('Failed to parse Claude response as JSON');
  }
}