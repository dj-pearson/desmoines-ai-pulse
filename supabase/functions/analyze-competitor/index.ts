import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompetitorAnalysisRequest {
  competitorId?: string;
  analysisType: 'scrape' | 'analyze' | 'suggest';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY');
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API_KEY is required');
    }

    const { competitorId, analysisType }: CompetitorAnalysisRequest = await req.json();

    let result;
    
    switch (analysisType) {
      case 'scrape':
        result = await scrapeCompetitorContent(supabaseClient, competitorId);
        break;
      case 'analyze':
        result = await analyzeCompetitorContent(supabaseClient, claudeApiKey, competitorId);
        break;
      case 'suggest':
        result = await generateContentSuggestions(supabaseClient, claudeApiKey, competitorId);
        break;
      default:
        throw new Error('Invalid analysis type');
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-competitor function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function scrapeCompetitorContent(supabaseClient: any, competitorId?: string) {
  // Get competitor info
  const { data: competitors, error: competitorError } = await supabaseClient
    .from('competitors')
    .select('*')
    .eq('is_active', true)
    .eq(competitorId ? 'id' : undefined, competitorId || undefined);

  if (competitorError) throw competitorError;
  if (!competitors?.length) throw new Error('No active competitors found');

  const results = [];

  for (const competitor of competitors) {
    try {
      console.log(`Scraping content for ${competitor.name} at ${competitor.website_url}`);
      
      // Fetch competitor website
      const response = await fetch(competitor.website_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DesMoinesInsiderBot/1.0)',
        }
      });

      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Extract content using basic parsing
      const content = extractContentFromHTML(html, competitor.website_url);
      
      // Store scraped content
      const { data: storedContent, error: storeError } = await supabaseClient
        .from('competitor_content')
        .upsert(content.map(item => ({
          ...item,
          competitor_id: competitor.id,
          scraped_at: new Date().toISOString(),
        })), { onConflict: 'competitor_id,url' });

      if (storeError) {
        console.error(`Error storing content for ${competitor.name}:`, storeError);
      }

      results.push({
        competitor: competitor.name,
        contentCount: content.length,
        success: true
      });

    } catch (error) {
      console.error(`Error scraping ${competitor.name}:`, error);
      results.push({
        competitor: competitor.name,
        success: false,
        error: error.message
      });
    }
  }

  return { results, total: results.length };
}

function extractContentFromHTML(html: string, baseUrl: string): any[] {
  const content = [];
  
  // Basic content extraction - in production, you'd use a proper HTML parser
  const titleMatches = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || [];
  const linkMatches = html.match(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi) || [];
  
  // Extract event-like content
  titleMatches.forEach((match, index) => {
    const titleText = match.replace(/<[^>]*>/g, '').trim();
    if (titleText.length > 10) {
      content.push({
        content_type: 'blog_post',
        title: titleText,
        description: `Content from ${new URL(baseUrl).hostname}`,
        url: baseUrl,
        category: 'General',
        tags: ['scraped', 'competitor'],
        publish_date: new Date().toISOString().split('T')[0],
        content_score: Math.floor(Math.random() * 50) + 50, // Placeholder scoring
      });
    }
  });

  return content.slice(0, 20); // Limit to 20 items per scrape
}

