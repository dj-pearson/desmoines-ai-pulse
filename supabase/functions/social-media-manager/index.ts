import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SocialMediaPost {
  content_type: 'event' | 'restaurant' | 'general';
  content_id?: string;
  subject_type: 'event_of_the_day' | 'restaurant_of_the_day' | 'weekly_highlight' | 'special_announcement';
  platform_type: 'twitter_threads' | 'facebook_linkedin';
  post_content: string;
  post_title?: string;
  content_url?: string;
  webhook_urls: string[];
  ai_prompt_used: string;
  metadata: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const claudeApiKey = Deno.env.get('CLAUDE_API');

    if (!claudeApiKey) {
      throw new Error('Claude API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, contentType, subjectType } = await req.json();

    console.log('Social Media Manager - Action:', action, 'ContentType:', contentType, 'SubjectType:', subjectType);

    if (action === 'generate') {
      // Get recent posts to avoid repetition
      const { data: recentPosts } = await supabase
        .from('social_media_posts')
        .select('content_id, content_type, subject_type')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .order('created_at', { ascending: false })
        .limit(20);

      const recentContentIds = recentPosts?.map(p => p.content_id) || [];

      // Choose content to feature
      let selectedContent: any = null;
      let contentUrl = '';

      if (contentType === 'event') {
        // Get upcoming events not recently featured
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString())
          .not('id', 'in', `(${recentContentIds.length > 0 ? recentContentIds.map(id => `'${id}'`).join(',') : "''"})`)
          .order('date', { ascending: true })
          .limit(10);

        if (events && events.length > 0) {
          selectedContent = events[Math.floor(Math.random() * events.length)];
          contentUrl = `https://wtkhfqpmcegzcbngroui.supabase.co/events/${selectedContent.id}`;
        }
      } else if (contentType === 'restaurant') {
        // Get restaurants or restaurant openings not recently featured
        const { data: restaurants } = await supabase
          .from('restaurants')
          .select('*')
          .not('id', 'in', `(${recentContentIds.length > 0 ? recentContentIds.map(id => `'${id}'`).join(',') : "''"})`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (restaurants && restaurants.length > 0) {
          selectedContent = restaurants[Math.floor(Math.random() * restaurants.length)];
          contentUrl = `https://wtkhfqpmcegzcbngroui.supabase.co/restaurants/${selectedContent.slug || selectedContent.id}`;
        }
      }

      if (!selectedContent) {
        throw new Error('No suitable content found for posting');
      }

      // Generate both versions using Claude
      const shortPrompt = `Create a compelling social media post (under 200 characters) for ${subjectType.replace('_', ' ')} featuring this ${contentType}:

Title: ${selectedContent.title || selectedContent.name}
Description: ${selectedContent.description || selectedContent.enhanced_description || selectedContent.original_description || ''}
Location: ${selectedContent.location || ''}
${contentType === 'event' ? `Date: ${selectedContent.date}` : ''}
${contentType === 'event' ? `Venue: ${selectedContent.venue || ''}` : ''}
${contentType === 'restaurant' ? `Cuisine: ${selectedContent.cuisine || ''}` : ''}

Make it engaging, use relevant hashtags, and keep it under 200 characters for Twitter/Threads. Include a call to action.`;

      const longPrompt = `Create a detailed social media post (200-500 characters) for ${subjectType.replace('_', ' ')} featuring this ${contentType}:

Title: ${selectedContent.title || selectedContent.name}
Description: ${selectedContent.description || selectedContent.enhanced_description || selectedContent.original_description || ''}
Location: ${selectedContent.location || ''}
${contentType === 'event' ? `Date: ${selectedContent.date}` : ''}
${contentType === 'event' ? `Venue: ${selectedContent.venue || ''}` : ''}
${contentType === 'restaurant' ? `Cuisine: ${selectedContent.cuisine || ''}` : ''}

Make it detailed and engaging for Facebook/LinkedIn. Include compelling details, storytelling elements, and a strong call to action.`;

      // Generate short post
      const shortResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: shortPrompt
          }]
        })
      });

      const shortData = await shortResponse.json();
      const shortContent = shortData.content[0].text;

      // Generate long post
      const longResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: longPrompt
          }]
        })
      });

      const longData = await longResponse.json();
      const longContent = longData.content[0].text;

      // Get active webhooks
      const { data: webhooks } = await supabase
        .from('social_media_webhooks')
        .select('*')
        .eq('is_active', true);

      const webhookUrls = webhooks?.map(w => w.webhook_url) || [];

      // Get optimal posting time
      const { data: nextPostTime } = await supabase.rpc('get_next_optimal_posting_time');

      // Save both posts
      const posts = [
        {
          content_type: contentType,
          content_id: selectedContent.id,
          subject_type: subjectType,
          platform_type: 'twitter_threads',
          post_content: shortContent,
          post_title: selectedContent.title || selectedContent.name,
          content_url: contentUrl,
          webhook_urls: webhookUrls,
          ai_prompt_used: shortPrompt,
          scheduled_for: nextPostTime,
          metadata: {
            content_data: selectedContent,
            generation_timestamp: new Date().toISOString()
          }
        },
        {
          content_type: contentType,
          content_id: selectedContent.id,
          subject_type: subjectType,
          platform_type: 'facebook_linkedin',
          post_content: longContent,
          post_title: selectedContent.title || selectedContent.name,
          content_url: contentUrl,
          webhook_urls: webhookUrls,
          ai_prompt_used: longPrompt,
          scheduled_for: nextPostTime,
          metadata: {
            content_data: selectedContent,
            generation_timestamp: new Date().toISOString()
          }
        }
      ];

      const { data: savedPosts, error } = await supabase
        .from('social_media_posts')
        .insert(posts)
        .select();

      if (error) {
        throw error;
      }

      console.log('Generated and saved social media posts:', savedPosts);

      return new Response(JSON.stringify({
        success: true,
        posts: savedPosts,
        selectedContent,
        nextPostTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'publish') {
      const { postId } = await req.json();

      // Get the post
      const { data: post, error: postError } = await supabase
        .from('social_media_posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (postError || !post) {
        throw new Error('Post not found');
      }

      // Send to webhooks
      const webhookPromises = (post.webhook_urls as string[]).map(async (webhookUrl) => {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              platform: post.platform_type,
              content: post.post_content,
              title: post.post_title,
              url: post.content_url,
              subject_type: post.subject_type,
              content_type: post.content_type,
              metadata: post.metadata
            })
          });

          return {
            url: webhookUrl,
            success: response.ok,
            status: response.status
          };
        } catch (error) {
          return {
            url: webhookUrl,
            success: false,
            error: error.message
          };
        }
      });

      const webhookResults = await Promise.all(webhookPromises);

      // Update post status
      const { error: updateError } = await supabase
        .from('social_media_posts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          metadata: {
            ...post.metadata,
            webhook_results: webhookResults
          }
        })
        .eq('id', postId);

      if (updateError) {
        throw updateError;
      }

      console.log('Post published successfully:', postId, webhookResults);

      return new Response(JSON.stringify({
        success: true,
        webhookResults
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Social Media Manager Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});