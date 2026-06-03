/**
 * SECURITY: verify_jwt = true (gateway) + in-function token validation.
 * The user id is derived from the verified JWT, never from the request body, so
 * a caller cannot fetch another user's profile/feedback/recommendations. A body
 * `userId` that does not match the authenticated user is rejected (403).
 * (PROD-API-003 — see docs/SECURITY_AUDIT.md #10.)
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { errorResponse } from "../_shared/errorResponse.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 10 AI requests per 15 minutes per client
  const rateLimit = checkRateLimit(req, { max: 10, message: 'AI recommendation rate limit exceeded. Please try again later.' });
  if (!rateLimit.success) {
    return rateLimit.response!;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate: the user id MUST come from the verified JWT, never the body.
    // This endpoint reads user-specific data with the service-role key, so
    // trusting a body `userId` would let anyone fetch another user's profile,
    // feedback, and recommendations (PROD-API-003 / docs/SECURITY_AUDIT.md #10).
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Reject a caller trying to request a different user's data outright,
    // rather than silently ignoring it.
    const body = await req.json().catch(() => ({} as { userId?: string }));
    if (body?.userId && body.userId !== userId) {
      return new Response(
        JSON.stringify({ error: 'userId does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get user profile and preferences
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get user feedback history
    const { data: feedback } = await supabase
      .from('user_event_feedback')
      .select(`
        *,
        events (
          id,
          title,
          category,
          location,
          enhanced_description,
          original_description
        )
      `)
      .eq('user_id', userId);

    // Get user interactions
    const { data: interactions } = await supabase
      .from('user_event_interactions')
      .select(`
        *,
        events (
          id,
          title,
          category,
          location
        )
      `)
      .eq('user_id', userId);

    // Get all available events
    const { data: allEvents } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (!allEvents || allEvents.length === 0) {
      return new Response(JSON.stringify({ 
        recommendations: [],
        confidence: 0,
        reasoning: "No events available"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate AI-powered recommendations
    let aiRecommendations = [];
    let confidence = 0.5; // Default confidence
    let reasoning = "Based on interest preferences";

    if (openAIApiKey && feedback && feedback.length > 0) {
      try {
        // Prepare data for AI analysis
        const userPreferences = {
          interests: profile?.interests || [],
          location: profile?.location,
          likedEvents: feedback.filter(f => f.feedback_type === 'thumbs_up').map(f => ({
            title: f.events?.title,
            category: f.events?.category,
            description: f.events?.enhanced_description || f.events?.original_description
          })),
          dislikedEvents: feedback.filter(f => f.feedback_type === 'thumbs_down').map(f => ({
            title: f.events?.title,
            category: f.events?.category,
            description: f.events?.enhanced_description || f.events?.original_description
          })),
          viewedEvents: interactions?.map(i => ({
            title: i.events?.title,
            category: i.events?.category,
            interactionType: i.interaction_type
          })) || []
        };

        const prompt = `
        You are an AI event recommendation engine. Analyze the user's preferences and behavior to recommend events.

        User Profile:
        - Interests: ${userPreferences.interests.join(', ')}
        - Location: ${userPreferences.location}

        User's Liked Events:
        ${userPreferences.likedEvents.map(e => `- ${e.title} (${e.category}): ${e.description?.substring(0, 100)}...`).join('\n')}

        User's Disliked Events:
        ${userPreferences.dislikedEvents.map(e => `- ${e.title} (${e.category}): ${e.description?.substring(0, 100)}...`).join('\n')}

        Available Events to Recommend From:
        ${allEvents.slice(0, 20).map(e => `ID: ${e.id} | ${e.title} | ${e.category} | ${e.location} | ${(e.enhanced_description || e.original_description || '').substring(0, 150)}...`).join('\n')}

        Please provide:
        1. A JSON array of recommended event IDs (up to 6 events)
        2. A confidence score (0-1) for these recommendations
        3. A brief reasoning for the recommendations

        Response format:
        {
          "eventIds": ["id1", "id2", ...],
          "confidence": 0.85,
          "reasoning": "Recommended based on user's preference for..."
        }
        `;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a sophisticated event recommendation AI. Provide accurate JSON responses.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000,
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          const aiContent = aiData.choices[0].message.content;
          
          try {
            const aiResult = JSON.parse(aiContent);
            if (aiResult.eventIds && Array.isArray(aiResult.eventIds)) {
              aiRecommendations = allEvents.filter(event => aiResult.eventIds.includes(event.id));
              confidence = aiResult.confidence || 0.8;
              reasoning = aiResult.reasoning || "AI-powered recommendations based on your preferences and feedback";
            }
          } catch (parseError) {
            console.log('AI response parsing failed, falling back to rule-based recommendations');
          }
        }
      } catch (aiError) {
        console.log('AI recommendations failed, using rule-based approach:', aiError);
      }
    }

    // Fallback to rule-based recommendations if AI fails or no feedback
    if (aiRecommendations.length === 0) {
      const userInterests = profile?.interests || [];
      const likedCategories = feedback?.filter(f => f.feedback_type === 'thumbs_up')
        .map(f => f.events?.category).filter(Boolean) || [];
      const dislikedEventIds = feedback?.filter(f => f.feedback_type === 'thumbs_down')
        .map(f => f.event_id) || [];

      // Score events based on user preferences
      const scoredEvents = allEvents.map(event => {
        let score = 0;
        
        // Interest-based scoring
        if (userInterests.includes('food') && 
            (event.category.toLowerCase().includes('food') || 
             event.title.toLowerCase().includes('food') ||
             (event.enhanced_description || event.original_description || '').toLowerCase().includes('restaurant'))) {
          score += 2;
        }
        
        if (userInterests.includes('music') && 
            (event.category.toLowerCase().includes('music') || 
             event.title.toLowerCase().includes('music') ||
             event.title.toLowerCase().includes('concert'))) {
          score += 2;
        }

        if (userInterests.includes('sports') && 
            (event.category.toLowerCase().includes('sport') || 
             event.title.toLowerCase().includes('game'))) {
          score += 2;
        }

        if (userInterests.includes('arts') && 
            (event.category.toLowerCase().includes('art') || 
             event.title.toLowerCase().includes('art'))) {
          score += 2;
        }

        // Category preference based on feedback
        if (likedCategories.includes(event.category)) {
          score += 3;
        }

        // Location preference
        if (profile?.location && event.location && 
            event.location.toLowerCase().includes(profile.location.toLowerCase().split(' ')[0])) {
          score += 1;
        }

        // Penalize disliked events
        if (dislikedEventIds.includes(event.id)) {
          score -= 5;
        }

        // Prefer enhanced events
        if (event.is_enhanced) {
          score += 0.5;
        }

        return { ...event, score };
      }).filter(event => event.score > 0 && !dislikedEventIds.includes(event.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      aiRecommendations = scoredEvents;
      confidence = Math.min(0.8, Math.max(0.3, scoredEvents.length / 6));
      reasoning = `Recommended based on your interests (${userInterests.join(', ')}) and feedback history`;
    }

    console.log(`Generated ${aiRecommendations.length} recommendations for user ${userId} with confidence ${confidence}`);

    return new Response(JSON.stringify({
      recommendations: aiRecommendations,
      confidence,
      reasoning,
      totalAvailableEvents: allEvents.length,
      userFeedbackCount: feedback?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return errorResponse(error, corsHeaders, {
      fn: 'personalized-recommendations',
      publicMessage: 'Failed to generate recommendations',
    });
  }
});