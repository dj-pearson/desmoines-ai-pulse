import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleGenerationRequest {
  suggestionId: string;
  customPrompt?: string;
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

    const claudeApiKey = Deno.env.get('CLAUDE_API');
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API key is required');
    }

    const { suggestionId, customPrompt }: ArticleGenerationRequest = await req.json();

    // Get the content suggestion details
    const { data: suggestion, error: suggestionError } = await supabaseClient
      .from('content_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .single();

    if (suggestionError) throw suggestionError;
    if (!suggestion) throw new Error('Content suggestion not found');

    // Get user info
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication required');

    console.log(`Generating article for suggestion: ${suggestion.suggested_title}`);

    // Prepare the article generation prompt
    const articlePrompt = customPrompt || `
Write a comprehensive, engaging article based on the following content suggestion:

Title: ${suggestion.suggested_title}
Description: ${suggestion.suggested_description || 'No description provided'}
Suggestion Type: ${suggestion.suggestion_type}
Priority Score: ${suggestion.priority_score}
Improvement Areas: ${suggestion.improvement_areas?.join(', ') || 'None specified'}

Additional Context:
${suggestion.ai_analysis ? JSON.stringify(suggestion.ai_analysis, null, 2) : 'No additional context provided'}

Please write a well-structured article that:
1. Has a compelling introduction that hooks the reader
2. Provides valuable, informative content
3. Is optimized for SEO with relevant keywords naturally integrated
4. Includes practical insights and actionable information
5. Has a strong conclusion that encourages engagement

Format the response as JSON with the following structure:
{
  "title": "SEO-optimized article title",
  "content": "Full article content in HTML format with proper headings, paragraphs, and structure",
  "excerpt": "Brief 2-3 sentence summary for preview",
  "seo_title": "Title optimized for search engines (under 60 characters)",
  "seo_description": "Meta description for SEO (under 160 characters)",
  "seo_keywords": ["keyword1", "keyword2", "keyword3"],
  "category": "Appropriate category for the article",
  "tags": ["tag1", "tag2", "tag3"]
}

Target audience: People interested in Des Moines events, attractions, and local experiences.
Tone: Informative yet engaging, professional but approachable.
Word count: Aim for 800-1500 words for comprehensive coverage.
`;

    // Call Claude API to generate the article
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
          content: articlePrompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const articleText = aiResponse.content[0].text;
    
    let articleData;
    try {
      // Try to parse the JSON response from Claude
      articleData = JSON.parse(articleText);
    } catch (parseError) {
      console.warn('Failed to parse JSON from Claude, using fallback structure');
      // Fallback if Claude doesn't return proper JSON
      articleData = {
        title: suggestion.suggested_title,
        content: articleText,
        excerpt: suggestion.suggested_description?.substring(0, 200) + '...' || '',
        seo_title: suggestion.suggested_title,
        seo_description: suggestion.suggested_description?.substring(0, 160) || '',
        seo_keywords: suggestion.improvement_areas || [],
        category: 'General',
        tags: suggestion.suggested_tags || ['ai-generated']
      };
    }

    // Create the article in the database
    const { data: article, error: articleError } = await supabaseClient
      .from('articles')
      .insert({
        title: articleData.title,
        content: articleData.content,
        excerpt: articleData.excerpt,
        author_id: user.id,
        status: 'draft', // Start as draft
        category: articleData.category || 'General',
        tags: articleData.tags || [],
        seo_title: articleData.seo_title,
        seo_description: articleData.seo_description,
        seo_keywords: articleData.seo_keywords || [],
        generated_from_suggestion_id: suggestionId
      })
      .select()
      .single();

    if (articleError) {
      console.error('Error creating article:', articleError);
      throw articleError;
    }

    // Update the suggestion status to indicate it's been used
    await supabaseClient
      .from('content_suggestions')
      .update({ status: 'implemented' })
      .eq('id', suggestionId);

    console.log(`Successfully generated article: ${article.title}`);

    return new Response(JSON.stringify({
      success: true,
      article: article,
      message: 'Article generated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-article function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});