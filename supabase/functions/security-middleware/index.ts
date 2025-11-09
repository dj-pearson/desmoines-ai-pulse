import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SECURITY FIX: Restrict CORS to known domains only
const ALLOWED_ORIGINS = [
  'https://desmoinesinsider.com',
  'https://www.desmoinesinsider.com',
  'http://localhost:5173', // Development
  'http://localhost:8080', // Development
];

function getCorsHeaders(origin: string | null): HeadersInit {
  // Check if origin is in allowed list
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rate-limit-identifier, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface SecurityConfig {
  endpoint: string;
  maxRequests: number;
  windowMs: number;
  requireAuth: boolean;
  allowedMethods: string[];
  maxPayloadSize?: number;
}

const securityConfigs: Record<string, SecurityConfig> = {
  'auth': {
    endpoint: 'auth',
    maxRequests: 5, // 5 attempts per 15 minutes
    windowMs: 15 * 60 * 1000,
    requireAuth: false,
    allowedMethods: ['POST'],
    maxPayloadSize: 1024, // 1KB
  },
  'api': {
    endpoint: 'api',
    maxRequests: 100, // 100 requests per hour
    windowMs: 60 * 60 * 1000,
    requireAuth: true,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    maxPayloadSize: 10 * 1024 * 1024, // 10MB
  },
  'upload': {
    endpoint: 'upload',
    maxRequests: 10, // 10 uploads per hour
    windowMs: 60 * 60 * 1000,
    requireAuth: true,
    allowedMethods: ['POST'],
    maxPayloadSize: 50 * 1024 * 1024, // 50MB
  },
  'search': {
    endpoint: 'search',
    maxRequests: 200, // 200 searches per hour
    windowMs: 60 * 60 * 1000,
    requireAuth: false,
    allowedMethods: ['GET', 'POST'],
    maxPayloadSize: 2048, // 2KB
  },
}

function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

function checkRateLimit(identifier: string, config: SecurityConfig): { allowed: boolean; resetTime: number; remaining: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const key = `${identifier}_${config.endpoint}_${windowStart}`;
  
  const existing = rateLimitStore.get(key);
  const resetTime = windowStart + config.windowMs;
  
  if (!existing) {
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, resetTime, remaining: config.maxRequests - 1 };
  }
  
  if (existing.count >= config.maxRequests) {
    return { allowed: false, resetTime, remaining: 0 };
  }
  
  existing.count++;
  return { allowed: true, resetTime, remaining: config.maxRequests - existing.count };
}

function validateInput(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(;|\-\-|\/\*|\*\/)/,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  ];
  
  function checkString(str: string, fieldName: string) {
    if (sqlPatterns.some(pattern => pattern.test(str))) {
      errors.push(`Potentially malicious content detected in ${fieldName}`);
    }
    
    if (str.length > 10000) {
      errors.push(`${fieldName} exceeds maximum length`);
    }
  }
  
  function validateObject(obj: any, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'string') {
        checkString(value, fieldName);
      } else if (typeof value === 'object' && value !== null) {
        validateObject(value, fieldName);
      }
    }
  }
  
  if (typeof data === 'string') {
    checkString(data, 'input');
  } else if (typeof data === 'object' && data !== null) {
    validateObject(data);
  }
  
  return { isValid: errors.length === 0, errors };
}

function generateSecurityHeaders(config: SecurityConfig) {
  return {
    ...corsHeaders,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  };
}

