import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateURLForSSRF } from "../_shared/validation.ts"
import { checkRateLimit } from "../_shared/rateLimit.ts"
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maximum allowed image size: 10MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

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

// Internal Supabase Storage URLs that can be accessed without auth
const INTERNAL_STORAGE_PATTERNS = [
  /\.supabase\.co\/storage\//,
  /\.supabase\.in\/storage\//,
]

function isInternalStorageUrl(url: string): boolean {
  return INTERNAL_STORAGE_PATTERNS.some(pattern => pattern.test(url));
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
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Allow unauthenticated access for internal Supabase Storage URLs
    const isInternal = isInternalStorageUrl(imageUrl);

    // JWT Authentication check for non-internal URLs
    if (!isInternal) {
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify the JWT by creating a Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Log authenticated image proxy request for abuse monitoring
      console.log(`Image proxy request: user=${user.id} url=${imageUrl.substring(0, 100)}`);
    }

    // Rate limiting: 50 requests per 15 minutes (image proxy is bandwidth-intensive)
    const rateLimit = checkRateLimit(req, { max: 50 });
    if (!rateLimit.success) {
      console.warn(`Image proxy rate limit exceeded for request`);
      return rateLimit.response!;
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
    const response = await fetchWithTimeout(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`)
    }

    // Check Content-Length header for size limit before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
      return new Response(JSON.stringify({ error: `Image exceeds maximum size of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB` }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const imageBuffer = await response.arrayBuffer()

    // Verify actual size after download (Content-Length may be missing or wrong)
    if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
      return new Response(JSON.stringify({ error: `Image exceeds maximum size of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB` }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return new Response(imageBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      }
    })

  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response(JSON.stringify({ error: 'Image proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
