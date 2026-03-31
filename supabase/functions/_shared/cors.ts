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

  // Check exact match against allowed origins
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Allow Lovable preview domains (for development and staging)
  const env = Deno.env.get('ENVIRONMENT') || 'development';
  if (env !== 'production' && origin.endsWith('.lovable.dev')) {
    return true;
  }

  return false;
}