async function logSecurityEvent(supabase: any, event: {
  type: 'rate_limit' | 'auth_failure' | 'validation_error' | 'suspicious_activity';
  identifier: string;
  endpoint: string;
  details: any;
  severity: 'low' | 'medium' | 'high';
}) {
  try {
    await supabase.from('security_audit_logs').insert({
      event_type: event.type,
      identifier: event.identifier,
      endpoint: event.endpoint,
      details: event.details,
      severity: event.severity,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Clean up old rate limit entries periodically
    if (Math.random() < 0.01) { // 1% chance
      cleanupRateLimitStore();
    }

    // Parse request
    const url = new URL(req.url);
    const method = req.method;
    const userAgent = req.headers.get('user-agent') || '';
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Get rate limit identifier (prefer user ID, fallback to IP)
    const authHeader = req.headers.get('authorization');
    let identifier = clientIP;
    let userId = null;
    
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) {
          identifier = user.id;
          userId = user.id;
        }
      } catch (error) {
        console.log('Auth validation failed:', error.message);
      }
    }

    // Determine security config based on endpoint
    const { endpoint, config } = Object.entries(securityConfigs).find(([key, cfg]) => 
      url.pathname.includes(key)
    ) || ['default', securityConfigs.api];

    const securityConfig = config || securityConfigs.api;

    // Method validation
    if (!securityConfig.allowedMethods.includes(method)) {
      await logSecurityEvent(supabase, {
        type: 'suspicious_activity',
        identifier,
        endpoint: endpoint,
        details: { method, path: url.pathname, userAgent },
        severity: 'medium',
      });

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: generateSecurityHeaders(securityConfig),
      });
    }

    // Payload size validation
    if (securityConfig.maxPayloadSize && req.body) {
      const contentLength = req.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > securityConfig.maxPayloadSize) {
        await logSecurityEvent(supabase, {
          type: 'validation_error',
          identifier,
          endpoint: endpoint,
          details: { contentLength, maxAllowed: securityConfig.maxPayloadSize },
          severity: 'medium',
        });

        return new Response(JSON.stringify({ error: 'Payload too large' }), {
          status: 413,
          headers: generateSecurityHeaders(securityConfig),
        });
      }
    }

    // Rate limiting
    const rateLimitResult = checkRateLimit(identifier, securityConfig);
    
    if (!rateLimitResult.allowed) {
      await logSecurityEvent(supabase, {
        type: 'rate_limit',
        identifier,
        endpoint: endpoint,
        details: { 
          maxRequests: securityConfig.maxRequests, 
          windowMs: securityConfig.windowMs,
          userAgent,
          method,
          path: url.pathname
        },
        severity: 'high',
      });

      const headers = {
        ...generateSecurityHeaders(securityConfig),
        'X-RateLimit-Limit': securityConfig.maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString(),
        'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
      };

      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        resetTime: rateLimitResult.resetTime,
      }), {
        status: 429,
        headers,
      });
    }

    // Authentication validation
    if (securityConfig.requireAuth && !userId) {
      await logSecurityEvent(supabase, {
        type: 'auth_failure',
        identifier,
        endpoint: endpoint,
        details: { path: url.pathname, method, userAgent },
        severity: 'medium',
      });

      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: generateSecurityHeaders(securityConfig),
      });
    }

    // Input validation for POST/PUT requests
    let requestData = null;
    if (['POST', 'PUT'].includes(method)) {
      try {
        const body = await req.text();
        if (body) {
          requestData = JSON.parse(body);
          const validation = validateInput(requestData);
          
          if (!validation.isValid) {
            await logSecurityEvent(supabase, {
              type: 'validation_error',
              identifier,
              endpoint: endpoint,
              details: { errors: validation.errors, method, path: url.pathname },
              severity: 'high',
            });

            return new Response(JSON.stringify({ 
              error: 'Invalid input detected',
              details: validation.errors,
            }), {
              status: 400,
              headers: generateSecurityHeaders(securityConfig),
            });
          }
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: generateSecurityHeaders(securityConfig),
        });
      }
    }

    // Security validation passed
    const responseHeaders = {
      ...generateSecurityHeaders(securityConfig),
      'X-RateLimit-Limit': securityConfig.maxRequests.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString(),
    };

    return new Response(JSON.stringify({
      success: true,
      message: 'Security validation passed',
      rateLimit: {
        limit: securityConfig.maxRequests,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime,
      },
      data: requestData,
    }), {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Security middleware error:', error);

    return new Response(JSON.stringify({ 
      error: 'Internal security error',
      message: 'Security validation could not be completed',
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});