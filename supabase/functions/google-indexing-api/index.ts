/**
 * Google Indexing API Edge Function
 *
 * Submits URLs to Google's Indexing API for faster crawling/indexing.
 * Uses a service account credential stored in the GOOGLE_SERVICE_ACCOUNT_JSON secret.
 *
 * Reference: https://developers.google.com/search/apis/indexing-api/v3/prereqs
 *
 * Request body:
 *   { "urls": string[], "type": "URL_UPDATED" | "URL_DELETED" }
 *
 * SECURITY: verify_jwt = true (requires authenticated admin user)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const INDEXING_API_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const BATCH_ENDPOINT = "https://indexing.googleapis.com/batch";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/indexing";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface IndexingRequest {
  urls: string[];
  type?: "URL_UPDATED" | "URL_DELETED";
}

interface IndexingResult {
  url: string;
  status: "success" | "error";
  statusCode?: number;
  message?: string;
}

/**
 * Base64url encode a Uint8Array or string
 */
function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Create a signed JWT for Google OAuth2 service account authentication
 */
async function createSignedJWT(
  serviceAccount: ServiceAccountKey
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Import the private key for signing
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Exchange a signed JWT for a Google OAuth2 access token
 */
async function getAccessToken(
  serviceAccount: ServiceAccountKey
): Promise<string> {
  const jwt = await createSignedJWT(serviceAccount);

  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Submit a single URL to the Google Indexing API
 */
async function submitUrl(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED",
  accessToken: string
): Promise<IndexingResult> {
  try {
    const response = await fetch(INDEXING_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        url,
        type,
      }),
    });

    if (response.ok) {
      return { url, status: "success", statusCode: response.status };
    }

    const errorBody = await response.text();
    return {
      url,
      status: "error",
      statusCode: response.status,
      message: errorBody,
    };
  } catch (error) {
    return {
      url,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Rate limit: 30 write requests per 15 minutes
  const rateLimit = checkRateLimit(req, {
    max: 30,
    message: "Google Indexing API rate limit exceeded. Please try again later.",
  });
  if (!rateLimit.success) {
    return rateLimit.response!;
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify the user is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT token and check admin role
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role from profiles
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the service account JSON from environment
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({
          error: "Google service account not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON secret.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount: ServiceAccountKey;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid GOOGLE_SERVICE_ACCOUNT_JSON format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: IndexingRequest = await req.json();
    const { urls, type = "URL_UPDATED" } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "urls must be a non-empty array of URL strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Google Indexing API has a daily quota of 200 URLs
    if (urls.length > 200) {
      return new Response(
        JSON.stringify({
          error: "Maximum 200 URLs per request (Google daily quota limit)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        return new Response(
          JSON.stringify({ error: `Invalid URL: ${url}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get access token
    const accessToken = await getAccessToken(serviceAccount);

    // Submit each URL
    const results: IndexingResult[] = [];
    for (const url of urls) {
      const result = await submitUrl(url, type, accessToken);
      results.push(result);
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        submitted: urls.length,
        success: successCount,
        errors: errorCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Google Indexing API error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
