import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const imageUrl = url.searchParams.get('url')
    
    if (!imageUrl) {
      return new Response('Missing url parameter', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    // Fetch the image from Google Places API
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`)
    }

    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return new Response(imageBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    })

  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response('Image proxy error', { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})
