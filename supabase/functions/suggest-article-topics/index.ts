import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TopicSuggestionRequest {
  category?: string;
  focusArea?: string;
  includeLocalTrends?: boolean;
  includeSeasonalTopics?: boolean;
  excludeExistingTopics?: boolean;
  suggestionCount?: number;
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

    const { 
      category = '',
      focusArea = '',
      includeLocalTrends = true,
      includeSeasonalTopics = true,
      excludeExistingTopics = true,
      suggestionCount = 8
    }: TopicSuggestionRequest = await req.json();

    // Get user info
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication required');

    console.log('Generating article topic suggestions');

    // Get existing articles to avoid duplicates
    let existingTopics: string[] = [];
    if (excludeExistingTopics) {
      const { data: articles } = await supabaseClient
        .from('articles')
        .select('title, category, tags')
        .limit(100);
      
      existingTopics = articles?.map(a => a.title.toLowerCase()) || [];
    }

    // Get current date for seasonal context
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentSeason = getSeason(currentDate);

    // Get competitor content for gap analysis
    const { data: competitorContent } = await supabaseClient
      .from('competitor_content')
      .select('title, category, tags')
      .limit(50);

    // Get trending content if available
    const { data: trendingContent } = await supabaseClient
      .from('trending_scores')
      .select('content_type, content_id')
      .eq('content_type', 'event')
      .order('score', { ascending: false })
      .limit(20);

    // Build context for AI suggestions
    const suggestionPrompt = `
You are an expert content strategist for DiscoverDesMoines.com, specializing in local Des Moines, Iowa content that drives engagement and SEO performance.

CURRENT CONTEXT:
- Current Month: ${currentMonth}
- Current Season: ${currentSeason}
- Requested Category: ${category || 'Any'}
- Focus Area: ${focusArea || 'General Des Moines content'}
- Include Local Trends: ${includeLocalTrends}
- Include Seasonal Topics: ${includeSeasonalTopics}

EXISTING CONTENT TO AVOID DUPLICATING:
${existingTopics.slice(0, 20).join(', ')}

COMPETITOR CONTENT FOR INSPIRATION:
${competitorContent?.slice(0, 10).map(c => c.title).join(', ') || 'No competitor data available'}

DES MOINES LOCAL CONTEXT:
- Major Events: Iowa State Fair (August), RAGBRAI (July), Downtown Farmers Market (May-Oct)
- Neighborhoods: East Village, Court Avenue, Ingersoll, Beaverdale, Highland Park, Drake
- Local Landmarks: Iowa State Capitol, Principal Park, Pappajohn Sculpture Park, Des Moines Art Center
- Local Culture: Insurance industry hub, agricultural heritage, Midwest values, craft beer scene
- Seasonal Activities: Winter festivals, spring flooding awareness, summer outdoor events, fall activities

CONTENT GAPS TO FILL:
- Underserved neighborhoods or areas
- Seasonal activities and events
- Local business spotlights
- Hidden gems and insider tips
- Practical local guides
- Family-friendly activities
- Date night ideas
- Budget-friendly options

GENERATE ${suggestionCount} COMPELLING ARTICLE TOPIC SUGGESTIONS:

Requirements:
1. Each topic should be specific to Des Moines or Iowa
2. Include a mix of evergreen and timely content
3. Consider local SEO opportunities
4. Balance popular topics with niche interests
5. Include actionable, practical content ideas
6. Consider different content types (guides, lists, reviews, how-tos)

${includeSeasonalTopics ? `7. Include seasonal relevance for ${currentMonth}/${currentSeason}` : ''}
${category ? `8. Focus primarily on ${category} category` : ''}
${focusArea ? `9. Emphasize ${focusArea} content` : ''}

Format your response as a JSON object with this structure:
{
  "suggestions": [
    {
      "title": "Compelling article title with Des Moines focus",
      "description": "Brief description of what the article would cover",
      "category": "Most appropriate category",
      "estimated_keywords": ["primary keyword", "secondary keyword", "local keyword"],
      "content_type": "guide|list|review|how-to|spotlight",
      "seo_potential": "high|medium|low",
      "seasonal_relevance": "high|medium|low|none",
      "target_audience": "families|young professionals|tourists|locals|all",
      "difficulty": "easy|medium|advanced",
      "estimated_word_count": "800-1000|1200-1500|1800-2500",
      "unique_angle": "What makes this topic unique or different"
    }
  ],
  "content_gaps_identified": ["gap 1", "gap 2", "gap 3"],
  "seasonal_opportunities": ["opportunity 1", "opportunity 2"],
  "trending_local_topics": ["trend 1", "trend 2"],
  "suggested_focus_areas": ["area 1", "area 2", "area 3"]
}

Generate diverse, engaging topics that would genuinely help Des Moines residents and visitors while performing well in search results.`;

    // Call Claude API for topic suggestions
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: suggestionPrompt
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', response.status, errorData);
      throw new Error(`Claude API error: ${response.status} - ${errorData}`);
    }

    const aiResponse = await response.json();
    const suggestionsText = aiResponse.content[0].text;
    
    let suggestionsData;
    try {
      // Try to parse the JSON response from Claude
      const jsonMatch = suggestionsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestionsData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON from Claude:', parseError);
      // Fallback structure with basic suggestions
      suggestionsData = {
        suggestions: [
          {
            title: "Best Coffee Shops in Des Moines for Remote Work",
            description: "A comprehensive guide to Des Moines coffee shops with WiFi, atmosphere, and amenities perfect for remote workers",
            category: "Food & Drink",
            estimated_keywords: ["Des Moines coffee shops", "remote work Des Moines", "WiFi coffee shops"],
            content_type: "guide",
            seo_potential: "high",
            seasonal_relevance: "low",
            target_audience: "young professionals",
            difficulty: "easy",
            estimated_word_count: "1200-1500",
            unique_angle: "Focus on remote work amenities and atmosphere"
          }
        ],
        content_gaps_identified: ["Remote work locations", "Neighborhood spotlights"],
        seasonal_opportunities: [`${currentSeason} activities in Des Moines`],
        trending_local_topics: ["Local business recovery", "Outdoor activities"],
        suggested_focus_areas: ["Local businesses", "Practical guides", "Hidden gems"]
      };
    }

    console.log(`Generated ${suggestionsData.suggestions?.length || 0} topic suggestions`);

    return new Response(JSON.stringify({
      success: true,
      data: suggestionsData,
      context: {
        current_season: currentSeason,
        current_month: currentMonth,
        excluded_topics_count: existingTopics.length,
        competitor_content_analyzed: competitorContent?.length || 0
      },
      message: 'Topic suggestions generated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-article-topics function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getSeason(date: Date): string {
  const month = date.getMonth() + 1; // getMonth() returns 0-11
  
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
}