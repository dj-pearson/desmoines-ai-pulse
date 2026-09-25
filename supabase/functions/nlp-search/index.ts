// nlp-search: natural-language search for events, restaurants, attractions
// and hotels. The handler lives in search.ts (handleSearch) so it can be
// tested offline; this file only wires the real dependencies.
//
// Uses the lightweight Claude model to parse a query like "free things to do
// this weekend with kids" into an intent, then runs one PostgREST query per
// content type. When the model is slow (3.5s) or fails, it answers 200 with a
// keyword search and `degraded: true` instead of a 500.
//
// Run the tests with: deno test --allow-read supabase/functions/nlp-search/

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import {
  buildLightweightClaudeRequest,
  extractClaudeText,
  getAIConfig,
  getAnthropicApiKey,
  getClaudeHeaders,
} from "../_shared/aiConfig.ts";
import { addCorsHeaders, getCorsHeaders, handleCors, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { handleSearch, type SearchClient, type SearchDeps } from "./search.ts";

function allowedOrigin(req: Request): string | undefined {
  const origin = req.headers.get("origin") || undefined;
  return origin && isOriginAllowed(origin) ? origin : undefined;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

// The caller check lives here, next to the service-role client, so it is in
// the file scripts/check-edge-auth.mjs reads. search.ts calls it to key the
// rate limit by user; an anon or invalid token falls back to the IP.
// The casts are only because supabase-js's generics are far wider than the
// slice SearchClient uses.
const client: SearchClient = {
  from: (table) => serviceClient.from(table) as unknown as ReturnType<SearchClient["from"]>,
  auth: {
    getUser: (jwt) =>
      serviceClient.auth.getUser(jwt) as unknown as ReturnType<SearchClient["auth"]["getUser"]>,
  },
};

const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

const deps: SearchDeps = {
  client,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  cors: {
    preflight: handleCors,
    headers: (req) => getCorsHeaders(allowedOrigin(req)),
  },
  rateLimit: async (req, userId) => {
    // Generous ceiling so real users (and clients that retry) are never
    // blocked, but a script can't burn Claude spend. Fails open on a DB outage.
    const rl = await checkRateLimitPersistent(req, {
      endpoint: "nlp-search",
      windowMs: 60 * 1000,
      max: 30,
      userId: userId ?? undefined,
      message: "Search rate limit exceeded. Please slow down and try again shortly.",
    });
    return !rl.success && rl.response ? addCorsHeaders(rl.response, allowedOrigin(req)) : null;
  },
  loadAi: async (prompt) => {
    const key = getAnthropicApiKey();
    if (!key) return null;
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(key, supabaseUrl, supabaseServiceKey);
    const body = await buildLightweightClaudeRequest(
      [{ role: "user", content: prompt }],
      { supabaseUrl, supabaseKey: supabaseServiceKey },
    );
    return {
      endpoint: config.api_endpoint,
      headers,
      model: config.lightweight_model,
      body,
      extractText: extractClaudeText,
    };
  },
  waitUntil: edgeRuntime ? (p) => edgeRuntime.waitUntil(p) : undefined,
};

serve((req) => handleSearch(req, deps));