async function analyzeCompetitorContent(supabaseClient: any, claudeApiKey: string, competitorId?: string) {
  // Get recent competitor content
  let query = supabaseClient
    .from('competitor_content')
    .select('*, competitors(name, website_url)')
    .order('scraped_at', { ascending: false })
    .limit(20);
    
  if (competitorId) {
    query = query.eq('competitor_id', competitorId);
  }

  const { data: content, error } = await query;
  if (error) throw error;
  if (!content?.length) throw new Error('No competitor content found to analyze');

  // Analyze content with Claude
  const analysisPrompt = `
Analyze the following competitor content and provide insights:

Content to analyze:
${content.map(item => `
- Title: ${item.title}
- Type: ${item.content_type}
- Category: ${item.category}
- Source: ${item.competitors?.name} (${item.competitors?.website_url})
- Description: ${item.description}
`).join('\n')}

Please provide analysis in the following JSON format:
{
  "content_themes": ["theme1", "theme2"],
  "competitive_advantages": ["advantage1", "advantage2"],
  "content_gaps": ["gap1", "gap2"],
  "recommendations": ["rec1", "rec2"],
  "content_quality_score": 85,
  "engagement_potential": "high/medium/low",
  "summary": "Brief analysis summary"
}
`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const analysisText = aiResponse.content[0].text;
  
  let analysis;
  try {
    analysis = JSON.parse(analysisText);
  } catch {
    analysis = {
      summary: analysisText,
      content_quality_score: 75,
      engagement_potential: 'medium'
    };
  }

  // Store analysis report
  const { data: report, error: reportError } = await supabaseClient
    .from('competitor_reports')
    .insert({
      competitor_id: competitorId || content[0].competitor_id,
      total_content_pieces: content.length,
      average_content_score: analysis.content_quality_score || 75,
      top_performing_categories: analysis.content_themes || [],
      competitive_advantages: analysis,
      recommendations: analysis
    });

  if (reportError) console.error('Error storing report:', reportError);

  return analysis;
}

async function generateContentSuggestions(supabaseClient: any, claudeApiKey: string, competitorId?: string) {
  // Get competitor content and our existing content
  const { data: competitorContent } = await supabaseClient
    .from('competitor_content')
    .select('*, competitors(name)')
    .eq(competitorId ? 'competitor_id' : undefined, competitorId || undefined)
    .order('content_score', { ascending: false })
    .limit(10);

  const { data: ourContent } = await supabaseClient
    .from('events')
    .select('title, category, description')
    .limit(10);

  if (!competitorContent?.length) {
    throw new Error('No competitor content found for suggestions');
  }

  const suggestionPrompt = `
Compare competitor content with our existing content and suggest improvements:

COMPETITOR CONTENT:
${competitorContent.map(item => `
- ${item.title} (${item.competitors?.name})
- Category: ${item.category}
- Score: ${item.content_score}
`).join('\n')}

OUR EXISTING CONTENT:
${ourContent?.map(item => `
- ${item.title}
- Category: ${item.category}
`).join('\n') || 'No content found'}

Generate 5 content suggestions that would help us compete better. For each suggestion, provide:
- suggested_title
- suggested_description
- improvement_areas (array)
- priority_score (1-100)
- suggestion_type ("improve", "counter", or "gap_fill")

Return as JSON array.
`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: suggestionPrompt
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const suggestionsText = aiResponse.content[0].text;
  
  let suggestions;
  try {
    suggestions = JSON.parse(suggestionsText);
  } catch {
    // Fallback suggestions if parsing fails
    suggestions = [{
      suggested_title: "Improve Content Strategy Based on Competitor Analysis",
      suggested_description: "Analyze and implement competitive content strategies",
      improvement_areas: ["content_quality", "seo_optimization"],
      priority_score: 80,
      suggestion_type: "improve"
    }];
  }

  // Store suggestions
  const suggestionRecords = suggestions.map((suggestion: any) => ({
    competitor_content_id: competitorContent[0].id,
    suggestion_type: suggestion.suggestion_type || 'improve',
    suggested_title: suggestion.suggested_title,
    suggested_description: suggestion.suggested_description,
    improvement_areas: suggestion.improvement_areas || [],
    priority_score: suggestion.priority_score || 50,
    ai_analysis: suggestion
  }));

  const { data: storedSuggestions, error: suggestionError } = await supabaseClient
    .from('content_suggestions')
    .insert(suggestionRecords);

  if (suggestionError) {
    console.error('Error storing suggestions:', suggestionError);
  }

  return {
    suggestions: suggestionRecords,
    count: suggestionRecords.length
  };
}