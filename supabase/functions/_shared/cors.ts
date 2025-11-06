/**
 * Environment-aware CORS configuration for edge functions
 */

/**
 * Get CORS origin based on environment
 */
export function getCorsOrigin(): string {
  const siteUrl = Deno.env.get('VITE_SITE_URL');
  const env = Deno.env.get('ENVIRONMENT') || 'development';

  // In production, use the configured site URL
  if (env === 'production' && siteUrl) {
    return siteUrl;
  }

  // In development/staging, allow all origins
  return '*';
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
    const corsOrigin = getCorsOrigin();

    // If in production with specific origin, validate the request origin
    let allowedOrigin = corsOrigin;
    if (corsOrigin !== '*' && requestOrigin) {
      // Check if request origin matches allowed origin
      const isAllowed = requestOrigin === corsOrigin ||
                       requestOrigin.endsWith('.lovable.dev') || // Allow Lovable preview
                       requestOrigin.endsWith('.localhost') ||    // Allow local development
                       requestOrigin.startsWith('http://localhost'); // Allow localhost

      if (!isAllowed) {
        return new Response('Forbidden', { status: 403 });
      }
      allowedOrigin = requestOrigin;
    }

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
  const corsOrigin = getCorsOrigin();

  // Allow all in development
  if (corsOrigin === '*') {
    return true;
  }

  // Check exact match
  if (origin === corsOrigin) {
    return true;
  }

  // Allow common development origins
  const devOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://localhost:8080',
  ];

  if (devOrigins.includes(origin)) {
    return true;
  }

  // Allow Lovable preview domains
  if (origin.endsWith('.lovable.dev')) {
    return true;
  }

  return false;
}
