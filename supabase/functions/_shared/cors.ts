/**
 * Environment-aware CORS configuration for edge functions
 */

/**
 * Get allowed origins based on environment
 */
export function getAllowedOrigins(): string[] {
  // Check both SITE_URL and VITE_SITE_URL — either can be set as a Supabase secret.
  // VITE_SITE_URL is the Vite convention for frontend; SITE_URL is the plain variant.
  const siteUrl =
    Deno.env.get('SITE_URL') ||
    Deno.env.get('VITE_SITE_URL');
  const env = Deno.env.get('ENVIRONMENT') || 'development';

  // Build base production list from the configured site URL
  const productionOrigins: string[] = [];
  if (siteUrl) {
    // Normalise: strip trailing slash, accept both www and non-www variants
    const normalised = siteUrl.replace(/\/$/, '');
    productionOrigins.push(normalised);
    // Also allow www <-> non-www sibling
    if (normalised.includes('://www.')) {
      productionOrigins.push(normalised.replace('://www.', '://'));
    } else {
      const url = new URL(normalised);
      productionOrigins.push(`${url.protocol}//www.${url.host}`);
    }
  }

  // Fallback hardcoded production origins so the function is never completely
  // locked out if the secret is momentarily missing during a deploy.
  const productionFallbacks = [
    'https://desmoinesinsider.com',
    'https://www.desmoinesinsider.com',
  ];

  const allowedOrigins: Record<string, string[]> = {
    production: productionOrigins.length > 0
      ? [...new Set([...productionOrigins, ...productionFallbacks])]
      : productionFallbacks,
    staging: [
      'https://staging.desmoinesinsider.com',
      'https://lovable.dev',
      // Explicit, env-configured preview origins (comma-separated) replace the
      // old blanket *.lovable.dev wildcard. e.g.
      // CORS_PREVIEW_ORIGINS="https://my-project.lovable.dev,https://preview.x.dev"
      ...getPreviewOrigins(),
      ...(siteUrl ? [siteUrl] : []),
    ],
    development: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8082',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ],
  };

  return allowedOrigins[env] || allowedOrigins.development;
}

/**
 * Explicit preview origins from the CORS_PREVIEW_ORIGINS secret
 * (comma-separated). Empty when unset. Never consulted in production.
 */
function getPreviewOrigins(): string[] {
  return (Deno.env.get('CORS_PREVIEW_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Get CORS origin based on environment
 * @deprecated Use getAllowedOrigins() instead for security
 */
export function getCorsOrigin(): string {
  const allowedOrigins = getAllowedOrigins();
  // Return first origin for backwards compatibility
  // Note: This should be phased out in favor of origin validation
  return allowedOrigins[0];
}

/**
 * Get CORS headers with environment-aware origin
 */
export function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin || getCorsOrigin();

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    // Get origin from request
    const requestOrigin = req.headers.get('origin');

    // Validate origin against allowed list
    if (requestOrigin && !isOriginAllowed(requestOrigin)) {
      return new Response('Forbidden - Origin not allowed', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }

    // Use the validated request origin or first allowed origin as fallback
    const allowedOrigin = requestOrigin || getCorsOrigin();

    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(allowedOrigin),
    });
  }

  return null;
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(response: Response, origin?: string): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(origin);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Validate origin against allowed origins
 */
export function isOriginAllowed(origin: string): boolean {
  const allowedOrigins = getAllowedOrigins();

  // Check exact match against allowed origins (includes any explicit
  // CORS_PREVIEW_ORIGINS in non-production).
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Lovable preview domains: NEVER in production, and no longer a blanket
  // suffix match. Only a single-label https subdomain of lovable.dev
  // (e.g. https://my-project.lovable.dev) — this rejects nested/forged hosts
  // like https://evil.attacker.lovable.dev and any http: origin. Opt out
  // entirely with ALLOW_LOVABLE_PREVIEWS=false.
  const env = Deno.env.get('ENVIRONMENT') || 'development';
  const lovableOptOut = (Deno.env.get('ALLOW_LOVABLE_PREVIEWS') || '').toLowerCase() === 'false';
  if (env !== 'production' && !lovableOptOut && /^https:\/\/[a-z0-9-]+\.lovable\.dev$/.test(origin)) {
    return true;
  }

  return false;
}
