import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleGenerationRequest {
  topic: string;
  category?: string;
  targetKeywords?: string[];
  tone?: 'professional' | 'conversational' | 'informative' | 'engaging';
  length?: 'short' | 'medium' | 'long';
  includeLocalSEO?: boolean;
  customInstructions?: string;
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

    const { 
      topic, 
      category = 'General',
      targetKeywords = [],
      tone = 'engaging',
      length = 'medium',
      includeLocalSEO = true,
      customInstructions = ''
    }: ArticleGenerationRequest = await req.json();

    // Get user info
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication required');

    console.log(`Generating AI article for topic: ${topic}`);

    // Define word count targets
    const wordCounts = {
      short: '800-1000',
      medium: '1200-1500', 
      long: '1800-2500'
    };

    // Build comprehensive Des Moines local SEO context
    const localSEOContext = includeLocalSEO ? `
CRITICAL LOCAL SEO REQUIREMENTS FOR DES MOINES, IOWA:

Geographic Context:
- Primary location: Des Moines, Iowa (Central Iowa)
- Greater Des Moines Metro area includes: West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Altoona, Pleasant Hill
- Major neighborhoods: East Village, Court Avenue, Ingersoll, Beaverdale, Highland Park, Drake, Sherman Hill, Valley Junction
- Key landmarks: Iowa State Capitol, Principal Park, Iowa Events Center, Pappajohn Sculpture Park, Des Moines Art Center, Science Center of Iowa

Local Business Ecosystem:
- Major employers: Principal Financial, EMC Insurance, Hy-Vee, Casey's General Stores, UnityPoint Health, MidAmerican Energy
- Industries: Insurance, agriculture, renewable energy, financial services, healthcare, manufacturing
- Local universities: Drake University, DMACC (Des Moines Area Community College), Grand View University

SEO Strategy Requirements:
1. Include "Des Moines" or "Des Moines area" naturally in the content (2-4 times)
2. Reference Iowa/Central Iowa when contextually appropriate
3. Mention local landmarks, neighborhoods, or businesses when relevant
4. Use local search patterns like "near me", "in Des Moines", "Des Moines area"
5. Include seasonal references (Iowa seasons, local events)
6. Reference local culture: Iowa State Fair, RAGBRAI, farmers markets, local food scene

Geo-Optimization (GEO) Elements:
- Entity relationships: Connect local businesses, landmarks, and geographic features
- Local intent keywords: "best [topic] in Des Moines", "Des Moines [category] guide"
- Regional context: Midwest culture, Iowa values, agricultural heritage
- Local event tie-ins: Iowa State Fair, Downtown Farmers Market, RAGBRAI, World Food Festival
- Weather/seasonal considerations: Iowa winters, spring flooding, summer festivals
` : '';

    // Advanced SEO prompt with local optimization
    const articlePrompt = `
You are an expert content writer and SEO specialist creating highly optimized content for DiscoverDesMoines.com, the premier local guide for Des Moines, Iowa.

ARTICLE REQUIREMENTS:
Topic: ${topic}
Category: ${category}
Tone: ${tone}
Target Length: ${wordCounts[length]} words
Target Keywords: ${targetKeywords.length > 0 ? targetKeywords.join(', ') : 'Generate relevant keywords'}

${localSEOContext}

ADVANCED SEO OPTIMIZATION REQUIREMENTS:

1. HEADLINE OPTIMIZATION:
   - Create a compelling H1 that includes primary keyword and location
   - Use power words and emotional triggers
   - Keep under 60 characters for SERP display

2. CONTENT STRUCTURE:
   - Use proper header hierarchy (H1, H2, H3)
   - Include 3-5 H2 sections with keyword variations
   - Add H3 subheadings for detailed breakdowns
   - Create scannable content with bullet points and numbered lists

3. KEYWORD OPTIMIZATION:
   - Primary keyword density: 1-2%
   - Include LSI (Latent Semantic Indexing) keywords
   - Use long-tail keyword variations
   - Natural keyword placement in first 100 words

4. LOCAL SEO ELEMENTS:
   - Include local schema markup suggestions
   - Reference local businesses and landmarks
   - Add location-based keywords naturally
   - Include local search intent phrases

5. ENGAGEMENT OPTIMIZATION:
   - Write compelling meta description (150-160 characters)
   - Include internal linking suggestions
   - Add call-to-action elements
   - Create shareable, quotable content snippets

6. E-A-T SIGNALS (Expertise, Authoritativeness, Trustworthiness):
   - Include expert insights or local knowledge
   - Reference credible local sources
   - Add specific dates, statistics, or facts
   - Include practical, actionable advice

7. USER EXPERIENCE:
   - Write in active voice (80%+ of sentences)
   - Use transition words for flow
   - Include questions to engage readers
   - Add local tips and insider knowledge

${customInstructions ? `CUSTOM INSTRUCTIONS: ${customInstructions}` : ''}

CRITICAL: Return your response as a properly formatted JSON object with this exact structure:
{
  "title": "SEO-optimized article title (include Des Moines when relevant)",
  "content": "Full article content in clean HTML format with proper H2, H3 tags, paragraphs, lists, and emphasis",
  "excerpt": "Compelling 2-3 sentence summary that hooks readers (150-160 characters)",
  "seo_title": "Title optimized for search engines (under 60 characters)",
  "seo_description": "Meta description with local keywords (150-160 characters)", 
  "seo_keywords": ["primary keyword", "local variation", "long-tail keyword", "LSI keyword", "location-based keyword"],
  "category": "${category}",
  "tags": ["relevant", "content", "tags", "including", "local", "topics"],
  "featured_image_suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "internal_linking_opportunities": ["related article topic 1", "related article topic 2"],
  "local_schema_suggestions": {
    "type": "Article",
    "location": "Des Moines, Iowa",
    "relevantEntities": ["entity1", "entity2"]
  },
  "content_score": {
    "readability": "Grade 8-10 reading level",
    "seo_strength": "Strong/Excellent",
    "local_relevance": "High"
  }
}

Write engaging, informative content that provides real value to Des Moines residents and visitors while being perfectly optimized for search engines and local discovery.`;

    // Call Claude API using centralized config
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
    const requestBody = await buildClaudeRequest(
      [{ role: 'user', content: articlePrompt }],
      { 
        supabaseUrl, 
        supabaseKey: supabaseServiceKey,
        useLargeTokens: true,
        useCreativeTemp: false
      }
    );

    const response = await fetch(config.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', response.status, errorData);
      throw new Error(`Claude API error: ${response.status} - ${errorData}`);
    }

    const aiResponse = await response.json();
    const articleText = aiResponse.content[0].text;
    
    let articleData;
    try {
      // Try to parse the JSON response from Claude
      const jsonMatch = articleText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        articleData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON from Claude:', parseError);
      // Fallback structure
      articleData = {
        title: topic + (includeLocalSEO ? ' - Des Moines Guide' : ''),
        content: articleText,
        excerpt: `Discover everything you need to know about ${topic} in Des Moines, Iowa. Your complete local guide.`,
        seo_title: topic + (includeLocalSEO ? ' Des Moines' : ''),
        seo_description: `Complete guide to ${topic} in Des Moines, Iowa. Expert insights, local tips, and insider knowledge.`,
        seo_keywords: [topic, 'Des Moines', 'Iowa', 'local guide'],
        category: category,
        tags: [topic.toLowerCase(), 'des moines', 'iowa', 'local'],
        featured_image_suggestions: [`${topic} in Des Moines`, `Des Moines ${topic} guide`],
        internal_linking_opportunities: [],
        local_schema_suggestions: {
          type: 'Article',
          location: 'Des Moines, Iowa',
          relevantEntities: [topic, 'Des Moines']
        },
        content_score: {
          readability: 'Grade 8-10',
          seo_strength: 'Good',
          local_relevance: 'High'
        }
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
        status: 'draft',
        category: articleData.category || category,
        tags: articleData.tags || [],
        seo_title: articleData.seo_title,
        seo_description: articleData.seo_description,
        seo_keywords: articleData.seo_keywords || [],
      })
      .select()
      .single();

    if (articleError) {
      console.error('Error creating article:', articleError);
      throw articleError;
    }

    console.log(`Successfully generated AI article: ${article.title}`);

    return new Response(JSON.stringify({
      success: true,
      article: article,
      metadata: {
        word_count: articleData.content.split(' ').length,
        seo_score: articleData.content_score,
        local_optimization: includeLocalSEO,
        featured_image_suggestions: articleData.featured_image_suggestions,
        internal_linking_opportunities: articleData.internal_linking_opportunities,
        schema_suggestions: articleData.local_schema_suggestions
      },
      message: 'AI-optimized article generated successfully'
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