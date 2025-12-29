import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { validateURLForSSRF } from "../_shared/validation.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Allowed domains for image proxying (add trusted image sources here)
const ALLOWED_IMAGE_DOMAINS = [
  'maps.googleapis.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'places.googleapis.com',
  'streetviewpixels-pa.googleapis.com',
  'geo0.ggpht.com',
  'geo1.ggpht.com',
  'geo2.ggpht.com',
  'geo3.ggpht.com',
]

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

    // SSRF Protection: Validate URL before fetching
    const validation = validateURLForSSRF(imageUrl, {
      allowedDomains: ALLOWED_IMAGE_DOMAINS,
      allowedProtocols: ['https:'],
      blockPrivateIPs: true,
    })

    if (!validation.valid) {
      console.error('SSRF validation failed:', validation.error)
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the image from validated URL
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
