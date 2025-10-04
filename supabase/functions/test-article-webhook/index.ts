import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webhookUrl } = await req.json();

    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    console.log('Testing webhook:', webhookUrl);

    // Prepare test payload
    const testPayload = {
      test: true,
      article_id: "test-id",
      article_title: "Test Article",
      article_url: "https://desmoinesinsider.com/articles/test",
      short_description: "This is a test short description for Twitter (280 chars max)",
      long_description: "This is a test longer description for Facebook. It contains more details about the article and can be up to 500 characters long.",
      excerpt: "Test excerpt",
      category: "Test",
      tags: ["test", "webhook"],
      seo_keywords: ["test", "webhook", "article"],
      featured_image_url: "https://example.com/image.jpg",
      published_at: new Date().toISOString(),
      author_id: "test-author-id"
    };

    console.log('Sending test payload to webhook');

    // Send test webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Webhook test failed:', errorText);
      throw new Error(`Webhook test failed: ${webhookResponse.status} ${webhookResponse.statusText}`);
    }

    console.log('Webhook test successful');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test webhook sent successfully',
        payload: testPayload
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-article-webhook:', error);
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
